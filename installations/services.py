from django.db import transaction
from django.utils import timezone

from orders.models import ActivityKind, Measurement

from .models import EventKind, Installation, InstallationFile, InstallationFileKind, InstallationStatus

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
