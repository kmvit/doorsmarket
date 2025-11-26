from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User, City, PushSubscription
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
    CitySerializer,
    PushSubscriptionSerializer
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


class PushSubscribeView(APIView):
    """Регистрация push-подписки"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        keys = data['keys']

        subscription, _ = PushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=data['endpoint'],
            defaults={
                'p256dh': keys['p256dh'],
                'auth': keys['auth'],
                'is_active': True,
            }
        )
        # Деактивируем остальные подписки пользователя
        PushSubscription.objects.filter(user=request.user).exclude(id=subscription.id).update(is_active=False)

        return Response(status=status.HTTP_204_NO_CONTENT)


class PushUnsubscribeView(APIView):
    """Отписка от push-уведомлений"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated = PushSubscription.objects.filter(user=request.user, is_active=True).update(is_active=False)
        status_code = status.HTTP_200_OK if updated else status.HTTP_204_NO_CONTENT
        body = {'deactivated': updated} if updated else None
        return Response(body, status=status_code)


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


class UserListView(generics.ListAPIView):
    """Список пользователей с фильтрацией по роли"""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = User.objects.filter(is_active=True).select_related('city')
        
        # Фильтрация по роли
        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)
        
        # Сортировка
        queryset = queryset.order_by('first_name', 'last_name', 'username')
        
        return queryset
# ===== Веб-интерфейс (Template Views) =====

from django.shortcuts import render, redirect
from django.urls import reverse
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
        
        task_summary = self._get_task_summary(request.user)
        
        context = {
            'user': request.user,
            'task_summary': task_summary,
        }
        return render(request, 'users/dashboard.html', context)
    
    def _get_task_summary(self, user):
        """Количество задач по категориям для дашборда"""
        from projects.models import Complaint, ComplaintStatus
        from django.db.models import Q
        
        summaries = []
        
        # Для монтажника используем страницу планирования, для остальных - список рекламаций
        if user.role == 'installer':
            base_url = reverse('projects:installer_planning')
        else:
            base_url = reverse('projects:complaint_list')
        
        def add_summary(key, label, query, url_param=None):
            count = Complaint.objects.filter(query).count()
            # Для монтажника формируем URL с параметром filter, для остальных - с my_tasks
            if user.role == 'installer':
                if url_param:
                    url = f"{base_url}?filter={url_param}"
                else:
                    url = base_url  # Для "В работе" без фильтра
            else:
                url = f"{base_url}?my_tasks={key}"
            
            summaries.append({
                'key': key,
                'label': label,
                'count': count,
                'url': url,
            })
        
        completed_statuses = {
            ComplaintStatus.COMPLETED,
            ComplaintStatus.RESOLVED,
            ComplaintStatus.CLOSED,
        }
        active_statuses = [choice[0] for choice in ComplaintStatus.choices if choice[0] not in completed_statuses]

        if user.role == 'installer':
            add_summary(
                'in_work',
                'В работе',
                (Q(installer_assigned=user) | Q(initiator=user)) & Q(status__in=active_statuses),
                url_param=None  # Без фильтра - показываем все активные
            )
            add_summary(
                'needs_planning',
                'Требуют планирования',
                Q(installer_assigned=user, status__in=['waiting_installer_date', 'needs_planning', 'installer_not_planned']),
                url_param='needs_planning'
            )
            add_summary(
                'planned',
                'Запланированные работы',
                Q(installer_assigned=user, status__in=['installation_planned', 'both_planned']),
                url_param='planned'
            )
            add_summary(
                'completed',
                'Завершено',
                Q(installer_assigned=user, status__in=['under_sm_review', 'completed']),
                url_param='completed'
            )
        elif user.role == 'manager':
            add_summary(
                'in_work',
                'В работе',
                (Q(manager=user) | Q(initiator=user) | Q(recipient=user)) & Q(status__in=active_statuses)
            )
            add_summary(
                'in_progress',
                'Нужно запустить в производство',
                Q(manager=user, status='in_progress')
            )
            add_summary(
                'on_warehouse',
                'Готово к отгрузке',
                Q(manager=user, status='on_warehouse')
            )
        elif user.role == 'service_manager':
            if user.city:
                city_filter = Q(initiator__city=user.city)
            else:
                city_filter = Q()

            add_summary(
                'in_work',
                'В работе',
                (Q(status__in=active_statuses) & city_filter) | Q(initiator=user, status__in=active_statuses)
            )
            add_summary(
                'new',
                'Новые рекламации',
                Q(status='new') & city_filter
            )
            add_summary(
                'review',
                'Ожидают проверки',
                Q(status__in=['under_sm_review', 'factory_approved', 'factory_rejected']) & city_filter
            )
            add_summary(
                'overdue',
                'Просроченные ответы',
                Q(status='sm_response_overdue') & city_filter
            )
        elif user.role == 'complaint_department':
            add_summary(
                'in_work',
                'В работе',
                Q(complaint_type='factory', status__in=active_statuses)
            )
            add_summary(
                'pending',
                'Ожидают ответа',
                Q(complaint_type='factory', status='sent')
            )
            add_summary(
                'overdue',
                'Просрочен ответ',
                Q(complaint_type='factory', status='factory_response_overdue')
            )
        elif user.role in ['admin', 'leader']:
            add_summary(
                'new',
                'Новые рекламации',
                Q(status='new')
            )
            add_summary(
                'factory_overdue',
                'Ответ фабрики просрочен',
                Q(status='factory_response_overdue')
            )
            add_summary(
                'shipping_overdue',
                'Отгрузка просрочена',
                Q(status='shipping_overdue')
            )
            add_summary(
                'sm_overdue',
                'Ответ СМ просрочен',
                Q(status='sm_response_overdue')
            )
        
        return summaries


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
