from rest_framework import serializers

from orders.serializers import format_file_size, infer_attachment_type

from .models import Installation, InstallationEvent, InstallationFile


def _user_name(user):
    if not user:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


class InstallationFileSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    file_url = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    attachment_type = serializers.SerializerMethodField()

    class Meta:
        model = InstallationFile
        fields = [
            'id', 'installation', 'kind', 'kind_display', 'file', 'file_url', 'file_size',
            'attachment_type', 'name', 'created_at',
        ]
        read_only_fields = ['id', 'installation', 'created_at']
        extra_kwargs = {'file': {'write_only': True}}

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None

    def get_file_size(self, obj):
        try:
            return format_file_size(obj.file.size)
        except (OSError, ValueError):
            return ''

    def get_attachment_type(self, obj):
        return infer_attachment_type(obj.name or obj.file.name)


def order_documents(order):
    """
    Документы заказа, которые попадают в пакет монтажа сами: КП заказа и
    бланки выполненных замеров (по публичной ссылке — она открывается без
    входа, так её можно переслать монтажнику или клиенту).
    """
    docs = []
    if order.commercial_offer:
        docs.append({'kind': 'order_kp', 'kind_display': 'КП заказа', 'name': 'КП заказа',
                     'file_url': order.commercial_offer.url})
    request = getattr(order, 'measurement_request', None)
    if request is not None:
        done = getattr(request, 'done_measurements', None)
        if done is None:
            done = [m for m in request.measurements.all() if m.is_done]
        for i, m in enumerate(done, start=1):
            name = 'Бланк замера' if len(done) == 1 else f'Бланк замера {i}'
            docs.append({'kind': 'order_measurement', 'kind_display': 'Бланк замера', 'name': name,
                         'file_url': f'/api/v1/public/measurements/{m.client_access_token}/pdf/'})
    return docs


class InstallationListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    client_name = serializers.CharField(source='order.client_name', read_only=True)
    address = serializers.CharField(source='order.address', read_only=True)
    kp_number = serializers.CharField(source='order.kp_number', read_only=True)
    salon_name = serializers.CharField(source='order.salon.name', read_only=True)
    city_name = serializers.CharField(source='order.salon.city.name', read_only=True)
    manager_name = serializers.SerializerMethodField()
    files = InstallationFileSerializer(many=True, read_only=True)
    order_documents = serializers.SerializerMethodField()

    class Meta:
        model = Installation
        fields = [
            'id', 'order', 'status', 'status_display', 'is_paid',
            'client_name', 'address', 'kp_number', 'salon_name', 'city_name', 'manager_name',
            'contact_name', 'contact_phone',
            'work_description', 'collection_finish', 'planned_delivery_date', 'desired_date_comment',
            'files', 'order_documents', 'created_at', 'updated_at',
        ]

    def get_manager_name(self, obj):
        return _user_name(obj.order.manager)

    def get_order_documents(self, obj):
        return order_documents(obj.order)


class InstallationEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = InstallationEvent
        fields = ['id', 'kind', 'kind_display', 'actor_name', 'description',
                  'old_status', 'new_status', 'meta', 'created_at']

    def get_actor_name(self, obj):
        return _user_name(obj.actor) or 'Система'


class InstallationDetailSerializer(InstallationListSerializer):
    created_by_name = serializers.SerializerMethodField()
    order_status_display = serializers.CharField(source='order.get_status_display', read_only=True)
    measurement_blank_required = serializers.SerializerMethodField()

    class Meta(InstallationListSerializer.Meta):
        fields = InstallationListSerializer.Meta.fields + [
            'created_by_name', 'order_status_display', 'measurement_blank_required',
        ]

    def get_created_by_name(self, obj):
        return _user_name(obj.created_by)

    def get_measurement_blank_required(self, obj):
        from .services import measurement_blank_required
        return measurement_blank_required(obj.order)


# Поля, которые правят после оформления (статус меняется отдельными действиями)
EDITABLE_FIELDS = [
    'is_paid', 'work_description', 'collection_finish', 'planned_delivery_date',
    'desired_date_comment', 'contact_name', 'contact_phone',
]


class InstallationWriteSerializer(serializers.ModelSerializer):
    # Оплачен или нет — менеджер обязан ответить явно, без значения по умолчанию
    is_paid = serializers.BooleanField(required=True)

    class Meta:
        model = Installation
        fields = ['order', *EDITABLE_FIELDS]
        extra_kwargs = {
            'work_description': {'required': True, 'allow_blank': False},
            'collection_finish': {'required': True, 'allow_blank': False},
        }

    def validate_contact_phone(self, value):
        return (value or '').strip()

    def validate(self, attrs):
        # В multipart-форме DRF считает пропущенный флаг за «нет» (как
        # неотмеченный чекбокс) — а ответ «оплачен или нет» обязателен
        if self.instance is None and 'is_paid' not in self.initial_data:
            raise serializers.ValidationError({'is_paid': ['Укажите, оплачен монтаж или нет.']})
        return attrs
