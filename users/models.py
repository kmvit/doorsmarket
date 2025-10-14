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