from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Prefetch
from django.utils import timezone

from .models import (
    Salon, Order, OrderItem, OrderItemAddon,
    MeasurementRequest, OrderActionReminder, OrderStatus, ActivityKind,
)
from .serializers import (
    SalonSerializer,
    OrderListSerializer,
    OrderDetailSerializer,
    OrderCreateSerializer,
    OrderItemWriteSerializer,
    MeasurementRequestSerializer,
    OrderActionReminderSerializer,
    WorkshopOrderSerializer,
)
from .pdf_parser import parse_kp_pdf


class IsAuthenticated(permissions.IsAuthenticated):
    pass


def get_orders_queryset_for_user(user):
    """Базовый ACL-фильтр заказов: менеджер — свой салон, СМ/руководитель — свой город, admin — всё."""
    qs = Order.objects.select_related(
        'manager', 'salon', 'salon__city'
    ).prefetch_related('items__addons')
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
        if hasattr(user, 'city') and user.city:
            return qs.filter(city=user.city)
        return qs


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
        """Создаёт заказ из распарсенных данных. Принимает тот же dict, что parse_kp вернул."""
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        salon_id = data.pop('salon', None)
        if not salon_id:
            return Response({'detail': 'Не указан салон'}, status=status.HTTP_400_BAD_REQUEST)

        items = data.pop('items', []) or []
        # Маппим поля парсера на поля Order
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
            addons = item.pop('addons', []) or []
            order_item = OrderItem.objects.create(
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
                notes=(item.get('notes') or ''),
                position=idx,
            )
            for addon in addons:
                OrderItemAddon.objects.create(
                    item=order_item,
                    kind=addon.get('kind') or 'extra',
                    name=(addon.get('name') or '')[:500],
                    quantity=int(addon.get('quantity') or 1),
                    price=addon.get('price') or None,
                    comment_face=addon.get('comment_face') or '',
                    comment_back=addon.get('comment_back') or '',
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
        return OrderItem.objects.filter(order_id=order_pk).prefetch_related('addons')

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
        reminder = self.get_object()
        reminder.done = True
        reminder.done_at = timezone.now()
        reminder.save(update_fields=['done', 'done_at'])
        return Response(OrderActionReminderSerializer(reminder).data)

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
    filterset_fields = ['status', 'salon']
    search_fields = ['kp_number', 'client_name', 'address', 'contact_phone', 'comment']
    ordering_fields = ['created_at', 'last_activity_at', 'status', 'client_name']
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
