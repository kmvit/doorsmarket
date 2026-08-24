"""
Вложения-картинки, ранее сохранённые как «Документ».

Тип вложения рекламации вычисляется при загрузке и хранится в БД, поэтому
файлы с расширениями, которых не было в списке картинок (в первую очередь
.jfif — так JPEG сохраняют Windows и Chrome), остались помечены документами
и не показывались как фото. Проставляем им «Фото» задним числом.
"""
from django.db import migrations
from django.db.models import Q

# Расширения, добавленные в распознавание картинок
NEW_IMAGE_EXTS = ('.jfif', '.jpe', '.bmp', '.heic', '.heif', '.avif')


def mark_images_as_photo(apps, schema_editor):
    ComplaintAttachment = apps.get_model('projects', 'ComplaintAttachment')
    condition = Q()
    for ext in NEW_IMAGE_EXTS:
        condition |= Q(file__iendswith=ext)
    # Только «документы»: коммерческие предложения и уже размеченные фото не трогаем
    ComplaintAttachment.objects.filter(condition, attachment_type='document').update(
        attachment_type='photo',
    )


def noop(apps, schema_editor):
    """Обратной миграции нет: исходный тип файла восстановить неоткуда."""


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0023_complaint_moscow_service_at_and_more'),
    ]

    operations = [
        migrations.RunPython(mark_images_as_photo, noop),
    ]
