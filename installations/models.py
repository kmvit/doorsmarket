from django.conf import settings
from django.db import models


class InstallationStatus(models.TextChoices):
    NOT_PLANNED = 'not_planned', 'Не запланирован'
    PLANNED = 'planned', 'Запланирован'
    NOT_READY = 'not_ready', 'Не готов к монтажу'
    AWAITING_SIGNATURE = 'awaiting_signature', 'Ожидает подписи клиента'
    PARTIALLY_DONE = 'partially_done', 'Частично завершён'
    DONE = 'done', 'Завершён'
    IRRELEVANT = 'irrelevant', 'Не актуален'


# Монтаж закрыт: по умолчанию скрыт в списке («кроме выполненных»), правки запрещены
CLOSED_INSTALLATION_STATUSES = frozenset({InstallationStatus.DONE, InstallationStatus.IRRELEVANT})


class InstallationFileKind(models.TextChoices):
    MEASUREMENT_BLANK = 'measurement_blank', 'Бланк замера'
    FINAL_KP = 'final_kp', 'Финальное КП'
    INSTALLATION_KP = 'installation_kp', 'КП на монтаж'
    DRAWINGS = 'drawings', 'Чертежи (СНИ)'
    EXTRA = 'extra', 'Дополнительные документы'
    PHOTO = 'photo', 'Фото'
    VIDEO = 'video', 'Видео'


class EventKind(models.TextChoices):
    CREATED = 'created', 'Монтаж оформлен'
    UPDATED = 'updated', 'Монтаж изменён'
    STATUS_CHANGED = 'status_changed', 'Изменён статус'
    FILE_ADDED = 'file_added', 'Добавлен файл'
    FILE_DELETED = 'file_deleted', 'Удалён файл'


class Installation(models.Model):
    """
    Монтаж по заказу. Список монтажей общий на город: его видят и правят все
    пользователи города, кроме монтажников. По одному заказу монтажей может
    быть несколько.
    """
    order = models.ForeignKey(
        'orders.Order', on_delete=models.CASCADE, related_name='installations',
        verbose_name='Заказ',
    )
    status = models.CharField(
        max_length=30, choices=InstallationStatus.choices,
        default=InstallationStatus.NOT_PLANNED, verbose_name='Статус',
    )
    is_paid = models.BooleanField(default=False, verbose_name='Оплачен')
    work_description = models.TextField(verbose_name='Что нужно смонтировать')
    collection_finish = models.CharField(max_length=500, verbose_name='Коллекция, покрытие')
    planned_delivery_date = models.DateField(
        null=True, blank=True, verbose_name='Плановая дата доставки',
        help_text='Менеджер ставит примерно при оформлении, уточняет при составлении реестра на доставку.',
    )
    desired_date_comment = models.TextField(
        blank=True, verbose_name='Желаемая дата монтажа и прочие комментарии',
    )
    # Контактное лицо монтажа: при оформлении берётся из заявки на замер или
    # заказа, дальше его меняют здесь, не трогая заказ
    contact_name = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')
    contact_phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон контактного лица')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Оформлен')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлён')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_installations', verbose_name='Кто оформил',
    )

    class Meta:
        verbose_name = 'Монтаж'
        verbose_name_plural = 'Монтажи'
        ordering = ['-created_at']

    def __str__(self):
        return f'Монтаж #{self.id} по заказу #{self.order_id}'

    @property
    def is_closed(self):
        return self.status in CLOSED_INSTALLATION_STATUSES

    def log(self, kind, actor=None, description='', old_status='', new_status='', meta=None):
        return InstallationEvent.objects.create(
            installation=self, kind=kind, actor=actor, description=description or '',
            old_status=old_status or '', new_status=new_status or '', meta=meta or {},
        )


class InstallationFile(models.Model):
    """Файл пакета документов монтажа."""
    installation = models.ForeignKey(
        Installation, on_delete=models.CASCADE, related_name='files', verbose_name='Монтаж',
    )
    kind = models.CharField(max_length=30, choices=InstallationFileKind.choices, verbose_name='Вид')
    file = models.FileField(upload_to='installations/files/', verbose_name='Файл')
    name = models.CharField(max_length=255, blank=True, verbose_name='Имя файла')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Загрузил',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Загружен')

    class Meta:
        verbose_name = 'Файл монтажа'
        verbose_name_plural = 'Файлы монтажа'
        ordering = ['id']

    def __str__(self):
        return self.name or self.file.name


class InstallationEvent(models.Model):
    """История монтажа: кто, когда и что делал."""
    installation = models.ForeignKey(
        Installation, on_delete=models.CASCADE, related_name='events', verbose_name='Монтаж',
    )
    kind = models.CharField(max_length=30, choices=EventKind.choices, verbose_name='Событие')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто',
    )
    description = models.TextField(blank=True, verbose_name='Описание')
    old_status = models.CharField(max_length=30, blank=True, verbose_name='Был статус')
    new_status = models.CharField(max_length=30, blank=True, verbose_name='Стал статус')
    meta = models.JSONField(default=dict, blank=True, verbose_name='Подробности')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Когда')

    class Meta:
        verbose_name = 'Событие монтажа'
        verbose_name_plural = 'История монтажей'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.get_kind_display()} — монтаж #{self.installation_id}'
