from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count
from django.utils import timezone
from django.db import transaction
from django.urls import reverse
from datetime import datetime

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
from .serializers import (
    ComplaintListSerializer,
    ComplaintDetailSerializer,
    ComplaintCreateSerializer,
    DefectiveProductSerializer,
    ComplaintAttachmentSerializer,
    ComplaintCommentSerializer,
    ShippingRegistrySerializer,
    NotificationSerializer,
    ProductionSiteSerializer,
    ComplaintReasonSerializer,
)
from users.models import User


class IsAuthenticated(permissions.IsAuthenticated):
    """Базовый класс для аутентифицированных пользователей"""
    pass


class ComplaintViewSet(viewsets.ModelViewSet):
    """
    ViewSet для работы с рекламациями
    
    list: Список рекламаций с фильтрацией по ролям
    retrieve: Детальная информация о рекламации
    create: Создание новой рекламации
    update: Обновление рекламации
    partial_update: Частичное обновление рекламации
    """
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['order_number', 'client_name', 'address', 'contact_person', 'contact_phone']
    ordering_fields = ['created_at', 'updated_at', 'status', 'order_number']
    ordering = ['-created_at']
    filterset_fields = ['status', 'complaint_type', 'production_site', 'reason']
    
    def get_queryset(self):
        """Фильтрация рекламаций по ролям пользователя"""
        user = self.request.user
        queryset = Complaint.objects.select_related(
            'initiator',
            'recipient',
            'manager',
            'production_site',
            'reason',
            'installer_assigned'
        ).prefetch_related(
            'defective_products',
            'attachments',
            'comments__author'
        )
        
        # Фильтрация по ролям
        if user.role == 'installer':
            # Монтажник видит только назначенные ему или созданные им
            queryset = queryset.filter(
                Q(initiator=user) | Q(installer_assigned=user)
            )
        elif user.role == 'complaint_department':
            # ОР видит только фабричные рекламации
            queryset = queryset.filter(complaint_type='factory')
        elif user.role == 'leader':
            # Руководитель видит все по своему городу
            if user.city:
                queryset = queryset.filter(initiator__city=user.city)
        elif user.role == 'service_manager':
            # Сервис-менеджер видит рекламации из своего города или созданные им
            user_city = getattr(user, 'city', None)
            if user_city:
                city_filter = Q(initiator__city=user_city)
                personal_filter = Q(initiator=user)
                queryset = queryset.filter(city_filter | personal_filter)
            else:
                # Если нет города, видит только созданные им
                queryset = queryset.filter(initiator=user)
        elif user.role == 'manager':
            # Менеджер видит рекламации из своего города
            if user.city:
                queryset = queryset.filter(initiator__city=user.city)
        # admin - видит все (без фильтрации)
        
        # Дополнительные фильтры из query params
        my_complaints = self.request.query_params.get('my_complaints')
        my_orders = self.request.query_params.get('my_orders')
        my_tasks = self.request.query_params.get('my_tasks')
        needs_planning = self.request.query_params.get('needs_planning')
        exclude_closed = self.request.query_params.get('exclude_closed', '1')
        city_id = self.request.query_params.get('city')
        
        if my_complaints:
            queryset = queryset.filter(initiator=user)
        
        if my_orders:
            if user.role == 'manager':
                queryset = queryset.filter(Q(manager=user) | Q(recipient=user))
            elif user.role == 'service_manager':
                queryset = queryset.filter(recipient=user)
            elif user.role == 'installer':
                # Для монтажника my_orders не нужен, так как базовый фильтр уже правильный
                # (Q(initiator=user) | Q(installer_assigned=user))
                # Не перезаписываем базовый фильтр
                pass
        
        # Обработка my_tasks (как в Django views)
        if my_tasks:
            completed_statuses = {
                ComplaintStatus.COMPLETED,
                ComplaintStatus.RESOLVED,
                ComplaintStatus.CLOSED,
            }
            active_statuses = [status for status, _ in ComplaintStatus.choices if status not in completed_statuses]
            
            role_task_filters = {
                'installer': {
                    'in_work': (Q(installer_assigned=user) | Q(initiator=user)) & Q(status__in=active_statuses),
                    'needs_planning': Q(installer_assigned=user, status__in=[
                        'waiting_installer_date', 'needs_planning', 'installer_not_planned'
                    ]),
                    'planned': Q(installer_assigned=user, status__in=[
                        'installation_planned', 'both_planned'
                    ]),
                    'completed': Q(installer_assigned=user, status__in=[
                        'under_sm_review', 'completed'
                    ]),
                },
                'manager': {
                    'in_work': (Q(manager=user) | Q(initiator=user) | Q(recipient=user)) & Q(status__in=active_statuses),
                    'in_progress': Q(manager=user, status='in_progress'),
                    'on_warehouse': Q(manager=user, status='on_warehouse'),
                },
                'service_manager': {
                    'in_work': Q(status__in=active_statuses),
                    'new': Q(status='new'),
                    'review': Q(status__in=['under_sm_review', 'factory_approved', 'factory_rejected']),
                    'overdue': Q(status='sm_response_overdue'),
                },
                'complaint_department': {
                    'in_work': Q(complaint_type='factory', status__in=active_statuses),
                    'pending': Q(complaint_type='factory', status='sent'),
                    'overdue': Q(complaint_type='factory', status='factory_response_overdue'),
                },
                'admin': {
                    'new': Q(status='new'),
                    'factory_overdue': Q(status='factory_response_overdue'),
                    'shipping_overdue': Q(status='shipping_overdue'),
                    'sm_overdue': Q(status='sm_response_overdue'),
                },
                'leader': {
                    'new': Q(status='new'),
                    'factory_overdue': Q(status='factory_response_overdue'),
                    'shipping_overdue': Q(status='shipping_overdue'),
                    'sm_overdue': Q(status='sm_response_overdue'),
                },
            }
            
            role_filters = role_task_filters.get(user.role, {})
            task_filter = role_filters.get(my_tasks)
            if task_filter:
                queryset = queryset.filter(task_filter)
        
        if needs_planning and user.role == 'installer':
            # Для монтажника дополняем базовый фильтр статусами, не перезаписываем
            queryset = queryset.filter(
                status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']
            )
        
        # Исключаем закрытые рекламации только для списка, не для детального просмотра
        # Это позволяет просматривать закрытые рекламации по ID (как в Django views)
        if self.action == 'list' and exclude_closed not in ['0', 'false', 'False']:
            queryset = queryset.exclude(status__in=['closed', 'completed', 'resolved'])
        
        # Фильтр по городу только для админа и ОР (через query param)
        if city_id and user.role in ['admin', 'complaint_department']:
            queryset = queryset.filter(
                Q(initiator__city_id=city_id) |
                Q(recipient__city_id=city_id) |
                Q(manager__city_id=city_id)
            )
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """Переопределяем list для проверки просрочки монтажника"""
        # Получаем queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        # Проверяем просрочку для рекламаций с монтажником
        installer_complaints = queryset.filter(
            installer_assigned__isnull=False,
            installer_assigned_at__isnull=False
        ).exclude(
            status__in=['completed', 'resolved', 'closed']
        )
        
        for complaint in installer_complaints:
            complaint.check_installer_overdue()
        
        # Возвращаем обновленный queryset через стандартный list
        response = super().list(request, *args, **kwargs)
        return response
    
    def get_object(self):
        """Переопределяем для проверки доступа ОР к фабричным рекламациям"""
        user = self.request.user
        
        # Для ОР проверяем доступ отдельно для всех действий
        if user.role == 'complaint_department':
            pk = self.kwargs.get('pk')
            try:
                obj = Complaint.objects.get(pk=pk)
                # ОР может видеть только фабричные рекламации
                if obj.complaint_type != 'factory':
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('У вас нет доступа к этой рекламации')
                return obj
            except Complaint.DoesNotExist:
                from rest_framework.exceptions import NotFound
                raise NotFound('Рекламация не найдена')
        
        # Для остальных ролей используем стандартную логику
        return super().get_object()
    
    def get_serializer_class(self):
        """Выбор сериализатора в зависимости от действия"""
        if self.action == 'list':
            return ComplaintListSerializer
        elif self.action == 'create':
            return ComplaintCreateSerializer
        return ComplaintDetailSerializer
    
    def get_serializer_context(self):
        """Добавление request в контекст сериализатора"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def create(self, request, *args, **kwargs):
        """Создание рекламации с установкой типа (если указан СМ)"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save()
        
        # Если СМ создал рекламацию с указанным типом, применяем соответствующую логику
        complaint_type = request.data.get('complaint_type')
        
        if request.user.role == 'service_manager' and complaint_type:
            if complaint_type == 'manager':
                complaint.set_type_manager()
            elif complaint_type == 'installer':
                # installer_assigned уже установлен в сериализаторе
                installer = complaint.installer_assigned
                complaint.set_type_installer(installer=installer)
            elif complaint_type == 'factory':
                complaint.set_type_factory()
        
        # Используем ComplaintDetailSerializer для ответа
        response_serializer = ComplaintDetailSerializer(complaint, context=self.get_serializer_context())
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    def check_object_permissions(self, request, obj):
        """Проверка прав доступа к конкретной рекламации"""
        super().check_object_permissions(request, obj)
        
        user = request.user
        
        # Админы и лидеры имеют полный доступ
        if user.role in ['admin', 'leader']:
            return
        
        # Проверка доступа по ролям
        has_access = False
        
        if obj.initiator == user:
            has_access = True
        elif obj.recipient == user:
            has_access = True
        elif obj.manager == user:
            has_access = True
        elif obj.installer_assigned == user:
            has_access = True
        elif user.role == 'manager':
            # Менеджеры могут видеть все рекламации
            has_access = True
        elif user.role == 'service_manager':
            # СМ могут видеть рекламации по своему городу
            if user.city and obj.initiator.city == user.city:
                has_access = True
            elif not user.city:
                has_access = True
        
        if not has_access:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("У вас нет доступа к этой рекламации")
    
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Обработка рекламации (выбор типа)"""
        complaint = self.get_object()
        user = request.user
        
        # Проверка прав (только СМ может обрабатывать)
        if user.role != 'service_manager' and user.role != 'admin':
            return Response(
                {'error': 'Только сервис-менеджер может обрабатывать рекламации'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        complaint_type = request.data.get('complaint_type')
        
        if complaint_type == 'installer':
            installer = complaint.installer_assigned
            complaint.set_type_installer(installer=installer)
        elif complaint_type == 'manager':
            if not complaint.manager:
                return Response(
                    {'error': 'Необходимо назначить менеджера перед установкой типа "Менеджер"'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            complaint.set_type_manager()
        elif complaint_type == 'factory':
            complaint.set_type_factory()
        else:
            return Response(
                {'error': 'Неверный тип рекламации'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Монтажник отмечает работу выполненной"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'installer' or complaint.installer_assigned != user:
            return Response(
                {'error': 'Только назначенный монтажник может отметить работу выполненной'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        complaint.mark_completed()
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def plan_installation(self, request, pk=None):
        """Планирование монтажа"""
        complaint = self.get_object()
        user = request.user
        
        installer_id = request.data.get('installer_id')
        installation_date = request.data.get('installation_date')
        
        if not installer_id or not installation_date:
            return Response(
                {'error': 'Необходимо указать installer_id и installation_date'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            installer = User.objects.get(id=installer_id, role='installer')
            installation_date = datetime.fromisoformat(installation_date.replace('Z', '+00:00'))
            installation_date = timezone.make_aware(installation_date)
        except User.DoesNotExist:
            return Response(
                {'error': 'Монтажник не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Неверный формат даты'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if user.role == 'installer':
            # Монтажник планирует сам
            complaint.plan_installation(installer, installation_date)
        elif user.role in ['service_manager', 'admin']:
            # СМ планирует для монтажника
            complaint.plan_installation_by_sm(installer, installation_date)
        else:
            return Response(
                {'error': 'У вас нет прав для планирования монтажа'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def start_production(self, request, pk=None):
        """Менеджер запускает производство"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'manager' or complaint.manager != user:
            return Response(
                {'error': 'Только назначенный менеджер может запустить производство'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        deadline_str = request.data.get('production_deadline')
        if not deadline_str:
            return Response(
                {'error': 'Необходимо указать production_deadline'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            deadline = timezone.make_aware(deadline)
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Неверный формат даты'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.start_production(deadline)
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_warehouse(self, request, pk=None):
        """Товар готов на складе"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'manager' or complaint.manager != user:
            return Response(
                {'error': 'Только назначенный менеджер может отметить товар на складе'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        complaint.mark_on_warehouse()
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def plan_shipping(self, request, pk=None):
        """Планирование отгрузки"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'manager' or complaint.manager != user:
            return Response(
                {'error': 'Только назначенный менеджер может планировать отгрузку'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        shipping_date_str = request.data.get('shipping_date')
        if not shipping_date_str:
            return Response(
                {'error': 'Необходимо указать shipping_date'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            shipping_date = datetime.fromisoformat(shipping_date_str.replace('Z', '+00:00'))
            shipping_date = timezone.make_aware(shipping_date)
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Неверный формат даты'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.plan_shipping(shipping_date)
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def agree_client(self, request, pk=None):
        """СМ согласовывает решение с клиентом"""
        complaint = self.get_object()
        user = request.user
        
        if user.role not in ['service_manager', 'admin']:
            return Response(
                {'error': 'Только сервис-менеджер может согласовывать решение с клиентом'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        deadline_str = request.data.get('production_deadline')
        if not deadline_str:
            return Response(
                {'error': 'Необходимо указать production_deadline'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            deadline = timezone.make_aware(deadline)
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Неверный формат даты'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.sm_agree_with_client(deadline)
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def dispute_decision(self, request, pk=None):
        """СМ оспаривает решение фабрики"""
        complaint = self.get_object()
        user = request.user
        
        if user.role not in ['service_manager', 'admin']:
            return Response(
                {'error': 'Только сервис-менеджер может оспаривать решение фабрики'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        arguments = request.data.get('dispute_arguments')
        if not arguments:
            return Response(
                {'error': 'Необходимо указать dispute_arguments'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.sm_dispute_factory_decision(arguments)
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def factory_approve(self, request, pk=None):
        """ОР одобряет рекламацию"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'complaint_department':
            return Response(
                {'error': 'Только отдел рекламаций может одобрять рекламации'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        complaint.factory_approve()
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def factory_reject(self, request, pk=None):
        """ОР отклоняет рекламацию"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'complaint_department':
            return Response(
                {'error': 'Только отдел рекламаций может отклонять рекламации'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        reject_reason = request.data.get('reject_reason')
        if not reject_reason:
            return Response(
                {'error': 'Необходимо указать reject_reason'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.factory_reject(reject_reason)
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_client_contact(self, request, pk=None):
        """Обновление контактной информации клиента"""
        complaint = self.get_object()
        user = request.user
        
        # Проверка прав доступа
        if user.role not in ['service_manager', 'manager', 'admin', 'leader']:
            return Response(
                {'error': 'У вас нет прав для редактирования контактных данных'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Проверка для СМ - может редактировать рекламации в своем городе
        if user.role == 'service_manager':
            if user.city and complaint.manager and complaint.manager.city != user.city:
                return Response(
                    {'error': 'У вас нет прав для редактирования этой рекламации'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Получаем новые данные
        new_contact_person = request.data.get('contact_person', '').strip()
        new_contact_phone = request.data.get('contact_phone', '').strip()
        new_address = request.data.get('address', '').strip()
        
        # Валидация
        if not new_contact_person or not new_contact_phone:
            return Response(
                {'error': 'Укажите контактное лицо и телефон'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Сохраняем старые данные для истории
        old_contact_person = complaint.contact_person
        old_contact_phone = complaint.contact_phone
        old_address = complaint.address
        
        # Обновляем данные
        complaint.contact_person = new_contact_person
        complaint.contact_phone = new_contact_phone
        if new_address:
            complaint.address = new_address
        complaint.save()
        
        # Создаем комментарий об изменении
        change_message = f"Изменены контактные данные клиента:\n"
        if old_contact_person != new_contact_person:
            change_message += f"Контактное лицо: {old_contact_person} → {new_contact_person}\n"
        if old_contact_phone != new_contact_phone:
            change_message += f"Телефон: {old_contact_phone} → {new_contact_phone}\n"
        if new_address and old_address != new_address:
            change_message += f"Адрес: {old_address} → {new_address}"
        
        ComplaintComment.objects.create(
            complaint=complaint,
            author=user,
            text=change_message
        )
        
        # Уведомляем всех участников об изменении
        # Уведомление инициатору (если не он сам менял)
        if complaint.initiator != user:
            complaint._create_notification(
                recipient=complaint.initiator,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление получателю (если не он сам менял)
        if complaint.recipient != user:
            complaint._create_notification(
                recipient=complaint.recipient,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление менеджеру (если не он сам менял и менеджер назначен)
        if complaint.manager and complaint.manager != user:
            complaint._create_notification(
                recipient=complaint.manager,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление монтажнику (если назначен и не он сам менял)
        if complaint.installer_assigned and complaint.installer_assigned != user:
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='sms',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные. Новый контакт: {new_contact_person}, тел: {new_contact_phone}'
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """СМ проверяет и одобряет выполненную монтажником работу"""
        complaint = self.get_object()
        user = request.user
        
        if user.role not in ['service_manager', 'admin']:
            return Response(
                {'error': 'Только сервис-менеджер может проверять выполненную работу'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if complaint.status != 'under_sm_review':
            return Response(
                {'error': 'Рекламация не находится в статусе ожидания проверки'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.approve_by_sm()
        
        # Создаем комментарий о проверке
        ComplaintComment.objects.create(
            complaint=complaint,
            author=user,
            text=f'Рекламация проверена и одобрена сервис-менеджером {user.get_full_name() or user.username}'
        )
        
        # Уведомляем монтажника об одобрении
        if complaint.installer_assigned:
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='push',
                title='Работа одобрена',
                message=f'Ваша работа по рекламации #{complaint.id} одобрена СМ'
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def change_installer(self, request, pk=None):
        """СМ заменяет монтажника"""
        complaint = self.get_object()
        user = request.user
        
        if user.role not in ['service_manager', 'admin']:
            return Response(
                {'error': 'Только сервис-менеджер может заменять монтажника'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        new_installer_id = request.data.get('new_installer_id')
        if not new_installer_id:
            return Response(
                {'error': 'Необходимо указать new_installer_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            old_installer = complaint.installer_assigned
            new_installer = User.objects.get(id=new_installer_id, role='installer')
            
            complaint.installer_assigned = new_installer
            complaint.save()
            
            # Создаем комментарий об изменении
            if old_installer:
                change_text = f'Монтажник изменен: {old_installer.get_full_name() or old_installer.username} → {new_installer.get_full_name() or new_installer.username}'
            else:
                change_text = f'Назначен монтажник: {new_installer.get_full_name() or new_installer.username}'
            
            ComplaintComment.objects.create(
                complaint=complaint,
                author=user,
                text=change_text
            )
            
            # Уведомляем старого монтажника
            if old_installer and old_installer != new_installer:
                complaint._create_notification(
                    recipient=old_installer,
                    notification_type='push',
                    title='Вы сняты с рекламации',
                    message=f'Рекламация #{complaint.id} назначена другому монтажнику'
                )
                complaint._create_notification(
                    recipient=old_installer,
                    notification_type='sms',
                    title='Вы сняты с рекламации',
                    message=f'Рекламация #{complaint.id} ({complaint.order_number}) назначена другому монтажнику'
                )
            
            # Уведомляем нового монтажника
            complaint._create_notification(
                recipient=new_installer,
                notification_type='push',
                title='Вам назначена рекламация',
                message=f'Рекламация #{complaint.id} назначена вам. Клиент: {complaint.client_name}'
            )
            complaint._create_notification(
                recipient=new_installer,
                notification_type='sms',
                title='Назначена рекламация',
                message=f'Рекламация #{complaint.id} ({complaint.order_number}). Клиент: {complaint.client_name}, тел: {complaint.contact_phone}'
            )
            
        except User.DoesNotExist:
            return Response(
                {'error': 'Монтажник не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def reschedule_installation(self, request, pk=None):
        """Монтажник переносит дату монтажа"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'installer' or complaint.installer_assigned != user:
            return Response(
                {'error': 'Только назначенный монтажник может переносить дату монтажа'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        installation_date_str = request.data.get('installation_date')
        if not installation_date_str:
            return Response(
                {'error': 'Необходимо указать installation_date'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            installation_date = datetime.fromisoformat(installation_date_str.replace('Z', '+00:00'))
            installation_date = timezone.make_aware(installation_date)
        except (ValueError, AttributeError):
            return Response(
                {'error': 'Неверный формат даты'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not complaint.planned_installation_date:
            return Response(
                {'error': 'Дата монтажа еще не была запланирована'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        old_date = complaint.planned_installation_date
        complaint.planned_installation_date = installation_date
        complaint.save()
        
        # Создаем комментарий о переносе
        ComplaintComment.objects.create(
            complaint=complaint,
            author=user,
            text=f'Дата монтажа перенесена: {old_date.strftime("%d.%m.%Y %H:%M")} → {installation_date.strftime("%d.%m.%Y %H:%M")}'
        )
        
        # Уведомляем СМ
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='push',
            title='Монтаж перенесен',
            message=f'Монтажник перенес дату монтажа по рекламации #{complaint.id} на {installation_date.strftime("%d.%m.%Y %H:%M")}'
        )
        
        # Уведомляем менеджера
        if complaint.manager:
            complaint._create_notification(
                recipient=complaint.manager,
                notification_type='push',
                title='Монтаж перенесен',
                message=f'Дата монтажа по рекламации #{complaint.id} перенесена на {installation_date.strftime("%d.%m.%Y %H:%M")}'
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_warehouse_or(self, request, pk=None):
        """ОР отмечает товар на складе для фабричных рекламаций"""
        complaint = self.get_object()
        user = request.user
        
        if user.role != 'complaint_department':
            return Response(
                {'error': 'Только отдел рекламаций может отмечать товар на складе для фабричных рекламаций'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if complaint.complaint_type != 'factory':
            return Response(
                {'error': 'Это действие доступно только для фабричных рекламаций'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if complaint.status != 'in_production':
            return Response(
                {'error': 'Товар должен быть в статусе "В производстве"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        complaint.mark_on_warehouse()
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """СМ закрывает рекламацию напрямую"""
        complaint = self.get_object()
        user = request.user
        
        if user.role not in ['service_manager', 'admin']:
            return Response(
                {'error': 'Только сервис-менеджер может закрывать рекламации'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if complaint.status in ['completed', 'closed', 'resolved', 'under_sm_review']:
            return Response(
                {'error': 'Рекламация уже завершена или находится в статусе проверки'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        closure_reason = request.data.get('closure_reason', '').strip()
        
        # Устанавливаем статус закрыта
        complaint.status = ComplaintStatus.CLOSED
        complaint.completion_date = timezone.now()
        complaint.save()
        
        # Создаем комментарий о завершении
        if closure_reason:
            comment_text = f'Рекламация завершена сервис-менеджером. Причина: {closure_reason}'
        else:
            comment_text = 'Рекламация завершена сервис-менеджером без указанной причины'
        
        ComplaintComment.objects.create(
            complaint=complaint,
            author=user,
            text=comment_text
        )
        
        # Уведомляем участников
        if complaint.initiator != user:
            complaint._create_notification(
                recipient=complaint.initiator,
                notification_type='push',
                title='Рекламация завершена',
                message=f'Рекламация #{complaint.id} завершена сервис-менеджером'
            )
        
        if complaint.manager and complaint.manager != user:
            complaint._create_notification(
                recipient=complaint.manager,
                notification_type='push',
                title='Рекламация завершена',
                message=f'Рекламация #{complaint.id} завершена сервис-менеджером'
            )
        
        serializer = self.get_serializer(complaint)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def send_factory_email(self, request, pk=None):
        """Отправить email уведомление в отдел рекламаций"""
        complaint = self.get_object()
        user = request.user
        
        # Проверяем права доступа
        if user.role not in ['service_manager', 'admin', 'leader']:
            return Response(
                {'error': 'Недостаточно прав для выполнения этого действия'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Проверяем, что рекламация имеет тип "Фабрика"
        if complaint.complaint_type != ComplaintType.FACTORY:
            return Response(
                {'error': 'Email уведомление отправляется только для рекламаций типа "Фабрика"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            complaint.send_factory_email_notification()
            return Response({'message': 'Email уведомление отправлено успешно'})
        except Exception as e:
            return Response(
                {'error': f'Ошибка отправки email: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """История изменений рекламации"""
        complaint = self.get_object()
        # TODO: Реализовать модель ComplaintHistory если нужно
        return Response({'message': 'История изменений будет реализована позже'})


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet для уведомлений"""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['is_read', 'notification_type', 'complaint']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Только уведомления текущего пользователя"""
        return Notification.objects.filter(
            recipient=self.request.user
        ).select_related('complaint', 'recipient')
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Отметить уведомление как прочитанное"""
        notification = self.get_object()
        notification.mark_as_read()
        serializer = self.get_serializer(notification)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Отметить все уведомления как прочитанные"""
        updated = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'updated_count': updated})


class ShippingRegistryViewSet(viewsets.ModelViewSet):
    """
    ViewSet для реестра отгрузки
    
    list: Список записей реестра с фильтрацией по ролям
    retrieve: Детальная информация о записи
    create: Создание новой записи в реестре
    update: Обновление записи
    partial_update: Частичное обновление записи
    stats: Статистика по реестру
    """
    serializer_class = ShippingRegistrySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['order_number', 'client_name', 'address', 'contact_person', 'contact_phone']
    ordering_fields = ['created_at', 'planned_shipping_date', 'delivery_status']
    ordering = ['-created_at']
    filterset_fields = ['order_type', 'delivery_status', 'manager', 'delivery_destination']
    
    def get_queryset(self):
        """
        Фильтрация по ролям согласно логике из views.py
        
        Администратор, Руководитель, Менеджер и СМ видят все записи
        ОР видит все записи
        """
        user = self.request.user
        
        # Проверка прав доступа согласно @role_required из views.py
        allowed_roles = ['manager', 'service_manager', 'complaint_department', 'admin', 'leader']
        if user.role not in allowed_roles:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("У вас нет прав для доступа к реестру на отгрузку")
        
        queryset = ShippingRegistry.objects.select_related(
            'complaint',
            'manager'
        )
        
        # Фильтрация по городам
        # Администратор, Руководитель, Менеджер и СМ видят все
        if user.role in ['admin', 'leader', 'manager', 'service_manager']:
            pass  # Без фильтрации
        # ОР видит все
        # complaint_department - без дополнительной фильтрации
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Статистика по реестру на отгрузку
        
        Возвращает:
        - total: Всего записей
        - pending: Ожидает отгрузки
        - in_transit: В пути
        - delivered: Доставлено
        - complaints: Рекламации
        """
        queryset = self.filter_queryset(self.get_queryset())
        
        stats = {
            'total': queryset.count(),
            'pending': queryset.filter(delivery_status='pending').count(),
            'in_transit': queryset.filter(delivery_status='in_transit').count(),
            'delivered': queryset.filter(delivery_status='delivered').count(),
            'complaints': queryset.filter(order_type='complaint').count(),
        }
        
        return Response(stats)


class ProductionSiteViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet для производственных площадок"""
    queryset = ProductionSite.objects.filter(is_active=True)
    serializer_class = ProductionSiteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter]
    search_fields = ['name', 'address']


class ComplaintReasonViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet для причин рекламаций"""
    queryset = ComplaintReason.objects.filter(is_active=True)
    serializer_class = ComplaintReasonSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['order', 'name']
    ordering = ['order', 'name']


class DefectiveProductViewSet(viewsets.ModelViewSet):
    """ViewSet для бракованных изделий"""
    serializer_class = DefectiveProductSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Фильтрация по рекламации"""
        complaint_id = self.request.query_params.get('complaint')
        queryset = DefectiveProduct.objects.all()
        
        if complaint_id:
            queryset = queryset.filter(complaint_id=complaint_id)
        
        return queryset


class ComplaintAttachmentViewSet(viewsets.ModelViewSet):
    """ViewSet для вложений рекламаций"""
    serializer_class = ComplaintAttachmentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Фильтрация по рекламации"""
        complaint_id = self.request.query_params.get('complaint')
        queryset = ComplaintAttachment.objects.all()
        
        if complaint_id:
            queryset = queryset.filter(complaint_id=complaint_id)
        
        return queryset
    
    def get_serializer_context(self):
        """Добавление request в контекст"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class ComplaintCommentViewSet(viewsets.ModelViewSet):
    """ViewSet для комментариев к рекламациям"""
    serializer_class = ComplaintCommentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [OrderingFilter]
    ordering_fields = ['created_at']
    ordering = ['created_at']
    
    def get_queryset(self):
        """Фильтрация по рекламации"""
        complaint_id = self.request.query_params.get('complaint')
        queryset = ComplaintComment.objects.select_related('author')
        
        if complaint_id:
            queryset = queryset.filter(complaint_id=complaint_id)
        
        return queryset
    
    def perform_create(self, serializer):
        """Автоматическая установка автора"""
        serializer.save(author=self.request.user)


class DashboardStatsView(APIView):
    """API для получения статистики для дашборда"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Получение статистики по задачам для текущего пользователя"""
        user = request.user
        stats = []
        
        completed_statuses = {
            ComplaintStatus.COMPLETED,
            ComplaintStatus.RESOLVED,
            ComplaintStatus.CLOSED,
        }
        active_statuses = [choice[0] for choice in ComplaintStatus.choices if choice[0] not in completed_statuses]
        
        def add_stat(key, label, query, url_param=None):
            count = Complaint.objects.filter(query).count()
            # Формируем URL для фронтенда
            if user.role == 'installer':
                # Для монтажника используем страницу задач с параметром filter
                if url_param:
                    url = f'/installer/planning?filter={url_param}'
                else:
                    url = '/installer/planning'  # Для "В работе" без фильтра
            else:
                # Для остальных ролей используем my_tasks
                url = f'/complaints?my_tasks={key}'
            
            stats.append({
                'key': key,
                'label': label,
                'count': count,
                'url_param': url_param,
                'url': url,
            })
        
        if user.role == 'installer':
            # Базовый фильтр для монтажника
            installer_base_filter = Q(installer_assigned=user) | Q(initiator=user)
            
            add_stat(
                'in_work',
                'В работе',
                installer_base_filter & Q(status__in=active_statuses),
                url_param=None
            )
            add_stat(
                'needs_planning',
                'Требуют планирования',
                installer_base_filter & Q(status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']),
                url_param='needs_planning'
            )
            add_stat(
                'planned',
                'Запланированные работы',
                installer_base_filter & Q(status__in=['installation_planned', 'both_planned']),
                url_param='planned'
            )
            add_stat(
                'completed',
                'Завершено',
                installer_base_filter & Q(status__in=['under_sm_review', 'completed']),
                url_param='completed'
            )
        elif user.role == 'manager':
            # Для менеджера применяем фильтр по городу
            user_city = getattr(user, 'city', None)
            if user_city:
                city_filter = Q(initiator__city=user_city)
            else:
                city_filter = Q()
            
            base_filter = city_filter & ~Q(status__in=['closed', 'completed', 'resolved'])
            
            add_stat(
                'total',
                'Всего',
                base_filter,
                url_param=None
            )
            add_stat(
                'new',
                'Новые',
                base_filter & Q(status='new'),
                url_param=None
            )
            add_stat(
                'in_work',
                'В работе',
                ((Q(manager=user) | Q(initiator=user) | Q(recipient=user)) & Q(status__in=active_statuses)) & city_filter
            )
            add_stat(
                'in_progress',
                'Нужно запустить в производство',
                Q(manager=user, status='in_progress') & city_filter
            )
            add_stat(
                'on_warehouse',
                'Готово к отгрузке',
                Q(manager=user, status='on_warehouse') & city_filter
            )
        elif user.role == 'service_manager':
            # Для СМ применяем фильтр: рекламации из его города ИЛИ созданные им
            user_city = getattr(user, 'city', None)
            if user_city:
                city_filter = Q(initiator__city=user_city)
                personal_filter = Q(initiator=user)
                base_filter = city_filter | personal_filter
            else:
                base_filter = Q(initiator=user)
            
            base_filter_active = base_filter & ~Q(status__in=['closed', 'completed', 'resolved'])
            
            add_stat(
                'in_work',
                'В работе',
                base_filter_active & Q(status__in=active_statuses)
            )
            add_stat(
                'new',
                'Новые рекламации',
                base_filter_active & Q(status='new')
            )
            add_stat(
                'review',
                'Ожидают проверки',
                base_filter_active & Q(status__in=['under_sm_review', 'factory_approved', 'factory_rejected'])
            )
            add_stat(
                'overdue',
                'Просроченные ответы',
                base_filter_active & Q(status='sm_response_overdue')
            )
        elif user.role == 'complaint_department':
            add_stat(
                'in_work',
                'В работе',
                Q(complaint_type='factory', status__in=active_statuses)
            )
            add_stat(
                'pending',
                'Ожидают ответа',
                Q(complaint_type='factory', status='sent')
            )
            add_stat(
                'overdue',
                'Просрочен ответ',
                Q(complaint_type='factory', status='factory_response_overdue')
            )
        elif user.role in ['admin', 'leader']:
            add_stat(
                'new',
                'Новые рекламации',
                Q(status='new')
            )
            add_stat(
                'factory_overdue',
                'Ответ фабрики просрочен',
                Q(status='factory_response_overdue')
            )
            add_stat(
                'shipping_overdue',
                'Отгрузка просрочена',
                Q(status='shipping_overdue')
            )
            add_stat(
                'sm_overdue',
                'Ответ СМ просрочен',
                Q(status='sm_response_overdue')
            )
        
        return Response({'stats': stats})