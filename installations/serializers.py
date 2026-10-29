from rest_framework import serializers

from orders.serializers import format_file_size, infer_attachment_type

from .models import RATING_FIELDS, Installation, InstallationEvent, InstallationFile, InstallationRating, InstallationVisit


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
            'id', 'installation', 'kind', 'kind_display', 'visit', 'file', 'file_url', 'file_size',
            'attachment_type', 'name', 'uploaded_by', 'review_status', 'review_comment', 'created_at',
        ]
        read_only_fields = ['id', 'installation', 'visit', 'uploaded_by', 'review_status', 'review_comment',
                            'created_at']
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


def rating_scores(rating):
    """Оценка клиента: баллы и комментарии по параметрам формы."""
    return {
        'created_at': rating.created_at,
        'items': [
            {'key': k, 'label': label, 'score': getattr(rating, InstallationRating.column(k)),
             'comment': (rating.comments or {}).get(k, '')}
            for k, label in RATING_FIELDS
        ],
    }


class StaffSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.SerializerMethodField()
    phone_number = serializers.CharField(allow_null=True)

    def get_full_name(self, obj):
        return _user_name(obj)


class InstallationVisitSerializer(serializers.ModelSerializer):
    installers = StaffSerializer(many=True, read_only=True)
    reschedule_requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = InstallationVisit
        fields = [
            'id', 'date_from', 'date_to', 'installers',
            'reschedule_requested_at', 'reschedule_requested_by_name', 'reschedule_reason',
            'previous_date_from', 'previous_date_to',
        ]

    def get_reschedule_requested_by_name(self, obj):
        return _user_name(obj.reschedule_requested_by)


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
    current_visit = serializers.SerializerMethodField()
    irrelevant_requested_by_name = serializers.SerializerMethodField()
    rating_overall = serializers.SerializerMethodField()

    class Meta:
        model = Installation
        fields = [
            'id', 'order', 'status', 'status_display', 'is_paid',
            'current_visit', 'irrelevant_requested_at', 'irrelevant_requested_by_name', 'irrelevant_reason',
            'client_name', 'address', 'kp_number', 'salon_name', 'city_name', 'manager_name',
            'contact_name', 'contact_phone',
            'work_description', 'collection_finish', 'planned_delivery_date', 'desired_date_comment',
            'files', 'order_documents', 'rating_overall', 'created_at', 'updated_at',
        ]

    def get_rating_overall(self, obj):
        rating = getattr(obj, 'rating', None) if hasattr(obj, 'rating') else None
        return rating.overall if rating else None

    def get_manager_name(self, obj):
        return _user_name(obj.order.manager)

    def get_order_documents(self, obj):
        return order_documents(obj.order)

    def get_current_visit(self, obj):
        visit = obj.current_visit
        return InstallationVisitSerializer(visit).data if visit else None

    def get_irrelevant_requested_by_name(self, obj):
        return _user_name(obj.irrelevant_requested_by)


class InstallationEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = InstallationEvent
        fields = ['id', 'kind', 'kind_display', 'actor_name', 'description',
                  'old_status', 'new_status', 'meta', 'created_at']

    def get_actor_name(self, obj):
        if obj.kind in ('client_confirmed', 'client_act_uploaded'):
            return 'Клиент'  # действия по ссылке из СМС, без входа
        return _user_name(obj.actor) or 'Система'


class InstallationDetailSerializer(InstallationListSerializer):
    created_by_name = serializers.SerializerMethodField()
    order_status_display = serializers.CharField(source='order.get_status_display', read_only=True)
    measurement_blank_required = serializers.SerializerMethodField()
    order_manager_id = serializers.SerializerMethodField()
    visits = InstallationVisitSerializer(many=True, read_only=True)
    installer_notified_at = serializers.SerializerMethodField()
    complaints = serializers.SerializerMethodField()
    client_link = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()

    class Meta(InstallationListSerializer.Meta):
        fields = InstallationListSerializer.Meta.fields + [
            'created_by_name', 'order_status_display', 'measurement_blank_required',
            'order_manager_id', 'visits', 'installer_notified_at', 'complaints',
            'act_sent_at', 'client_confirmed_at', 'client_link', 'rating', 'payment',
        ]

    def get_rating(self, obj):
        return rating_scores(obj.rating) if hasattr(obj, 'rating') else None

    def get_payment(self, obj):
        """Акт текущего выезда на оплату: можно ли отправить и когда уже отправляли."""
        from .services import payment_acts
        visit = obj.current_visit
        if visit is None:
            return None
        return {
            'available': obj.status in ('done', 'partially_done') and payment_acts(obj).exists(),
            'sent_at': visit.payment_sent_at,
            'sent_by_name': _user_name(visit.payment_sent_by),
            'accountant_email': obj.order.salon.city.accountant_email,
        }

    def get_client_link(self, obj):
        from .sms import client_link
        return client_link(obj) if obj.client_code else None

    def get_installer_notified_at(self, obj):
        """Когда монтажник последний раз отправил «не дозвонился» по текущему выезду."""
        visit = obj.current_visit
        if visit is None:
            return None
        event = obj.events.filter(
            kind='sms_sent', meta__purpose='installer_call_failed', created_at__gte=visit.created_at,
        ).order_by('-created_at').first()
        return event.created_at if event else None

    def get_complaints(self, obj):
        """Рекламации по заказу, заведённые после оформления монтажа."""
        from projects.models import Complaint
        rows = Complaint.objects.filter(source_order=obj.order, created_at__gte=obj.created_at).order_by('-id')
        return [{'id': c.id, 'created_at': c.created_at, 'status_display': c.get_status_display()} for c in rows]

    def get_order_manager_id(self, obj):
        return obj.order.manager_id

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


class ScheduleVisitSerializer(serializers.ModelSerializer):
    """Выезд в календаре монтажника: что, куда, к кому."""
    installers = StaffSerializer(many=True, read_only=True)
    installation_id = serializers.IntegerField(source='installation.id')
    status = serializers.CharField(source='installation.status')
    status_display = serializers.CharField(source='installation.get_status_display')
    order = serializers.IntegerField(source='installation.order_id')
    client_name = serializers.CharField(source='installation.order.client_name')
    address = serializers.CharField(source='installation.order.address')
    work_description = serializers.CharField(source='installation.work_description')
    contact_name = serializers.CharField(source='installation.contact_name')
    contact_phone = serializers.CharField(source='installation.contact_phone')

    class Meta:
        model = InstallationVisit
        fields = [
            'id', 'date_from', 'date_to', 'installers', 'installation_id', 'status', 'status_display',
            'order', 'client_name', 'address', 'work_description', 'contact_name', 'contact_phone',
        ]
