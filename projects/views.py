from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q, Count
from django.db import transaction
from users.models import User
from .models import (
    Complaint,
    ComplaintReason,
    ProductionSite,
    DefectiveProduct,
    ComplaintAttachment,
    ComplaintComment,
    ShippingRegistry,
    Notification
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
    
    # Фильтрация по ролям и городам
    # 1. Монтажник видит только назначенные ему (независимо от города)
    if request.user.role == 'installer':
        complaints = complaints.filter(
            Q(initiator=request.user) | Q(installer_assigned=request.user)
        )
    # 2. Администратор и Руководитель видят все по всем городам
    elif request.user.role in ['admin', 'leader']:
        pass  # Без фильтрации
    # 3. СМ и Менеджер видят все рекламации по своему городу
    elif request.user.role in ['service_manager', 'manager']:
        if request.user.city:
            complaints = complaints.filter(
                Q(initiator__city=request.user.city) | 
                Q(recipient__city=request.user.city) |
                Q(manager__city=request.user.city)
            )
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
    
    # Фильтрация по статусу
    status_filter = request.GET.get('status')
    if status_filter:
        complaints = complaints.filter(status=status_filter)
    
    # Фильтрация по причине
    reason_filter = request.GET.get('reason')
    if reason_filter:
        complaints = complaints.filter(reason_id=reason_filter)
    
    # Фильтрация по инициатору (мои рекламации)
    if request.GET.get('my_complaints'):
        complaints = complaints.filter(initiator=request.user)
    
    # Фильтрация по получателю (назначенные мне)
    if request.GET.get('assigned_to_me'):
        complaints = complaints.filter(recipient=request.user)
    
    # Поиск
    search_query = request.GET.get('search')
    if search_query:
        complaints = complaints.filter(
            Q(order_number__icontains=search_query) |
            Q(client_name__icontains=search_query) |
            Q(contact_person__icontains=search_query) |
            Q(address__icontains=search_query)
        )
    
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
    }
    
    return render(request, 'projects/complaint_list.html', context)


@login_required(login_url='/api/v1/login/')
@complaint_access_required(check_initiator=True, check_recipient=True, check_manager=True, check_installer=True)
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
    
    context = {
        'complaint': complaint,
    }
    
    return render(request, 'projects/complaint_detail.html', context)


@login_required(login_url='/api/v1/login/')
def complaint_create(request):
    """Создание новой рекламации"""
    
    if request.method == 'POST':
        try:
            with transaction.atomic():
                # Получаем данные из формы
                recipient_id = request.POST.get('recipient')
                manager_id = request.POST.get('manager')
                production_site_id = request.POST.get('production_site')
                reason_id = request.POST.get('reason')
                
                # Валидация обязательных полей
                if not all([manager_id, production_site_id, reason_id, 
                           request.POST.get('order_number'), 
                           request.POST.get('client_name'),
                           request.POST.get('address'),
                           request.POST.get('contact_person'),
                           request.POST.get('contact_phone'),
                           request.POST.get('problem_description')]):
                    messages.error(request, 'Заполните все обязательные поля')
                    raise ValueError('Missing required fields')
                
                # Определяем получателя
                if recipient_id:
                    recipient = User.objects.get(id=recipient_id)
                else:
                    # Если инициатор - менеджер или монтажник, получатель - первый СМ
                    if request.user.role in ['manager', 'installer']:
                        recipient = User.objects.filter(role='service_manager').first()
                        if not recipient:
                            messages.error(request, 'Не найден сервис-менеджер для назначения')
                            raise ValueError('No service manager found')
                    else:
                        recipient = User.objects.get(id=recipient_id)
                
                # Создаем рекламацию
                complaint = Complaint.objects.create(
                    initiator=request.user,
                    recipient=recipient,
                    manager_id=manager_id,
                    production_site_id=production_site_id,
                    reason_id=reason_id,
                    order_number=request.POST.get('order_number'),
                    client_name=request.POST.get('client_name'),
                    address=request.POST.get('address'),
                    contact_person=request.POST.get('contact_person'),
                    contact_phone=request.POST.get('contact_phone'),
                    problem_description=request.POST.get('problem_description'),
                    document_package_link=request.POST.get('document_package_link', ''),
                )
                
                # Загружаем КП если есть
                if request.FILES.get('commercial_offer'):
                    complaint.commercial_offer = request.FILES['commercial_offer']
                    complaint.save()
                
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
        'recipients': User.objects.filter(role__in=['service_manager', 'complaint_department', 'leader']),
        'show_recipient': request.user.role not in ['manager', 'installer'],
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
    # Администратор и Руководитель видят все
    if request.user.role in ['admin', 'leader']:
        pass  # Без фильтрации
    # СМ и Менеджер видят только по своему городу
    elif request.user.role in ['service_manager', 'manager']:
        if request.user.city:
            shipping_entries = shipping_entries.filter(manager__city=request.user.city)
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
    if request.user.role in ['service_manager', 'manager']:
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
            complaint.set_type_manager()
            messages.success(request, 'Тип рекламации установлен: Менеджер')
            
        elif action == 'set_type_factory':
            complaint.set_type_factory()
            messages.success(request, 'Тип рекламации установлен: Фабрика')
            
        elif action == 'approve':
            complaint.approve_by_sm()
            messages.success(request, 'Рекламация одобрена и завершена')
        
        return redirect('projects:complaint_detail', pk=complaint.id)
    
    # Получаем монтажников для планирования
    installers = User.objects.filter(role='installer').order_by('first_name', 'last_name')
    
    context = {
        'complaint': complaint,
        'installers': installers,
    }
    
    return render(request, 'projects/complaint_process.html', context)


@login_required(login_url='/api/v1/login/')
@role_required(['installer', 'admin', 'leader'])
def installer_planning(request):
    """Страница задач монтажника"""
    
    # Получаем только рекламации, назначенные ЭТОМУ монтажнику
    complaints = Complaint.objects.filter(
        installer_assigned=request.user,
        complaint_type='installer'
    ).select_related(
        'initiator', 'recipient', 'manager', 'production_site', 'reason'
    ).order_by('-created_at')
    
    # Admin и Leader видят все рекламации монтажников
    if request.user.role in ['admin', 'leader']:
        complaints = Complaint.objects.filter(
            complaint_type='installer'
        ).select_related(
            'initiator', 'recipient', 'manager', 'production_site', 'reason', 'installer_assigned'
        ).order_by('-created_at')
    
    # Фильтрация по статусу
    filter_type = request.GET.get('filter')
    if filter_type == 'needs_planning':
        complaints = complaints.filter(status__in=['waiting_installer_date', 'needs_planning'])
    elif filter_type == 'planned':
        complaints = complaints.filter(status='installation_planned')
    elif filter_type == 'completed':
        complaints = complaints.filter(status__in=['under_sm_review', 'completed'])
    
    # Обработка POST-запроса (назначение даты)
    if request.method == 'POST':
        complaint_id = request.POST.get('complaint_id')
        installation_date = request.POST.get('installation_date')
        
        if complaint_id and installation_date:
            try:
                from datetime import datetime
                complaint = Complaint.objects.get(id=complaint_id, installer_assigned=request.user)
                installation_date = datetime.fromisoformat(installation_date)
                complaint.plan_installation(request.user, installation_date)
                messages.success(request, 'Монтаж запланирован успешно')
            except Complaint.DoesNotExist:
                messages.error(request, 'Рекламация не найдена или не назначена вам')
            except Exception as e:
                messages.error(request, f'Ошибка при планировании: {str(e)}')
        else:
            messages.error(request, 'Заполните все поля')
        
        return redirect('projects:installer_planning')
    
    # Статистика
    base_filter = {'installer_assigned': request.user, 'complaint_type': 'installer'} if request.user.role == 'installer' else {'complaint_type': 'installer'}
    
    stats = {
        'total': Complaint.objects.filter(**base_filter).count(),
        'needs_planning': Complaint.objects.filter(**base_filter, status__in=['waiting_installer_date', 'needs_planning']).count(),
        'planned': Complaint.objects.filter(**base_filter, status='installation_planned').count(),
        'completed': Complaint.objects.filter(**base_filter, status__in=['under_sm_review', 'completed']).count(),
    }
    
    context = {
        'complaints': complaints,
        'stats': stats,
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
    
    # Фильтруем по менеджеру и городу
    if request.user.role == 'admin' or request.user.role == 'leader':
        # Админ и лидер видят все
        pass
    elif request.user.role == 'manager':
        # Менеджер видит только по своему городу и где он назначен менеджером
        if request.user.city:
            complaints = complaints.filter(
                Q(manager=request.user) | 
                Q(manager__city=request.user.city)
            )
        else:
            complaints = complaints.filter(manager=request.user)
    
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
            'waiting_factory_response', 
            'waiting_factory_response_overdue',
            'waiting_client_agreement', 
            'waiting_client_agreement_overdue',
            'client_agreed'
        ]
    ).select_related(
        'initiator', 'recipient', 'manager', 'production_site', 'reason'
    ).order_by('-created_at')
    
    if request.method == 'POST':
        action = request.POST.get('action')
        complaint_id = request.POST.get('complaint_id')
        
        try:
            from datetime import datetime
            complaint = Complaint.objects.get(id=complaint_id)
            
            if action == 'factory_responded':
                commercial_offer = request.POST.get('commercial_offer')
                agreement_deadline = request.POST.get('agreement_deadline')
                
                if commercial_offer and agreement_deadline:
                    complaint.commercial_offer_text = commercial_offer
                    complaint.client_agreement_date = datetime.fromisoformat(agreement_deadline)
                    complaint.status = complaint.ComplaintStatus.WAITING_CLIENT_AGREEMENT
                    complaint.save()
                    
                    # Уведомление СМ
                    complaint._create_notification(
                        recipient=complaint.recipient,
                        notification_type='push',
                        title='Ответ фабрики получен',
                        message=f'Получен ответ фабрики по рекламации #{complaint.id}. Требуется согласование с клиентом.'
                    )
                    messages.success(request, 'Ответ фабрики сохранен, отправлено на согласование клиенту')
                else:
                    messages.error(request, 'Заполните все поля')
                
            elif action == 'client_agreed':
                complaint.status = complaint.ComplaintStatus.CLIENT_AGREED
                complaint.save()
                
                # Уведомление менеджеру для запуска производства
                complaint._create_notification(
                    recipient=complaint.manager,
                    notification_type='push',
                    title='Клиент согласовал КП',
                    message=f'Клиент согласовал КП по рекламации #{complaint.id}. Можно запускать производство.'
                )
                messages.success(request, 'Согласие клиента зафиксировано')
                    
        except Exception as e:
            messages.error(request, f'Ошибка: {str(e)}')
        
        return redirect('projects:or_factory_complaints')
    
    # Статистика
    stats = {
        'waiting_response': complaints.filter(
            status__in=['waiting_factory_response', 'waiting_factory_response_overdue']
        ).count(),
        'waiting_agreement': complaints.filter(
            status__in=['waiting_client_agreement', 'waiting_client_agreement_overdue']
        ).count(),
        'agreed': complaints.filter(status='client_agreed').count(),
        'overdue': complaints.filter(
            status__in=['waiting_factory_response_overdue', 'waiting_client_agreement_overdue']
        ).count(),
    }
    
    context = {
        'complaints': complaints,
        'stats': stats,
    }
    
    return render(request, 'projects/or_factory_complaints.html', context)


