"""
Справочник дверей: серия → модель → цвет → картинка варианта полотна.

Структура повторяет то, как каталог приходит от фабрики папками:

    Модерн/            → DoorSeries «Модерн»
      Epsilon/         → DoorModel «Epsilon»
        Капуччино/     → DoorColor «Капуччино»
          1 - Капуччино.jpg   → DoorImage variant='1'  (глухое полотно)
          12 - Капуччино.jpg  → DoorImage variant='12' (три стекла)

Вариант полотна в каталоге кодируют по-разному — где-то номером («12»),
где-то артикулом («AC36», «Torino TR 702», «New York SF 2»), — поэтому
`DoorImage.variant` хранит его строкой как есть.

Цвет — общий справочник на весь каталог, потому что одни и те же цвета
повторяются у разных моделей, а пишут их в КП по-разному («Капучино» /
«Капуччино»). Расхождения написания гасит `catalog.normalize.normalize`,
а совсем непохожие варианты («Милк ZB 810 EVO» = «Milk») заводятся
синонимами в поле `aliases`.
"""
import unicodedata

from django.db import models

from .normalize import normalize


class AliasMixin(models.Model):
    """Общая логика для справочников: нормализованное имя + синонимы."""

    name = models.CharField(max_length=255, verbose_name='Название')
    norm_name = models.CharField(
        max_length=255, db_index=True, editable=False,
        verbose_name='Нормализованное название',
    )
    aliases = models.TextField(
        blank=True, verbose_name='Синонимы',
        help_text='По одному в строке. Как это название пишут в КП, если отличается.',
    )

    class Meta:
        abstract = True

    def alias_list(self):
        """Список синонимов без пустых строк."""
        return [line.strip() for line in (self.aliases or '').splitlines() if line.strip()]

    def all_names(self):
        """Основное название и все синонимы."""
        return [self.name, *self.alias_list()]

    def save(self, *args, **kwargs):
        # Каталог приходит папками с macOS — там имена в NFC-разложении.
        self.name = unicodedata.normalize('NFC', self.name)
        self.norm_name = normalize(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DoorSeries(models.Model):
    name = models.CharField(max_length=255, unique=True, verbose_name='Название')
    position = models.PositiveSmallIntegerField(default=0, verbose_name='Порядок')

    class Meta:
        verbose_name = 'Серия дверей'
        verbose_name_plural = 'Серии дверей'
        ordering = ['position', 'name']

    def __str__(self):
        return self.name


class DoorModel(AliasMixin):
    series = models.ForeignKey(
        DoorSeries, on_delete=models.CASCADE, related_name='models',
        verbose_name='Серия',
    )

    class Meta:
        verbose_name = 'Модель двери'
        verbose_name_plural = 'Модели дверей'
        ordering = ['series__position', 'series__name', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['series', 'name'], name='catalog_doormodel_unique_in_series',
            ),
        ]

    def __str__(self):
        return f'{self.series.name} / {self.name}'


class DoorColor(AliasMixin):
    class Meta:
        verbose_name = 'Цвет двери'
        verbose_name_plural = 'Цвета дверей'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['name'], name='catalog_doorcolor_unique_name'),
        ]


class ImageSource(models.TextChoices):
    CATALOG = 'catalog', 'Из каталога'
    MANUAL = 'manual', 'Загружена менеджером'


class DoorImage(models.Model):
    """
    Картинка полотна конкретной модели в конкретном цвете.

    `variant` — код рисунка полотна из имени файла: «1» (глухое), «12»
    (с тремя стёклами), «AC36», «Torino TR 702». Пустой variant означает
    единственную картинку модели в этом цвете.
    """
    door_model = models.ForeignKey(
        DoorModel, on_delete=models.CASCADE, related_name='images',
        verbose_name='Модель',
    )
    color = models.ForeignKey(
        DoorColor, on_delete=models.CASCADE, related_name='images',
        verbose_name='Цвет',
    )
    variant = models.CharField(
        max_length=100, blank=True, db_index=True, verbose_name='Вариант полотна',
        help_text='Номер или артикул полотна из каталога: 1, 12, AC36, Torino TR 702…',
    )
    image = models.ImageField(upload_to='catalog/doors/', verbose_name='Картинка')
    source = models.CharField(
        max_length=20, choices=ImageSource.choices, default=ImageSource.CATALOG,
        verbose_name='Источник',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Картинка двери'
        verbose_name_plural = 'Картинки дверей'
        ordering = ['door_model', 'color', 'variant']
        constraints = [
            models.UniqueConstraint(
                fields=['door_model', 'color', 'variant'],
                name='catalog_doorimage_unique_variant',
            ),
        ]

    def __str__(self):
        variant = f' {self.variant}' if self.variant else ''
        return f'{self.door_model.name}{variant} — {self.color.name}'
