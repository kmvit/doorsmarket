from django.db import models
from django.conf import settings


class ProductionSite(models.Model):
    """Производственная площадка"""
    name = models.CharField(max_length=255, verbose_name='Название площадки')
    address = models.TextField(blank=True, verbose_name='Адрес')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Производственная площадка'
        verbose_name_plural = 'Производственные площадки'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class ComplaintReason(models.Model):
    """Причины рекламации"""
    name = models.CharField(max_length=255, unique=True, verbose_name='Название причины')
    description = models.TextField(blank=True, verbose_name='Описание')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    order = models.PositiveIntegerField(default=0, verbose_name='Порядок сортировки')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Причина рекламации'
        verbose_name_plural = 'Причины рекламации'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name


class ComplaintStatus(models.TextChoices):
    """Статусы рекламации"""
    NEW = 'new', 'Новая'
    IN_PROGRESS = 'in_progress', 'В работе'
    WAITING_RESPONSE = 'waiting_response', 'Ожидает ответа'
    RESOLVED = 'resolved', 'Решена'
    CLOSED = 'closed', 'Закрыта'
    REJECTED = 'rejected', 'Отклонена'


class Complaint(models.Model):
    """Рекламация (заявка)"""
    
    # Автоматические поля
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания заявки')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='initiated_complaints',
        verbose_name='Инициатор заявки'
    )
    
    # Назначение
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='received_complaints',
        verbose_name='Получатель заявки',
        help_text='Если инициатор менеджер или монтажник, то автоматически СМ'
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='managed_complaints',
        verbose_name='Менеджер заказа',
        limit_choices_to={'role': 'manager'}
    )
    
    # Производство
    production_site = models.ForeignKey(
        ProductionSite,
        on_delete=models.PROTECT,
        verbose_name='Производственная площадка'
    )
    
    # Информация о заказе
    reason = models.ForeignKey(
        ComplaintReason,
        on_delete=models.PROTECT,
        verbose_name='Причина рекламации'
    )
    order_number = models.CharField(max_length=100, verbose_name='Номер заказа')
    client_name = models.CharField(max_length=255, verbose_name='Наименование клиента')
    address = models.TextField(verbose_name='Адрес')
    contact_person = models.CharField(max_length=255, verbose_name='Контактное лицо от клиента')
    contact_phone = models.CharField(max_length=20, verbose_name='Телефон контактного лица')
    
    # Описание проблемы
    problem_description = models.TextField(verbose_name='Описание проблемы')
    
    # Документы и ссылки
    document_package_link = models.URLField(
        blank=True,
        verbose_name='Ссылка на пакет документов'
    )
    commercial_offer = models.FileField(
        upload_to='complaints/commercial_offers/%Y/%m/',
        blank=True,
        null=True,
        verbose_name='Коммерческое предложение'
    )
    
    # Статус
    status = models.CharField(
        max_length=20,
        choices=ComplaintStatus.choices,
        default=ComplaintStatus.NEW,
        verbose_name='Статус'
    )
    
    class Meta:
        verbose_name = 'Рекламация'
        verbose_name_plural = 'Рекламации'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['order_number']),
        ]
    
    def __str__(self):
        return f"Рекламация #{self.id} - {self.order_number}"
    
    def save(self, *args, **kwargs):
        """Автоматическая установка получателя"""
        if not self.pk and not self.recipient_id:
            # Если инициатор - менеджер или монтажник, получатель - сервис-менеджер
            if self.initiator.role in ['manager', 'installer']:
                from users.models import User
                # Найти первого доступного сервис-менеджера
                service_manager = User.objects.filter(role='service_manager').first()
                if service_manager:
                    self.recipient = service_manager
        super().save(*args, **kwargs)


class DefectiveProduct(models.Model):
    """Бракованное изделие"""
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='defective_products',
        verbose_name='Рекламация'
    )
    product_name = models.CharField(max_length=255, verbose_name='Наименование бракованного изделия')
    size = models.CharField(max_length=100, verbose_name='Размер изделия')
    opening_type = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Открывание'
    )
    problem_description = models.TextField(verbose_name='Описание проблемы')
    order = models.PositiveIntegerField(default=0, verbose_name='Порядок')
    
    class Meta:
        verbose_name = 'Бракованное изделие'
        verbose_name_plural = 'Бракованные изделия'
        ordering = ['complaint', 'order']
    
    def __str__(self):
        return f"{self.product_name} ({self.size})"


class ComplaintAttachment(models.Model):
    """Вложение к рекламации (фото/видео/документы)"""
    
    ATTACHMENT_TYPE_CHOICES = [
        ('photo', 'Фото'),
        ('video', 'Видео'),
        ('document', 'Документ'),
    ]
    
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='attachments',
        verbose_name='Рекламация'
    )
    file = models.FileField(
        upload_to='complaints/attachments/%Y/%m/',
        verbose_name='Файл',
        help_text='Загрузка без сжатия и изменения формата'
    )
    attachment_type = models.CharField(
        max_length=10,
        choices=ATTACHMENT_TYPE_CHOICES,
        verbose_name='Тип вложения'
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Описание'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата загрузки')
    
    class Meta:
        verbose_name = 'Вложение'
        verbose_name_plural = 'Вложения'
        ordering = ['uploaded_at']
    
    def __str__(self):
        return f"{self.get_attachment_type_display()} - {self.file.name}"
    
    @property
    def file_size(self):
        """Размер файла в читаемом формате"""
        if self.file:
            size = self.file.size
            for unit in ['B', 'KB', 'MB', 'GB']:
                if size < 1024.0:
                    return f"{size:.1f} {unit}"
                size /= 1024.0
        return "0 B"


class ComplaintComment(models.Model):
    """Комментарий к рекламации"""
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='Рекламация'
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name='Автор'
    )
    text = models.TextField(verbose_name='Текст комментария')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Комментарий'
        verbose_name_plural = 'Комментарии'
        ordering = ['created_at']
    
    def __str__(self):
        return f"Комментарий от {self.author.username} - {self.created_at.strftime('%d.%m.%Y %H:%M')}"
