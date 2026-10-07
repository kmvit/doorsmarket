from django.db import models
from django.contrib.auth.models import AbstractUser



class City(models.Model):
    """
    Города, в которых работают пользователи
    """
    name = models.CharField(max_length=255)
    warehouse_notification_email = models.EmailField(
        blank=True,
        null=True,
        verbose_name='Email уведомления "Товар на складе"',
        help_text='Если указан, при нажатии кнопки "Товар на складе" ОР этого города будет отправлено письмо на этот адрес'
    )

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
    - руководитель группы салонов — права руководителя, но видит только
      закреплённые за ним салоны (User.managed_salons)
    """
    SERVICE_MANAGER = "service_manager", "Сервис-менеджер"
    MANAGER = "manager", "Менеджер"
    INSTALLER = "installer", "Монтажник"
    COMPLAINT_DEPARTMENT = "complaint_department", "Отдел рекламаций"
    ADMIN = "admin", "Администратор"
    LEADER = "leader", "Руководитель подразделения"
    GROUP_LEADER = "group_leader", "Руководитель группы салонов"


# Роли с правами руководителя. Видимость у них разная: у руководителя
# подразделения — весь город, у руководителя группы — его салоны.
LEADER_ROLES = (Role.LEADER, Role.GROUP_LEADER)


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
    salon = models.ForeignKey(
        'orders.Salon',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='Салон',
    )
    # Салоны руководителя группы: только их заказы, замеры, рекламации и реестры он видит
    managed_salons = models.ManyToManyField(
        'orders.Salon',
        blank=True,
        related_name='group_leaders',
        verbose_name='Салоны руководителя группы',
    )

    @property
    def is_leader(self):
        return self.role in LEADER_ROLES

    def managed_salon_ids(self):
        """Салоны руководителя группы (кешируется на объекте до конца запроса)."""
        if not hasattr(self, '_managed_salon_ids'):
            self._managed_salon_ids = list(self.managed_salons.values_list('id', flat=True))
        return self._managed_salon_ids
    
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