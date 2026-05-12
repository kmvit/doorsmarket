from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import (
    Salon, Order, OrderItem, OrderAddon, OrderAttachment, ActivityKind,
    MeasurementRequest, OrderActionReminder,
)

User = get_user_model()


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

    class Meta:
        model = OrderItem
        fields = [
            'id', 'order', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'door_type_display',
            'opening_type', 'opening_type_display',
            'door_height', 'door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'notes', 'position',
        ]
        read_only_fields = ['id']


class OrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            'id', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'opening_type',
            'door_height', 'door_width',
            'recommended_opening_height', 'recommended_opening_width',
            'notes', 'position',
        ]
        read_only_fields = ['id']


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

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon', 'salon_name',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'status', 'status_display',
            'last_activity_at', 'last_activity_kind', 'last_activity_kind_display',
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    manager = OrderManagerSerializer(read_only=True)
    salon = SalonSerializer(read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    addons = OrderAddonSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    commercial_offer_url = serializers.SerializerMethodField()
    last_activity_kind_display = serializers.CharField(source='get_last_activity_kind_display', read_only=True)
    lift_impossible_warning = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'lift_available', 'stairs_available', 'floor_readiness', 'comment',
            'status', 'status_display', 'commercial_offer_url', 'items', 'addons',
            'last_activity_at', 'last_activity_kind', 'last_activity_kind_display',
            'lift_impossible_warning',
        ]

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
            instance.items.all().delete()
            for idx, item_data in enumerate(items_data):
                OrderItem.objects.create(order=instance, position=idx, **item_data)
        if addons_data is not None:
            instance.addons.all().delete()
            for idx, addon_data in enumerate(addons_data):
                addon_data.setdefault('position', idx)
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
