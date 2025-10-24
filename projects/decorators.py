"""
Декораторы для проверки прав доступа
"""
from functools import wraps
from django.shortcuts import redirect
from django.contrib import messages


def role_required(allowed_roles):
    """
    Декоратор для проверки роли пользователя
    
    Использование:
        @role_required(['admin', 'manager'])
        def my_view(request):
            ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                messages.error(request, 'Необходима авторизация')
                return redirect('users:web_login')
            
            if request.user.role not in allowed_roles:
                messages.error(request, 'У вас нет прав для доступа к этой странице')
                return redirect('users:web_dashboard')
            
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def complaint_access_required(check_initiator=False, check_recipient=False, check_manager=False, check_installer=False):
    """
    Декоратор для проверки доступа к конкретной рекламации
    
    Параметры:
        check_initiator: Проверить, является ли пользователь инициатором
        check_recipient: Проверить, является ли пользователь получателем
        check_manager: Проверить, является ли пользователь менеджером
        check_installer: Проверить, является ли пользователь назначенным монтажником
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                messages.error(request, 'Необходима авторизация')
                return redirect('users:web_login')
            
            # Получаем pk из kwargs (если это детальная страница)
            complaint_id = kwargs.get('pk')
            if complaint_id:
                from .models import Complaint
                try:
                    complaint = Complaint.objects.get(pk=complaint_id)
                    
                    # Админы и лидеры имеют полный доступ
                    if request.user.role in ['admin', 'leader']:
                        return view_func(request, *args, **kwargs)
                    
                    # Проверяем различные условия доступа
                    has_access = False
                    
                    if check_initiator and complaint.initiator == request.user:
                        has_access = True
                    
                    if check_recipient and complaint.recipient == request.user:
                        has_access = True
                    
                    if check_manager and complaint.manager == request.user:
                        has_access = True
                    
                    if check_installer and complaint.installer_assigned == request.user:
                        has_access = True
                    
                    # СМ и ОР имеют доступ ко всем рекламациям
                    if request.user.role in ['service_manager', 'complaint_department']:
                        has_access = True
                    
                    if not has_access:
                        messages.error(request, 'У вас нет прав для доступа к этой рекламации')
                        return redirect('projects:complaint_list')
                        
                except Complaint.DoesNotExist:
                    messages.error(request, 'Рекламация не найдена')
                    return redirect('projects:complaint_list')
            
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator

