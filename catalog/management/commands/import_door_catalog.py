"""
Импорт каталога дверей из папки, как её отдаёт фабрика.

Ожидаемая структура — «Серия / Модель / Цвет / <вариант> - <Цвет>.jpg»:

    Модерн/Epsilon/Капуччино/12 - Капуччино.jpg
    Модерн/Alfa/Венге/AC36 - Венге.jpg
    Модерн/Torino/RAL Avorio/Torino TR 702 - RAL Avorio.jpg

Всё, что в имени файла стоит до « - », считается кодом варианта полотна:
в каталоге это то номер рисунка, то артикул. Цвет берётся из названия
папки, а не из имени файла, — папка надёжнее.

Команда понимает и папку всего каталога (внутри несколько серий), и папку
одной серии — глубину определяет сама по тому, где лежат картинки.

    python manage.py import_door_catalog /path/to/Каталог
    python manage.py import_door_catalog /path/to/Модерн --dry-run

Импорт идемпотентный: повторный запуск обновляет картинки на месте
(ключ — модель + цвет + вариант), а не плодит дубли — ни строк в базе,
ни файлов в media.
"""
import os
import re

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


def _is_image(name: str) -> bool:
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


class Command(BaseCommand):
    help = 'Импортирует каталог дверей (серия/модель/цвет/картинки) из папки'

    def add_arguments(self, parser):
        parser.add_argument('path', help='Путь к папке каталога или серии')
        parser.add_argument(
            '--series', dest='series_name', default='',
            help='Название серии, если папка — это одна серия и её имя нужно переопределить',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Показать, что будет импортировано, ничего не записывая',
        )

    def handle(self, *args, **options):
        root = os.path.abspath(os.path.expanduser(options['path']))
        if not os.path.isdir(root):
            raise CommandError(f'Папка не найдена: {root}')

        depth = _detect_depth(root)
        if depth == 0:
            raise CommandError(
                'В папке не нашлось картинок на ожидаемой глубине. '
                'Нужна структура «Серия/Модель/Цвет/файл.jpg» либо «Модель/Цвет/файл.jpg».'
            )

        if depth == 3:
            series_dirs = [(options['series_name'] or os.path.basename(root), root)]
        else:
            series_dirs = [(os.path.basename(p), p) for p in _subdirs(root)]

        self.dry_run = options['dry_run']
        self.stats = {'series': 0, 'models': 0, 'colors': 0, 'images': 0, 'no_variant': 0}

        with transaction.atomic():
            for position, (series_name, series_path) in enumerate(series_dirs):
                self._import_series(series_name, series_path, position)
            if self.dry_run:
                transaction.set_rollback(True)

        prefix = '[dry-run] ' if self.dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}Серий: {self.stats["series"]}, моделей: {self.stats["models"]}, '
            f'цветов: {self.stats["colors"]}, картинок: {self.stats["images"]} '
            f'(без номера варианта: {self.stats["no_variant"]})'
        ))

    # ---------- импорт по уровням ----------

    def _import_series(self, series_name: str, series_path: str, position: int):
        series, _ = DoorSeries.objects.get_or_create(
            name=series_name, defaults={'position': position},
        )
        self.stats['series'] += 1
        self.stdout.write(f'Серия «{series_name}»')

        for model_path in _subdirs(series_path):
            model_name = os.path.basename(model_path)
            door_model, created = DoorModel.objects.get_or_create(
                series=series, name=model_name,
            )
            if created:
                self.stats['models'] += 1
            for color_path in _subdirs(model_path):
                self._import_color(door_model, color_path)

    def _import_color(self, door_model: DoorModel, color_path: str):
        color_name = os.path.basename(color_path)
        color = DoorColor.objects.filter(norm_name=normalize(color_name)).first()
        if color is None:
            color = DoorColor.objects.create(name=color_name)
            self.stats['colors'] += 1

        for image_path in _images_in(color_path):
            self._import_image(door_model, color, image_path)

    def _import_image(self, door_model: DoorModel, color: DoorColor, image_path: str):
        filename = os.path.basename(image_path)
        variant = _variant_from_filename(filename)

        self.stats['images'] += 1
        if not variant:
            self.stats['no_variant'] += 1
        self.stdout.write(
            f'  {door_model.name} / {color.name} / вариант {variant or "—"}: {filename}'
        )
        if self.dry_run:
            return

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
