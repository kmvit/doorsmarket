from django.db import transaction
from django.utils import timezone

from orders.models import ActivityKind, Measurement

from .models import ActReview, EventKind, Installation, InstallationFile, InstallationFileKind, InstallationStatus

# Виды файлов, которые можно приложить при оформлении (ключи multipart-формы)
UPLOAD_KINDS = [k for k, _ in InstallationFileKind.choices]


def measurement_blank_required(order):
    """Бланк замера прикладывают, только если по заказу не было выполненного замера."""
    return not Measurement.objects.filter(request__order=order, is_done=True).exists()


def required_file_kinds(order):
    kinds = [InstallationFileKind.FINAL_KP, InstallationFileKind.INSTALLATION_KP]
    if measurement_blank_required(order):
        kinds.insert(0, InstallationFileKind.MEASUREMENT_BLANK)
    return kinds


def prefill(order):
    """Подсказки формы оформления: контактное лицо и какие файлы обязательны."""
    request = getattr(order, 'measurement_request', None)
    if request is not None:
        contact_name, contact_phone = request.contact_name, request.contact_phone
    else:
        contact_name, contact_phone = order.client_name, order.contact_phone
    return {
        'order': order.id,
        'client_name': order.client_name,
        'address': order.address,
        'kp_number': order.kp_number,
        'contact_name': contact_name or '',
        'contact_phone': contact_phone or '',
        'measurement_blank_required': measurement_blank_required(order),
        'installations_count': order.installations.count(),
    }


def missing_required_files(order, files_by_kind):
    """Обязательные виды файлов, которых нет среди загружаемых."""
    labels = dict(InstallationFileKind.choices)
    return [labels[k] for k in required_file_kinds(order) if not files_by_kind.get(k)]


@transaction.atomic
def create_installation(*, order, data, files_by_kind, actor):
    inst = Installation.objects.create(order=order, created_by=actor, **data)
    for kind, files in files_by_kind.items():
        for f in files:
            InstallationFile.objects.create(
                installation=inst, kind=kind, file=f, name=f.name[:255], uploaded_by=actor,
            )
    inst.log(EventKind.CREATED, actor=actor, description='Монтаж оформлен', new_status=inst.status)
    order.log_activity(
        ActivityKind.INSTALLATION_CREATED, actor=actor,
        description=f'Оформлен монтаж #{inst.id}', meta={'installation_id': inst.id},
    )
    # Решение «монтаж не нужен» снимается: монтаж всё-таки оформили
    if order.installation_not_needed_at:
        order.installation_not_needed_at = None
        order.installation_not_needed_by = None
        order.save(update_fields=['installation_not_needed_at', 'installation_not_needed_by', 'updated_at'])
    return inst


def set_installation_not_needed(order, not_needed, actor):
    if not_needed:
        order.installation_not_needed_at = timezone.now()
        order.installation_not_needed_by = actor
        description = 'Монтаж не нужен'
    else:
        order.installation_not_needed_at = None
        order.installation_not_needed_by = None
        description = 'Монтаж снова нужен'
    order.save(update_fields=['installation_not_needed_at', 'installation_not_needed_by', 'updated_at'])
    order.log_activity(ActivityKind.INSTALLATION_NOT_NEEDED, actor=actor, description=description,
                       meta={'not_needed': bool(not_needed)})


# ==================== Этап 2: график, статусы ====================

def _push(user, title, body, url, actor=None):
    """Push сотруднику; себе не шлём, ошибки отправки не роняют действие."""
    if not user or (actor is not None and user.pk == actor.pk):
        return
    try:
        from users.push_utils import send_push_notification
        send_push_notification(user=user, title=title, body=body, url=url)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).error('Ошибка push по монтажу: %s', exc)


def _set_status(inst, new_status, actor, kind, description, extra_fields=()):
    old = inst.status
    inst.status = new_status
    inst.save(update_fields=['status', 'updated_at', *extra_fields])
    inst.log(kind, actor=actor, description=description, old_status=old, new_status=new_status)


def city_installers(city_id):
    from django.contrib.auth import get_user_model
    return get_user_model().objects.filter(
        role='installer', is_active=True, city_id=city_id,
    ).order_by('first_name', 'last_name', 'username')


def _period(visit):
    from .sms import _format_date
    if visit.date_from == visit.date_to:
        return _format_date(visit.date_from)
    return f'{_format_date(visit.date_from)}–{_format_date(visit.date_to)}'


def _installer_names(installers):
    return ', '.join(f'{u.first_name} {u.last_name}'.strip() or u.username for u in installers)


@transaction.atomic
def assign(inst, *, installers, date_from, date_to, actor):
    """
    Назначить монтаж (или поправить назначение). Монтаж «не запланирован» или
    «частично завершён» получает новый выезд, запланированный — правится текущий.
    Клиенту — СМС при первом назначении и при смене даты начала.
    """
    from . import sms
    from .models import InstallationVisit

    visit = inst.current_visit if inst.status == InstallationStatus.PLANNED else None
    old_from = visit.date_from if visit else None
    old_installers = set(visit.installers.values_list('id', flat=True)) if visit else set()
    if visit is None:
        visit = InstallationVisit(installation=inst)
    visit.date_from, visit.date_to, visit.assigned_by = date_from, date_to, actor
    # СМ сам выставил даты — запрос монтажника на перенос этим решён
    _clear_reschedule(visit)
    visit.save()
    visit.installers.set(installers)

    description = f'{_period(visit)}, монтажник: {_installer_names(installers)}'
    if inst.status != InstallationStatus.PLANNED:
        _set_status(inst, InstallationStatus.PLANNED, actor, EventKind.ASSIGNED, description)
    else:
        inst.log(EventKind.ASSIGNED, actor=actor, description=f'Изменено назначение: {description}')

    url = f'/orders/installations/{inst.id}'
    for user in installers:
        if user.id not in old_installers or old_from != date_from:
            _push(user, f'Монтаж #{inst.id} на {_period(visit)}',
                  f'{inst.order.client_name}, {inst.order.address}', url, actor)
    for user_id in old_installers - {u.id for u in installers}:
        from django.contrib.auth import get_user_model
        _push(get_user_model().objects.filter(pk=user_id).first(),
              f'Монтаж #{inst.id} снят с вашего графика', inst.order.client_name, url, actor)

    if old_from is None:
        sms.send(inst, sms.installation_scheduled(date_from, actor), actor=actor, purpose='scheduled')
    elif old_from != date_from:
        sms.send(inst, sms.installation_rescheduled(date_from, actor), actor=actor, purpose='rescheduled')
    return visit


def _drop_current_visit(inst, actor):
    """Убирает текущий выезд запланированного монтажа и сообщает монтажникам."""
    visit = inst.current_visit if inst.status == InstallationStatus.PLANNED else None
    if visit is None:
        return
    for user in visit.installers.all():
        _push(user, f'Монтаж #{inst.id} снят с вашего графика', inst.order.client_name,
              f'/orders/installations/{inst.id}', actor)
    visit.delete()


@transaction.atomic
def unassign(inst, actor):
    _drop_current_visit(inst, actor)
    _set_status(inst, InstallationStatus.NOT_PLANNED, actor, EventKind.UNASSIGNED, 'Снят с графика монтажников')


@transaction.atomic
def mark_not_ready(inst, actor):
    _drop_current_visit(inst, actor)
    _set_status(inst, InstallationStatus.NOT_READY, actor, EventKind.NOT_READY, 'Клиент не готов к монтажу')


def mark_ready(inst, actor):
    _set_status(inst, InstallationStatus.NOT_PLANNED, actor, EventKind.READY,
                'Клиент готов — монтаж снова ждёт назначения')


def request_irrelevant(inst, reason, actor):
    inst.irrelevant_requested_at = timezone.now()
    inst.irrelevant_requested_by = actor
    inst.irrelevant_reason = reason
    inst.save(update_fields=['irrelevant_requested_at', 'irrelevant_requested_by', 'irrelevant_reason', 'updated_at'])
    inst.log(EventKind.IRRELEVANT_REQUESTED, actor=actor,
             description=f'Причина: {reason}' if reason else 'Помечен неактуальным')
    _push(inst.order.manager, f'Монтаж #{inst.id} помечен неактуальным',
          reason or 'Подтвердите или оставьте монтаж в работе', f'/orders/installations/{inst.id}', actor)


def _clear_irrelevant_request(inst):
    inst.irrelevant_requested_at = None
    inst.irrelevant_requested_by = None
    inst.irrelevant_reason = ''
    return ['irrelevant_requested_at', 'irrelevant_requested_by', 'irrelevant_reason']


@transaction.atomic
def confirm_irrelevant(inst, actor):
    requested_by = inst.irrelevant_requested_by
    _drop_current_visit(inst, actor)
    fields = _clear_irrelevant_request(inst)
    _set_status(inst, InstallationStatus.IRRELEVANT, actor, EventKind.IRRELEVANT_CONFIRMED,
                'Менеджер подтвердил неактуальность', extra_fields=fields)
    _push(requested_by, f'Монтаж #{inst.id} признан неактуальным', 'Менеджер подтвердил',
          f'/orders/installations/{inst.id}', actor)


def keep_relevant(inst, comment, actor):
    requested_by = inst.irrelevant_requested_by
    fields = _clear_irrelevant_request(inst)
    inst.save(update_fields=[*fields, 'updated_at'])
    inst.log(EventKind.IRRELEVANT_REJECTED, actor=actor,
             description=f'Комментарий: {comment}' if comment else 'Менеджер оставил монтаж в работе')
    _push(requested_by, f'Монтаж #{inst.id} остаётся в работе',
          comment or 'Менеджер не подтвердил неактуальность', f'/orders/installations/{inst.id}', actor)


# ==================== Этап 3: работа монтажника ====================

# Файлы по факту работ — привязаны к выезду
WORK_FILE_KINDS = (InstallationFileKind.ACT, InstallationFileKind.ACT_UNSIGNED, InstallationFileKind.RESULT)


def add_file(inst, *, kind, upload, name, actor, review_status='', log=True):
    """
    Файл в пакет монтажа. Акт и фото/видео результата привязываются к текущему
    выезду и сразу попадают во вложения заказа (тот же файл, без копии).
    """
    visit = None
    if kind in WORK_FILE_KINDS:
        visit = inst.current_visit
    f = InstallationFile.objects.create(
        installation=inst, kind=kind, visit=visit, file=upload, name=name, uploaded_by=actor,
        review_status=review_status,
    )
    # Акт клиента до проверки подписи в заказ не идёт — только подтверждённый
    if visit is not None and kind != InstallationFileKind.ACT_UNSIGNED and review_status != ActReview.PENDING:
        _attach_to_order(inst, f)
    if log:
        inst.log(EventKind.FILE_ADDED, actor=actor, description=f'{f.get_kind_display()}: {f.name}',
                 meta={'file_id': f.id})
    return f


def _attach_to_order(inst, f):
    from orders.models import OrderAttachment
    OrderAttachment.objects.create(
        order=inst.order, file=f.file.name,
        name=f'Монтаж #{inst.id}. {f.get_kind_display()}: {f.name}'[:255],
    )


def city_service_managers(inst):
    from django.contrib.auth import get_user_model
    return get_user_model().objects.filter(
        role='service_manager', is_active=True, city_id=inst.order.salon.city_id, measurements_only=False,
    )


def installer_call_failed(inst, actor):
    from . import sms
    return sms.send(inst, sms.installer_call_failed(actor), actor=actor, purpose='installer_call_failed')


@transaction.atomic
def reschedule_by_installer(inst, *, date_from, date_to, reason, actor):
    visit = inst.current_visit
    if visit.reschedule_requested_at is None:
        visit.previous_date_from, visit.previous_date_to = visit.date_from, visit.date_to
    visit.date_from, visit.date_to = date_from, date_to
    visit.reschedule_requested_at = timezone.now()
    visit.reschedule_requested_by = actor
    visit.reschedule_reason = reason
    visit.save()
    inst.log(EventKind.RESCHEDULE_REQUESTED, actor=actor,
             description=f'Новая дата {_period(visit)}. Причина: {reason}',
             meta={'previous_from': str(visit.previous_date_from), 'previous_to': str(visit.previous_date_to)})
    for sm in city_service_managers(inst):
        _push(sm, f'Монтаж #{inst.id}: перенос на {_period(visit)}',
              f'Подтвердите перенос. Причина: {reason}', f'/orders/installations/{inst.id}', actor)


def _clear_reschedule(visit):
    visit.reschedule_requested_at = None
    visit.reschedule_requested_by = None
    visit.reschedule_reason = ''
    visit.previous_date_from = None
    visit.previous_date_to = None


@transaction.atomic
def confirm_reschedule(inst, actor):
    """СМ подтверждает перенос — клиенту СМС с новой датой."""
    from . import sms
    visit = inst.current_visit
    requested_by = visit.reschedule_requested_by
    date_changed = visit.previous_date_from != visit.date_from
    _clear_reschedule(visit)
    visit.save()
    inst.log(EventKind.RESCHEDULE_CONFIRMED, actor=actor, description=f'Монтаж на {_period(visit)}')
    _push(requested_by, f'Перенос монтажа #{inst.id} подтверждён', _period(visit),
          f'/orders/installations/{inst.id}', actor)
    if date_changed:
        sms.send(inst, sms.installation_rescheduled(visit.date_from, actor), actor=actor, purpose='rescheduled')


@transaction.atomic
def reject_reschedule(inst, comment, actor):
    """СМ отклоняет перенос — в графике возвращаются прежние даты."""
    visit = inst.current_visit
    requested_by = visit.reschedule_requested_by
    visit.date_from, visit.date_to = visit.previous_date_from, visit.previous_date_to
    _clear_reschedule(visit)
    visit.save()
    inst.log(EventKind.RESCHEDULE_REJECTED, actor=actor,
             description=f'Остаётся {_period(visit)}' + (f'. {comment}' if comment else ''))
    _push(requested_by, f'Перенос монтажа #{inst.id} отклонён',
          comment or f'Монтаж остаётся на {_period(visit)}', f'/orders/installations/{inst.id}', actor)


def has_current_act(inst):
    """Подписанный акт текущего выезда: от сотрудника или клиентский с подтверждённой подписью."""
    visit = inst.current_visit
    return visit is not None and inst.files.filter(
        visit=visit, kind=InstallationFileKind.ACT, review_status__in=['', ActReview.APPROVED],
    ).exists()


def has_unsigned_act(inst):
    visit = inst.current_visit
    return visit is not None and inst.files.filter(visit=visit, kind=InstallationFileKind.ACT_UNSIGNED).exists()


def complete(inst, *, partial, actor):
    if partial:
        _set_status(inst, InstallationStatus.PARTIALLY_DONE, actor, EventKind.PARTIALLY_COMPLETED,
                    'Часть работ выполнена, монтаж продолжится')
    else:
        _set_status(inst, InstallationStatus.DONE, actor, EventKind.COMPLETED, 'Монтаж завершён')
        request_rating(inst, actor)
    _push(inst.order.manager, f'Монтаж #{inst.id}: {inst.get_status_display().lower()}',
          inst.order.client_name, f'/orders/installations/{inst.id}', actor)


# ==================== Этап 4: подпись акта клиентом ====================

def ensure_client_code(inst):
    from orders.models import generate_short_code
    if not inst.client_code:
        while True:
            code = generate_short_code(8)
            if not Installation.objects.filter(client_code=code).exists():
                break
        inst.client_code = code
        inst.save(update_fields=['client_code', 'updated_at'])
    return inst.client_code


def _push_installers(inst, title, body, actor=None):
    visit = inst.current_visit
    for user in (visit.installers.all() if visit else []):
        _push(user, title, body, f'/orders/installations/{inst.id}', actor)


@transaction.atomic
def send_act_to_client(inst, actor):
    """Работу не приняли: монтаж ждёт подписи, клиенту — ссылка на акт."""
    from . import sms
    ensure_client_code(inst)
    first = inst.status != InstallationStatus.AWAITING_SIGNATURE
    inst.act_sent_at = timezone.now()
    if first:
        _set_status(inst, InstallationStatus.AWAITING_SIGNATURE, actor, EventKind.ACT_SENT,
                    'Работу не приняли на месте — акт отправлен клиенту на подпись', extra_fields=['act_sent_at'])
    else:
        inst.save(update_fields=['act_sent_at', 'updated_at'])
        inst.log(EventKind.ACT_SENT, actor=actor, description='Ссылка на подпись акта отправлена повторно')
    sms.send(inst, sms.act_sign_request(inst), actor=actor, purpose='act_sign_request')


def client_confirm(inst):
    if inst.client_confirmed_at:
        return
    inst.client_confirmed_at = timezone.now()
    inst.save(update_fields=['client_confirmed_at', 'updated_at'])
    inst.log(EventKind.CLIENT_CONFIRMED, description='Клиент подтвердил по ссылке, что работы выполнены')
    _push_installers(inst, f'Клиент подтвердил монтаж #{inst.id}',
                     'Подписанного акта пока нет — монтаж можно завершить только с ним')


@transaction.atomic
def client_upload_act(inst, upload):
    """Клиент приложил подписанный акт — монтажнику задача проверить подпись."""
    f = add_file(inst, kind=InstallationFileKind.ACT, upload=upload, name=upload.name[:255], actor=None,
                 review_status=ActReview.PENDING, log=False)
    if not inst.client_confirmed_at:
        inst.client_confirmed_at = timezone.now()
        inst.save(update_fields=['client_confirmed_at', 'updated_at'])
    inst.log(EventKind.CLIENT_ACT_UPLOADED, description=f'Подписанный акт: {f.name}', meta={'file_id': f.id})
    _push_installers(inst, f'Монтаж #{inst.id}: проверьте акт',
                     'Клиент приложил подписанный акт — проверьте подпись и подтвердите')
    return f


@transaction.atomic
def approve_act(f, actor):
    inst = f.installation
    f.review_status = ActReview.APPROVED
    f.reviewed_by, f.reviewed_at = actor, timezone.now()
    f.save(update_fields=['review_status', 'reviewed_by', 'reviewed_at'])
    _attach_to_order(inst, f)
    inst.log(EventKind.ACT_APPROVED, actor=actor, description=f'{f.name}: подпись на месте')


@transaction.atomic
def reject_act(f, reason, actor):
    """Подпись не подтверждена — клиенту снова уходит ссылка с причиной."""
    from . import sms
    inst = f.installation
    f.review_status = ActReview.REJECTED
    f.review_comment = reason
    f.reviewed_by, f.reviewed_at = actor, timezone.now()
    f.save(update_fields=['review_status', 'review_comment', 'reviewed_by', 'reviewed_at'])
    inst.log(EventKind.ACT_REJECTED, actor=actor, description=f'{f.name}: {reason}')
    sms.send(inst, sms.act_rejected(inst, reason), actor=actor, purpose='act_rejected')


# ==================== Этап 5: оценка клиента, акт на оплату ====================

def request_rating(inst, actor):
    """Монтаж завершён — клиенту ссылка на оценку (та же страница /m/{код})."""
    from . import sms
    ensure_client_code(inst)
    sms.send(inst, sms.rating_request(inst), actor=actor, purpose='rating_request')


def rating_participants(inst):
    """Кто работал с заказом: менеджер, замерщик (выполненные замеры), монтажники всех выездов."""
    from django.contrib.auth import get_user_model
    from orders.models import Measurement
    ids = {inst.order.manager_id}
    ids.update(Measurement.objects.filter(request__order=inst.order, is_done=True)
               .exclude(service_manager__isnull=True).values_list('service_manager_id', flat=True))
    ids.update(inst.visits.values_list('installers', flat=True))
    return get_user_model().objects.filter(id__in=[i for i in ids if i])


@transaction.atomic
def submit_rating(inst, scores, comments):
    from .models import RATING_FIELDS, InstallationRating
    rating = InstallationRating.objects.create(
        installation=inst, comments=comments,
        **{InstallationRating.column(k): v for k, v in scores.items()},
    )
    rating.participants.set(rating_participants(inst))
    overall = f'общее впечатление {scores["overall"]}/5' if scores.get('overall') else 'оценки получены'
    inst.log(EventKind.RATED, description=f'Клиент оценил работу: {overall}')
    labels = dict(RATING_FIELDS)
    body = ', '.join(f'{labels[k]} — {v}' for k, v in scores.items() if v)
    for user in rating.participants.all():
        _push(user, f'Клиент оценил заказ #{inst.order_id}', body, f'/orders/installations/{inst.id}')
    return rating


def payment_acts(inst):
    """Подписанные акты текущего выезда — их и шлём бухгалтеру."""
    visit = inst.current_visit
    if visit is None:
        return InstallationFile.objects.none()
    return inst.files.filter(visit=visit, kind=InstallationFileKind.ACT,
                             review_status__in=['', ActReview.APPROVED])


def payment_subject(inst, installer):
    from .sms import staff_name_phone
    order = inst.order
    kp = f' (КП {order.kp_number})' if order.kp_number else ''
    return (f'Акт на оплату: монтаж #{inst.id}, заказ #{order.id}{kp}, {order.client_name}, '
            f'монтажник {staff_name_phone(installer)[0]}')


class PaymentEmailError(Exception):
    pass


def send_to_payment(inst, estimate, actor):
    """
    Акт выполненных работ — бухгалтеру города. Письмо уходит с общего адреса,
    ответ — монтажнику (Reply-To); в теме монтажник, номер заказа и монтажа,
    в теле — смета работ и ссылка на монтаж.
    """
    from django.conf import settings
    from django.core.mail import EmailMessage
    from orders.sms_templates import _base_url
    from .sms import staff_name_phone

    to = inst.order.salon.city.accountant_email
    if not to:
        raise PaymentEmailError('У города не указана почта бухгалтера — обратитесь к администратору.')
    acts = list(payment_acts(inst))
    if not acts:
        raise PaymentEmailError('Нет подписанного акта — без него на оплату не отправить.')
    name, phone = staff_name_phone(actor)
    body = (
        f'{payment_subject(inst, actor)}\n'
        f'Статус монтажа: {inst.get_status_display()}\n'
        f'Адрес: {inst.order.address}\n'
        f'Монтаж в программе: {_base_url()}/orders/installations/{inst.id}\n\n'
        f'Смета работ:\n{estimate}\n\n'
        f'{name}{", " + phone if phone else ""}'
    )
    email = EmailMessage(
        subject=payment_subject(inst, actor), body=body, from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to], reply_to=[actor.email] if actor.email else None,
    )
    for f in acts:
        with f.file.open('rb') as fh:
            email.attach(f.name, fh.read())
    try:
        email.send()
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).error('Не удалось отправить акт монтажа #%s на оплату: %s', inst.id, exc)
        raise PaymentEmailError('Письмо не отправилось — попробуйте ещё раз позже.')
    visit = inst.current_visit
    again = visit.payment_sent_at is not None
    visit.payment_sent_at, visit.payment_sent_by = timezone.now(), actor
    visit.save(update_fields=['payment_sent_at', 'payment_sent_by', 'updated_at'])
    inst.log(EventKind.PAYMENT_SENT, actor=actor,
             description=f'{"Повторно: " if again else ""}акт отправлен на {to}', meta={'estimate': estimate})
