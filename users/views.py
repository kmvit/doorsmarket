from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User, City
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
    CitySerializer
)


class RegisterView(generics.CreateAPIView):
    """Регистрация нового пользователя"""
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Генерация JWT токенов для автоматического входа после регистрации
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            },
            'message': 'Пользователь успешно зарегистрирован'
        }, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateAPIView):
    """Получение и обновление данных текущего пользователя"""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """Смена пароля пользователя"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        
        if serializer.is_valid():
            user = request.user
            
            # Проверка старого пароля
            if not user.check_password(serializer.validated_data['old_password']):
                return Response(
                    {'old_password': ['Неверный пароль']},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Установка нового пароля
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            
            return Response({
                'message': 'Пароль успешно изменен'
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    """Выход пользователя (добавление токена в черный список)"""
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh_token')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
                return Response({
                    'message': 'Выход выполнен успешно'
                }, status=status.HTTP_200_OK)
            return Response(
                {'error': 'Требуется refresh token'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class CityListView(generics.ListAPIView):
    """Список всех городов"""
    queryset = City.objects.all()
    serializer_class = CitySerializer
    permission_classes = [permissions.AllowAny]


# ===== Веб-интерфейс (Template Views) =====

from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views import View
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Q


class WebLoginView(View):
    """Веб-страница входа"""
    
    def get(self, request):
        if request.user.is_authenticated:
            return redirect('users:web_dashboard')
        return render(request, 'users/login.html')
    
    def post(self, request):
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            login(request, user)
            messages.success(request, f'Добро пожаловать, {user.get_full_name() or user.username}!')
            return redirect('users:web_dashboard')
        else:
            messages.error(request, 'Неверное имя пользователя или пароль')
            return render(request, 'users/login.html')


class WebRegisterView(View):
    """Веб-страница регистрации"""
    
    def get(self, request):
        if request.user.is_authenticated:
            return redirect('users:web_dashboard')
        cities = City.objects.all()
        return render(request, 'users/register.html', {'cities': cities})
    
    def post(self, request):
        cities = City.objects.all()
        
        # Получение данных из формы
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password2 = request.POST.get('password2')
        first_name = request.POST.get('first_name', '')
        last_name = request.POST.get('last_name', '')
        role = request.POST.get('role', 'service_manager')
        city_id = request.POST.get('city_id')
        phone_number = request.POST.get('phone_number', '')
        
        # Валидация
        if not username or not email or not password:
            messages.error(request, 'Заполните все обязательные поля')
            return render(request, 'users/register.html', {'cities': cities})
        
        # Запрет создания администраторов через регистрацию
        if role == 'admin':
            messages.error(request, 'Невозможно зарегистрироваться с ролью администратора')
            return render(request, 'users/register.html', {'cities': cities})
        
        if password != password2:
            messages.error(request, 'Пароли не совпадают')
            return render(request, 'users/register.html', {'cities': cities})
        
        # Проверка существования пользователя
        if User.objects.filter(username=username).exists():
            messages.error(request, 'Пользователь с таким именем уже существует')
            return render(request, 'users/register.html', {'cities': cities})
        
        if User.objects.filter(email=email).exists():
            messages.error(request, 'Пользователь с таким email уже существует')
            return render(request, 'users/register.html', {'cities': cities})
        
        # Валидация пароля
        try:
            validate_password(password)
        except ValidationError as e:
            for error in e.messages:
                messages.error(request, error)
            return render(request, 'users/register.html', {'cities': cities})
        
        # Создание пользователя
        try:
            city = None
            if city_id:
                city = City.objects.get(id=city_id)
            
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                role=role,
                city=city,
                phone_number=phone_number
            )
            
            # Автоматический вход после регистрации
            login(request, user)
            messages.success(request, 'Регистрация прошла успешно! Добро пожаловать!')
            return redirect('users:web_dashboard')
            
        except Exception as e:
            messages.error(request, f'Ошибка при регистрации: {str(e)}')
            return render(request, 'users/register.html', {'cities': cities})


class WebLogoutView(View):
    """Выход из системы"""
    
    def get(self, request):
        logout(request)
        messages.success(request, 'Вы успешно вышли из системы')
        return redirect('users:web_login')


class WebDashboardView(View):
    """Главная страница после входа"""
    
    def get(self, request):
        if not request.user.is_authenticated:
            return redirect('users:web_login')
        
        # Получаем новые задачи/уведомления для пользователя
        new_tasks = self._get_new_tasks_for_user(request.user)
        
        context = {
            'user': request.user,
            'new_tasks': new_tasks,
        }
        return render(request, 'users/dashboard.html', context)
    
    def _get_new_tasks_for_user(self, user):
        """Получить список новых задач для пользователя в зависимости от роли"""
        from projects.models import Complaint, Notification
        from django.db.models import Q
        
        tasks = []
        
        # Непрочитанные уведомления
        unread_notifications = Notification.objects.filter(
            recipient=user,
            is_read=False
        ).select_related('complaint').order_by('-created_at')
        
        # Получаем ID рекламаций, по которым уже есть непрочитанные уведомления
        notified_complaint_ids = set(unread_notifications.values_list('complaint_id', flat=True))
        
        for notification in unread_notifications[:10]:
            tasks.append({
                'type': 'notification',
                'id': notification.id,
                'complaint_id': notification.complaint.id,
                'title': notification.title,
                'message': notification.message,
                'created_at': notification.created_at,
                'url': f'/complaints/{notification.complaint.id}/',
            })
        
        # Дополнительные задачи в зависимости от роли (только если нет уведомления)
        if user.role == 'installer':
            # Монтажник: рекламации требующие планирования (без дублей с уведомлениями)
            installer_tasks = Complaint.objects.filter(
                installer_assigned=user,
                status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']
            ).exclude(
                id__in=notified_complaint_ids
            ).select_related('manager', 'production_site').order_by('-created_at')[:5]
            
            for complaint in installer_tasks:
                tasks.append({
                    'type': 'task',
                    'id': f'complaint_{complaint.id}',
                    'complaint_id': complaint.id,
                    'title': 'Требуется планирование монтажа',
                    'message': f'Рекламация #{complaint.id} - {complaint.order_number}',
                    'created_at': complaint.created_at,
                    'url': f'/complaints/{complaint.id}/',
                })
        
        elif user.role == 'manager':
            # Менеджер: рекламации требующие действий (только без уведомлений)
            manager_tasks = Complaint.objects.filter(
                status__in=['in_progress', 'on_warehouse']
            ).exclude(
                id__in=notified_complaint_ids
            ).select_related('production_site', 'reason', 'manager').order_by('-created_at')[:5]
            
            for complaint in manager_tasks:
                if complaint.status == 'in_progress':
                    title = 'Запустить производство'
                elif complaint.status == 'on_warehouse':
                    title = 'Товар на складе - требуется отгрузка'
                else:
                    title = 'Требуется действие'
                
                tasks.append({
                    'type': 'task',
                    'id': f'complaint_{complaint.id}',
                    'complaint_id': complaint.id,
                    'title': title,
                    'message': f'Рекламация #{complaint.id} - {complaint.order_number}',
                    'created_at': complaint.created_at,
                    'url': f'/complaints/{complaint.id}/',
                })
        
        elif user.role == 'service_manager':
            # СМ: новые рекламации и требующие проверки (без дублей)
            sm_tasks = Complaint.objects.filter(
                Q(recipient=user) & (Q(status='new') | Q(status='under_sm_review'))
            ).exclude(
                id__in=notified_complaint_ids
            ).select_related('initiator', 'manager', 'production_site').order_by('-created_at')[:5]
            
            for complaint in sm_tasks:
                if complaint.status == 'new':
                    title = 'Новая рекламация - выбрать тип'
                elif complaint.status == 'under_sm_review':
                    title = 'Работа выполнена - требуется проверка'
                else:
                    title = 'Требуется действие'
                
                tasks.append({
                    'type': 'task',
                    'id': f'complaint_{complaint.id}',
                    'complaint_id': complaint.id,
                    'title': title,
                    'message': f'Рекламация #{complaint.id} - {complaint.order_number}',
                    'created_at': complaint.created_at,
                    'url': f'/complaints/{complaint.id}/',
                })
        
        elif user.role == 'complaint_department':
            # ОР: фабричные рекламации (без дублей)
            or_tasks = Complaint.objects.filter(
                complaint_type='factory',
                status__in=['sent', 'factory_response_overdue']
            ).exclude(
                id__in=notified_complaint_ids
            ).select_related('manager', 'production_site').order_by('-created_at')[:5]
            
            for complaint in or_tasks:
                if complaint.status == 'factory_response_overdue':
                    title = 'ПРОСРОЧЕН ответ фабрики!'
                else:
                    title = 'Фабричная рекламация - требуется ответ'
                
                tasks.append({
                    'type': 'task',
                    'id': f'complaint_{complaint.id}',
                    'complaint_id': complaint.id,
                    'title': title,
                    'message': f'Рекламация #{complaint.id} - {complaint.order_number}',
                    'created_at': complaint.created_at,
                    'url': f'/complaints/{complaint.id}/',
                })
        
        elif user.role in ['admin', 'leader']:
            # Админ/Руководитель: новые рекламации и критические задачи (без дублей)
            admin_tasks = Complaint.objects.filter(
                Q(status='new') | 
                Q(status='factory_response_overdue') |
                Q(status='shipping_overdue') |
                Q(status='sm_response_overdue')
            ).exclude(
                id__in=notified_complaint_ids
            ).select_related('initiator', 'manager', 'production_site').order_by('-created_at')[:5]
            
            for complaint in admin_tasks:
                status_titles = {
                    'new': 'Новая рекламация',
                    'factory_response_overdue': 'ПРОСРОЧЕН ответ фабрики',
                    'shipping_overdue': 'ПРОСРОЧЕНА отгрузка',
                    'sm_response_overdue': 'ПРОСРОЧЕН ответ СМ',
                }
                title = status_titles.get(complaint.status, 'Требуется внимание')
                
                tasks.append({
                    'type': 'task',
                    'id': f'complaint_{complaint.id}',
                    'complaint_id': complaint.id,
                    'title': title,
                    'message': f'Рекламация #{complaint.id} - {complaint.order_number}',
                    'created_at': complaint.created_at,
                    'url': f'/complaints/{complaint.id}/',
                })
        
        # Сортируем все задачи по дате создания (новые первыми)
        tasks.sort(key=lambda x: x['created_at'], reverse=True)
        
        return tasks


@login_required(login_url='/api/v1/login/')
def user_list(request):
    """Список пользователей"""
    
    # Получаем всех пользователей
    users = User.objects.select_related('city')
    
    # Фильтрация по роли
    role_filter = request.GET.get('role')
    if role_filter:
        users = users.filter(role=role_filter)
    
    # Фильтрация по городу
    city_filter = request.GET.get('city')
    if city_filter:
        users = users.filter(city_id=city_filter)
    
    # Фильтрация по активности
    is_active_filter = request.GET.get('is_active')
    if is_active_filter == 'true':
        users = users.filter(is_active=True)
    elif is_active_filter == 'false':
        users = users.filter(is_active=False)
    
    # Поиск
    search_query = request.GET.get('search')
    if search_query:
        users = users.filter(
            Q(username__icontains=search_query) |
            Q(email__icontains=search_query) |
            Q(first_name__icontains=search_query) |
            Q(last_name__icontains=search_query) |
            Q(phone_number__icontains=search_query)
        )
    
    # Сортировка
    sort_by = request.GET.get('sort', 'username')
    users = users.order_by(sort_by)
    
    # Статистика
    stats = {
        'total': User.objects.count(),
        'active': User.objects.filter(is_active=True).count(),
        'by_role': {}
    }
    
    from users.models import Role
    for role_value, role_label in Role.choices:
        stats['by_role'][role_value] = User.objects.filter(role=role_value).count()
    
    # Данные для фильтров
    cities = City.objects.all()
    roles = Role.choices
    
    context = {
        'users': users,
        'cities': cities,
        'roles': roles,
        'stats': stats,
        'current_role': role_filter,
        'current_city': city_filter,
        'search_query': search_query,
    }
    
    return render(request, 'users/user_list.html', context)


@login_required(login_url='/api/v1/login/')
def notifications_list(request):
    """Список уведомлений для пользователя"""
    from projects.models import Notification
    from django.utils import timezone
    
    # Получаем непрочитанные уведомления
    unread_notifications = Notification.objects.filter(
        recipient=request.user,
        is_read=False
    ).select_related('complaint', 'complaint__manager', 'complaint__production_site').order_by('-created_at')
    
    # Получаем прочитанные уведомления (последние 20)
    read_notifications = Notification.objects.filter(
        recipient=request.user,
        is_read=True
    ).select_related('complaint', 'complaint__manager', 'complaint__production_site').order_by('-created_at')[:20]
    
    # Статистика
    stats = {
        'unread_count': unread_notifications.count(),
        'read_count': read_notifications.count(),
        'total': unread_notifications.count(),
    }
    
    context = {
        'unread_notifications': unread_notifications,
        'read_notifications': read_notifications,
        'stats': stats,
    }
    
    return render(request, 'users/notifications_list.html', context)


@login_required(login_url='/api/v1/login/')
def mark_notification_read(request, notification_id):
    """Отметить уведомление как прочитанное и перейти к рекламации"""
    from projects.models import Notification
    
    try:
        notification = Notification.objects.get(
            id=notification_id,
            recipient=request.user
        )
        notification.mark_as_read()
        messages.success(request, 'Уведомление отмечено как прочитанное')
        return redirect('projects:complaint_detail', pk=notification.complaint.id)
    except Notification.DoesNotExist:
        messages.error(request, 'Уведомление не найдено')
        return redirect('users:notifications_list')


@login_required(login_url='/api/v1/login/')
def mark_all_notifications_read(request):
    """Отметить все уведомления как прочитанные"""
    from projects.models import Notification
    from django.utils import timezone
    
    if request.method == 'POST':
        updated_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )
        
        messages.success(request, f'Отмечено прочитанными: {updated_count} уведомлений')
    
    return redirect('users:notifications_list')
