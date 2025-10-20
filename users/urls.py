from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    # API Views
    RegisterView,
    UserDetailView,
    ChangePasswordView,
    LogoutView,
    CityListView,
    # Web Views
    WebLoginView,
    WebRegisterView,
    WebLogoutView,
    WebDashboardView,
    user_list,
)

app_name = 'users'

urlpatterns = [
    # ===== API Endpoints =====
    
    # Аутентификация
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    
    # Управление пользователем
    path('auth/me/', UserDetailView.as_view(), name='user_detail'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
    
    # Справочники
    path('cities/', CityListView.as_view(), name='cities'),
    
    # ===== Web Interface =====
    
    # Веб-страницы аутентификации
    path('login/', WebLoginView.as_view(), name='web_login'),
    path('register/', WebRegisterView.as_view(), name='web_register'),
    path('logout/', WebLogoutView.as_view(), name='web_logout'),
    path('dashboard/', WebDashboardView.as_view(), name='web_dashboard'),
    
    # Управление пользователями
    path('users/', user_list, name='user_list'),
]

