"""
Тесты импорта каталога дверей из папки фабрики.

Главное, что здесь проверяется, — идемпотентность: каталог перезаливают
регулярно, и повторный запуск не должен ни плодить строки в базе, ни
оставлять в media файлы без ссылок.
"""
import io
import os
import shutil
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings

from catalog.models import DoorColor, DoorImage, DoorModel, DoorSeries


def write_png(path: str):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (10, 20), (180, 150, 120)).save(buffer, format='PNG')
    with open(path, 'wb') as fh:
        fh.write(buffer.getvalue())


def build_catalog_dir(root: str):
    """
    Мини-каталог в том же виде, в каком его отдаёт фабрика: серия / модель /
    цвет / «<вариант> - <цвет>.jpg», с обоими способами кодировать вариант.
    """
    files = [
        ('Модерн', 'Epsilon', 'Капуччино', '1 - Капуччино.png'),
        ('Модерн', 'Epsilon', 'Капуччино', '12 - Капуччино.png'),
        ('Модерн', 'Alfa', 'Венге', 'AC36 - Венге.png'),
        ('Модерн', 'Torino', 'RAL Avorio', 'Torino TR 702 - RAL Avorio.png'),
    ]
    for series, model, color, filename in files:
        directory = os.path.join(root, series, model, color)
        os.makedirs(directory, exist_ok=True)
        write_png(os.path.join(directory, filename))
    return len(files)


class ImportDoorCatalogTest(TestCase):
    def setUp(self):
        self.source = tempfile.mkdtemp(prefix='catalog-src-')
        self.addCleanup(shutil.rmtree, self.source, ignore_errors=True)
        self.file_count = build_catalog_dir(self.source)

        # MEDIA_ROOT свой на каждый тест: базу между тестами откатывают, а
        # файлы — нет, и одинаковые имена из соседних тестов исказили бы счёт.
        self.media_root = tempfile.mkdtemp(prefix='catalog-media-')
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        media = override_settings(MEDIA_ROOT=self.media_root)
        media.enable()
        self.addCleanup(media.disable)

    def stored_files(self):
        directory = os.path.join(self.media_root, 'catalog', 'doors')
        return sorted(os.listdir(directory)) if os.path.isdir(directory) else []

    def test_import_builds_catalog_tree(self):
        call_command('import_door_catalog', self.source, verbosity=0)

        self.assertEqual(DoorSeries.objects.count(), 1)
        self.assertEqual(DoorModel.objects.count(), 3)
        self.assertEqual(DoorColor.objects.count(), 3)
        self.assertEqual(DoorImage.objects.count(), self.file_count)

    def test_variant_is_taken_from_filename(self):
        call_command('import_door_catalog', self.source, verbosity=0)

        variants = set(DoorImage.objects.values_list('variant', flat=True))
        # И номер рисунка, и буквенный артикул, и артикул с названием модели.
        self.assertEqual(variants, {'1', '12', 'AC36', 'Torino TR 702'})

    def test_reimport_does_not_duplicate_rows_or_files(self):
        call_command('import_door_catalog', self.source, verbosity=0)
        first_files = self.stored_files()
        self.assertEqual(len(first_files), self.file_count)

        call_command('import_door_catalog', self.source, verbosity=0)

        self.assertEqual(DoorImage.objects.count(), self.file_count)
        # Storage не перезаписывает одноимённый файл, а дописывает суффикс:
        # без явного удаления старого media удваивался на каждом импорте.
        self.assertEqual(self.stored_files(), first_files)

    def test_reimport_refreshes_picture_content(self):
        call_command('import_door_catalog', self.source, verbosity=0)
        image = DoorImage.objects.get(variant='AC36')
        original_size = image.image.size

        # Фабрика прислала обновлённую картинку под тем же именем.
        from PIL import Image as PILImage

        path = os.path.join(self.source, 'Модерн', 'Alfa', 'Венге', 'AC36 - Венге.png')
        PILImage.new('RGB', (400, 800), (10, 20, 30)).save(path, format='PNG')

        call_command('import_door_catalog', self.source, verbosity=0)

        image.refresh_from_db()
        self.assertNotEqual(image.image.size, original_size)

    def test_series_folder_can_be_imported_directly(self):
        # Папка одной серии: «Модель/Цвет/файл», без уровня серии сверху.
        series_dir = os.path.join(self.source, 'Модерн')
        call_command('import_door_catalog', series_dir, verbosity=0)

        self.assertEqual(DoorSeries.objects.count(), 1)
        self.assertEqual(DoorSeries.objects.first().name, 'Модерн')
        self.assertEqual(DoorImage.objects.count(), self.file_count)

    def test_dry_run_writes_nothing(self):
        call_command('import_door_catalog', self.source, dry_run=True, verbosity=0)

        self.assertEqual(DoorImage.objects.count(), 0)
        self.assertEqual(DoorSeries.objects.count(), 0)
        self.assertEqual(self.stored_files(), [])
