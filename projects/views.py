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
    ComplaintComment
)


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
