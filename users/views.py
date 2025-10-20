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
        
        context = {
            'user': request.user,
        }
        return render(request, 'users/dashboard.html', context)


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
