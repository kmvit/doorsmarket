from django.db import models
from django.conf import settings
from django.utils import timezone


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
    # Основные статусы
    NEW = 'new', 'Новая'
    IN_PROGRESS = 'in_progress', 'В работе'
    COMPLETED = 'completed', 'Выполнена'
    IN_PRODUCTION = 'in_production', 'Заказ в производстве'
    ON_WAREHOUSE = 'on_warehouse', 'Товар на складе'
    SHIPPING_OVERDUE = 'shipping_overdue', 'Отгрузка просрочена'
    FACTORY_DISPUTE = 'factory_dispute', 'Спор с фабрикой'
    FACTORY_RESPONSE_OVERDUE = 'factory_response_overdue', 'Ответ фабрики просрочен'
    SM_RESPONSE_OVERDUE = 'sm_response_overdue', 'СМ просрочил ответ'
    UNDER_SM_REVIEW = 'under_sm_review', 'На проверке у СМ'
    
    # Планирование
    WAITING_INSTALLER_DATE = 'waiting_installer_date', 'Ожидает дату от монтажника'
    NEEDS_PLANNING = 'needs_planning', 'Нужно запланировать'
    INSTALLER_NOT_PLANNED = 'installer_not_planned', 'Монтажник не запланировал'
    SHIPPING_PLANNED = 'shipping_planned', 'Отгрузка запланирована'
    INSTALLATION_PLANNED = 'installation_planned', 'Монтаж запланирован'
    BOTH_PLANNED = 'both_planned', 'Отгрузка и монтаж запланированы'
    
    # Финальные статусы
    RESOLVED = 'resolved', 'Решена'
    CLOSED = 'closed', 'Закрыта'
    REJECTED = 'rejected', 'Отклонена'
    SENT = 'sent', 'Отправлена'


class ComplaintType(models.TextChoices):
    """Типы рекламаций"""
    MANAGER = 'manager', 'Менеджер'
    INSTALLER = 'installer', 'Монтажник'
    FACTORY = 'factory', 'Фабрика'


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
    
    # Тип рекламации
    complaint_type = models.CharField(
        max_length=20,
        choices=ComplaintType.choices,
        blank=True,
        null=True,
        verbose_name='Тип рекламации'
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
    commercial_offer_text = models.TextField(
        blank=True,
        verbose_name='Описание коммерческого предложения'
    )
    
    # Статус
    status = models.CharField(
        max_length=30,
        choices=ComplaintStatus.choices,
        default=ComplaintStatus.NEW,
        verbose_name='Статус'
    )
    
    # Планирование и даты
    planned_installation_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Запланированная дата монтажа'
    )
    planned_shipping_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Запланированная дата отгрузки'
    )
    production_deadline = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Срок готовности производства'
    )
    installer_assigned = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='assigned_complaints',
        blank=True,
        null=True,
        verbose_name='Назначенный монтажник',
        limit_choices_to={'role': 'installer'}
    )
    
    # Дополнительные поля для логики
    factory_response_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата ответа фабрики'
    )
    client_agreement_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата согласования с клиентом'
    )
    completion_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата завершения'
    )
    
    # Поле для связи с реестром отгрузки
    added_to_shipping_registry_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Добавлено в реестр на отгрузку'
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
        """Автоматическая установка получателя и статуса"""
        if not self.pk and not self.recipient_id:
            # Если инициатор - менеджер или монтажник, получатель - сервис-менеджер
            if self.initiator.role in ['manager', 'installer']:
                from users.models import User
                # Найти первого доступного сервис-менеджера
                service_manager = User.objects.filter(role='service_manager').first()
                if service_manager:
                    self.recipient = service_manager
        
        # Автоматически устанавливаем статус "В работе" при создании
        if not self.pk:
            self.status = ComplaintStatus.IN_PROGRESS
            
        super().save(*args, **kwargs)
    
    def set_type_installer(self):
        """СМ выбирает тип 'Монтажник'"""
        self.complaint_type = ComplaintType.INSTALLER
        self.status = ComplaintStatus.WAITING_INSTALLER_DATE
        self.save()
        self._create_notification(
            recipient=self.initiator,
            notification_type='push',
            title='Требуется планирование монтажа',
            message=f'Рекламация #{self.id} требует назначения даты монтажа'
        )
    
    def set_type_manager(self):
        """СМ выбирает тип 'Менеджер'"""
        self.complaint_type = ComplaintType.MANAGER
        self.status = ComplaintStatus.IN_PROGRESS
        self.save()
        self._create_notification(
            recipient=self.manager,
            notification_type='pc',
            title='Требуется оформление заказа',
            message=f'Рекламация #{self.id} требует оформления заказа на производство'
        )
    
    def set_type_factory(self):
        """СМ выбирает тип 'Фабрика'"""
        self.complaint_type = ComplaintType.FACTORY
        self.status = ComplaintStatus.IN_PROGRESS
        self.save()
        # Уведомление для ОР
        from users.models import User
        or_user = User.objects.filter(role='complaint_department').first()
        if or_user:
            self._create_notification(
                recipient=or_user,
                notification_type='email',
                title='Новая рекламация от фабрики',
                message=f'Рекламация #{self.id} требует решения отдела рекламаций'
            )
    
    def plan_installation(self, installer, installation_date):
        """Монтажник планирует дату монтажа"""
        self.installer_assigned = installer
        self.planned_installation_date = installation_date
        self.status = ComplaintStatus.INSTALLATION_PLANNED
        self.save()
        self._create_notification(
            recipient=self.recipient,
            notification_type='push',
            title='Монтаж запланирован',
            message=f'Монтажник {installer.get_full_name()} запланировал монтаж на {installation_date.strftime("%d.%m.%Y")}'
        )
    
    def mark_completed(self):
        """Монтажник отмечает работу выполненной"""
        self.status = ComplaintStatus.UNDER_SM_REVIEW
        self.save()
        self._create_notification(
            recipient=self.recipient,
            notification_type='push',
            title='Требуется проверка',
            message=f'Рекламация #{self.id} выполнена, требуется проверка СМ'
        )
    
    def approve_by_sm(self):
        """СМ проверяет и одобряет выполнение"""
        self.status = ComplaintStatus.COMPLETED
        self.completion_date = timezone.now()
        self.save()
        # Уведомление клиенту для оценки
        self._create_notification(
            recipient=None,  # TODO: добавить поле для клиента
            notification_type='sms',
            title='Работа выполнена',
            message=f'Рекламация #{self.id} выполнена. Пожалуйста, оцените качество работы.'
        )
    
    def start_production(self, deadline):
        """Менеджер запускает производство"""
        self.status = ComplaintStatus.IN_PRODUCTION
        self.production_deadline = deadline
        self.save()
    
    def mark_on_warehouse(self):
        """Товар готов на складе"""
        self.status = ComplaintStatus.ON_WAREHOUSE
        self.added_to_shipping_registry_at = timezone.now()
        self.save()
        # Уведомления менеджеру и СМ
        self._create_notification(
            recipient=self.manager,
            notification_type='pc',
            title='Товар готов к отгрузке',
            message=f'Товар по рекламации #{self.id} готов, поставьте в реестр на отгрузку'
        )
        self._create_notification(
            recipient=self.recipient,
            notification_type='push',
            title='Запланируйте монтаж',
            message=f'Товар по рекламации #{self.id} готов, запланируйте монтаж'
        )
    
    def add_to_shipping_registry(self, doors_count=1, lift_type='our', lift_method='elevator', 
                                  payment_status='', delivery_destination='client', comments=''):
        """Добавляет рекламацию в реестр на отгрузку"""
        from .models import ShippingRegistry
        
        # Проверяем, нет ли уже записи
        if hasattr(self, 'shipping_entry') and self.shipping_entry:
            return self.shipping_entry
        
        # Создаем новую запись
        entry = ShippingRegistry.objects.create(
            complaint=self,
            order_number=self.order_number,
            manager=self.manager,
            client_name=self.client_name,
            address=self.address,
            contact_person=self.contact_person,
            contact_phone=self.contact_phone,
            doors_count=doors_count,
            lift_type=lift_type,
            lift_method=lift_method,
            order_type=ShippingRegistry.OrderType.COMPLAINT,  # Автоматически "Рекламация"
            payment_status=payment_status,
            delivery_destination=delivery_destination,
            comments=comments,
            planned_shipping_date=self.planned_shipping_date,
        )
        
        self.added_to_shipping_registry_at = timezone.now()
        self.save()
        
        return entry
    
    def plan_shipping(self, shipping_date):
        """Менеджер планирует отгрузку"""
        self.planned_shipping_date = shipping_date
        if self.planned_installation_date:
            self.status = ComplaintStatus.BOTH_PLANNED
        else:
            self.status = ComplaintStatus.SHIPPING_PLANNED
        self.save()
    
    def plan_installation_by_sm(self, installer, installation_date):
        """СМ планирует монтаж"""
        self.installer_assigned = installer
        self.planned_installation_date = installation_date
        if self.planned_shipping_date:
            self.status = ComplaintStatus.BOTH_PLANNED
        else:
            self.status = ComplaintStatus.INSTALLATION_PLANNED
        self.save()
    
    def _create_notification(self, recipient, notification_type, title, message):
        """Создание уведомления"""
        if recipient:
            from django.utils import timezone
            Notification.objects.create(
                complaint=self,
                recipient=recipient,
                notification_type=notification_type,
                title=title,
                message=message
            )


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


class ShippingRegistry(models.Model):
    """Реестр на отгрузку"""
    
    class LiftType(models.TextChoices):
        """Тип подъема"""
        OUR = 'our', 'Наш'
        CLIENT = 'client', 'Клиент'
    
    class LiftMethod(models.TextChoices):
        """Способ подъема"""
        ELEVATOR = 'elevator', 'Лифт'
        MANUAL = 'manual', 'Ручной'
    
    class OrderType(models.TextChoices):
        """Вид заказа"""
        MAIN = 'main', 'Основной'
        COMPLAINT = 'complaint', 'Рекламация'
    
    class DeliveryDestination(models.TextChoices):
        """Куда везем"""
        CLIENT = 'client', 'Клиент'
        WAREHOUSE = 'warehouse', 'На склад'
    
    class DeliveryStatus(models.TextChoices):
        """Статус доставки"""
        PENDING = 'pending', 'Ожидает отгрузки'
        IN_TRANSIT = 'in_transit', 'В пути'
        DELIVERED = 'delivered', 'Доставлено'
        CANCELLED = 'cancelled', 'Отменено'
    
    # Связь с рекламацией (опционально)
    complaint = models.OneToOneField(
        'Complaint',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='shipping_entry',
        verbose_name='Рекламация'
    )
    
    # Основная информация
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата добавления в реестр')
    order_number = models.CharField(max_length=100, verbose_name='Номер заказа')
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='shipping_orders',
        verbose_name='Менеджер',
        limit_choices_to={'role': 'manager'}
    )
    
    # Информация о клиенте
    client_name = models.CharField(max_length=255, verbose_name='Клиент')
    address = models.TextField(verbose_name='Адрес')
    contact_person = models.CharField(max_length=255, verbose_name='Контактное лицо')
    contact_phone = models.CharField(max_length=20, verbose_name='Телефон')
    
    # Информация о заказе
    doors_count = models.PositiveIntegerField(default=1, verbose_name='Количество дверей')
    lift_type = models.CharField(
        max_length=10,
        choices=LiftType.choices,
        verbose_name='Чей подъем'
    )
    lift_method = models.CharField(
        max_length=10,
        choices=LiftMethod.choices,
        verbose_name='Как подъем'
    )
    order_type = models.CharField(
        max_length=10,
        choices=OrderType.choices,
        default=OrderType.MAIN,
        verbose_name='Вид заказа'
    )
    payment_status = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Оплата'
    )
    delivery_destination = models.CharField(
        max_length=10,
        choices=DeliveryDestination.choices,
        default=DeliveryDestination.CLIENT,
        verbose_name='Куда везем'
    )
    
    # Дополнительно
    comments = models.TextField(blank=True, verbose_name='Комментарии')
    delivery_status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        verbose_name='Статус доставки'
    )
    client_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name='Оценка клиента (доставка)',
        help_text='От 1 до 5'
    )
    
    # Даты
    planned_shipping_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Запланированная дата отгрузки'
    )
    actual_shipping_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Фактическая дата отгрузки'
    )
    
    class Meta:
        verbose_name = 'Запись в реестре отгрузки'
        verbose_name_plural = 'Реестр на отгрузку'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Отгрузка {self.order_number} - {self.client_name}"
    
    def save(self, *args, **kwargs):
        # Если создается из рекламации, автоматически ставим тип "Рекламация"
        if self.complaint and not self.pk:
            self.order_type = self.OrderType.COMPLAINT
        super().save(*args, **kwargs)


class Notification(models.Model):
    """Уведомления"""
    
    NOTIFICATION_TYPES = [
        ('push', 'Push-уведомление'),
        ('sms', 'SMS'),
        ('email', 'Email'),
        ('pc', 'Уведомление на ПК'),
    ]
    
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='Рекламация'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='notifications',
        verbose_name='Получатель'
    )
    notification_type = models.CharField(
        max_length=10,
        choices=NOTIFICATION_TYPES,
        verbose_name='Тип уведомления'
    )
    title = models.CharField(max_length=255, verbose_name='Заголовок')
    message = models.TextField(verbose_name='Сообщение')
    is_sent = models.BooleanField(default=False, verbose_name='Отправлено')
    sent_at = models.DateTimeField(blank=True, null=True, verbose_name='Дата отправки')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Уведомление'
        verbose_name_plural = 'Уведомления'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_notification_type_display()} - {self.recipient.username}"


