from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from .models import (
    Salon, Order, OrderItem, OrderAddon, OrderAttachment, ActivityKind,
    MeasurementRequest, OrderActionReminder,
    Measurement, MeasurementOpening, MeasurementAttachment,
    OrderActivityLog, OVERDUE_STATUSES,
)

User = get_user_model()


def infer_attachment_type(filename: str) -> str:
    ext = (filename or '').lower().rsplit('.', 1)[-1]
    if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'):
        return 'photo'
    if ext in ('mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'):
        return 'video'
    return 'document'


def format_file_size(size_bytes):
    if not size_bytes:
        return ''
    if size_bytes < 1024:
        return f'{size_bytes} B'
    if size_bytes < 1024 * 1024:
        return f'{size_bytes / 1024:.1f} KB'
    return f'{size_bytes / (1024 * 1024):.1f} MB'


class OrderAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    attachment_type = serializers.SerializerMethodField()

    class Meta:
        model = OrderAttachment
        fields = [
            'id', 'order', 'order_item', 'file', 'file_url',
            'file_size', 'attachment_type', 'name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'file_url', 'file_size', 'attachment_type']
        extra_kwargs = {'file': {'write_only': True}}

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def get_file_size(self, obj):
        try:
            return format_file_size(obj.file.size)
        except (OSError, ValueError):
            return ''

    def get_attachment_type(self, obj):
        return infer_attachment_type(obj.name or obj.file.name)

    def validate(self, attrs):
        order = attrs.get('order')
        order_item = attrs.get('order_item')
        if not order and not order_item:
            raise serializers.ValidationError('Укажите заказ или позицию (проём).')
        if order_item and not order:
            attrs['order'] = order_item.order
        elif order and order_item and order_item.order_id != order.id:
            raise serializers.ValidationError('Позиция не принадлежит указанному заказу.')
        return attrs

    def create(self, validated_data):
        file = validated_data.get('file')
        if file and not validated_data.get('name'):
            validated_data['name'] = file.name
        return super().create(validated_data)


class SalonSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source='city.name', read_only=True)

    class Meta:
        model = Salon
        fields = ['id', 'name', 'city', 'city_name', 'address', 'phone', 'is_active']


class OrderAddonSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    opening_type_display = serializers.CharField(source='get_opening_type_display', read_only=True)

    class Meta:
        model = OrderAddon
        fields = [
            'id', 'order', 'kind', 'kind_display', 'name', 'quantity',
            'size', 'opening_type', 'opening_type_display',
            'price', 'amount', 'comment', 'position',
        ]
        read_only_fields = ['id']


class OrderItemSerializer(serializers.ModelSerializer):
    door_type_display = serializers.CharField(source='get_door_type_display', read_only=True)
    opening_type_display = serializers.CharField(source='get_opening_type_display', read_only=True)
    attachments = OrderAttachmentSerializer(many=True, read_only=True)
    measurement_data = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'order', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'door_type_display',
            'opening_type', 'opening_type_display',
            'door_height', 'door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'notes', 'position', 'attachments', 'measurement_data',
        ]
        read_only_fields = ['id']

    def get_measurement_data(self, obj):
        """
        Снимок из связанного MeasurementOpening (если менеджер привязал замер).
        Используется в OrderDetail для столбцов «из Замера» и столбца «Рекомендации».
        Берём самый свежий связанный проём — на случай нескольких замеров по заказу.
        """
        op = obj.measurement_openings.order_by('-id').first()
        if op is None:
            return None
        from .recommendations import build_recommendation_text
        door_h = op.desired_door_height or op.recommended_door_height
        door_w = op.desired_door_width or op.recommended_door_width
        return {
            'opening_id': op.id,
            'opening_number': op.opening_number,
            'room_name': op.room_name,
            'door_type': op.door_type,
            'actual_height': op.actual_height,
            'actual_width': op.actual_width,
            'actual_depth': op.actual_depth,
            'recommended_door_height': op.recommended_door_height,
            'recommended_door_width': op.recommended_door_width,
            'recommended_opening_height': op.recommended_opening_height,
            'recommended_opening_width': op.recommended_opening_width,
            'desired_door_height': op.desired_door_height,
            'desired_door_width': op.desired_door_width,
            'opening_type': op.opening_type,
            'notes': op.notes,
            'recommendation_text': build_recommendation_text(
                op.actual_height, op.actual_width, door_h, door_w,
            ),
        }


class OrderItemWriteSerializer(serializers.ModelSerializer):
    # id передаётся с фронта при редактировании, чтобы обновлять позиции «на месте»
    # (по id), а не удалять+пересоздавать — иначе рвутся связки замера
    # (MeasurementOpening.order_item) и слетают рекомендации.
    id = serializers.IntegerField(required=False)

    class Meta:
        model = OrderItem
        fields = [
            'id', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'opening_type',
            'door_height', 'door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'notes', 'position',
        ]


class OrderAddonWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderAddon
        fields = [
            'id', 'kind', 'name', 'quantity', 'size', 'opening_type',
            'price', 'amount', 'comment', 'position',
        ]
        read_only_fields = ['id']


class OrderManagerSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'phone_number']

    def get_full_name(self, obj):
        name = f'{obj.first_name} {obj.last_name}'.strip()
        return name or obj.username


class OrderListSerializer(serializers.ModelSerializer):
    manager = OrderManagerSerializer(read_only=True)
    salon_name = serializers.CharField(source='salon.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    last_activity_kind_display = serializers.CharField(source='get_last_activity_kind_display', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon', 'salon_name',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'status', 'status_display', 'is_overdue',
            'last_activity_at', 'last_activity_kind', 'last_activity_kind_display',
        ]

    def get_is_overdue(self, obj):
        return obj.status in OVERDUE_STATUSES


class OrderDetailSerializer(serializers.ModelSerializer):
    manager = OrderManagerSerializer(read_only=True)
    salon = SalonSerializer(read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    addons = OrderAddonSerializer(many=True, read_only=True)
    attachments = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    commercial_offer_url = serializers.SerializerMethodField()
    last_activity_kind_display = serializers.CharField(source='get_last_activity_kind_display', read_only=True)
    lift_impossible_warning = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'lift_available', 'stairs_available', 'floor_readiness', 'comment',
            'status', 'status_display', 'commercial_offer_url', 'items', 'addons',
            'attachments',
            'production_start_date', 'production_deadline', 'is_overdue',
            'last_activity_at', 'last_activity_kind', 'last_activity_kind_display',
            'lift_impossible_warning',
        ]

    def get_is_overdue(self, obj):
        return obj.status in OVERDUE_STATUSES

    def get_attachments(self, obj):
        qs = obj.attachments.filter(order_item__isnull=True)
        return OrderAttachmentSerializer(qs, many=True, context=self.context).data

    def get_lift_impossible_warning(self, obj):
        """Если подъем невозможен ни на лифте, ни по лестнице — выводим предупреждение."""
        if obj.lift_available is False and obj.stairs_available is False:
            return 'При данных размерах подъем невозможен.'
        return None

    def get_commercial_offer_url(self, obj):
        if obj.commercial_offer:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.commercial_offer.url)
        return None


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemWriteSerializer(many=True, required=False)
    addons = OrderAddonWriteSerializer(many=True, required=False)
    next_action_text = serializers.CharField(write_only=True, required=False, allow_blank=True)
    next_action_due_at = serializers.DateTimeField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Order
        fields = [
            'salon', 'kp_number', 'kp_date', 'client_name', 'contact_phone',
            'address', 'lift_available', 'stairs_available', 'floor_readiness',
            'comment', 'status', 'items', 'addons',
            'production_start_date', 'production_deadline',
            'next_action_text', 'next_action_due_at',
        ]

    def validate(self, attrs):
        # При CREATE — «следующее действие» обязательно
        if self.instance is None:
            if not (attrs.get('next_action_text') or '').strip():
                raise serializers.ValidationError({
                    'next_action_text': 'Укажите следующее действие по заказу',
                })
            if not attrs.get('next_action_due_at'):
                raise serializers.ValidationError({
                    'next_action_due_at': 'Укажите срок следующего действия',
                })
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        addons_data = validated_data.pop('addons', [])
        next_action_text = (validated_data.pop('next_action_text', '') or '').strip()
        next_action_due = validated_data.pop('next_action_due_at', None)
        validated_data['manager'] = self.context['request'].user
        validated_data['last_activity_at'] = timezone.now()
        validated_data['last_activity_kind'] = ActivityKind.CREATED
        order = Order.objects.create(**validated_data)
        for idx, item_data in enumerate(items_data):
            # position задаём порядком в списке; убираем возможный дубль из payload,
            # иначе create() упадёт с "multiple values for keyword argument 'position'".
            item_data.pop('position', None)
            item_data.pop('id', None)
            OrderItem.objects.create(order=order, position=idx, **item_data)
        for idx, addon_data in enumerate(addons_data):
            addon_data.setdefault('position', idx)
            OrderAddon.objects.create(order=order, **addon_data)
        if next_action_text and next_action_due:
            OrderActionReminder.objects.create(
                order=order,
                action_text=next_action_text[:500],
                due_at=next_action_due,
                created_by=self.context['request'].user,
            )
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        addons_data = validated_data.pop('addons', None)
        old_status = instance.status
        # Всё обновление — в одной транзакции: позиции удаляются и пересоздаются,
        # и если пересоздание упадёт, удаление откатится. Иначе при любой ошибке
        # заказ остаётся без позиций КП.
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.last_activity_at = timezone.now()
            if 'status' in validated_data and validated_data['status'] != old_status:
                instance.last_activity_kind = ActivityKind.STATUS_CHANGED
            elif items_data is not None or addons_data is not None:
                instance.last_activity_kind = ActivityKind.ITEMS_CHANGED
            else:
                instance.last_activity_kind = ActivityKind.UPDATED
            instance.save()
            if items_data is not None:
                # Обновляем позиции «на месте» по id, сохраняя их первичные ключи.
                # Это критично: на OrderItem ссылается MeasurementOpening.order_item
                # (связки замера по проёмам). Удаление+пересоздание обнуляло бы эти
                # FK (SET_NULL) — связки и рекомендации слетали при каждом сохранении.
                existing = {i.id: i for i in instance.items.all()}
                seen_ids = set()
                for idx, item_data in enumerate(items_data):
                    item_data.pop('position', None)
                    item_id = item_data.pop('id', None)
                    if item_id and item_id in existing:
                        obj = existing[item_id]
                        for attr, value in item_data.items():
                            setattr(obj, attr, value)
                        obj.position = idx
                        obj.save()
                        seen_ids.add(item_id)
                    else:
                        OrderItem.objects.create(order=instance, position=idx, **item_data)
                # Удаляем только реально убранные менеджером позиции.
                for old_id, obj in existing.items():
                    if old_id not in seen_ids:
                        obj.delete()
            if addons_data is not None:
                instance.addons.all().delete()
                for idx, addon_data in enumerate(addons_data):
                    addon_data['position'] = idx
                    OrderAddon.objects.create(order=instance, **addon_data)
        return instance


class MeasurementRequestSerializer(serializers.ModelSerializer):
    payer_display = serializers.CharField(source='get_payer_display', read_only=True)
    opening_plan_url = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MeasurementRequest
        fields = [
            'id', 'order', 'contact_name', 'contact_position', 'contact_phone',
            'desired_date', 'payer', 'payer_display', 'opening_plan', 'opening_plan_url',
            'comment', 'created_at', 'created_by', 'created_by_name',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'order']
        extra_kwargs = {
            'opening_plan': {'write_only': True, 'required': False, 'allow_null': True},
        }

    def get_opening_plan_url(self, obj):
        if obj.opening_plan:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.opening_plan.url)
        return None

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        u = obj.created_by
        return f'{u.first_name} {u.last_name}'.strip() or u.username


class OrderActionReminderSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = OrderActionReminder
        fields = [
            'id', 'order', 'due_at', 'action_text', 'done', 'done_at',
            'created_at', 'created_by', 'created_by_name', 'notified', 'is_overdue',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'done_at', 'notified']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        u = obj.created_by
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_is_overdue(self, obj):
        if obj.done:
            return False
        return obj.due_at < timezone.now()


class OrderActivityLogSerializer(serializers.ModelSerializer):
    """Журнал событий заказа (Лист 6)."""
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderActivityLog
        fields = [
            'id', 'order', 'kind', 'kind_display', 'actor', 'actor_name',
            'description', 'old_status', 'new_status', 'meta', 'created_at',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return 'Система'
        u = obj.actor
        return f'{u.first_name} {u.last_name}'.strip() or u.username


class WorkshopOrderSerializer(serializers.ModelSerializer):
    """Сериализатор для списка наработок (Workshop) — Лист 3 в ТЗ."""
    manager = OrderManagerSerializer(read_only=True)
    salon_name = serializers.CharField(source='salon.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    last_activity_kind_display = serializers.CharField(source='get_last_activity_kind_display', read_only=True)
    next_action_at = serializers.SerializerMethodField()
    next_action_text = serializers.SerializerMethodField()
    last_comment = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'client_name', 'address', 'status', 'status_display',
            'last_activity_at', 'last_activity_kind', 'last_activity_kind_display',
            'contact_phone', 'kp_number', 'manager', 'salon_name', 'comment',
            'next_action_at', 'next_action_text', 'last_comment',
        ]

    def _next_reminder(self, obj):
        return getattr(obj, '_next_reminder', None) or obj.action_reminders.filter(done=False).order_by('due_at').first()

    def get_next_action_at(self, obj):
        rem = self._next_reminder(obj)
        return rem.due_at if rem else None

    def get_next_action_text(self, obj):
        rem = self._next_reminder(obj)
        return rem.action_text if rem else ''

    def get_last_comment(self, obj):
        return obj.comment or ''


# ==================== Phase 3: Замер ====================

class MeasurementAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = MeasurementAttachment
        fields = ['id', 'measurement', 'opening', 'file', 'file_url', 'name', 'created_at']
        read_only_fields = ['id', 'created_at', 'file_url']
        extra_kwargs = {'file': {'write_only': True}}

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
        return None


class MeasurementOpeningSerializer(serializers.ModelSerializer):
    door_type_display = serializers.CharField(source='get_door_type_display', read_only=True)
    opening_type_display = serializers.CharField(source='get_opening_type_display', read_only=True)
    attachments = MeasurementAttachmentSerializer(many=True, read_only=True)
    inverso_warning = serializers.SerializerMethodField()
    recommendation_text = serializers.SerializerMethodField()
    # Необязателен при создании — если не передан, бэкенд проставит max(opening_number)+1
    opening_number = serializers.IntegerField(required=False)

    class Meta:
        model = MeasurementOpening
        fields = [
            'id', 'measurement', 'order_item', 'opening_number', 'room_name',
            'door_type', 'door_type_display',
            'actual_height', 'actual_width', 'actual_depth',
            'recommended_door_height', 'recommended_door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'desired_door_height', 'desired_door_width',
            'opening_type', 'opening_type_display',
            'addon_width',
            'face_trim_qty', 'face_trim_comment',
            'back_trim_qty', 'back_trim_comment',
            'extra_hardware', 'threshold', 'notes',
            'attachments', 'inverso_warning', 'recommendation_text',
        ]
        read_only_fields = ['id']

    def get_inverso_warning(self, obj):
        from .recommendations import validate_inverso_warning, inverso_warning_text
        return inverso_warning_text() if validate_inverso_warning(obj.opening_type) else None

    def get_recommendation_text(self, obj):
        from .recommendations import build_recommendation_text
        door_h = obj.desired_door_height or obj.recommended_door_height
        door_w = obj.desired_door_width or obj.recommended_door_width
        return build_recommendation_text(
            obj.actual_height, obj.actual_width, door_h, door_w,
        )


class MeasurementOpeningWriteSerializer(serializers.ModelSerializer):
    """Для PUT/PATCH массивом проёмов через MeasurementSerializer."""
    class Meta:
        model = MeasurementOpening
        fields = [
            'id', 'order_item', 'opening_number', 'room_name',
            'door_type',
            'actual_height', 'actual_width', 'actual_depth',
            'recommended_door_height', 'recommended_door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'desired_door_height', 'desired_door_width',
            'opening_type', 'addon_width',
            'face_trim_qty', 'face_trim_comment',
            'back_trim_qty', 'back_trim_comment',
            'extra_hardware', 'threshold', 'notes',
        ]


class MeasurementSerializer(serializers.ModelSerializer):
    """Полный сериализатор замера для CRUD."""
    openings = MeasurementOpeningSerializer(many=True, read_only=True)
    attachments = MeasurementAttachmentSerializer(many=True, read_only=True)
    service_manager_name = serializers.SerializerMethodField()
    order_id = serializers.IntegerField(source='request.order_id', read_only=True)
    client_name = serializers.CharField(source='request.order.client_name', read_only=True)
    address = serializers.CharField(source='request.order.address', read_only=True)
    contact_name = serializers.CharField(source='request.contact_name', read_only=True)
    contact_position = serializers.CharField(source='request.contact_position', read_only=True)
    contact_phone = serializers.CharField(source='request.contact_phone', read_only=True)
    opening_plan_url = serializers.SerializerMethodField()
    signature_photo_url = serializers.SerializerMethodField()
    lift_required = serializers.SerializerMethodField()
    lift_impossible_warning = serializers.SerializerMethodField()
    order_status = serializers.CharField(source='request.order.status', read_only=True)
    order_attachments = serializers.SerializerMethodField()
    # Условия объекта (хранятся в заказе, заполняет СМ при замере)
    lift_available = serializers.BooleanField(source='request.order.lift_available', read_only=True, allow_null=True)
    stairs_available = serializers.BooleanField(source='request.order.stairs_available', read_only=True, allow_null=True)
    floor_readiness = serializers.CharField(source='request.order.floor_readiness', read_only=True, allow_blank=True)

    class Meta:
        model = Measurement
        fields = [
            'id', 'request', 'order_id', 'service_manager', 'service_manager_name',
            'measurement_date', 'signature_photo', 'signature_photo_url',
            'client_access_token', 'is_done', 'done_at', 'is_processed', 'processed_at',
            'created_at', 'updated_at',
            'openings', 'attachments', 'order_attachments',
            'client_name', 'address', 'contact_name', 'contact_position', 'contact_phone',
            'opening_plan_url', 'lift_required', 'lift_impossible_warning', 'order_status',
            'lift_available', 'stairs_available', 'floor_readiness',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'is_done', 'done_at',
            'is_processed', 'processed_at', 'client_access_token',
            'service_manager',
        ]
        extra_kwargs = {'signature_photo': {'write_only': True, 'required': False}}

    def get_service_manager_name(self, obj):
        u = obj.service_manager
        if not u:
            return None
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_opening_plan_url(self, obj):
        request = self.context.get('request')
        plan = obj.request.opening_plan if obj.request else None
        if plan and request:
            return request.build_absolute_uri(plan.url)
        return None

    def get_signature_photo_url(self, obj):
        request = self.context.get('request')
        if obj.signature_photo and request:
            return request.build_absolute_uri(obj.signature_photo.url)
        return None

    def get_lift_required(self, obj):
        from .recommendations import validate_lift_required
        ops = list(obj.openings.values(
            'actual_height', 'desired_door_height', 'recommended_door_height',
        ))
        return validate_lift_required(ops)

    def get_lift_impossible_warning(self, obj):
        from .recommendations import lift_impossible_warning
        order = obj.request.order if obj.request else None
        if not order:
            return None
        return lift_impossible_warning(order.lift_available, order.stairs_available)

    def get_order_attachments(self, obj):
        order = obj.request.order if obj.request else None
        if not order:
            return []
        atts = order.attachments.select_related('order_item').all()
        return OrderAttachmentSerializer(atts, many=True, context=self.context).data


class MeasurementListSerializer(serializers.ModelSerializer):
    """Краткий сериализатор для списка замеров."""
    order_id = serializers.IntegerField(source='request.order_id', read_only=True)
    client_name = serializers.CharField(source='request.order.client_name', read_only=True)
    address = serializers.CharField(source='request.order.address', read_only=True)
    contact_name = serializers.CharField(source='request.contact_name', read_only=True)
    contact_position = serializers.CharField(source='request.contact_position', read_only=True)
    contact_phone = serializers.CharField(source='request.contact_phone', read_only=True)
    desired_date = serializers.DateField(source='request.desired_date', read_only=True)
    payer_display = serializers.CharField(source='request.get_payer_display', read_only=True)
    service_manager_name = serializers.SerializerMethodField()
    order_status = serializers.CharField(source='request.order.status', read_only=True)
    order_status_display = serializers.CharField(source='request.order.get_status_display', read_only=True)
    manager_name = serializers.SerializerMethodField()

    class Meta:
        model = Measurement
        fields = [
            'id', 'order_id', 'client_name', 'address',
            'contact_name', 'contact_position', 'contact_phone',
            'desired_date', 'payer_display',
            'measurement_date', 'is_done', 'done_at', 'is_processed', 'processed_at',
            'service_manager', 'service_manager_name',
            'order_status', 'order_status_display', 'manager_name', 'created_at',
        ]

    def get_service_manager_name(self, obj):
        u = obj.service_manager
        if not u:
            return None
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_manager_name(self, obj):
        m = obj.request.order.manager if obj.request else None
        if not m:
            return None
        return f'{m.first_name} {m.last_name}'.strip() or m.username
