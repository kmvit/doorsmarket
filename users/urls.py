from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    # API Views
    RegisterView,
    UserDetailView,
    ChangePasswordView,
    LogoutView,
    CityListView,
    UserListView,
    PushSubscribeView,
    PushUnsubscribeView,
    # Web Views
    WebLoginView,
    WebRegisterView,
    WebLogoutView,
    WebDashboardView,
    user_list,
    notifications_list,
    mark_notification_read,
    mark_all_notifications_read,
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
    path('auth/push-subscribe/', PushSubscribeView.as_view(), name='push_subscribe'),
    path('auth/push-unsubscribe/', PushUnsubscribeView.as_view(), name='push_unsubscribe'),
    
    # Справочники
    path('cities/', CityListView.as_view(), name='cities'),
    path('users/', UserListView.as_view(), name='users'),
    
    # ===== Web Interface =====
    
    # Веб-страницы аутентификации
    path('login/', WebLoginView.as_view(), name='web_login'),
    path('register/', WebRegisterView.as_view(), name='web_register'),
    path('logout/', WebLogoutView.as_view(), name='web_logout'),
    path('dashboard/', WebDashboardView.as_view(), name='web_dashboard'),
    
    # Управление пользователями
    path('web/users/', user_list, name='user_list'),
    
    # Уведомления и задачи
    path('web/notifications/', notifications_list, name='notifications_list'),
    path('web/notifications/<int:notification_id>/read/', mark_notification_read, name='mark_notification_read'),
    path('web/notifications/mark-all-read/', mark_all_notifications_read, name='mark_all_notifications_read'),
]

