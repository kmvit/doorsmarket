import uuid
import secrets
import string
from django.db import models
from django.conf import settings

# base62 алфавит для коротких кодов ссылок (без похожих символов не заморачиваемся —
# код генерится и проверяется на уникальность).
_SHORT_ALPHABET = string.ascii_letters + string.digits


def generate_short_code(length: int = 7) -> str:
    return ''.join(secrets.choice(_SHORT_ALPHABET) for _ in range(length))


class Salon(models.Model):
    name = models.CharField(max_length=255, verbose_name='Название')
    city = models.ForeignKey(
        'users.City',
        on_delete=models.PROTECT,
        related_name='salons',
        verbose_name='Город',
    )
    address = models.CharField(max_length=500, blank=True, verbose_name='Адрес')
    phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон')
    is_active = models.BooleanField(default=True, verbose_name='Активен')

    class Meta:
        verbose_name = 'Салон'
        verbose_name_plural = 'Салоны'
        ordering = ['city', 'name']

    def __str__(self):
        return f'{self.name} ({self.city})'


class OrderStatus(models.TextChoices):
    DRAFT = 'draft', 'Черновик'
    ACTIVE = 'active', 'Создан'
    MEASUREMENT_REQUESTED = 'measurement_requested', 'Заявка на замер'
    MEASUREMENT_SCHEDULED = 'measurement_scheduled', 'Замер запланирован'
    MEASUREMENT_DONE = 'measurement_done', 'Замер выполнен'
    MEASUREMENT_PROCESSED = 'measurement_processed', 'Замер обработан'
    PAID = 'paid', 'Оплачен'
    IN_PRODUCTION = 'in_production', 'В производстве'
    ON_WAREHOUSE = 'on_warehouse', 'На складе'
    SHIPPED = 'shipped', 'Отгружен'
    COMPLETED = 'completed', 'Выполнен'
    CANCELLED = 'cancelled', 'Не актуален'
    # Просрочки (выставляются кронами, отображаются красным)
    MEASUREMENT_NOT_PLANNED = 'measurement_not_planned', 'Замер не запланирован'
    MEASUREMENT_NOT_DONE = 'measurement_not_done', 'Замер не выполнен'
    MEASUREMENT_NOT_PROCESSED = 'measurement_not_processed', 'Замер не обработан'


# Статусы-просрочки — для красной разметки в списках
OVERDUE_STATUSES = frozenset({
    OrderStatus.MEASUREMENT_NOT_PLANNED,
    OrderStatus.MEASUREMENT_NOT_DONE,
    OrderStatus.MEASUREMENT_NOT_PROCESSED,
})


class ActivityKind(models.TextChoices):
    """Виды активности по заказу — отображаются в Наработках"""
    CREATED = 'created', 'Заказ создан'
    UPDATED = 'updated', 'Заказ обновлён'
    ITEMS_CHANGED = 'items_changed', 'Изменены позиции'
    STATUS_CHANGED = 'status_changed', 'Изменён статус'
    FILE_ATTACHED = 'file_attached', 'Загружен файл'
    COMMENT_ADDED = 'comment_added', 'Добавлен комментарий'
    MEASUREMENT_REQUESTED = 'measurement_requested', 'Заявка на замер'
    MEASUREMENT_SCHEDULED = 'measurement_scheduled', 'Замер запланирован'
    MEASUREMENT_DONE = 'measurement_done', 'Замер выполнен'
    MEASUREMENT_PROCESSED = 'measurement_processed', 'Замер обработан'
    SMS_SENT = 'sms_sent', 'Отправлено SMS клиенту'


class Order(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлён')
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='orders',
        verbose_name='Менеджер',
    )
    salon = models.ForeignKey(
        Salon,
        on_delete=models.PROTECT,
        related_name='orders',
        verbose_name='Салон',
    )
    kp_number = models.CharField(max_length=100, blank=True, verbose_name='Номер КП')
    kp_date = models.DateField(null=True, blank=True, verbose_name='Дата КП')
    client_name = models.CharField(max_length=255, verbose_name='Клиент')
    contact_phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон контакта')
    address = models.CharField(max_length=500, blank=True, verbose_name='Адрес')
    lift_available = models.BooleanField(null=True, blank=True, verbose_name='Есть лифт')
    stairs_available = models.BooleanField(null=True, blank=True, verbose_name='Есть лестница')
    floor_readiness = models.TextField(blank=True, verbose_name='Готовность пола')
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        default=OrderStatus.DRAFT,
        verbose_name='Статус',
    )
    commercial_offer = models.FileField(
        upload_to='orders/commercial_offers/',
        null=True,
        blank=True,
        verbose_name='Коммерческое предложение',
    )
    last_activity_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата последней активности',
    )
    last_activity_kind = models.CharField(
        max_length=40,
        choices=ActivityKind.choices,
        blank=True,
        default='',
        verbose_name='Вид активности',
    )
    # Фаза 5: даты производства
    production_start_date = models.DateField(
        null=True, blank=True, verbose_name='Дата запуска в производство',
    )
    production_deadline = models.DateField(
        null=True, blank=True, verbose_name='Дата готовности',
    )

    class Meta:
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ #{self.id} — {self.client_name}'

    def touch_activity(self, kind: str, save: bool = True):
        """Обновить дату/вид последней активности."""
        from django.utils import timezone
        self.last_activity_at = timezone.now()
        self.last_activity_kind = kind
        if save:
            self.save(update_fields=['last_activity_at', 'last_activity_kind', 'updated_at'])

    # ==================== Фаза 5: журнал + переходы статусов ====================

    def log_activity(self, kind, actor=None, description='', old_status='', new_status='', meta=None):
        """Записать событие в общий журнал OrderActivityLog (Лист 6)."""
        return OrderActivityLog.objects.create(
            order=self,
            kind=kind,
            actor=actor,
            description=description or '',
            old_status=old_status or '',
            new_status=new_status or '',
            meta=meta or {},
        )

    def _notify_status_change(self, old_status, new_status, actor=None):
        """Push менеджеру (и СМ) о смене статуса заказа. Актора не уведомляем."""
        import logging
        from users.push_utils import send_push_notification
        logger = logging.getLogger(__name__)
        recipients = set()
        if self.manager_id:
            recipients.add(self.manager)
        for user in recipients:
            if actor is not None and user.pk == actor.pk:
                continue
            try:
                send_push_notification(
                    user=user,
                    title=f'Заказ #{self.id}: {self.get_status_display()}',
                    body=f'Статус изменён на «{self.get_status_display()}»',
                    url=f'/orders/{self.id}',
                    data={'orderId': self.id},
                )
            except Exception as exc:  # noqa: BLE001
                logger.error('Ошибка push о смене статуса заказа #%s: %s', self.id, exc)

    def change_status(self, new_status, actor=None, description='', extra_update_fields=None, notify=True):
        """
        Базовый переход статуса: пишет в журнал и шлёт уведомления.
        Используется методами mark_* и кронами просрочек.
        """
        from django.utils import timezone
        old_status = self.status
        self.status = new_status
        self.last_activity_at = timezone.now()
        self.last_activity_kind = ActivityKind.STATUS_CHANGED
        fields = ['status', 'last_activity_at', 'last_activity_kind', 'updated_at']
        if extra_update_fields:
            fields.extend(f for f in extra_update_fields if f not in fields)
        self.save(update_fields=fields)
        self.log_activity(
            ActivityKind.STATUS_CHANGED,
            actor=actor,
            description=description,
            old_status=old_status,
            new_status=new_status,
        )
        if notify:
            self._notify_status_change(old_status, new_status, actor=actor)
        return old_status

    def mark_paid(self, actor=None):
        return self.change_status(OrderStatus.PAID, actor=actor, description='Заказ оплачен')

    def mark_in_production(self, deadline=None, start_date=None, actor=None):
        from django.utils import timezone
        extra = []
        if start_date is not None:
            self.production_start_date = start_date
            extra.append('production_start_date')
        elif self.production_start_date is None:
            self.production_start_date = timezone.localdate()
            extra.append('production_start_date')
        if deadline is not None:
            self.production_deadline = deadline
            extra.append('production_deadline')
        return self.change_status(
            OrderStatus.IN_PRODUCTION, actor=actor,
            description='Запущен в производство', extra_update_fields=extra,
        )

    def mark_on_warehouse(self, actor=None):
        return self.change_status(OrderStatus.ON_WAREHOUSE, actor=actor, description='Поступил на склад')

    def mark_shipped(self, actor=None):
        return self.change_status(OrderStatus.SHIPPED, actor=actor, description='Отгружен')

    def mark_completed(self, actor=None):
        return self.change_status(OrderStatus.COMPLETED, actor=actor, description='Заказ выполнен')

    def mark_cancelled(self, actor=None):
        return self.change_status(OrderStatus.CANCELLED, actor=actor, description='Заказ отменён (не актуален)')


class DoorType(models.TextChoices):
    ENTRANCE = 'entrance', 'Входная'
    INTERIOR = 'interior', 'Межкомнатная'
    OTHER = 'other', 'Другое'


class OpeningType(models.TextChoices):
    A = 'A', 'A — правое наружнее, лицо снаружи'
    B = 'B', 'B — правое наружнее, лицо внутри'
    B_INVERSO = 'B_INVERSO', 'B Inverso — правое внутреннее, лицо снаружи'
    C = 'C', 'C — левое наружнее, лицо снаружи'
    D = 'D', 'D — левое наружнее, лицо внутри'
    D_INVERSO = 'D_INVERSO', 'D Inverso — левое внутреннее, лицо снаружи'


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='items', verbose_name='Заказ'
    )
    opening_number = models.PositiveSmallIntegerField(verbose_name='Номер проёма')
    room_name = models.CharField(max_length=255, blank=True, verbose_name='Помещение')
    model_name = models.CharField(max_length=500, blank=True, verbose_name='Модель')
    quantity = models.PositiveSmallIntegerField(default=1, verbose_name='Количество')
    price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='Цена'
    )
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='Сумма'
    )
    door_type = models.CharField(
        max_length=30, choices=DoorType.choices, blank=True, verbose_name='Тип двери'
    )
    opening_type = models.CharField(
        max_length=30, choices=OpeningType.choices, blank=True, verbose_name='Тип открывания'
    )
    door_height = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='Высота полотна, мм'
    )
    door_width = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='Ширина полотна, мм'
    )
    recommended_opening_height = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='Рекомендуемая высота проёма, мм'
    )
    recommended_opening_width = models.PositiveIntegerField(
        null=True, blank=True, verbose_name='Рекомендуемая ширина проёма, мм'
    )
    notes = models.TextField(blank=True, verbose_name='Примечания')
    position = models.PositiveSmallIntegerField(default=0, verbose_name='Порядок')

    class Meta:
        verbose_name = 'Позиция заказа'
        verbose_name_plural = 'Позиции заказа'
        ordering = ['position', 'opening_number']

    def __str__(self):
        return f'Проём {self.opening_number} — {self.model_name}'


class AddonKind(models.TextChoices):
    BOX = 'box', 'Короб'
    PLATBAND = 'platband', 'Наличник'
    EXTENSION = 'extension', 'Добор'
    HINGES = 'hinges', 'Петли'
    HANDLE = 'handle', 'Ручки'
    MECHANISM = 'mechanism', 'Механизм'
    GLASS = 'glass', 'Стекло'
    EXTRA = 'extra', 'Доп. к заказу'
    SERVICE = 'service', 'Услуга'


class OrderAddon(models.Model):
    """
    Сопутствующие позиции (короб, наличник, добор, петли, ручки, механизм,
    стекло, доп. к заказу, услуги). Привязаны к заказу в целом — общим списком,
    как они идут в КП. По ТЗ менеджер может удалять / добавлять / копировать.
    """
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='addons', verbose_name='Заказ'
    )
    kind = models.CharField(max_length=30, choices=AddonKind.choices, verbose_name='Вид')
    name = models.CharField(max_length=500, verbose_name='Наименование')
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, default=1, verbose_name='Количество',
        help_text='Поддерживаются дробные значения (наличников может быть 1.5)',
    )
    size = models.CharField(max_length=100, blank=True, verbose_name='Размер')
    opening_type = models.CharField(
        max_length=30, choices=OpeningType.choices, blank=True,
        verbose_name='Открывание (для коробов)',
    )
    price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='Цена'
    )
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='Сумма'
    )
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    position = models.PositiveSmallIntegerField(default=0, verbose_name='Порядок')

    class Meta:
        verbose_name = 'Сопутствующая позиция'
        verbose_name_plural = 'Сопутствующие позиции'
        ordering = ['position', 'id']

    def __str__(self):
        return f'{self.get_kind_display()} — {self.name}'


class OrderAttachment(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='attachments',
        verbose_name='Заказ',
    )
    order_item = models.ForeignKey(
        OrderItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='attachments',
        verbose_name='Позиция',
    )
    file = models.FileField(upload_to='orders/attachments/', verbose_name='Файл')
    name = models.CharField(max_length=255, blank=True, verbose_name='Имя файла')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Вложение заказа'
        verbose_name_plural = 'Вложения заказов'

    def __str__(self):
        return self.name or self.file.name


class MeasurementPayer(models.TextChoices):
    CLIENT = 'client', 'Клиент'
    SALON = 'salon', 'Салон'


class MeasurementRequest(models.Model):
    """Заявка на замер (одна на заказ)."""
    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name='measurement_request',
        verbose_name='Заказ',
    )
    contact_name = models.CharField(max_length=255, verbose_name='Контактное лицо ФИО')
    contact_position = models.CharField(max_length=255, blank=True, verbose_name='Должность')
    contact_phone = models.CharField(max_length=50, verbose_name='Телефон контактного лица')
    desired_date = models.DateField(null=True, blank=True, verbose_name='Желаемая дата замера')
    payer = models.CharField(
        max_length=20,
        choices=MeasurementPayer.choices,
        default=MeasurementPayer.CLIENT,
        verbose_name='Кто оплачивает замер',
    )
    opening_plan = models.FileField(
        upload_to='orders/opening_plans/',
        null=True,
        blank=True,
        verbose_name='План открывания',
    )
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_measurement_requests',
        verbose_name='Создал',
    )

    class Meta:
        verbose_name = 'Заявка на замер'
        verbose_name_plural = 'Заявки на замер'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заявка на замер по заказу #{self.order_id}'


class OrderActionReminder(models.Model):
    """Наработка / напоминание о следующем действии по заказу."""
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='action_reminders',
        verbose_name='Заказ',
    )
    due_at = models.DateTimeField(verbose_name='Срок')
    action_text = models.CharField(max_length=500, verbose_name='Действие')
    done = models.BooleanField(default=False, verbose_name='Выполнено')
    done_at = models.DateTimeField(null=True, blank=True, verbose_name='Выполнено в')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Создано')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_action_reminders',
        verbose_name='Создал',
    )
    notified = models.BooleanField(
        default=False,
        verbose_name='Уведомление отправлено',
        help_text='True после отправки in-app уведомления при наступлении due_at',
    )

    class Meta:
        verbose_name = 'Наработка'
        verbose_name_plural = 'Наработки'
        ordering = ['done', 'due_at']
        indexes = [
            models.Index(fields=['done', 'due_at']),
            models.Index(fields=['order', 'done']),
        ]

    def __str__(self):
        return f'{self.action_text} (до {self.due_at})'


# ==================== Phase 3: Замер ====================


class Measurement(models.Model):
    """
    Замер (один на заявку). Создаётся СМ при назначении даты.
    Привязан к MeasurementRequest 1:1.
    """
    request = models.OneToOneField(
        MeasurementRequest,
        on_delete=models.CASCADE,
        related_name='measurement',
        verbose_name='Заявка на замер',
    )
    service_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='measurements',
        verbose_name='Сервис-менеджер',
    )
    measurement_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата и время замера',
    )
    signature_photo = models.FileField(
        upload_to='orders/signatures/',
        null=True,
        blank=True,
        verbose_name='Фото подписанного бланка',
    )
    client_access_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        verbose_name='Публичный токен для PDF',
        help_text='Используется в публичной ссылке на PDF без авторизации',
    )
    short_code = models.CharField(
        max_length=12,
        unique=True,
        null=True,
        blank=True,
        editable=False,
        verbose_name='Короткий код для SMS-ссылки',
        help_text='Короткая ссылка /z/{код} → PDF-бланк (для SMS клиенту)',
    )
    is_done = models.BooleanField(default=False, verbose_name='Замер выполнен')
    done_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата выполнения')
    is_processed = models.BooleanField(default=False, verbose_name='Замер обработан менеджером')
    processed_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата обработки')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Замер'
        verbose_name_plural = 'Замеры'
        ordering = ['-created_at']

    def __str__(self):
        return f'Замер по заказу #{self.request.order_id}'

    def save(self, *args, **kwargs):
        # Генерируем уникальный короткий код при первом сохранении
        if not self.short_code:
            for _ in range(10):
                code = generate_short_code()
                if not Measurement.objects.filter(short_code=code).exists():
                    self.short_code = code
                    break
        super().save(*args, **kwargs)

    @property
    def order(self):
        return self.request.order


class MeasurementOpening(models.Model):
    """
    Замерные данные по одному проёму. Привязан к Measurement и опционально
    к OrderItem (с какой именно дверью соответствует).
    """
    measurement = models.ForeignKey(
        Measurement,
        on_delete=models.CASCADE,
        related_name='openings',
        verbose_name='Замер',
    )
    order_item = models.ForeignKey(
        OrderItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='measurement_openings',
        verbose_name='Позиция заказа',
    )
    opening_number = models.PositiveSmallIntegerField(verbose_name='Номер проёма')
    room_name = models.CharField(max_length=255, blank=True, verbose_name='Помещение')

    # Тип двери (выбирает СМ — раньше копировался из заказа)
    door_type = models.CharField(
        max_length=30, choices=DoorType.choices, blank=True, verbose_name='Тип двери',
    )

    # Фактические размеры проёма (вводит СМ)
    actual_height = models.PositiveIntegerField(null=True, blank=True, verbose_name='Фактическая высота, мм')
    actual_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Фактическая ширина, мм')
    actual_depth = models.PositiveIntegerField(null=True, blank=True, verbose_name='Фактическая глубина, мм')

    # Авто-рекомендации (рассчитываются на сервере и клиенте)
    recommended_door_height = models.PositiveIntegerField(null=True, blank=True, verbose_name='Рек. высота двери')
    recommended_door_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Рек. ширина двери')
    recommended_opening_height = models.PositiveIntegerField(null=True, blank=True, verbose_name='Рек. высота проёма')
    recommended_opening_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Рек. ширина проёма')

    # Желаемый размер двери (вводит СМ — заменяет старую логику change_target+new_door_*)
    desired_door_height = models.PositiveIntegerField(null=True, blank=True, verbose_name='Желаемая высота двери')
    desired_door_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Желаемая ширина двери')

    # Открывание (может переопределять КП-открывание)
    opening_type = models.CharField(
        max_length=30,
        choices=OpeningType.choices,
        blank=True,
        verbose_name='Открывание',
    )
    addon_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Ширина добора, мм')

    # Наличники — поддерживаем дробные значения (по Excel «число, в т.ч. дробное»)
    face_trim_qty = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        verbose_name='Наличник лицевой, кол-во',
    )
    face_trim_comment = models.TextField(blank=True, verbose_name='Комментарий лицевой')
    back_trim_qty = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        verbose_name='Наличник оборотный, кол-во',
    )
    back_trim_comment = models.TextField(blank=True, verbose_name='Комментарий оборотный')

    extra_hardware = models.TextField(blank=True, verbose_name='Доп. фурнитура')
    threshold = models.TextField(blank=True, verbose_name='Порог')
    notes = models.TextField(blank=True, verbose_name='Примечания / рекомендации')

    class Meta:
        verbose_name = 'Проём (замер)'
        verbose_name_plural = 'Проёмы (замер)'
        ordering = ['opening_number']

    def __str__(self):
        return f'Проём #{self.opening_number} замера #{self.measurement_id}'


class MeasurementAttachment(models.Model):
    """Фото/документы по замеру в целом или по конкретному проёму."""
    measurement = models.ForeignKey(
        Measurement,
        on_delete=models.CASCADE,
        related_name='attachments',
        verbose_name='Замер',
    )
    opening = models.ForeignKey(
        MeasurementOpening,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='attachments',
        verbose_name='Проём',
    )
    file = models.FileField(upload_to='orders/measurements/', verbose_name='Файл')
    name = models.CharField(max_length=255, blank=True, verbose_name='Имя файла')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Вложение замера'
        verbose_name_plural = 'Вложения замера'

    def __str__(self):
        return self.name or self.file.name


# ==================== Phase 5: журнал событий заказа ====================


class OrderActivityLog(models.Model):
    """
    Общий журнал «кто/когда/что» по любому событию заказа (Лист 6 ТЗ).
    Пишется на: создание/правки заказа, смену позиций, загрузку файлов,
    смену статуса, события замера и отправку SMS клиенту.
    Заменяет узкий OrderStatusHistory.
    """
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='activity_logs',
        verbose_name='Заказ',
    )
    kind = models.CharField(
        max_length=40,
        choices=ActivityKind.choices,
        verbose_name='Вид события',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='order_activity_logs',
        verbose_name='Кто',
        help_text='Пусто = системное событие (cron)',
    )
    description = models.CharField(max_length=500, blank=True, verbose_name='Описание')
    old_status = models.CharField(max_length=40, blank=True, verbose_name='Старый статус')
    new_status = models.CharField(max_length=40, blank=True, verbose_name='Новый статус')
    meta = models.JSONField(default=dict, blank=True, verbose_name='Доп. данные')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Когда')

    class Meta:
        verbose_name = 'Событие заказа'
        verbose_name_plural = 'Журнал событий заказа'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order', '-created_at']),
        ]

    def __str__(self):
        return f'#{self.order_id} {self.get_kind_display()} ({self.created_at:%d.%m.%Y %H:%M})'
