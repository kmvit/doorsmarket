from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Salon, Order, OrderItem, OrderItemAddon, OrderAttachment

User = get_user_model()


class SalonSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source='city.name', read_only=True)

    class Meta:
        model = Salon
        fields = ['id', 'name', 'city', 'city_name', 'address', 'phone', 'is_active']


class OrderItemAddonSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = OrderItemAddon
        fields = ['id', 'item', 'kind', 'kind_display', 'name', 'quantity', 'price', 'comment_face', 'comment_back']
        read_only_fields = ['id']


class OrderItemSerializer(serializers.ModelSerializer):
    addons = OrderItemAddonSerializer(many=True, read_only=True)
    door_type_display = serializers.CharField(source='get_door_type_display', read_only=True)
    opening_type_display = serializers.CharField(source='get_opening_type_display', read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id', 'order', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'door_type_display',
            'opening_type', 'opening_type_display',
            'door_height', 'door_width', 'notes', 'position', 'addons',
        ]
        read_only_fields = ['id']


class OrderItemWriteSerializer(serializers.ModelSerializer):
    addons = OrderItemAddonSerializer(many=True, required=False)

    class Meta:
        model = OrderItem
        fields = [
            'id', 'opening_number', 'room_name', 'model_name',
            'quantity', 'price', 'amount', 'door_type', 'opening_type',
            'door_height', 'door_width', 'notes', 'position', 'addons',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        addons_data = validated_data.pop('addons', [])
        item = OrderItem.objects.create(**validated_data)
        for addon_data in addons_data:
            OrderItemAddon.objects.create(item=item, **addon_data)
        return item

    def update(self, instance, validated_data):
        addons_data = validated_data.pop('addons', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if addons_data is not None:
            instance.addons.all().delete()
            for addon_data in addons_data:
                OrderItemAddon.objects.create(item=instance, **addon_data)
        return instance


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

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon', 'salon_name',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'status', 'status_display',
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    manager = OrderManagerSerializer(read_only=True)
    salon = SalonSerializer(read_only=True)
    items = OrderItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    commercial_offer_url = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'created_at', 'updated_at', 'manager', 'salon',
            'kp_number', 'kp_date', 'client_name', 'contact_phone', 'address',
            'lift_available', 'stairs_available', 'floor_readiness', 'comment',
            'status', 'status_display', 'commercial_offer_url', 'items',
        ]

    def get_commercial_offer_url(self, obj):
        if obj.commercial_offer:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.commercial_offer.url)
        return None


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemWriteSerializer(many=True, required=False)

    class Meta:
        model = Order
        fields = [
            'salon', 'kp_number', 'kp_date', 'client_name', 'contact_phone',
            'address', 'lift_available', 'stairs_available', 'floor_readiness',
            'comment', 'status', 'items',
        ]

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data['manager'] = self.context['request'].user
        order = Order.objects.create(**validated_data)
        for idx, item_data in enumerate(items_data):
            addons_data = item_data.pop('addons', [])
            item = OrderItem.objects.create(order=order, position=idx, **item_data)
            for addon_data in addons_data:
                OrderItemAddon.objects.create(item=item, **addon_data)
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for idx, item_data in enumerate(items_data):
                addons_data = item_data.pop('addons', [])
                item = OrderItem.objects.create(order=instance, position=idx, **item_data)
                for addon_data in addons_data:
                    OrderItemAddon.objects.create(item=item, **addon_data)
        return instance
