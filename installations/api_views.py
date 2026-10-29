from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from marketingdoors.search import NumberAwareSearchFilter
from orders.api_views import apply_people_filters, get_orders_queryset_for_user, requested_statuses

from . import services
from . import sms
from .access import (
    CREATE_ROLES, DECIDE_ROLES, INSTALLER_FILE_KINDS, INSTALLER_ROLE, READY_ROLES, SCHEDULE_ROLES,
    can_see_installations, installations_for_user, is_installer_of,
)
from .models import (
    CLOSED_INSTALLATION_STATUSES, EventKind, InstallationFile, InstallationStatus, InstallationVisit,
)
from .serializers import (
    EDITABLE_FIELDS, InstallationDetailSerializer, InstallationEventSerializer,
    InstallationFileSerializer, InstallationListSerializer, InstallationWriteSerializer,
    ScheduleVisitSerializer, StaffSerializer,
)

# Папки списка монтажей (плитки на главной). Порядок — порядок показа.
INSTALLATION_FOLDERS = [
    ('to_assign', 'Назначить монтаж'),
    ('planned', 'Запланирован'),
    ('not_ready', 'Не готов к монтажу'),
    ('irrelevant_requested', 'Неактуален? Подтвердить'),
    ('reschedule_requested', 'Перенос даты? Подтвердить'),
]


def apply_installation_folder(qs, folder):
    if folder == 'to_assign':
        # Ждут назначения: новые и частично завершённые (нужен следующий выезд)
        return qs.filter(status__in=[InstallationStatus.NOT_PLANNED, InstallationStatus.PARTIALLY_DONE])
    if folder == 'planned':
        return qs.filter(status=InstallationStatus.PLANNED)
    if folder == 'not_ready':
        return qs.filter(status=InstallationStatus.NOT_READY)
    if folder == 'irrelevant_requested':
        return qs.filter(irrelevant_requested_at__isnull=False).exclude(status=InstallationStatus.IRRELEVANT)
    if folder == 'reschedule_requested':
        return qs.filter(
            status=InstallationStatus.PLANNED, visits__reschedule_requested_at__isnull=False,
        ).distinct()
    return qs


def _parse_date(value):
    from datetime import date
    try:
        return date.fromisoformat(str(value or ''))
    except ValueError:
        return None


def _ids(value):
    if isinstance(value, (list, tuple)):
        items = value
    else:
        items = str(value or '').split(',')
    return [int(v) for v in items if str(v).strip().isdigit()]


def _forbidden(message):
    return Response({'detail': message}, status=status.HTTP_403_FORBIDDEN)


def _bad(message):
    return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)


class CanSeeInstallations(permissions.BasePermission):
    message = 'Список монтажей вам недоступен.'

    def has_permission(self, request, view):
        return can_see_installations(request.user)


def _bool_param(value):
    if value in ('true', '1'):
        return True
    if value in ('false', '0'):
        return False
    return None


def _order_for(user, order_id):
    """Заказ, по которому пользователь может оформить монтаж, или None."""
    if not str(order_id or '').isdigit():
        return None
    return get_orders_queryset_for_user(user).filter(id=order_id).first()


class InstallationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          mixins.CreateModelMixin, mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    """
    Список монтажей — общий на город. Оформляет монтаж менеджер (из заказа или
    из списка), правят все пользователи города, кроме монтажников, пока монтаж
    не завершён.
    """
    permission_classes = [permissions.IsAuthenticated, CanSeeInstallations]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [NumberAwareSearchFilter, OrderingFilter]
    # id — номер монтажа, order__id — номер заказа: ищут по обоим «#123»
    search_fields = [
        'id', 'order__id', 'order__client_name', 'order__address', 'order__kp_number',
        'contact_name', 'contact_phone',
    ]
    ordering_fields = ['created_at', 'planned_delivery_date', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        request = self.request
        qs = installations_for_user(request.user)
        if self.action != 'list':
            return qs
        params = request.query_params
        if (order_id := params.get('order')) and order_id.isdigit():
            qs = qs.filter(order_id=order_id)
        statuses = requested_statuses(request)
        if statuses:
            qs = qs.filter(status__in=statuses)
        # «Кроме выполненных» — по умолчанию в списке; явный выбор закрытого
        # статуса в фильтре важнее, иначе он всегда давал бы пустой список
        if params.get('exclude_closed') == 'true' and not statuses & set(CLOSED_INSTALLATION_STATUSES):
            qs = qs.exclude(status__in=CLOSED_INSTALLATION_STATUSES)
        is_paid = _bool_param(params.get('is_paid'))
        if is_paid is not None:
            qs = qs.filter(is_paid=is_paid)
        if params.get('mine') == 'true':
            qs = qs.filter(order__manager=request.user)
        qs = apply_installation_folder(qs, params.get('folder'))
        return apply_people_filters(qs, request, order_path='order__')

    def get_serializer_class(self):
        if self.action == 'list':
            return InstallationListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return InstallationWriteSerializer
        return InstallationDetailSerializer

    def _detail(self, inst):
        # Перечитываем с prefetch — в ответе пакет документов уже с новыми файлами
        inst = installations_for_user(self.request.user).get(pk=inst.pk)
        return InstallationDetailSerializer(inst, context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        if request.user.role not in CREATE_ROLES:
            return Response({'detail': 'Монтаж оформляет менеджер.'}, status=status.HTTP_403_FORBIDDEN)
        order = _order_for(request.user, request.data.get('order'))
        if order is None:
            return Response({'order': ['Заказ не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = {k: v for k, v in serializer.validated_data.items() if k != 'order'}

        files_by_kind = {k: request.FILES.getlist(k) for k in services.UPLOAD_KINDS}
        missing = services.missing_required_files(order, files_by_kind)
        if missing:
            return Response(
                {'files': [f'Приложите: {", ".join(missing)}.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inst = services.create_installation(
            order=order, data=data, files_by_kind=files_by_kind, actor=request.user,
        )
        return Response(self._detail(inst), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if request.user.role == INSTALLER_ROLE:
            return _forbidden('Монтаж правят менеджер и сервис-менеджер.')
        inst = self.get_object()
        if inst.is_closed:
            return Response(
                {'detail': f'Монтаж в статусе «{inst.get_status_display()}» — правки закрыты.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(inst, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        before = {f: getattr(inst, f) for f in EDITABLE_FIELDS}
        for field, value in serializer.validated_data.items():
            if field in EDITABLE_FIELDS:
                setattr(inst, field, value)
        changed = [f for f in EDITABLE_FIELDS if getattr(inst, f) != before[f]]
        if changed:
            inst.save(update_fields=[*changed, 'updated_at'])
            labels = [str(inst._meta.get_field(f).verbose_name) for f in changed]
            inst.log(
                EventKind.UPDATED, actor=request.user,
                description='Изменено: ' + ', '.join(labels),
                meta={'fields': changed},
            )
        return Response(self._detail(inst))

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        inst = self.get_object()
        return Response(InstallationEventSerializer(inst.events.select_related('actor'), many=True).data)

    @action(detail=False, methods=['get'])
    def prefill(self, request):
        """Данные заказа для формы оформления: ?order=ID."""
        order = _order_for(request.user, request.query_params.get('order'))
        if order is None:
            return Response({'detail': 'Заказ не найден.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(services.prefill(order))

    @action(detail=False, methods=['post'], url_path='set_not_needed')
    def set_not_needed(self, request):
        """
        «Монтаж не нужен» по заказу и отмена этого решения.
        Тело: {order, not_needed: true|false}.
        """
        if request.user.role not in CREATE_ROLES:
            return Response({'detail': 'Это решает менеджер.'}, status=status.HTTP_403_FORBIDDEN)
        order = _order_for(request.user, request.data.get('order'))
        if order is None:
            return Response({'order': ['Заказ не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        not_needed = _bool_param(str(request.data.get('not_needed')).lower())
        if not_needed is None:
            return Response({'not_needed': ['Укажите true или false.']}, status=status.HTTP_400_BAD_REQUEST)
        if not_needed and order.installations.exists():
            return Response(
                {'detail': 'По заказу уже оформлен монтаж.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        services.set_installation_not_needed(order, not_needed, request.user)
        return Response({'order': order.id, 'installation_not_needed_at': order.installation_not_needed_at})


    # ---------- Этап 2: распределение по монтажникам ----------

    @action(detail=False, methods=['get'], url_path='folder_counts')
    def folder_counts(self, request):
        """Счётчики папок монтажей для главной. ?mine=true — монтажи по своим заказам."""
        base = installations_for_user(request.user)
        if request.query_params.get('mine') == 'true':
            base = base.filter(order__manager=request.user)
        return Response([
            {'folder': folder, 'label': label, 'count': apply_installation_folder(base, folder).count()}
            for folder, label in INSTALLATION_FOLDERS
        ])

    def _installers_qs(self, request):
        from django.contrib.auth import get_user_model
        from orders.serializers import user_city_id
        qs = get_user_model().objects.filter(role='installer', is_active=True).select_related('city')
        if request.user.role == 'admin':
            city = request.query_params.get('city')
            return qs.filter(city_id=city) if str(city or '').isdigit() else qs
        if request.user.role == 'group_leader':
            return qs.filter(city__salons__id__in=request.user.managed_salon_ids()).distinct()
        return qs.filter(city_id=user_city_id(request.user))

    @action(detail=False, methods=['get'])
    def installers(self, request):
        """Монтажники города — для вкладки «Монтажники» и выбора при назначении."""
        qs = self._installers_qs(request).order_by('first_name', 'last_name', 'username')
        return Response([
            {**StaffSerializer(u).data, 'city': u.city_id, 'city_name': u.city.name if u.city else ''}
            for u in qs
        ])

    @action(detail=False, methods=['get'])
    def schedule(self, request):
        """
        Выезды в графиках монтажников за период: ?installers=1,2&date_from=&date_to=
        (без installers — все монтажники, которых видит пользователь).
        """
        date_from = _parse_date(request.query_params.get('date_from'))
        date_to = _parse_date(request.query_params.get('date_to'))
        if not date_from or not date_to or date_to < date_from:
            return _bad('Укажите период: date_from и date_to (ГГГГ-ММ-ДД).')
        if (date_to - date_from).days > 92:
            return _bad('Период не больше трёх месяцев.')
        installer_ids = set(self._installers_qs(request).values_list('id', flat=True))
        requested = set(_ids(request.query_params.get('installers')))
        if requested:
            installer_ids &= requested
        visits = InstallationVisit.objects.filter(
            installers__in=installer_ids, date_from__lte=date_to, date_to__gte=date_from,
        ).exclude(installation__status=InstallationStatus.IRRELEVANT).select_related(
            'installation', 'installation__order',
        ).prefetch_related('installers').distinct().order_by('date_from', 'id')
        return Response(ScheduleVisitSerializer(visits, many=True).data)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """СМ назначает монтаж: {installers: [id], date_from, date_to}."""
        if request.user.role not in SCHEDULE_ROLES:
            return _forbidden('Назначает монтажи сервис-менеджер.')
        inst = self.get_object()
        allowed = (InstallationStatus.NOT_PLANNED, InstallationStatus.PLANNED, InstallationStatus.PARTIALLY_DONE)
        if inst.status not in allowed:
            return _bad(f'Монтаж в статусе «{inst.get_status_display()}» назначить нельзя.')
        date_from = _parse_date(request.data.get('date_from'))
        date_to = _parse_date(request.data.get('date_to')) or date_from
        if not date_from:
            return _bad('Укажите дату монтажа.')
        if date_to < date_from:
            return _bad('Дата окончания раньше даты начала.')
        installer_ids = _ids(request.data.get('installers'))
        installers = list(services.city_installers(inst.order.salon.city_id).filter(id__in=installer_ids))
        if not installers or len(installers) != len(set(installer_ids)):
            return _bad('Выберите монтажников города, где монтаж.')
        services.assign(inst, installers=installers, date_from=date_from, date_to=date_to, actor=request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'])
    def unassign(self, request, pk=None):
        if request.user.role not in SCHEDULE_ROLES:
            return _forbidden('Графики правит сервис-менеджер.')
        inst = self.get_object()
        if inst.status != InstallationStatus.PLANNED:
            return _bad('Монтаж не стоит в графике.')
        services.unassign(inst, request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'], url_path='not_ready')
    def not_ready(self, request, pk=None):
        if request.user.role not in SCHEDULE_ROLES:
            return _forbidden('Отмечает сервис-менеджер.')
        inst = self.get_object()
        if inst.status not in (InstallationStatus.NOT_PLANNED, InstallationStatus.PLANNED,
                               InstallationStatus.PARTIALLY_DONE):
            return _bad(f'Из статуса «{inst.get_status_display()}» — нельзя.')
        services.mark_not_ready(inst, request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'])
    def ready(self, request, pk=None):
        """«Назначить монтаж»: клиент готов — монтаж снова ждёт назначения СМ."""
        if request.user.role not in READY_ROLES:
            return _forbidden('Недоступно.')
        inst = self.get_object()
        if inst.status != InstallationStatus.NOT_READY:
            return _bad('Монтаж не в статусе «Не готов к монтажу».')
        services.mark_ready(inst, request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'], url_path='request_irrelevant')
    def request_irrelevant(self, request, pk=None):
        if request.user.role not in SCHEDULE_ROLES:
            return _forbidden('Пометить неактуальным может сервис-менеджер.')
        inst = self.get_object()
        if inst.is_closed or inst.irrelevant_requested_at:
            return _bad('Монтаж уже закрыт или ждёт решения менеджера.')
        services.request_irrelevant(inst, (request.data.get('reason') or '').strip()[:500], request.user)
        return Response(self._detail(inst))

    def _decide(self, request):
        if request.user.role not in DECIDE_ROLES:
            return None, _forbidden('Решение по неактуальности принимает менеджер.')
        inst = self.get_object()
        if not inst.irrelevant_requested_at or inst.is_closed:
            return None, _bad('Монтаж не помечен неактуальным.')
        return inst, None

    @action(detail=True, methods=['post'], url_path='confirm_irrelevant')
    def confirm_irrelevant(self, request, pk=None):
        inst, error = self._decide(request)
        if error:
            return error
        services.confirm_irrelevant(inst, request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'], url_path='keep_relevant')
    def keep_relevant(self, request, pk=None):
        inst, error = self._decide(request)
        if error:
            return error
        services.keep_relevant(inst, (request.data.get('comment') or '').strip()[:500], request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'], url_path='notify_call_failed')
    def notify_call_failed(self, request, pk=None):
        """СМ не дозвонился до контактного лица — СМС «перезвоните»."""
        if request.user.role not in SCHEDULE_ROLES:
            return _forbidden('Отправляет сервис-менеджер.')
        inst = self.get_object()
        if inst.is_closed:
            return _bad('Монтаж закрыт.')
        if not (inst.contact_phone or inst.order.contact_phone):
            return _bad('У контактного лица нет телефона.')
        if not sms.send(inst, sms.call_failed(request.user), actor=request.user, purpose='call_failed'):
            return _bad('Не удалось отправить СМС.')
        return Response(self._detail(inst))


    # ---------- Этап 3: монтажник ----------

    def _installer_or_sm(self, request, inst):
        """Действие монтажника по текущему выезду (СМ может сделать за него)."""
        if request.user.role in SCHEDULE_ROLES or is_installer_of(request.user, inst):
            return None
        return _forbidden('Это делает монтажник, назначенный на монтаж.')

    @action(detail=True, methods=['post'], url_path='installer_call_failed')
    def installer_call_failed(self, request, pk=None):
        """Монтажник не дозвонился до клиента — СМС «перезвоните монтажнику»."""
        inst = self.get_object()
        if (error := self._installer_or_sm(request, inst)):
            return error
        if inst.status != InstallationStatus.PLANNED:
            return _bad('Монтаж не запланирован.')
        if not (inst.contact_phone or inst.order.contact_phone):
            return _bad('У контактного лица нет телефона.')
        if not services.installer_call_failed(inst, request.user):
            return _bad('Не удалось отправить уведомление.')
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """Монтажник переносит дату: {date_from, date_to, reason}. СМ потом подтверждает."""
        inst = self.get_object()
        if (error := self._installer_or_sm(request, inst)):
            return error
        if inst.status != InstallationStatus.PLANNED:
            return _bad('Монтаж не запланирован.')
        date_from = _parse_date(request.data.get('date_from'))
        date_to = _parse_date(request.data.get('date_to')) or date_from
        reason = (request.data.get('reason') or '').strip()[:500]
        if not date_from or date_to < date_from:
            return _bad('Укажите новые даты.')
        if not reason:
            return _bad('Укажите причину переноса.')
        visit = inst.current_visit
        if (visit.date_from, visit.date_to) == (date_from, date_to):
            return _bad('Даты не изменились.')
        services.reschedule_by_installer(inst, date_from=date_from, date_to=date_to, reason=reason,
                                         actor=request.user)
        return Response(self._detail(inst))

    def _pending_reschedule(self, request):
        if request.user.role not in SCHEDULE_ROLES:
            return None, _forbidden('Перенос подтверждает сервис-менеджер.')
        inst = self.get_object()
        visit = inst.current_visit
        if inst.status != InstallationStatus.PLANNED or not visit or not visit.reschedule_requested_at:
            return None, _bad('Переноса, ждущего решения, нет.')
        return inst, None

    @action(detail=True, methods=['post'], url_path='confirm_reschedule')
    def confirm_reschedule(self, request, pk=None):
        inst, error = self._pending_reschedule(request)
        if error:
            return error
        services.confirm_reschedule(inst, request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'], url_path='reject_reschedule')
    def reject_reschedule(self, request, pk=None):
        inst, error = self._pending_reschedule(request)
        if error:
            return error
        services.reject_reschedule(inst, (request.data.get('comment') or '').strip()[:500], request.user)
        return Response(self._detail(inst))

    def _complete(self, request, partial):
        inst = self.get_object()
        if (error := self._installer_or_sm(request, inst)):
            return error
        if inst.status != InstallationStatus.PLANNED:
            return _bad('Завершить можно запланированный монтаж.')
        if not services.has_current_act(inst):
            return _bad('Сначала прикрепите акт выполненных работ с подписью клиента.')
        services.complete(inst, partial=partial, actor=request.user)
        return Response(self._detail(inst))

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return self._complete(request, partial=False)

    @action(detail=True, methods=['post'], url_path='complete_partial')
    def complete_partial(self, request, pk=None):
        return self._complete(request, partial=True)


class InstallationFileViewSet(mixins.CreateModelMixin, mixins.DestroyModelMixin,
                              viewsets.GenericViewSet):
    """Файлы пакета документов монтажа: добавить / удалить, пока монтаж не завершён."""
    permission_classes = [permissions.IsAuthenticated, CanSeeInstallations]
    serializer_class = InstallationFileSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return InstallationFile.objects.filter(
            installation__in=installations_for_user(self.request.user),
        ).select_related('installation', 'installation__order')

    def create(self, request, *args, **kwargs):
        inst_id = request.data.get('installation')
        inst = installations_for_user(request.user).filter(
            pk=inst_id if str(inst_id or '').isdigit() else None,
        ).first()
        if inst is None:
            return Response({'installation': ['Монтаж не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        if inst.is_closed:
            return Response({'detail': 'Монтаж закрыт — файлы не меняются.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data['kind']
        if request.user.role == INSTALLER_ROLE and (
            kind not in INSTALLER_FILE_KINDS or not is_installer_of(request.user, inst)
        ):
            return _forbidden('Монтажник прикладывает акт и фото/видео своего монтажа.')
        if kind in INSTALLER_FILE_KINDS and inst.status != InstallationStatus.PLANNED:
            return _bad('Акт и фото результата прикладывают к запланированному монтажу.')
        upload = serializer.validated_data['file']
        f = services.add_file(inst, kind=kind, upload=upload, actor=request.user,
                              name=serializer.validated_data.get('name') or upload.name[:255])
        return Response(self.get_serializer(f).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        f = self.get_object()
        inst = f.installation
        if request.user.role == INSTALLER_ROLE and f.uploaded_by_id != request.user.id:
            return _forbidden('Монтажник удаляет только свои файлы.')
        if inst.is_closed:
            return Response({'detail': 'Монтаж закрыт — файлы не меняются.'}, status=status.HTTP_400_BAD_REQUEST)
        # Последний файл обязательного вида не удаляем — пакет должен остаться полным
        if (
            f.kind in services.required_file_kinds(inst.order)
            and not inst.files.filter(kind=f.kind).exclude(pk=f.pk).exists()
        ):
            return Response(
                {'detail': f'«{f.get_kind_display()}» обязателен: сначала загрузите замену.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        description = f'{f.get_kind_display()}: {f.name}'
        f.delete()
        inst.log(EventKind.FILE_DELETED, actor=request.user, description=description)
        return Response(status=status.HTTP_204_NO_CONTENT)
