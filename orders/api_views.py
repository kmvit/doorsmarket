from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Prefetch
from django.utils import timezone

from .models import (
    Salon, Order, OrderItem, OrderAddon, OrderAttachment,
    MeasurementRequest, OrderActionReminder, OrderStatus, ActivityKind,
    Measurement, MeasurementOpening, MeasurementAttachment,
)
from .serializers import (
    SalonSerializer,
    OrderListSerializer,
    OrderDetailSerializer,
    OrderCreateSerializer,
    OrderItemWriteSerializer,
    OrderAttachmentSerializer,
    MeasurementRequestSerializer,
    OrderActionReminderSerializer,
    WorkshopOrderSerializer,
    MeasurementSerializer,
    MeasurementListSerializer,
    MeasurementOpeningSerializer,
    MeasurementOpeningWriteSerializer,
    MeasurementAttachmentSerializer,
)
from .pdf_parser import parse_kp_pdf
from .recommendations import (
    calculate_door_recommendation,
    calculate_opening_recommendation,
    validate_lift_required,
)


class IsAuthenticated(permissions.IsAuthenticated):
    pass


def get_orders_queryset_for_user(user):
    """Базовый ACL-фильтр заказов: менеджер — свой салон, СМ/руководитель — свой город, admin — всё."""
    qs = Order.objects.select_related(
        'manager', 'salon', 'salon__city'
    ).prefetch_related(
        'items',
        'items__attachments',
        'addons',
        Prefetch(
            'attachments',
            queryset=OrderAttachment.objects.filter(order_item__isnull=True),
        ),
    )
    if user.role == 'admin':
        return qs
    if user.role in ('leader', 'service_manager'):
        if hasattr(user, 'city') and user.city:
            return qs.filter(salon__city=user.city)
        return qs.none()
    if user.role == 'manager':
        if hasattr(user, 'salon') and user.salon_id:
            return qs.filter(salon=user.salon)
        return qs.filter(manager=user)
    return qs.none()


class SalonViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SalonSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['city']
    search_fields = ['name', 'address']

    def get_queryset(self):
        user = self.request.user
        qs = Salon.objects.filter(is_active=True).select_related('city')
        if user.role == 'admin':
            return qs
        # Менеджер видит только свой салон (тот, к которому он привязан)
        if user.role == 'manager':
            if hasattr(user, 'salon') and user.salon_id:
                return qs.filter(id=user.salon_id)
            return qs.none()
        # СМ и руководитель — все салоны своего города
        if hasattr(user, 'city') and user.city:
            return qs.filter(city=user.city)
        return qs.none()


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['kp_number', 'client_name', 'address', 'contact_phone']
    ordering_fields = ['created_at', 'updated_at', 'status', 'kp_date', 'client_name']
    ordering = ['-created_at']
    filterset_fields = ['status', 'salon']

    def get_queryset(self):
        user = self.request.user
        qs = get_orders_queryset_for_user(user)

        manager_id = self.request.query_params.get('manager_id')
        if manager_id:
            qs = qs.filter(manager_id=manager_id)

        salon_id = self.request.query_params.get('salon_id')
        if salon_id:
            qs = qs.filter(salon_id=salon_id)

        if self.request.query_params.get('my_orders') == 'true':
            qs = qs.filter(manager=user)

        if self.request.query_params.get('exclude_cancelled') == 'true':
            qs = qs.exclude(status='cancelled')

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return OrderCreateSerializer
        return OrderDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    # ---------- Phase 2: парсинг КП ----------

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def parse_kp(self, request):
        """Парсит загруженный PDF КП и возвращает превью данных без создания заказа."""
        pdf_file = request.FILES.get('file')
        if not pdf_file:
            return Response(
                {'detail': 'Файл КП не передан (поле "file")'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = parse_kp_pdf(pdf_file)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        # Decimal-поля нужно сериализовать как строки
        for item in data.get('items', []):
            for key in ('price', 'amount'):
                if item.get(key) is not None:
                    item[key] = str(item[key])
        return Response(data)

    @action(detail=False, methods=['post'])
    def create_from_parsed(self, request):
        """Создаёт заказ из распарсенных данных. Принимает dict от parse_kp + поля salon/comment."""
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        salon_id = data.pop('salon', None)
        if not salon_id:
            return Response({'detail': 'Не указан салон'}, status=status.HTTP_400_BAD_REQUEST)

        # Обязательное «следующее действие»
        next_action_text = (data.pop('next_action_text', None) or '').strip()
        next_action_due = data.pop('next_action_due_at', None)
        if not next_action_text or not next_action_due:
            return Response(
                {'detail': 'Укажите следующее действие по заказу и его срок (next_action_text + next_action_due_at)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = data.pop('items', []) or []
        addons = data.pop('addons', []) or []

        order_kwargs = {
            'salon_id': salon_id,
            'client_name': (data.get('client_name') or '').strip()[:255] or 'Не указан',
            'contact_phone': (data.get('contact_phone') or '')[:50],
            'address': (data.get('address') or '')[:500],
            'kp_number': (data.get('kp_number') or '')[:100],
            'kp_date': data.get('kp_date') or None,
            'comment': (data.get('comment') or ''),
            'manager': request.user,
            'status': OrderStatus.ACTIVE,
            'last_activity_at': timezone.now(),
            'last_activity_kind': ActivityKind.CREATED,
        }
        order = Order.objects.create(**order_kwargs)

        for idx, item in enumerate(items):
            OrderItem.objects.create(
                order=order,
                opening_number=int(item.get('opening_number') or (idx + 1)),
                room_name=(item.get('room_name') or '')[:255],
                model_name=(item.get('model_name') or '')[:500],
                quantity=int(item.get('quantity') or 1),
                price=item.get('price') or None,
                amount=item.get('amount') or None,
                door_type=item.get('door_type') or '',
                opening_type=item.get('opening_type') or '',
                door_height=item.get('door_height') or None,
                door_width=item.get('door_width') or None,
                recommended_opening_height=item.get('recommended_opening_height') or None,
                recommended_opening_width=item.get('recommended_opening_width') or None,
                notes=(item.get('notes') or ''),
                position=idx,
            )

        for idx, addon in enumerate(addons):
            OrderAddon.objects.create(
                order=order,
                kind=addon.get('kind') or 'extra',
                name=(addon.get('name') or '')[:500],
                quantity=addon.get('quantity') or 1,
                size=(addon.get('size') or '')[:100],
                opening_type=addon.get('opening_type') or '',
                price=addon.get('price') or None,
                amount=addon.get('amount') or None,
                comment=(addon.get('comment') or ''),
                position=idx,
            )

        # Создаём обязательное «следующее действие»
        OrderActionReminder.objects.create(
            order=order,
            action_text=next_action_text[:500],
            due_at=next_action_due,
            created_by=request.user,
        )

        serializer = OrderDetailSerializer(order, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ---------- Phase 2: Заявка на замер ----------

    @action(
        detail=True, methods=['get', 'post', 'patch'],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
        url_path='measurement-request',
    )
    def measurement_request(self, request, pk=None):
        """GET / POST / PATCH заявки на замер по заказу."""
        order = self.get_object()
        instance = MeasurementRequest.objects.filter(order=order).first()

        if request.method == 'GET':
            if not instance:
                return Response(None)
            return Response(MeasurementRequestSerializer(instance, context={'request': request}).data)

        partial = request.method == 'PATCH' or instance is not None
        serializer = MeasurementRequestSerializer(
            instance, data=request.data, partial=partial, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        is_create = instance is None
        instance = serializer.save(
            order=order,
            created_by=request.user if is_create else instance.created_by,
        )
        if is_create:
            order.status = OrderStatus.MEASUREMENT_REQUESTED
            order.touch_activity(ActivityKind.MEASUREMENT_REQUESTED, save=False)
            order.save()
        return Response(
            MeasurementRequestSerializer(instance, context={'request': request}).data,
            status=status.HTTP_201_CREATED if is_create else status.HTTP_200_OK,
        )


class OrderItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderItemWriteSerializer

    def get_queryset(self):
        order_pk = self.kwargs.get('order_pk')
        return OrderItem.objects.filter(order_id=order_pk)

    def perform_create(self, serializer):
        order_pk = self.kwargs.get('order_pk')
        serializer.save(order_id=order_pk)


class OrderActionReminderViewSet(viewsets.ModelViewSet):
    """CRUD напоминаний (наработок). Видны напоминания доступных пользователю заказов."""
    permission_classes = [IsAuthenticated]
    serializer_class = OrderActionReminderSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['order', 'done']
    ordering = ['done', 'due_at']

    def get_queryset(self):
        user = self.request.user
        accessible_ids = list(get_orders_queryset_for_user(user).values_list('id', flat=True))
        qs = OrderActionReminder.objects.filter(order_id__in=accessible_ids).select_related(
            'order', 'created_by'
        )
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(created_by=user)
        if self.request.query_params.get('today') == 'true':
            today = timezone.localdate()
            qs = qs.filter(due_at__date=today, done=False)
        if self.request.query_params.get('overdue') == 'true':
            qs = qs.filter(due_at__lt=timezone.now(), done=False)
        return qs

    def perform_create(self, serializer):
        reminder = serializer.save(created_by=self.request.user)
        reminder.order.touch_activity(ActivityKind.UPDATED)

    @action(detail=True, methods=['post'])
    def mark_done(self, request, pk=None):
        """
        Закрывает напоминание. Опционально меняет статус заказа.
        Передаём `new_status` (один из OrderStatus) — будет применён к заказу
        и создаст новое напоминание-«заглушка», если заказчик хочет следующее действие.
        Также можно передать `next_action_text` + `next_action_due_at` для авто-создания
        следующего напоминания.
        """
        reminder = self.get_object()
        reminder.done = True
        reminder.done_at = timezone.now()
        reminder.save(update_fields=['done', 'done_at'])

        new_status = request.data.get('new_status')
        order = reminder.order
        if new_status and new_status in dict(OrderStatus.choices):
            old_status = order.status
            order.status = new_status
            order.touch_activity(ActivityKind.STATUS_CHANGED, save=False)
            order.save(update_fields=['status', 'last_activity_at', 'last_activity_kind'])

        # Авто-создание следующего напоминания
        next_text = request.data.get('next_action_text')
        next_due = request.data.get('next_action_due_at')
        next_reminder = None
        if next_text and next_due:
            next_reminder = OrderActionReminder.objects.create(
                order=order,
                action_text=str(next_text)[:500],
                due_at=next_due,
                created_by=request.user,
            )

        result = OrderActionReminderSerializer(reminder).data
        if next_reminder:
            result['next_reminder'] = OrderActionReminderSerializer(next_reminder).data
        return Response(result)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        reminder = self.get_object()
        new_due = request.data.get('due_at')
        if not new_due:
            return Response({'detail': 'due_at обязателен'}, status=status.HTTP_400_BAD_REQUEST)
        reminder.due_at = new_due
        reminder.done = False
        reminder.done_at = None
        reminder.notified = False
        reminder.save()
        return Response(OrderActionReminderSerializer(reminder).data)


class WorkshopViewSet(viewsets.ReadOnlyModelViewSet):
    """Список Наработок — заказы менеджера со связкой ближайшее напоминание + статус + телефон."""
    permission_classes = [IsAuthenticated]
    serializer_class = WorkshopOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'salon', 'manager']
    # Поиск по любому из полей таблицы (как в рекламациях)
    search_fields = [
        'id', 'kp_number', 'client_name', 'address', 'contact_phone',
        'comment', 'salon__name', 'manager__first_name', 'manager__last_name',
        'manager__username', 'action_reminders__action_text',
    ]
    ordering_fields = ['created_at', 'last_activity_at', 'status', 'client_name', 'kp_number']
    ordering = ['-last_activity_at']

    def get_queryset(self):
        user = self.request.user
        qs = get_orders_queryset_for_user(user)
        # Подгружаем ближайшее активное напоминание
        qs = qs.prefetch_related(
            Prefetch(
                'action_reminders',
                queryset=OrderActionReminder.objects.filter(done=False).order_by('due_at'),
                to_attr='_active_reminders',
            )
        )
        # Фильтры из ТЗ Workshop
        if self.request.query_params.get('mine') == 'true':
            qs = qs.filter(manager=user)
        if self.request.query_params.get('with_reminder_today') == 'true':
            today = timezone.localdate()
            qs = qs.filter(action_reminders__due_at__date=today, action_reminders__done=False).distinct()
        if self.request.query_params.get('with_overdue_reminder') == 'true':
            qs = qs.filter(action_reminders__due_at__lt=timezone.now(), action_reminders__done=False).distinct()
        return qs

    def get_serializer(self, *args, **kwargs):
        # Прокидываем _next_reminder в инстанс заказа
        serializer = super().get_serializer(*args, **kwargs)
        return serializer

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        for order in qs:
            active = getattr(order, '_active_reminders', None)
            order._next_reminder = active[0] if active else None
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ==================== Phase 3: Замер ====================

def get_measurements_queryset_for_user(user):
    """ACL для замеров — те же правила, что и для заказов."""
    accessible_orders = get_orders_queryset_for_user(user).values_list('id', flat=True)
    return Measurement.objects.filter(
        request__order_id__in=list(accessible_orders)
    ).select_related(
        'request', 'request__order', 'request__order__manager',
        'request__order__salon', 'service_manager',
    ).prefetch_related(
        'openings',
        'openings__attachments',
        'attachments',
        'request__order__attachments',
        'request__order__attachments__order_item',
    )


class MeasurementViewSet(viewsets.ModelViewSet):
    """
    CRUD замеров. Доступен СМ (свой город), менеджеру (свой салон), admin/leader.
    """
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_done', 'is_processed', 'service_manager']
    search_fields = [
        'id', 'request__order__id', 'request__order__client_name',
        'request__order__address', 'request__order__kp_number',
        'request__contact_name', 'request__contact_phone',
    ]
    ordering_fields = ['created_at', 'measurement_date', 'done_at']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = get_measurements_queryset_for_user(self.request.user)
        # Folder-фильтры из ТЗ:
        folder = self.request.query_params.get('folder')
        if folder == 'unscheduled':
            # Ожидают назначения — measurement_date пуст
            qs = qs.filter(measurement_date__isnull=True, is_done=False)
        elif folder == 'scheduled':
            # Запланированные — есть дата, не выполнен
            qs = qs.filter(measurement_date__isnull=False, is_done=False)
        elif folder == 'today':
            today = timezone.localdate()
            qs = qs.filter(measurement_date__date=today, is_done=False)
        elif folder == 'done':
            qs = qs.filter(is_done=True)
        elif folder == 'mine':
            qs = qs.filter(service_manager=self.request.user)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return MeasurementListSerializer
        return MeasurementSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    # ---- Создание замера из заявки (СМ берёт заявку в работу) ----
    @action(detail=False, methods=['post'])
    def create_from_request(self, request):
        """
        Создаёт пустой замер из MeasurementRequest. Если уже есть — возвращает существующий.
        Тело: {request_id: int, measurement_date: ISO-datetime (optional)}
        Также копирует проёмы из OrderItem.
        """
        request_id = request.data.get('request_id')
        if not request_id:
            return Response({'detail': 'Не указан request_id'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            mr = MeasurementRequest.objects.select_related('order').get(pk=request_id)
        except MeasurementRequest.DoesNotExist:
            return Response({'detail': 'Заявка не найдена'}, status=status.HTTP_404_NOT_FOUND)

        # ACL: только СМ/admin/leader того же города или менеджер заказа
        accessible = get_orders_queryset_for_user(request.user).filter(id=mr.order_id).exists()
        if not accessible:
            return Response({'detail': 'Нет доступа'}, status=status.HTTP_403_FORBIDDEN)

        m = Measurement.objects.filter(request=mr).first()
        is_create = m is None
        if is_create:
            m = Measurement.objects.create(
                request=mr,
                service_manager=request.user,
                measurement_date=request.data.get('measurement_date') or None,
            )
            # Копируем проёмы из OrderItem
            for item in mr.order.items.all():
                MeasurementOpening.objects.create(
                    measurement=m,
                    order_item=item,
                    opening_number=item.opening_number,
                    room_name=item.room_name,
                    door_height_by_order=item.door_height,
                    door_width_by_order=item.door_width,
                    opening_type=item.opening_type or '',
                )

        # Если назначили дату при создании — статус scheduled
        if m.measurement_date and mr.order.status == OrderStatus.MEASUREMENT_REQUESTED:
            mr.order.status = OrderStatus.MEASUREMENT_SCHEDULED
            mr.order.touch_activity(ActivityKind.MEASUREMENT_SCHEDULED, save=False)
            mr.order.save()

        return Response(
            MeasurementSerializer(m, context={'request': request}).data,
            status=status.HTTP_201_CREATED if is_create else status.HTTP_200_OK,
        )

    # ---- Назначить дату/время замера ----
    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        m = self.get_object()
        date = request.data.get('measurement_date')
        if not date:
            return Response({'detail': 'Не указана дата'}, status=status.HTTP_400_BAD_REQUEST)
        m.measurement_date = date
        m.save(update_fields=['measurement_date', 'updated_at'])
        order = m.request.order
        if order.status in (OrderStatus.MEASUREMENT_REQUESTED, OrderStatus.MEASUREMENT_SCHEDULED):
            order.status = OrderStatus.MEASUREMENT_SCHEDULED
            order.touch_activity(ActivityKind.MEASUREMENT_SCHEDULED, save=False)
            order.save()
        return Response(MeasurementSerializer(m, context={'request': request}).data)

    # ---- Отметить выполненным (СМ) ----
    @action(detail=True, methods=['post'])
    def mark_done(self, request, pk=None):
        m = self.get_object()
        # Валидация: opening_plan обязателен
        if not (m.request.opening_plan or m.attachments.exists()):
            return Response(
                {'detail': 'Перед закрытием замера приложите план открывания.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        m.is_done = True
        m.done_at = timezone.now()
        m.save(update_fields=['is_done', 'done_at', 'updated_at'])
        order = m.request.order
        order.status = OrderStatus.MEASUREMENT_DONE
        order.touch_activity(ActivityKind.MEASUREMENT_DONE, save=False)
        order.save()
        return Response(MeasurementSerializer(m, context={'request': request}).data)

    # ---- Менеджер: «обработан» ----
    @action(detail=True, methods=['post'])
    def mark_processed(self, request, pk=None):
        m = self.get_object()
        if not m.is_done:
            return Response(
                {'detail': 'Сначала замер должен быть выполнен СМ.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        m.is_processed = True
        m.processed_at = timezone.now()
        m.save(update_fields=['is_processed', 'processed_at', 'updated_at'])
        order = m.request.order
        order.status = OrderStatus.MEASUREMENT_PROCESSED
        order.touch_activity(ActivityKind.MEASUREMENT_PROCESSED, save=False)
        order.save()
        return Response(MeasurementSerializer(m, context={'request': request}).data)


class MeasurementOpeningViewSet(viewsets.ModelViewSet):
    """CRUD проёмов замера. Авто-расчёт рекомендаций при сохранении."""
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementOpeningSerializer

    def get_queryset(self):
        accessible_measurements = get_measurements_queryset_for_user(self.request.user).values_list('id', flat=True)
        qs = MeasurementOpening.objects.filter(measurement_id__in=list(accessible_measurements))
        m_id = self.request.query_params.get('measurement')
        if m_id:
            qs = qs.filter(measurement_id=m_id)
        return qs.prefetch_related('attachments')

    def perform_create(self, serializer):
        instance = serializer.save()
        self._recalc_recommendations(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._recalc_recommendations(instance)

    def _recalc_recommendations(self, op: MeasurementOpening):
        """Авто-расчёт рекомендуемых размеров двери и проёма."""
        if op.actual_height or op.actual_width:
            rec_dh, rec_dw = calculate_door_recommendation(op.actual_height, op.actual_width)
            op.recommended_door_height = rec_dh
            op.recommended_door_width = rec_dw
        if op.door_height_by_order or op.door_width_by_order:
            rec_oh, rec_ow = calculate_opening_recommendation(op.door_height_by_order, op.door_width_by_order)
            op.recommended_opening_height = rec_oh
            op.recommended_opening_width = rec_ow
        op.save(update_fields=[
            'recommended_door_height', 'recommended_door_width',
            'recommended_opening_height', 'recommended_opening_width',
        ])


class MeasurementAttachmentViewSet(viewsets.ModelViewSet):
    """Загрузка / удаление вложений замера."""
    permission_classes = [IsAuthenticated]
    serializer_class = MeasurementAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        accessible_measurements = get_measurements_queryset_for_user(self.request.user).values_list('id', flat=True)
        return MeasurementAttachment.objects.filter(measurement_id__in=list(accessible_measurements))

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx


class OrderAttachmentViewSet(viewsets.ModelViewSet):
    """Загрузка / удаление вложений заказа (по заказу или по проёму)."""
    permission_classes = [IsAuthenticated]
    serializer_class = OrderAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        accessible_orders = get_orders_queryset_for_user(self.request.user).values_list('id', flat=True)
        qs = OrderAttachment.objects.filter(
            Q(order_id__in=list(accessible_orders))
            | Q(order_item__order_id__in=list(accessible_orders))
        )
        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(Q(order_id=order_id) | Q(order_item__order_id=order_id))
        order_item_id = self.request.query_params.get('order_item')
        if order_item_id:
            qs = qs.filter(order_item_id=order_item_id)
        return qs.select_related('order', 'order_item')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        instance = serializer.save()
        order = instance.order or (instance.order_item.order if instance.order_item_id else None)
        if order:
            order.touch_activity(ActivityKind.FILE_ATTACHED)
