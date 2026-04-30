from django.db import models
from django.conf import settings


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
    ACTIVE = 'active', 'Активный'
    CANCELLED = 'cancelled', 'Отменён'


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

    class Meta:
        verbose_name = 'Заказ'
        verbose_name_plural = 'Заказы'
        ordering = ['-created_at']

    def __str__(self):
        return f'Заказ #{self.id} — {self.client_name}'


class DoorType(models.TextChoices):
    ENTRANCE = 'entrance', 'Входная'
    INTERIOR = 'interior', 'Межкомнатная'
    OTHER = 'other', 'Другое'


class OpeningType(models.TextChoices):
    LEFT = 'left', 'Левое'
    RIGHT = 'right', 'Правое'
    LEFT_INNER = 'left_inner', 'Левое внутреннее'
    RIGHT_INNER = 'right_inner', 'Правое внутреннее'
    SLIDING = 'sliding', 'Раздвижное'
    OTHER = 'other', 'Другое'


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


class OrderItemAddon(models.Model):
    item = models.ForeignKey(
        OrderItem, on_delete=models.CASCADE, related_name='addons', verbose_name='Позиция'
    )
    kind = models.CharField(max_length=30, choices=AddonKind.choices, verbose_name='Вид')
    name = models.CharField(max_length=500, verbose_name='Наименование')
    quantity = models.PositiveSmallIntegerField(default=1, verbose_name='Количество')
    price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, verbose_name='Цена'
    )
    comment_face = models.TextField(blank=True, verbose_name='Комментарий лицо')
    comment_back = models.TextField(blank=True, verbose_name='Комментарий торец')

    class Meta:
        verbose_name = 'Дополнение к позиции'
        verbose_name_plural = 'Дополнения к позициям'

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
