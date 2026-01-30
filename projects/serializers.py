from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    Complaint,
    DefectiveProduct,
    ComplaintAttachment,
    ComplaintComment,
    ShippingRegistry,
    Notification,
    ProductionSite,
    ComplaintReason,
    ComplaintStatus,
    ComplaintType,
)
from users.serializers import UserSerializer, CitySerializer

User = get_user_model()


class ProductionSiteSerializer(serializers.ModelSerializer):
    """Сериализатор для производственных площадок"""
    
    class Meta:
        model = ProductionSite
        fields = ['id', 'name', 'address', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class ComplaintReasonSerializer(serializers.ModelSerializer):
    """Сериализатор для причин рекламаций"""
    
    class Meta:
        model = ComplaintReason
        fields = ['id', 'name', 'description', 'is_active', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


class DefectiveProductSerializer(serializers.ModelSerializer):
    """Сериализатор для бракованных изделий"""
    
    class Meta:
        model = DefectiveProduct
        fields = [
            'id',
            'complaint',
            'product_name',
            'size',
            'opening_type',
            'problem_description',
            'order',
        ]
        read_only_fields = ['id']


class ComplaintAttachmentSerializer(serializers.ModelSerializer):
    """Сериализатор для вложений рекламаций"""
    file_url = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    
    class Meta:
        model = ComplaintAttachment
        fields = [
            'id',
            'complaint',
            'file',
            'file_url',
            'file_size',
            'attachment_type',
            'description',
            'uploaded_at',
        ]
        read_only_fields = ['id', 'uploaded_at']
    
    def get_file_url(self, obj):
        """Возвращает URL файла"""
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_file_size(self, obj):
        """Возвращает размер файла"""
        return obj.file_size


class ComplaintCommentSerializer(serializers.ModelSerializer):
    """Сериализатор для комментариев к рекламациям"""
    author = UserSerializer(read_only=True)
    author_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='author',
        write_only=True
    )
    
    class Meta:
        model = ComplaintComment
        fields = [
            'id',
            'complaint',
            'author',
            'author_id',
            'text',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ComplaintListSerializer(serializers.ModelSerializer):
    """Упрощенный сериализатор для списка рекламаций"""
    initiator = UserSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)
    manager = UserSerializer(read_only=True)
    production_site = ProductionSiteSerializer(read_only=True)
    reason = ComplaintReasonSerializer(read_only=True)
    installer_assigned = UserSerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    complaint_type_display = serializers.CharField(source='get_complaint_type_display', read_only=True)
    
    class Meta:
        model = Complaint
        fields = [
            'id',
            'order_number',
            'client_name',
            'address',
            'contact_person',
            'contact_phone',
            'status',
            'status_display',
            'complaint_type',
            'complaint_type_display',
            'initiator',
            'recipient',
            'manager',
            'production_site',
            'reason',
            'installer_assigned',
            'created_at',
            'updated_at',
            'planned_installation_date',
            'planned_shipping_date',
            'production_deadline',
        ]


class ComplaintDetailSerializer(serializers.ModelSerializer):
    """Полный сериализатор для детальной информации о рекламации"""
    initiator = UserSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)
    manager = UserSerializer(read_only=True)
    production_site = ProductionSiteSerializer(read_only=True)
    reason = ComplaintReasonSerializer(read_only=True)
    installer_assigned = UserSerializer(read_only=True)
    
    # Вложенные объекты
    defective_products = DefectiveProductSerializer(many=True, read_only=True)
    attachments = ComplaintAttachmentSerializer(many=True, read_only=True)
    comments = ComplaintCommentSerializer(many=True, read_only=True)
    
    # Foreign key IDs для записи
    initiator_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='initiator',
        write_only=True,
        required=False
    )
    recipient_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='service_manager'),
        source='recipient',
        write_only=True,
        required=False
    )
    manager_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='manager'),
        source='manager',
        write_only=True,
        required=False
    )
    production_site_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductionSite.objects.filter(is_active=True),
        source='production_site',
        write_only=True,
        required=False
    )
    reason_id = serializers.PrimaryKeyRelatedField(
        queryset=ComplaintReason.objects.filter(is_active=True),
        source='reason',
        write_only=True,
        required=False
    )
    installer_assigned_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='installer'),
        source='installer_assigned',
        write_only=True,
        required=False,
        allow_null=True
    )
    
    # Display fields
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    complaint_type_display = serializers.CharField(source='get_complaint_type_display', read_only=True)
    commercial_offer_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Complaint
        fields = [
            # Основные поля
            'id',
            'created_at',
            'updated_at',
            
            # Тип и статус
            'complaint_type',
            'complaint_type_display',
            'status',
            'status_display',
            
            # Назначение
            'initiator',
            'initiator_id',
            'recipient',
            'recipient_id',
            'manager',
            'manager_id',
            'installer_assigned',
            'installer_assigned_id',
            
            # Производство
            'production_site',
            'production_site_id',
            
            # Информация о заказе
            'reason',
            'reason_id',
            'order_number',
            'client_name',
            'address',
            'contact_person',
            'contact_phone',
            'additional_info',
            'assignee_comment',
            
            # Документы
            'document_package_link',
            'commercial_offer',
            'commercial_offer_url',
            'commercial_offer_text',
            
            # Планирование и даты
            'planned_installation_date',
            'planned_shipping_date',
            'production_deadline',
            
            # Фабрика
            'factory_response_date',
            'factory_reject_reason',
            'factory_approve_comment',
            'dispute_arguments',
            'client_agreement_date',
            'completion_date',
            
            # Реестр отгрузки
            'added_to_shipping_registry_at',
            
            # Вложенные объекты
            'defective_products',
            'attachments',
            'comments',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_commercial_offer_url(self, obj):
        """Возвращает URL коммерческого предложения"""
        if obj.commercial_offer:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.commercial_offer.url)
            return obj.commercial_offer.url
        return None


class ComplaintCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания рекламации"""
    initiator_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='initiator',
        write_only=True,
        required=False
    )
    recipient_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='service_manager'),
        source='recipient',
        write_only=True,
        required=False
    )
    manager_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='manager'),
        source='manager',
        write_only=True,
        required=False
    )
    installer_assigned_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='installer'),
        source='installer_assigned',
        write_only=True,
        required=False
    )
    production_site_id = serializers.PrimaryKeyRelatedField(
        queryset=ProductionSite.objects.filter(is_active=True),
        source='production_site',
        write_only=True
    )
    reason_id = serializers.PrimaryKeyRelatedField(
        queryset=ComplaintReason.objects.filter(is_active=True),
        source='reason',
        write_only=True
    )
    
    class Meta:
        model = Complaint
        fields = [
            'initiator_id',
            'recipient_id',
            'manager_id',
            'installer_assigned_id',
            'production_site_id',
            'reason_id',
            'complaint_type',
            'order_number',
            'client_name',
            'address',
            'contact_person',
            'contact_phone',
            'additional_info',
            'assignee_comment',
            'document_package_link',
            'commercial_offer',
            'commercial_offer_text',
        ]
    
    def create(self, validated_data):
        """Создание рекламации с автоматической установкой инициатора и получателя"""
        request = self.context.get('request')
        if request and request.user:
            # Если initiator_id не указан, используем текущего пользователя
            if 'initiator' not in validated_data:
                validated_data['initiator'] = request.user
            
            # Если recipient не указан, назначаем автоматически (логика из views.py)
            if 'recipient' not in validated_data:
                complaint_type = validated_data.get('complaint_type')
                
                # Если СМ создает рекламацию и указан тип
                if request.user.role == 'service_manager' and complaint_type:
                    if complaint_type == 'manager':
                        # Получатель - менеджер заказа
                        if 'manager' in validated_data and validated_data['manager']:
                            validated_data['recipient'] = validated_data['manager']
                        else:
                            raise serializers.ValidationError({
                                'manager_id': 'Для типа "Менеджер" нужно указать менеджера заказа'
                            })
                    elif complaint_type == 'installer':
                        # Получатель - выбранный монтажник
                        if 'installer_assigned' in validated_data and validated_data['installer_assigned']:
                            validated_data['recipient'] = validated_data['installer_assigned']
                        else:
                            raise serializers.ValidationError({
                                'installer_assigned_id': 'Для типа "Монтажник" нужно выбрать монтажника'
                            })
                    elif complaint_type == 'factory':
                        # Получатель - первый ОР
                        complaint_dept = User.objects.filter(role='complaint_department').first()
                        if complaint_dept:
                            validated_data['recipient'] = complaint_dept
                        else:
                            raise serializers.ValidationError({
                                'recipient': 'Не найден отдел рекламаций'
                            })
                # Если инициатор - менеджер или монтажник, получатель - сервис-менеджер
                elif request.user.role in ['manager', 'installer']:
                    # Найти первого доступного сервис-менеджера (можно по городу)
                    user_city = getattr(request.user, 'city', None)
                    if user_city:
                        service_manager = User.objects.filter(role='service_manager', city=user_city).first()
                    if not service_manager:
                        service_manager = User.objects.filter(role='service_manager').first()
                    if service_manager:
                        validated_data['recipient'] = service_manager
                    else:
                        raise serializers.ValidationError({
                            'recipient': 'Не найден сервис-менеджер для назначения получателя'
                        })
                else:
                    # Для других ролей (admin, leader, complaint_department) 
                    # recipient должен быть указан явно
                    raise serializers.ValidationError({
                        'recipient_id': 'Поле обязательно для вашей роли'
                    })
            
            # Валидация: менеджер заказа обязателен для всех (как в views.py)
            if 'manager' not in validated_data or not validated_data['manager']:
                raise serializers.ValidationError({
                    'manager_id': 'Необходимо указать менеджера заказа'
                })
            
            # Устанавливаем complaint_type при создании (если указан)
            if 'complaint_type' in validated_data and validated_data['complaint_type']:
                # complaint_type уже в validated_data, будет установлен автоматически
                pass
        
        return super().create(validated_data)


class ShippingRegistrySerializer(serializers.ModelSerializer):
    """Сериализатор для реестра отгрузки"""
    complaint = ComplaintListSerializer(read_only=True)
    complaint_id = serializers.PrimaryKeyRelatedField(
        queryset=Complaint.objects.all(),
        source='complaint',
        write_only=True,
        required=False,
        allow_null=True
    )
    manager = UserSerializer(read_only=True)
    manager_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='manager'),
        source='manager',
        write_only=True
    )
    
    lift_type_display = serializers.CharField(source='get_lift_type_display', read_only=True)
    lift_method_display = serializers.CharField(source='get_lift_method_display', read_only=True)
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)
    delivery_destination_display = serializers.CharField(source='get_delivery_destination_display', read_only=True)
    delivery_status_display = serializers.CharField(source='get_delivery_status_display', read_only=True)
    
    class Meta:
        model = ShippingRegistry
        fields = [
            'id',
            'complaint',
            'complaint_id',
            'created_at',
            'order_number',
            'manager',
            'manager_id',
            'client_name',
            'address',
            'contact_person',
            'contact_phone',
            'doors_count',
            'lift_type',
            'lift_type_display',
            'lift_method',
            'lift_method_display',
            'order_type',
            'order_type_display',
            'payment_status',
            'delivery_destination',
            'delivery_destination_display',
            'comments',
            'delivery_status',
            'delivery_status_display',
            'client_rating',
            'planned_shipping_date',
            'actual_shipping_date',
        ]
        read_only_fields = ['id', 'created_at']


class NotificationSerializer(serializers.ModelSerializer):
    """Сериализатор для уведомлений"""
    complaint = ComplaintListSerializer(read_only=True)
    complaint_id = serializers.PrimaryKeyRelatedField(
        queryset=Complaint.objects.all(),
        source='complaint',
        write_only=True
    )
    recipient = UserSerializer(read_only=True)
    recipient_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='recipient',
        write_only=True
    )
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'complaint',
            'complaint_id',
            'recipient',
            'recipient_id',
            'notification_type',
            'notification_type_display',
            'title',
            'message',
            'is_sent',
            'is_read',
            'sent_at',
            'read_at',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'sent_at', 'read_at']

