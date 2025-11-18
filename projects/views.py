from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q, Count
from django.db import transaction
from django.utils import timezone
from users.models import User, City
from .forms import ComplaintEditForm
from .models import (
    Complaint,
    ComplaintReason,
    ProductionSite,
    DefectiveProduct,
    ComplaintAttachment,
    ComplaintComment,
    ShippingRegistry,
    Notification,
    ComplaintStatus,
)
from .decorators import role_required, complaint_access_required


@login_required(login_url='/api/v1/login/')
def complaint_list(request):
    """Список рекламаций"""
    
    # Получаем все рекламации
    complaints = Complaint.objects.select_related(
        'initiator',
        'recipient',
        'manager',
        'production_site',
        'reason'
    ).prefetch_related('defective_products', 'attachments')
    
    # Фильтрация по ролям
    # 1. Монтажник видит только назначенные ему (независимо от города)
    if request.user.role == 'installer':
        complaints = complaints.filter(
            Q(initiator=request.user) | Q(installer_assigned=request.user)
        )
    # 2. Администратор, Руководитель, Менеджер и СМ - базовый набор, дальнейшие ограничения ниже
    elif request.user.role in ['admin', 'leader', 'manager', 'service_manager']:
        pass  # Без фильтрации
    # 4. ОР видит только фабричные рекламации (по всем городам)
    elif request.user.role == 'complaint_department':
        complaints = complaints.filter(complaint_type='factory')
    
    # Фильтр "Требуют планирования" для монтажника
    needs_planning = request.GET.get('needs_planning')
    if needs_planning and request.user.role == 'installer':
        complaints = complaints.filter(
            installer_assigned=request.user,
            status__in=['waiting_installer_date', 'needs_planning']
        )
    
    # Фильтр "Мои задачи" для быстрого доступа из дашборда
    my_tasks_key = request.GET.get('my_tasks')
    completed_statuses = {
        ComplaintStatus.COMPLETED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
    }
    active_statuses = [status for status, _ in ComplaintStatus.choices if status not in completed_statuses]
    if my_tasks_key:
        role_task_filters = {
            'installer': {
                'in_work': (Q(installer_assigned=request.user) | Q(initiator=request.user)) & Q(status__in=active_statuses),
                'needs_planning': Q(installer_assigned=request.user, status__in=[
                    'waiting_installer_date', 'needs_planning', 'installer_not_planned'
                ]),
                'planned': Q(installer_assigned=request.user, status__in=[
                    'installation_planned', 'both_planned'
                ]),
                'completed': Q(installer_assigned=request.user, status__in=[
                    'under_sm_review', 'completed'
                ]),
            },
            'manager': {
                'in_work': (Q(manager=request.user) | Q(initiator=request.user) | Q(recipient=request.user)) & Q(status__in=active_statuses),
                'in_progress': Q(manager=request.user, status='in_progress'),
                'on_warehouse': Q(manager=request.user, status='on_warehouse'),
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
        
        role_filters = role_task_filters.get(request.user.role, {})
        task_filter = role_filters.get(my_tasks_key)
        if task_filter:
            complaints = complaints.filter(task_filter)
    
    # Фильтрация по статусу
    status_filter = request.GET.get('status')
    if status_filter:
        complaints = complaints.filter(status=status_filter)
    
    # Фильтрация по причине
    reason_filter = request.GET.get('reason')
    if reason_filter:
        complaints = complaints.filter(reason_id=reason_filter)
    
    # Фильтрация по инициатору (созданные мной) и назначению
    my_complaints_filter = request.GET.get('created_by_me')
    assigned_filter = request.GET.get('my_orders')
    
    if my_complaints_filter and assigned_filter:
        assigned_condition = (
            Q(manager=request.user) | Q(recipient=request.user)
            if request.user.role == 'manager'
            else Q(recipient=request.user)
        )
        complaints = complaints.filter(Q(initiator=request.user) | assigned_condition)
    else:
        if my_complaints_filter:
            complaints = complaints.filter(initiator=request.user)
    
        if assigned_filter:
            if request.user.role == 'manager':
                complaints = complaints.filter(Q(manager=request.user) | Q(recipient=request.user))
            elif request.user.role == 'service_manager':
                complaints = complaints.filter(Q(recipient=request.user))
            elif request.user.role == 'installer':
                complaints = complaints.filter(installer_assigned=request.user)
            else:
                complaints = complaints.filter(recipient=request.user)
    
    # Исключаем закрытые и выполненные рекламации по умолчанию
    exclude_closed_param = request.GET.get('exclude_closed')
    if exclude_closed_param is None:
        exclude_closed = True
    else:
        exclude_closed = exclude_closed_param not in ['0', 'false', 'False']
    
    if exclude_closed:
        complaints = complaints.exclude(status__in=['closed', 'completed'])
    
    # Фильтрация по городам
    cities = None
    selected_city_id = request.GET.get('city', '').strip()

    if request.user.role in ['admin', 'complaint_department']:
        cities = City.objects.order_by('name')
        if selected_city_id:
            complaints = complaints.filter(
                Q(initiator__city_id=selected_city_id) |
                Q(recipient__city_id=selected_city_id) |
                Q(manager__city_id=selected_city_id)
            )
    else:
        user_city = getattr(request.user, 'city', None)
        if request.user.role == 'service_manager':
            personal_filter = Q(initiator=request.user)
            if user_city:
                city_filter = Q(initiator__city=user_city)
                complaints = complaints.filter(city_filter | personal_filter)
            else:
                complaints = complaints.filter(personal_filter)
        elif request.user.role in ['manager', 'leader'] and user_city:
            city_filter = Q(initiator__city=user_city)
            complaints = complaints.filter(city_filter)

    # Поиск
    search_query = request.GET.get('search', '').strip()
    if search_query:
        search_conditions = (
            Q(order_number__icontains=search_query) |
            Q(client_name__icontains=search_query) |
            Q(contact_person__icontains=search_query) |
            Q(address__icontains=search_query)
        )
        
        normalized_phone_query = ''.join(ch for ch in search_query if ch.isdigit())
        phone_conditions = Q(contact_phone__icontains=search_query)
        if normalized_phone_query:
            regex_pattern = '[^0-9]*'.join(normalized_phone_query)
            phone_conditions |= Q(contact_phone__iregex=regex_pattern)
        
        complaints = complaints.filter(search_conditions | phone_conditions)
    
    # Сортировка
    sort_by = request.GET.get('sort', '-created_at')
    complaints = complaints.order_by(sort_by)
    
    # Получаем данные для фильтров
    reasons = ComplaintReason.objects.filter(is_active=True)
    statuses = Complaint._meta.get_field('status').choices
    
    # Статистика
    stats = {
        'total': complaints.count(),
        'new': complaints.filter(status='new').count(),
        'in_progress': complaints.filter(status='in_progress').count(),
        'resolved': complaints.filter(status='resolved').count(),
    }
    
    # Дополнительная статистика для монтажника
    if request.user.role == 'installer':
        stats['needs_planning'] = complaints.filter(
            installer_assigned=request.user,
            status__in=['waiting_installer_date', 'needs_planning']
        ).count()
        stats['in_work'] = complaints.filter(
            installer_assigned=request.user,
            status='installation_planned'
        ).count()
    
    context = {
        'complaints': complaints,
        'reasons': reasons,
        'statuses': statuses,
        'stats': stats,
        'current_status': status_filter,
        'current_reason': reason_filter,
        'search_query': search_query,
        'cities': cities,
        'selected_city_id': selected_city_id,
        'exclude_closed': exclude_closed,
        'created_by_me': bool(my_complaints_filter),
        'my_orders': bool(assigned_filter),
    }
    
    return render(request, 'projects/complaint_list.html', context)


@login_required(login_url='/api/v1/login/')
@complaint_access_required(
    check_initiator=True,
    check_recipient=True,
    check_manager=True,
    check_installer=True,
    allow_manager_all=True,
)
def complaint_detail(request, pk):
    """Детальная страница рекламации"""
    
    complaint = get_object_or_404(
        Complaint.objects.select_related(
            'initiator',
            'recipient',
            'manager',
            'production_site',
            'reason'
        ).prefetch_related(
            'defective_products',
            'attachments',
            'comments__author'
        ),
        pk=pk
    )
    
    # Обработка POST-запросов
    if request.method == 'POST':
        action = request.path.split('/')[-2]  # Получаем действие из URL
        
        # Действия менеджера
        if request.user.role == 'manager' and complaint.manager == request.user:
            if action == 'start-production' and complaint.status == 'in_progress':
                # Запуск производства
                production_deadline = request.POST.get('production_deadline')
                if production_deadline:
                    from datetime import datetime
                    deadline = datetime.fromisoformat(production_deadline)
                    complaint.start_production(deadline)
                    messages.success(request, 'Заказ запущен в производство')
                else:
                    messages.error(request, 'Укажите дату готовности')
            
            elif action == 'mark-warehouse' and complaint.status == 'in_production':
                # Товар готов на складе
                complaint.mark_on_warehouse()
                messages.success(request, 'Товар отмечен как готовый на складе')
            
            elif action == 'plan-shipping' and complaint.status == 'on_warehouse':
                # Планирование отгрузки
                shipping_date = request.POST.get('shipping_date')
                if shipping_date:
                    from datetime import datetime
                    shipping_date = datetime.fromisoformat(shipping_date)
                    complaint.plan_shipping(shipping_date)
                    messages.success(request, f'Отгрузка запланирована на {shipping_date.strftime("%d.%m.%Y")}')
                else:
                    messages.error(request, 'Укажите дату отгрузки')
        
        # Действия СМ
        elif request.user.role == 'service_manager':
            if action == 'plan-installation' and complaint.status in ['on_warehouse', 'shipping_planned']:
                # Планирование монтажа
                installation_date = request.POST.get('installation_date')
                installer_id = request.POST.get('installer')
                if installation_date and installer_id:
                    from datetime import datetime
                    installation_date = datetime.fromisoformat(installation_date)
                    installer = User.objects.get(id=installer_id)
                    complaint.plan_installation_by_sm(installer, installation_date)
                    messages.success(request, f'Монтаж запланирован на {installation_date.strftime("%d.%m.%Y %H:%M")}, монтажник: {installer.get_full_name() or installer.username}')
                else:
                    messages.error(request, 'Укажите дату монтажа и монтажника')
        
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    from datetime import date
    
    closure_reason = None
    if complaint.status == 'closed':
        closure_prefix = 'Рекламация завершена сервис-менеджером'
        comments_list = list(complaint.comments.all())
        for comment in reversed(comments_list):
            if comment.text.startswith(closure_prefix):
                if 'Причина:' in comment.text:
                    closure_reason = comment.text.split('Причина:', 1)[1].strip()
                    if not closure_reason:
                        closure_reason = 'Не указана'
                elif 'без указанной причины' in comment.text.lower():
                    closure_reason = 'Не указана'
                else:
                    closure_reason = comment.text.replace(closure_prefix, '').strip() or 'Не указана'
                break
    
    context = {
        'complaint': complaint,
        'today': date.today().isoformat(),
        'available_installers': User.objects.filter(role='installer'),
        'closure_reason': closure_reason,
    }
    
    return render(request, 'projects/complaint_detail.html', context)


@login_required(login_url='/api/v1/login/')
@complaint_access_required(check_initiator=True, check_recipient=True, check_manager=True)
def complaint_edit(request, pk):
    """Редактирование рекламации сервис-менеджером."""
    complaint = get_object_or_404(
        Complaint.objects.select_related(
            'initiator',
            'recipient',
            'manager',
            'production_site',
            'reason'
        ),
        pk=pk
    )
    # Разрешаем редактирование инициатору, СМ и пользователям с расширенными правами
    if not (
        complaint.initiator == request.user or
        request.user.role in ['service_manager', 'admin', 'leader']
    ):
        messages.error(request, 'У вас нет прав для редактирования этой рекламации')
        return redirect('projects:complaint_detail', pk=complaint.id)

    form = ComplaintEditForm(
        request.POST or None,
        request.FILES or None,
        instance=complaint,
        user=request.user,
    )

    if request.method == 'POST':
        if form.is_valid():
            form.save()
            
            # Обрабатываем новые вложения (фото/видео/документы)
            files = request.FILES.getlist('attachments')
            for file in files:
                # Определяем тип файла по расширению
                file_ext = file.name.lower().split('.')[-1]
                if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                    attachment_type = 'photo'
                elif file_ext in ['mp4', 'avi', 'mov', 'wmv', 'flv']:
                    attachment_type = 'video'
                else:
                    attachment_type = 'document'
                
                ComplaintAttachment.objects.create(
                    complaint=complaint,
                    file=file,
                    attachment_type=attachment_type
                )
            
            # Обрабатываем новые коммерческие предложения
            commercial_offers = request.FILES.getlist('commercial_offers')
            for co_file in commercial_offers:
                ComplaintAttachment.objects.create(
                    complaint=complaint,
                    file=co_file,
                    attachment_type='commercial_offer',
                    description='Коммерческое предложение'
                )
            
            messages.success(request, 'Данные рекламации обновлены')
            return redirect('projects:complaint_detail', pk=complaint.id)
        else:
            messages.error(request, 'Исправьте ошибки в форме')

    context = {
        'complaint': complaint,
        'form': form,
    }

    return render(request, 'projects/complaint_edit.html', context)


@login_required(login_url='/api/v1/login/')
def complaint_create(request):
    """Создание новой рекламации"""
    
    if request.method == 'POST':
        def get_service_manager_for_city(city):
            qs = User.objects.filter(role='service_manager')
            if city:
                sm = qs.filter(city=city).first()
                if sm:
                    return sm
            return qs.first()
        
        try:
            with transaction.atomic():
                # Получаем данные из формы
                recipient_id = request.POST.get('recipient')
                manager_id = request.POST.get('manager')
                production_site_id = request.POST.get('production_site')
                reason_id = request.POST.get('reason')
                final_manager_id = manager_id
                
                # Валидация обязательных полей
                required_fields = [production_site_id, reason_id, 
                           request.POST.get('order_number'), 
                           request.POST.get('client_name'),
                           request.POST.get('address'),
                           request.POST.get('contact_person'),
                                 request.POST.get('contact_phone')]
                
                if not all(required_fields):
                    messages.error(request, 'Заполните все обязательные поля')
                    raise ValueError('Missing required fields')
                
                # Для монтажников обязательно нужны вложения (фото/видео/документы)
                if request.user.role == 'installer':
                    if not request.FILES.getlist('attachments'):
                        messages.error(request, 'Для монтажников обязательно нужно прикрепить фото/видео/документы!')
                        raise ValueError('Installer must attach files')
                
                # Обработка типа рекламации для СМ
                complaint_type = request.POST.get('complaint_type')
                installer_id = request.POST.get('installer')
                
                # Определяем получателя
                if request.user.role == 'service_manager' and complaint_type:
                    # СМ выбрал тип рекламации сразу
                    if complaint_type == 'manager':
                        # Получатель - менеджер заказа
                        recipient = User.objects.get(id=manager_id)
                    elif complaint_type == 'installer':
                        # Получатель - выбранный монтажник
                        if not installer_id:
                            messages.error(request, 'Для типа "Монтажник" нужно выбрать монтажника')
                            raise ValueError('Installer required for installer type')
                        recipient = User.objects.get(id=installer_id)
                    elif complaint_type == 'factory':
                        # Получатель - первый ОР
                        recipient = User.objects.filter(role='complaint_department').first()
                        if not recipient:
                            messages.error(request, 'Не найден отдел рекламаций')
                            raise ValueError('No complaint department found')
                elif recipient_id:
                    recipient = User.objects.get(id=recipient_id)
                else:
                    # Если инициатор - менеджер или монтажник, получатель - первый СМ
                    if request.user.role in ['manager', 'installer']:
                        recipient = get_service_manager_for_city(getattr(request.user, 'city', None))
                        if not recipient:
                            messages.error(request, 'Не найден сервис-менеджер для назначения')
                            raise ValueError('No service manager found')
                    else:
                        recipient = User.objects.get(id=recipient_id)
                
                # Определяем менеджера заказа (все инициаторы выбирают вручную)
                # Валидация: менеджер заказа обязателен для всех
                if not final_manager_id:
                    messages.error(request, 'Необходимо указать менеджера заказа')
                    raise ValueError('Manager is required')
                
                # Создаем рекламацию
                complaint = Complaint.objects.create(
                    initiator=request.user,
                    recipient=recipient,
                    manager_id=final_manager_id,
                    production_site_id=production_site_id,
                    reason_id=reason_id,
                    order_number=request.POST.get('order_number'),
                    client_name=request.POST.get('client_name'),
                    address=request.POST.get('address'),
                    contact_person=request.POST.get('contact_person'),
                    contact_phone=request.POST.get('contact_phone'),
                    additional_info=request.POST.get('additional_info', '').strip(),
                    assignee_comment=request.POST.get('assignee_comment', '').strip(),
                    document_package_link=request.POST.get('document_package_link', ''),
                )
                
                # Добавляем бракованные изделия
                product_names = request.POST.getlist('product_name[]')
                product_sizes = request.POST.getlist('product_size[]')
                product_openings = request.POST.getlist('product_opening[]')
                product_descriptions = request.POST.getlist('product_description[]')
                
                for i in range(len(product_names)):
                    if product_names[i].strip():  # Только если есть название
                        DefectiveProduct.objects.create(
                            complaint=complaint,
                            product_name=product_names[i],
                            size=product_sizes[i] if i < len(product_sizes) else '',
                            opening_type=product_openings[i] if i < len(product_openings) else '',
                            problem_description=product_descriptions[i] if i < len(product_descriptions) else '',
                            order=i
                        )
                
                # Добавляем вложения
                files = request.FILES.getlist('attachments')
                for file in files:
                    # Определяем тип файла по расширению
                    file_ext = file.name.lower().split('.')[-1]
                    if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                        attachment_type = 'photo'
                    elif file_ext in ['mp4', 'avi', 'mov', 'wmv', 'flv']:
                        attachment_type = 'video'
                    else:
                        attachment_type = 'document'
                    
                    ComplaintAttachment.objects.create(
                        complaint=complaint,
                        file=file,
                        attachment_type=attachment_type
                    )
                
                # Добавляем коммерческие предложения
                commercial_offers = request.FILES.getlist('commercial_offers')
                for co_file in commercial_offers:
                    ComplaintAttachment.objects.create(
                        complaint=complaint,
                        file=co_file,
                        attachment_type='commercial_offer',
                        description='Коммерческое предложение'
                    )
                
                # Если СМ выбрал тип рекламации сразу, применяем соответствующую логику
                if request.user.role == 'service_manager' and complaint_type:
                    if complaint_type == 'manager':
                        complaint.set_type_manager()
                        messages.success(request, f'Рекламация #{complaint.id} создана и отправлена менеджеру!')
                    elif complaint_type == 'installer':
                        complaint.installer_assigned_id = installer_id
                        complaint.save()
                        complaint.set_type_installer()
                        messages.success(request, f'Рекламация #{complaint.id} создана и отправлена монтажнику!')
                    elif complaint_type == 'factory':
                        complaint.set_type_factory()
                        messages.success(request, f'Рекламация #{complaint.id} создана и отправлена в ОР!')
                else:
                    messages.success(request, f'Рекламация #{complaint.id} успешно создана!')
                
                return redirect('projects:complaint_detail', pk=complaint.id)
                
        except ValueError:
            pass  # Сообщение об ошибке уже выведено
        except Exception as e:
            messages.error(request, f'Ошибка при создании рекламации: {str(e)}')
    
    # GET запрос - показываем форму
    context = {
        'reasons': ComplaintReason.objects.filter(is_active=True),
        'production_sites': ProductionSite.objects.filter(is_active=True),
        'managers': User.objects.filter(role='manager'),
        'installers': User.objects.filter(role='installer'),
        'recipients': User.objects.filter(role__in=['service_manager', 'complaint_department', 'leader']),
        'show_recipient': request.user.role not in ['manager', 'installer', 'service_manager'],
    }
    
    return render(request, 'projects/complaint_create.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['manager', 'service_manager', 'complaint_department', 'admin', 'leader'])
def shipping_registry(request):
    """Реестр на отгрузку"""
    
    # Получаем все записи из реестра
    shipping_entries = ShippingRegistry.objects.select_related(
        'manager', 'complaint'
    ).all()
    
    # Фильтрация по городам
    # Администратор, Руководитель, Менеджер и СМ видят все
    if request.user.role in ['admin', 'leader', 'manager', 'service_manager']:
        pass  # Без фильтрации
    # ОР видит все
    # complaint_department - без дополнительной фильтрации
    
    # Фильтры
    order_type_filter = request.GET.get('order_type', '')
    delivery_status_filter = request.GET.get('delivery_status', '')
    manager_filter = request.GET.get('manager', '')
    search_query = request.GET.get('search', '')
    
    if order_type_filter:
        shipping_entries = shipping_entries.filter(order_type=order_type_filter)
    
    if delivery_status_filter:
        shipping_entries = shipping_entries.filter(delivery_status=delivery_status_filter)
    
    if manager_filter:
        shipping_entries = shipping_entries.filter(manager_id=manager_filter)
    
    if search_query:
        shipping_entries = shipping_entries.filter(
            Q(order_number__icontains=search_query) |
            Q(client_name__icontains=search_query) |
            Q(contact_person__icontains=search_query) |
            Q(address__icontains=search_query)
        )
    
    # Статистика
    stats = {
        'total': shipping_entries.count(),
        'pending': shipping_entries.filter(delivery_status='pending').count(),
        'in_transit': shipping_entries.filter(delivery_status='in_transit').count(),
        'delivered': shipping_entries.filter(delivery_status='delivered').count(),
        'complaints': shipping_entries.filter(order_type='complaint').count(),
    }
    
    # Списки для фильтров
    managers = User.objects.filter(role='manager').order_by('first_name', 'last_name')
    
    context = {
        'shipping_entries': shipping_entries,
        'managers': managers,
        'stats': stats,
        'current_order_type': order_type_filter,
        'current_delivery_status': delivery_status_filter,
        'current_manager': manager_filter,
        'search_query': search_query,
    }
    
    return render(request, 'projects/shipping_registry.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['manager', 'service_manager', 'complaint_department', 'admin', 'leader'])
def shipping_detail(request, pk):
    """Детальная страница записи реестра на отгрузку"""
    
    entry = get_object_or_404(ShippingRegistry, pk=pk)
    
    # Проверка прав по городу
    # Менеджер видит все, СМ - только по своему городу
    if request.user.role == 'service_manager':
        if request.user.city and entry.manager.city != request.user.city:
            messages.error(request, 'У вас нет доступа к этой записи')
            return redirect('projects:shipping_registry')
    
    if request.method == 'POST':
        # Обновление данных
        try:
            entry.doors_count = int(request.POST.get('doors_count', 1))
            entry.lift_type = request.POST.get('lift_type')
            entry.lift_method = request.POST.get('lift_method')
            entry.payment_status = request.POST.get('payment_status', '')
            entry.delivery_destination = request.POST.get('delivery_destination')
            entry.comments = request.POST.get('comments', '')
            entry.delivery_status = request.POST.get('delivery_status')
            
            # Оценка клиента
            rating = request.POST.get('client_rating')
            if rating:
                entry.client_rating = int(rating)
            
            entry.save()
            messages.success(request, 'Запись обновлена успешно')
            return redirect('projects:shipping_detail', pk=entry.id)
        except Exception as e:
            messages.error(request, f'Ошибка при обновлении: {str(e)}')
    
    context = {
        'entry': entry,
    }
    
    return render(request, 'projects/shipping_detail.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['service_manager', 'complaint_department', 'admin', 'leader'])
def complaint_process(request, pk):
    """Обработка рекламации СМ"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'update_assignee_comment':
            new_comment = request.POST.get('assignee_comment', '').strip()
            complaint.assignee_comment = new_comment
            complaint.save(update_fields=['assignee_comment'])
            messages.success(request, 'Комментарий для исполнителя обновлён.')
            return redirect('projects:complaint_process', pk=complaint.id)

        if action == 'set_type_installer':
            installer_id = request.POST.get('installer')
            if installer_id:
                installer = User.objects.get(id=installer_id)
                complaint.set_type_installer()
                complaint.installer_assigned = installer
                complaint.save()
                messages.success(request, f'Тип установлен: Монтажник. Назначен: {installer.get_full_name() or installer.username}')
            else:
                messages.error(request, 'Выберите монтажника')
                return redirect('projects:complaint_process', pk=complaint.id)
            
        elif action == 'set_type_manager':
            manager_id = request.POST.get('manager')
            if manager_id:
                manager = User.objects.get(id=manager_id)
                
                # Создаем комментарий если менеджер только что назначен
                if not complaint.manager:
                    ComplaintComment.objects.create(
                        complaint=complaint,
                        author=request.user,
                        text=f'Назначен менеджер заказа: {manager.get_full_name() or manager.username}'
                    )
                
                complaint.manager = manager
                complaint.save()
                
                try:
                    complaint.set_type_manager()
                    messages.success(request, f'Тип рекламации установлен: Менеджер. Назначен: {manager.get_full_name() or manager.username}')
                except ValueError as e:
                    messages.error(request, str(e))
                    return redirect('projects:complaint_process', pk=complaint.id)
            else:
                messages.error(request, 'Выберите менеджера')
                return redirect('projects:complaint_process', pk=complaint.id)
            
        elif action == 'set_type_factory':
            complaint.set_type_factory()
            messages.success(request, 'Тип рекламации установлен: Фабрика')
            
        elif action == 'approve':
            # СМ проверяет и одобряет выполненную монтажником работу
            complaint.approve_by_sm()
            
            # Создаем комментарий о проверке
            ComplaintComment.objects.create(
                complaint=complaint,
                author=request.user,
                text=f'Рекламация проверена и одобрена сервис-менеджером {request.user.get_full_name() or request.user.username}'
            )
            
            # Уведомляем монтажника об одобрении
            if complaint.installer_assigned:
                complaint._create_notification(
                    recipient=complaint.installer_assigned,
                    notification_type='push',
                    title='Работа одобрена',
                    message=f'Ваша работа по рекламации #{complaint.id} одобрена СМ'
                )
            
            messages.success(request, 'Рекламация проверена и отмечена как выполненная! Клиенту отправлено SMS для оценки работы.')
        
        elif action == 'close':
            # СМ может завершить рекламацию напрямую
            complaint.status = 'closed'
            complaint.completion_date = timezone.now()
            complaint.save()
            
            closure_reason = request.POST.get('closure_reason', '').strip()
            
            # Создаем комментарий о завершении
            if closure_reason:
                comment_text = f'Рекламация завершена сервис-менеджером. Причина: {closure_reason}'
            else:
                comment_text = 'Рекламация завершена сервис-менеджером без указанной причины'
            
            ComplaintComment.objects.create(
                complaint=complaint,
                author=request.user,
                text=comment_text
            )
            
            # Уведомляем участников
            if complaint.initiator != request.user:
                complaint._create_notification(
                    recipient=complaint.initiator,
                    notification_type='push',
                    title='Рекламация завершена',
                    message=f'Рекламация #{complaint.id} завершена сервис-менеджером'
                )
            
            if complaint.manager != request.user:
                complaint._create_notification(
                    recipient=complaint.manager,
                    notification_type='push',
                    title='Рекламация завершена',
                    message=f'Рекламация #{complaint.id} завершена сервис-менеджером'
                )
            
            if closure_reason:
                messages.success(request, 'Рекламация успешно завершена. Причина сохранена в комментарии.')
            else:
                messages.warning(request, 'Рекламация завершена, но причина не указана. Комментарий сохранен без причины.')
        
        elif action == 'change_installer':
            # СМ может заменить монтажника
            new_installer_id = request.POST.get('new_installer')
            if new_installer_id:
                old_installer = complaint.installer_assigned
                new_installer = User.objects.get(id=new_installer_id)
                
                complaint.installer_assigned = new_installer
                complaint.save()
                
                # Создаем комментарий об изменении
                if old_installer:
                    change_text = f'Монтажник изменен: {old_installer.get_full_name() or old_installer.username} → {new_installer.get_full_name() or new_installer.username}'
                else:
                    change_text = f'Назначен монтажник: {new_installer.get_full_name() or new_installer.username}'
                
                ComplaintComment.objects.create(
                    complaint=complaint,
                    author=request.user,
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
                
                messages.success(request, f'Монтажник успешно изменен на {new_installer.get_full_name() or new_installer.username}')
            else:
                messages.error(request, 'Выберите нового монтажника')
        
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    # Получаем монтажников и менеджеров для планирования
    installers = User.objects.filter(role='installer').order_by('first_name', 'last_name')
    managers = User.objects.filter(role='manager').order_by('first_name', 'last_name')
    
    context = {
        'complaint': complaint,
        'installers': installers,
        'managers': managers,
    }
    
    return render(request, 'projects/complaint_process.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['installer', 'admin', 'leader'])
def installer_planning(request):
    """Страница задач монтажника"""
    
    # Получаем рекламации, назначенные ЭТОМУ монтажнику
    # Включаем и тип "installer" и тип "manager" (где СМ запланировал монтаж)
    complaints = Complaint.objects.filter(
        Q(installer_assigned=request.user) | Q(initiator=request.user)
    ).select_related(
        'initiator', 'recipient', 'manager', 'production_site', 'reason'
    ).order_by('-created_at')
    
    # Admin и Leader видят все рекламации с назначенным монтажником
    if request.user.role in ['admin', 'leader']:
        complaints = Complaint.objects.filter(
            installer_assigned__isnull=False
        ).select_related(
            'initiator', 'recipient', 'manager', 'production_site', 'reason', 'installer_assigned'
        ).order_by('-created_at')
    
    # Исключаем закрытые и выполненные рекламации по умолчанию
    exclude_closed_param = request.GET.get('exclude_closed')
    if exclude_closed_param is None:
        exclude_closed = True
    else:
        exclude_closed = exclude_closed_param not in ['0', 'false', 'False']
    
    # Фильтрация по статусу
    filter_type = request.GET.get('filter')
    if filter_type == 'needs_planning':
        complaints = complaints.filter(status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned'])
    elif filter_type == 'planned':
        complaints = complaints.filter(status__in=['installation_planned', 'both_planned'])
    elif filter_type == 'completed':
        complaints = complaints.filter(status__in=['under_sm_review', 'completed'])
    elif filter_type == 'closed':
        complaints = complaints.filter(status=ComplaintStatus.CLOSED)
    else:
        # По умолчанию исключаем закрытые и выполненные рекламации, если чекбокс включен
        if exclude_closed:
            complaints = complaints.exclude(status__in=['closed', 'completed'])
    
    # Обработка POST-запроса (назначение даты или перенос)
    if request.method == 'POST':
        action = request.POST.get('action', 'plan')
        complaint_id = request.POST.get('complaint_id')
        installation_date = request.POST.get('installation_date')
        
        if complaint_id and installation_date:
            try:
                from datetime import datetime
                complaint = Complaint.objects.get(id=complaint_id, installer_assigned=request.user)
                new_installation_date = datetime.fromisoformat(installation_date)
                
                if action == 'reschedule' and complaint.planned_installation_date:
                    # Перенос даты монтажа
                    old_date = complaint.planned_installation_date
                    complaint.planned_installation_date = new_installation_date
                    complaint.save()
                    
                    # Создаем комментарий о переносе
                    ComplaintComment.objects.create(
                        complaint=complaint,
                        author=request.user,
                        text=f'Дата монтажа перенесена: {old_date.strftime("%d.%m.%Y %H:%M")} → {new_installation_date.strftime("%d.%m.%Y %H:%M")}'
                    )
                    
                    # Уведомляем СМ
                    complaint._create_notification(
                        recipient=complaint.recipient,
                        notification_type='push',
                        title='Монтаж перенесен',
                        message=f'Монтажник перенес дату монтажа по рекламации #{complaint.id} на {new_installation_date.strftime("%d.%m.%Y %H:%M")}'
                    )
                    
                    # Уведомляем менеджера
                    complaint._create_notification(
                        recipient=complaint.manager,
                        notification_type='push',
                        title='Монтаж перенесен',
                        message=f'Дата монтажа по рекламации #{complaint.id} перенесена на {new_installation_date.strftime("%d.%m.%Y %H:%M")}'
                    )
                    
                    messages.success(request, f'Дата монтажа успешно перенесена на {new_installation_date.strftime("%d.%m.%Y %H:%M")}')
                else:
                    # Первичное планирование
                    complaint.plan_installation(request.user, new_installation_date)
                messages.success(request, 'Монтаж запланирован успешно')
                    
            except Complaint.DoesNotExist:
                messages.error(request, 'Рекламация не найдена или не назначена вам')
            except Exception as e:
                messages.error(request, f'Ошибка при планировании: {str(e)}')
        else:
            messages.error(request, 'Заполните все поля')
        
        return redirect('projects:installer_planning')
    
    # Статистика
    base_filter = {'installer_assigned': request.user} if request.user.role == 'installer' else {'installer_assigned__isnull': False}
    
    stats = {
        'total': Complaint.objects.filter(**base_filter).count(),
        'needs_planning': Complaint.objects.filter(**base_filter, status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']).count(),
        'planned': Complaint.objects.filter(**base_filter, status__in=['installation_planned', 'both_planned']).count(),
        'completed': Complaint.objects.filter(**base_filter, status__in=['under_sm_review', 'completed']).count(),
        'closed': Complaint.objects.filter(**base_filter, status=ComplaintStatus.CLOSED).count(),
    }
    
    context = {
        'complaints': complaints,
        'stats': stats,
        'exclude_closed': exclude_closed,
    }
    
    return render(request, 'projects/installer_tasks.html', context)


@login_required(login_url='/api/v1/login/')
@complaint_access_required(check_installer=True)
def installer_complete(request, pk):
    """Монтажник отмечает работу выполненной"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    if request.method == 'POST':
        complaint.mark_completed()
        messages.success(request, 'Работа отмечена как выполненная')
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    context = {
        'complaint': complaint,
    }
    
    return render(request, 'projects/installer_complete.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['manager', 'admin', 'leader'])
def manager_production(request):
    """Управление производством менеджером"""
    
    # Получаем рекламации менеджера
    complaints = Complaint.objects.filter(
        status__in=['in_progress', 'in_production', 'on_warehouse', 'shipping_planned']
    ).select_related(
        'initiator', 'recipient', 'production_site', 'reason'
    )
    
    # Фильтруем по менеджеру
    # Админ, лидер и менеджер видят все
    if request.user.role in ['admin', 'leader', 'manager']:
        pass  # Без фильтрации
    
    complaints = complaints.order_by('-created_at')
    
    if request.method == 'POST':
        action = request.POST.get('action')
        complaint_id = request.POST.get('complaint_id')
        
        try:
            complaint = Complaint.objects.get(id=complaint_id)
            
            if action == 'start_production':
                deadline = request.POST.get('production_deadline')
                if deadline:
                    from datetime import datetime
                    deadline = datetime.fromisoformat(deadline)
                    complaint.start_production(deadline)
                    messages.success(request, 'Производство запущено')
                else:
                    messages.error(request, 'Укажите срок готовности')
                    
            elif action == 'mark_on_warehouse':
                complaint.mark_on_warehouse()
                messages.success(request, 'Товар отмечен как готовый на складе')
                
            elif action == 'plan_shipping':
                shipping_date = request.POST.get('shipping_date')
                if shipping_date:
                    from datetime import datetime
                    shipping_date = datetime.fromisoformat(shipping_date)
                    complaint.plan_shipping(shipping_date)
                    messages.success(request, 'Отгрузка запланирована')
                else:
                    messages.error(request, 'Укажите дату отгрузки')
                    
        except Exception as e:
            messages.error(request, f'Ошибка: {str(e)}')
        
        return redirect('projects:manager_production')
    
    context = {
        'complaints': complaints,
    }
    
    return render(request, 'projects/manager_production.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['complaint_department', 'admin', 'leader'])
def or_factory_complaints(request):
    """Работа ОР с фабричными рекламациями"""
    
    # Получаем фабричные рекламации  
    complaints = Complaint.objects.filter(
        complaint_type='factory',
        status__in=[
            'sent',  # Отправлена
            'factory_response_overdue',  # Ответ фабрики просрочен
            'factory_approved',  # Ответ получен (ожидает СМ)
            'sm_response_overdue',  # СМ просрочил ответ
            'factory_dispute',  # Спор с фабрикой
            'in_production',  # В производстве после одобрения
            'on_warehouse',  # Товар готов
        ]
    ).select_related(
        'initiator', 'recipient', 'manager', 'production_site', 'reason'
    ).order_by('-created_at')
    
    if request.method == 'POST':
        action = request.POST.get('action')
        complaint_id = request.POST.get('complaint_id')
        
        try:
            complaint = Complaint.objects.get(id=complaint_id)
            
            if action == 'factory_approve':
                # ОР одобряет рекламацию - запуск в производство
                sm_name = complaint.recipient.get_full_name() or complaint.recipient.username
                complaint.factory_approve()
                messages.success(
                    request,
                    f'Ответ фабрики сохранён. Статус рекламации обновлён на «Ответ получен», уведомление отправлено СМ ({sm_name}) для согласования с клиентом.'
                )
                
            elif action == 'factory_reject':
                # ОР отказывает в рекламации
                reject_reason = request.POST.get('reject_reason', '').strip()
                if reject_reason:
                    complaint.factory_reject(reject_reason)
                    messages.success(request, 'Рекламация отклонена. СМ получил уведомление.')
                else:
                    messages.error(request, 'Укажите причину отказа')
                    return redirect('projects:or_factory_complaints')
                
            elif action == 'mark_warehouse':
                # ОР отмечает товар на складе
                sm_name = complaint.recipient.get_full_name() or complaint.recipient.username
                manager_name = complaint.manager.get_full_name() or complaint.manager.username if complaint.manager else "не назначен"
                complaint.mark_on_warehouse()
                messages.success(request, f'Товар отмечен как готовый на складе. Уведомления отправлены: СМ ({sm_name}), Менеджер ({manager_name}).')
                    
        except Exception as e:
            messages.error(request, f'Ошибка: {str(e)}')
        
        return redirect('projects:or_factory_complaints')
    
    # Статистика
    stats = {
        'total': complaints.count(),
        'sent': complaints.filter(status__in=['sent', 'factory_response_overdue']).count(),  # Ожидает ответа (включая просроченные)
        'overdue': complaints.filter(status='factory_response_overdue').count(),  # Просрочена
        'dispute': complaints.filter(status='factory_dispute').count(),  # Споры
        'in_production': complaints.filter(status='in_production').count(),  # В производстве
        'on_warehouse': complaints.filter(status='on_warehouse').count(),  # На складе
    }
    
    context = {
        'complaints': complaints,
        'stats': stats,
    }
    
    return render(request, 'projects/or_factory_complaints.html', context)


@login_required(login_url='/api/v1/login/')
def complaint_history(request, pk):
    """История событий по рекламации"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    # Проверка прав доступа
    # Менеджер, СМ, Админ, Лидер и ОР видят историю всех рекламаций
    if request.user.role not in ['manager', 'service_manager', 'admin', 'leader', 'complaint_department']:
        messages.error(request, 'У вас нет доступа к истории рекламаций')
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    # Собираем всю историю событий
    history_events = []
    
    # 1. Создание рекламации
    history_events.append({
        'type': 'created',
        'date': complaint.created_at,
        'user': complaint.initiator,
        'title': 'Рекламация создана',
        'description': f'Инициатор: {complaint.initiator.get_full_name() or complaint.initiator.username} ({complaint.initiator.get_role_display()})',
        'icon': 'create',
        'color': 'blue'
    })
    
    # 2. Комментарии
    comments = complaint.comments.all().select_related('author')
    for comment in comments:
        history_events.append({
            'type': 'comment',
            'date': comment.created_at,
            'user': comment.author,
            'title': 'Комментарий добавлен',
            'description': comment.text,
            'icon': 'comment',
            'color': 'gray'
        })
    
    # 3. Уведомления (отправленные)
    notifications = complaint.notifications.filter(is_sent=True).select_related('recipient')
    for notification in notifications:
        history_events.append({
            'type': 'notification',
            'date': notification.sent_at or notification.created_at,
            'user': notification.recipient,
            'title': f'Уведомление: {notification.title}',
            'description': f'{notification.get_notification_type_display()} → {notification.recipient.get_full_name() or notification.recipient.username}',
            'icon': 'notification',
            'color': 'yellow'
        })
    
    # 4. Изменение статуса (из обновлений)
    if complaint.updated_at != complaint.created_at:
        history_events.append({
            'type': 'updated',
            'date': complaint.updated_at,
            'user': None,
            'title': 'Рекламация обновлена',
            'description': f'Текущий статус: {complaint.get_status_display()}',
            'icon': 'update',
            'color': 'purple'
        })
    
    # 5. Назначение монтажника
    if complaint.installer_assigned:
        # Ищем комментарий о назначении
        installer_comment = comments.filter(text__icontains='монтажник').first()
        if installer_comment:
            history_events.append({
                'type': 'installer_assigned',
                'date': installer_comment.created_at,
                'user': installer_comment.author,
                'title': 'Назначен монтажник',
                'description': f'Монтажник: {complaint.installer_assigned.get_full_name() or complaint.installer_assigned.username}',
                'icon': 'user',
                'color': 'green'
            })
    
    # 6. Планирование монтажа
    if complaint.planned_installation_date:
        history_events.append({
            'type': 'installation_planned',
            'date': complaint.planned_installation_date,
            'user': complaint.installer_assigned,
            'title': 'Монтаж запланирован',
            'description': f'Дата: {complaint.planned_installation_date.strftime("%d.%m.%Y")}',
            'icon': 'calendar',
            'color': 'indigo'
        })
    
    # 7. Планирование отгрузки
    if complaint.planned_shipping_date:
        history_events.append({
            'type': 'shipping_planned',
            'date': complaint.planned_shipping_date,
            'user': complaint.manager,
            'title': 'Отгрузка запланирована',
            'description': f'Дата: {complaint.planned_shipping_date.strftime("%d.%m.%Y")}',
            'icon': 'truck',
            'color': 'orange'
        })
    
    # 8. Завершение
    if complaint.completion_date:
        history_events.append({
            'type': 'completed',
            'date': complaint.completion_date,
            'user': None,
            'title': 'Рекламация завершена',
            'description': f'Дата завершения: {complaint.completion_date.strftime("%d.%m.%Y %H:%M")}',
            'icon': 'check',
            'color': 'green'
        })
    
    # Сортируем по дате (от новых к старым)
    history_events.sort(key=lambda x: x['date'], reverse=True)
    
    context = {
        'complaint': complaint,
        'history_events': history_events,
        'total_events': len(history_events),
    }
    
    return render(request, 'projects/complaint_history.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['service_manager', 'manager', 'admin', 'leader'])
def update_client_contact(request, pk):
    """Обновление контактной информации клиента"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    # Проверка прав доступа
    # Менеджер, СМ, Админ и Лидер могут редактировать
    # Для менеджера - без ограничений (видит все рекламации)
    if request.user.role == 'service_manager':
        # СМ может редактировать рекламации в своем городе
        if request.user.city and complaint.manager and complaint.manager.city != request.user.city:
            messages.error(request, 'У вас нет прав для редактирования этой рекламации')
            return redirect('projects:complaint_detail', pk=complaint.id)
    
    if request.method == 'POST':
        # Получаем новые данные
        new_contact_person = request.POST.get('contact_person', '').strip()
        new_contact_phone = request.POST.get('contact_phone', '').strip()
        new_address = request.POST.get('address', '').strip()
        
        # Валидация
        if not new_contact_person or not new_contact_phone:
            messages.error(request, 'Укажите контактное лицо и телефон')
            return redirect('projects:complaint_detail', pk=complaint.id)
        
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
            author=request.user,
            text=change_message
        )
        
        # Уведомляем всех участников об изменении
        # Уведомление инициатору (если не он сам менял)
        if complaint.initiator != request.user:
            complaint._create_notification(
                recipient=complaint.initiator,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление получателю (если не он сам менял)
        if complaint.recipient != request.user:
            complaint._create_notification(
                recipient=complaint.recipient,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление менеджеру (если не он сам менял и менеджер назначен)
        if complaint.manager and complaint.manager != request.user:
            complaint._create_notification(
                recipient=complaint.manager,
                notification_type='push',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные клиента. Новое контактное лицо: {new_contact_person}'
            )
        
        # Уведомление монтажнику (если назначен и не он сам менял)
        if complaint.installer_assigned and complaint.installer_assigned != request.user:
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='sms',
                title='Изменены контактные данные клиента',
                message=f'По рекламации #{complaint.id} изменены контактные данные. Новый контакт: {new_contact_person}, тел: {new_contact_phone}'
            )
        
        messages.success(request, 'Контактные данные клиента успешно обновлены. Уведомления отправлены всем участникам.')
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    # GET запрос - показываем форму (можно добавить отдельный шаблон)
    return redirect('projects:complaint_detail', pk=complaint.id)


@login_required(login_url='/api/v1/login/')
@role_required(['service_manager', 'admin', 'leader'])
def sm_agree_client(request, pk):
    """СМ согласовывает решение фабрики с клиентом"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    # Проверка, что рекламация в правильном статусе
    if complaint.status not in ['factory_approved', 'sm_response_overdue']:
        messages.error(request, 'Рекламация не находится на этапе согласования с клиентом')
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    if request.method == 'POST':
        production_deadline = request.POST.get('production_deadline')
        
        if production_deadline:
            from datetime import datetime
            deadline = datetime.fromisoformat(production_deadline)
            
            # Вызываем метод согласования
            complaint.sm_agree_with_client(deadline)
            
            # Создаем комментарий
            ComplaintComment.objects.create(
                complaint=complaint,
                author=request.user,
                text=f'СМ согласовал решение фабрики с клиентом. Срок готовности: {deadline.strftime("%d.%m.%Y")}'
            )
            
            messages.success(request, f'Решение согласовано с клиентом! Срок готовности: {deadline.strftime("%d.%m.%Y")}. ОР получил уведомление.')
        else:
            messages.error(request, 'Укажите дату готовности заказа')
    
    return redirect('projects:complaint_detail', pk=complaint.id)


@login_required(login_url='/api/v1/login/')
@role_required(['service_manager', 'admin', 'leader'])
def sm_dispute_decision(request, pk):
    """СМ оспаривает решение фабрики"""
    complaint = get_object_or_404(Complaint, pk=pk)
    
    # Проверка, что рекламация в правильном статусе
    if complaint.status not in ['factory_approved', 'sm_response_overdue', 'factory_rejected']:
        messages.error(request, 'Рекламация не находится на этапе ответов фабрике')
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    if request.method == 'POST':
        dispute_arguments = request.POST.get('dispute_arguments', '').strip()
        
        if dispute_arguments:
            # Вызываем метод оспаривания
            complaint.sm_dispute_factory_decision(dispute_arguments)
            
            # Сохраняем дополнительные документы, если есть
            files = request.FILES.getlist('dispute_attachments')
            for file in files:
                # Определяем тип файла
                file_ext = file.name.lower().split('.')[-1]
                if file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                    attachment_type = 'photo'
                elif file_ext in ['mp4', 'avi', 'mov', 'wmv', 'flv']:
                    attachment_type = 'video'
                else:
                    attachment_type = 'document'
                
                ComplaintAttachment.objects.create(
                    complaint=complaint,
                    file=file,
                    attachment_type=attachment_type,
                    description='Документ для спора с фабрикой'
                )
            
            # Создаем комментарий
            ComplaintComment.objects.create(
                complaint=complaint,
                author=request.user,
                text=f'СМ оспорил решение фабрики. Аргументы: {dispute_arguments}'
            )
            
            messages.success(request, 'Рекламация отправлена фабрике на повторное рассмотрение.')
        else:
            messages.error(request, 'Укажите аргументы спора')
    
    return redirect('projects:complaint_detail', pk=complaint.id)


