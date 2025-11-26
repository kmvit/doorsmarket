from django.db import models
from django.contrib.auth.models import AbstractUser



class City(models.Model):
    """
    Города, в которых работают пользователи
    """
    name = models.CharField(max_length=255)
    def __str__(self):
        return self.name


class Role(models.TextChoices):
    """
    - Сервис-менеджеров
    - менеджеров 
    - монтажников 
    - отдел рекламаций 
    - администратор 
    - руководитель подразделения, который видит все по своему городу
    """
    SERVICE_MANAGER = "service_manager", "Сервис-менеджер"
    MANAGER = "manager", "Менеджер"
    INSTALLER = "installer", "Монтажник"
    COMPLAINT_DEPARTMENT = "complaint_department", "Отдел рекламаций"
    ADMIN = "admin", "Администратор"
    LEADER = "leader", "Руководитель подразделения"


class User(AbstractUser):
    """
    Пользователи
    """
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.SERVICE_MANAGER)
    city = models.ForeignKey(City, on_delete=models.PROTECT, null=True, blank=True)
    phone_number = models.CharField(
        max_length=20, 
        blank=True, 
        null=True, 
        verbose_name='Номер телефона',
        help_text='Формат: +7XXXXXXXXXX'
    )
    
    def __str__(self):
        return self.username


class PushSubscription(models.Model):
    """
    Push-подписки пользователей для Web Push уведомлений
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.URLField(max_length=500)
    p256dh = models.CharField(max_length=200)  # p256dh ключ
    auth = models.CharField(max_length=200)  # auth ключ
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['user', 'endpoint']
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]
    
    def __str__(self):
        return f'Push подписка для {self.user.username}'