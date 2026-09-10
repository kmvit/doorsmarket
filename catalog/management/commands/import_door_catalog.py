"""
Импорт каталога дверей из папки, как её отдаёт фабрика.

Фабрика присылает каталог в двух разных раскладках, поэтому их две:

  • `series-model-color` (по умолчанию) — «Серия / Модель / Цвет / файл»:

        Модерн/Epsilon/Капуччино/12 - Капуччино.jpg

  • `model-coating-color` — «Модель / Покрытие / Цвет / файл»:

        Geometria/Окрашенные/RAL 8017/Geometria 3 vetro.jpg

    Здесь серией становится покрытие: это и есть то, чем модели группируются
    в таком каталоге. Файлы, лежащие прямо в папке модели, без покрытия и
    цвета, тоже импортируются — иначе модели вроде Secret пропали бы целиком.

Всё, что в имени файла стоит до « - », считается кодом варианта полотна:
в каталоге это то номер рисунка, то артикул. Если разделителя нет, вариантом
берётся имя файла целиком. Цвет берётся из названия папки, а не из имени
файла, — папка надёжнее.

    python manage.py import_door_catalog /path/to/Каталог
    python manage.py import_door_catalog /path/to/Каталог --layout model-coating-color
    python manage.py import_door_catalog /path/to/Каталог --replace --dry-run

Импорт идемпотентный: повторный запуск обновляет картинки на месте
(ключ — модель + цвет + вариант), а не плодит дубли — ни строк в базе,
ни файлов в media.
"""
import os
import re
from collections import namedtuple

from django.apps import apps
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import DoorColor, DoorImage, DoorModel, DoorSeries, ImageSource
from catalog.normalize import normalize

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp')

# «12 - Капуччино.jpg» → «12», «Torino TR 702 - RAL Avorio.jpg» → «Torino TR 702».
# Разделитель — дефис или тире, обязательно окружённый пробелами: внутри самих
# кодов дефис тоже встречается («Glasgow 0_10»).
FILENAME_SPLIT_RE = re.compile(r'\s+[-–—]\s+')

LAYOUT_SERIES_MODEL_COLOR = 'series-model-color'
LAYOUT_MODEL_COATING_COLOR = 'model-coating-color'
LAYOUTS = (LAYOUT_SERIES_MODEL_COLOR, LAYOUT_MODEL_COATING_COLOR)

# Для файлов, лежащих прямо в папке модели: ни покрытия, ни цвета не указано.
# Заводим явные подписи, чтобы такие двери всё-таки можно было выбрать.
NO_COATING = 'Без покрытия'
NO_COLOR = 'Без цвета'

Entry = namedtuple('Entry', 'series model color path')


def _is_image(name: str) -> bool:
    """
    Картинка каталога, а не служебный файл.

    macOS кладёт рядом с каждым файлом AppleDouble-двойник «._имя.jpg», и он
    тоже оканчивается на .jpg — без этой проверки каталог набивается мусорными
    вариантами вроде «._Brussel GF4». Windows аналогично оставляет Thumbs.db.
    """
    if name.startswith('.'):
        return False
    return name.lower().endswith(IMAGE_EXTS)


def _subdirs(path: str):
    return sorted(
        entry.path for entry in os.scandir(path)
        if entry.is_dir() and not entry.name.startswith('.')
    )


def _images_in(path: str):
    return sorted(
        entry.path for entry in os.scandir(path)
        if entry.is_file() and _is_image(entry.name)
    )


def _variant_from_filename(filename: str) -> str:
    """
    Код варианта полотна из имени файла — всё до « - ». Если разделителя нет,
    вариантом считаем имя файла целиком: у некоторых моделей картинка одна.
    """
    stem = os.path.splitext(filename)[0].strip()
    return FILENAME_SPLIT_RE.split(stem, maxsplit=1)[0].strip().strip('-–— ')


def _detect_depth(root: str) -> int:
    """
    На какой глубине от `root` лежат картинки: 3 — root это серия
    (root/модель/цвет/файл), 4 — root это весь каталог (root/серия/…).
    """
    for level_1 in _subdirs(root):
        for level_2 in _subdirs(level_1):
            if _images_in(level_2):
                return 3
            for level_3 in _subdirs(level_2):
                if _images_in(level_3):
                    return 4
    return 0


def scan_series_model_color(root: str, series_override: str = ''):
    """Раскладка «Серия / Модель / Цвет / файл»; root может быть и одной серией."""
    depth = _detect_depth(root)
    if depth == 0:
        raise CommandError(
            'В папке не нашлось картинок на ожидаемой глубине. Нужна структура '
            '«Серия/Модель/Цвет/файл.jpg» либо «Модель/Цвет/файл.jpg».'
        )
    if depth == 3:
        series_dirs = [(series_override or os.path.basename(root), root)]
    else:
        series_dirs = [(os.path.basename(p), p) for p in _subdirs(root)]

    for series_name, series_path in series_dirs:
        for model_path in _subdirs(series_path):
            model_name = os.path.basename(model_path)
            for color_path in _subdirs(model_path):
                color_name = os.path.basename(color_path)
                for image_path in _images_in(color_path):
                    yield Entry(series_name, model_name, color_name, image_path)


def scan_model_coating_color(root: str, series_override: str = ''):
    """Раскладка «Модель / Покрытие / Цвет / файл»: серией становится покрытие."""
    found = False
    for model_path in _subdirs(root):
        model_name = os.path.basename(model_path)

        # Картинки прямо в папке модели: покрытие и цвет не указаны.
        for image_path in _images_in(model_path):
            found = True
            yield Entry(series_override or NO_COATING, model_name, NO_COLOR, image_path)

        for coating_path in _subdirs(model_path):
            coating_name = os.path.basename(coating_path)
            for color_path in _subdirs(coating_path):
                color_name = os.path.basename(color_path)
                for image_path in _images_in(color_path):
                    found = True
                    yield Entry(
                        series_override or coating_name, model_name, color_name, image_path,
                    )
    if not found:
        raise CommandError(
            'В папке не нашлось картинок. Для этой раскладки нужна структура '
            '«Модель/Покрытие/Цвет/файл.jpg».'
        )


class Command(BaseCommand):
    help = 'Импортирует каталог дверей из папки фабрики'

    def add_arguments(self, parser):
        parser.add_argument('path', help='Путь к папке каталога')
        parser.add_argument(
            '--layout', choices=LAYOUTS, default=LAYOUT_SERIES_MODEL_COLOR,
            help='Раскладка папок каталога (по умолчанию «Серия/Модель/Цвет»)',
        )
        parser.add_argument(
            '--series', dest='series_name', default='',
            help='Принудительное название серии для всех картинок',
        )
        parser.add_argument(
            '--replace', action='store_true',
            help='Заменить каталог: после импорта убрать прежние картинки. '
                 'Те, что уже выбраны в каких-то КП, остаются — иначе у менеджеров '
                 'пропали бы двери в готовых предложениях.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что будет импортировано, ничего не записывая',
        )

    def handle(self, *args, **options):
        root = os.path.abspath(os.path.expanduser(options['path']))
        if not os.path.isdir(root):
            raise CommandError(f'Папка не найдена: {root}')

        scanner = (
            scan_model_coating_color
            if options['layout'] == LAYOUT_MODEL_COATING_COLOR
            else scan_series_model_color
        )
        self.dry_run = options['dry_run']
        self.stats = {'series': 0, 'models': 0, 'colors': 0, 'images': 0, 'no_variant': 0}

        with transaction.atomic():
            before = set(DoorImage.objects.values_list('id', flat=True))
            touched = self._import(scanner(root, options['series_name']))
            if options['replace']:
                self._replace(before - touched)
            if self.dry_run:
                transaction.set_rollback(True)

        prefix = '[dry-run] ' if self.dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Серий: {self.stats["series"]}, моделей: {self.stats["models"]}, '
            f'цветов: {self.stats["colors"]}, картинок: {self.stats["images"]} '
            f'(без номера варианта: {self.stats["no_variant"]})'
        ))

    # ---------- импорт ----------

    def _import(self, entries) -> set:
        """Импортирует записи и возвращает id затронутых картинок."""
        series_cache, model_cache, color_cache = {}, {}, {}
        touched = set()
        current_group = None

        for entry in entries:
            series = series_cache.get(entry.series)
            if series is None:
                series, created = DoorSeries.objects.get_or_create(
                    name=entry.series, defaults={'position': len(series_cache)},
                )
                series_cache[entry.series] = series
                if created:
                    self.stats['series'] += 1

            model_key = (entry.series, entry.model)
            door_model = model_cache.get(model_key)
            if door_model is None:
                door_model, created = DoorModel.objects.get_or_create(
                    series=series, name=entry.model,
                )
                model_cache[model_key] = door_model
                if created:
                    self.stats['models'] += 1

            color = color_cache.get(entry.color)
            if color is None:
                color = DoorColor.objects.filter(norm_name=normalize(entry.color)).first()
                if color is None:
                    color = DoorColor.objects.create(name=entry.color)
                    self.stats['colors'] += 1
                color_cache[entry.color] = color

            # Каталог на десятки тысяч файлов: пишем строку на папку цвета,
            # а не на каждый файл, иначе вывод невозможно читать.
            group = (entry.series, entry.model, entry.color)
            if group != current_group:
                current_group = group
                self.stdout.write(f'{entry.series} / {entry.model} / {entry.color}')

            image_id = self._import_image(door_model, color, entry.path)
            if image_id:
                touched.add(image_id)

        return touched

    def _import_image(self, door_model: DoorModel, color: DoorColor, image_path: str):
        filename = os.path.basename(image_path)
        variant = _variant_from_filename(filename)

        self.stats['images'] += 1
        if not variant:
            self.stats['no_variant'] += 1
        if self.dry_run:
            return None

        image, _ = DoorImage.objects.get_or_create(
            door_model=door_model, color=color, variant=variant,
            defaults={'source': ImageSource.CATALOG},
        )
        # Старый файл удаляем сами: storage не перезаписывает одноимённый, а
        # дописывает к имени случайный суффикс — без этого каждый повторный
        # импорт удваивал media, оставляя прежние файлы висеть без ссылок.
        if image.image:
            image.image.delete(save=False)
        # Имя в media собираем из id — артикулы содержат пробелы и кириллицу.
        stored_name = f'{door_model.pk}-{color.pk}-{image.pk}{os.path.splitext(filename)[1].lower()}'
        with open(image_path, 'rb') as fh:
            image.image.save(stored_name, File(fh), save=False)
        image.source = ImageSource.CATALOG
        image.save()
        return image.pk

    # ---------- замена каталога ----------

    def _replace(self, stale_ids: set):
        """
        Убирает картинки прежнего каталога. Те, что уже выбраны в каких-то КП,
        оставляем: иначе у менеджеров пропали бы двери в готовых предложениях.
        """
        if not stale_ids:
            self.stdout.write('Замена: прежних картинок не осталось')
            return

        item_model = apps.get_model('orders', 'PrettyOfferItem')
        used = set(
            item_model.objects.filter(front_image_id__in=stale_ids)
            .values_list('front_image_id', flat=True)
        ) | set(
            item_model.objects.filter(back_image_id__in=stale_ids)
            .values_list('back_image_id', flat=True)
        )
        removable = stale_ids - used

        if not self.dry_run:
            for image in DoorImage.objects.filter(id__in=removable):
                if image.image:
                    image.image.delete(save=False)
                image.delete()
            # Модели и цвета, оставшиеся без единой картинки, только мешают
            # в окне выбора — убираем и их.
            DoorModel.objects.filter(images__isnull=True).delete()
            DoorColor.objects.filter(images__isnull=True).delete()
            DoorSeries.objects.filter(models__isnull=True).delete()

        self.stdout.write(self.style.WARNING(
            f'Замена: убрано прежних картинок {len(removable)}, '
            f'оставлено выбранных в КП {len(used)}'
        ))
