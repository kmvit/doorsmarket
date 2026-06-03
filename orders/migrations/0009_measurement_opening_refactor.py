# Generated for Phase 3.5: разделение замера и КП

from django.db import migrations, models


def migrate_new_to_desired(apps, schema_editor):
    """Переносим значения старого «нового размера двери» в новое «желаемый размер двери»."""
    MeasurementOpening = apps.get_model('orders', 'MeasurementOpening')
    for op in MeasurementOpening.objects.all():
        op.desired_door_height = op.new_door_height
        op.desired_door_width = op.new_door_width
        op.save(update_fields=['desired_door_height', 'desired_door_width'])


def migrate_desired_to_new(apps, schema_editor):
    """Обратная миграция — копируем desired_* обратно в new_*."""
    MeasurementOpening = apps.get_model('orders', 'MeasurementOpening')
    for op in MeasurementOpening.objects.all():
        op.new_door_height = op.desired_door_height
        op.new_door_width = op.desired_door_width
        op.save(update_fields=['new_door_height', 'new_door_width'])


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_alter_order_status_measurement_measurementopening_and_more'),
    ]

    operations = [
        # Шаг 1: добавляем новые поля
        migrations.AddField(
            model_name='measurementopening',
            name='door_type',
            field=models.CharField(
                blank=True,
                choices=[('entrance', 'Входная'), ('interior', 'Межкомнатная'), ('other', 'Другое')],
                max_length=30,
                verbose_name='Тип двери',
            ),
        ),
        migrations.AddField(
            model_name='measurementopening',
            name='desired_door_height',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Желаемая высота двери'),
        ),
        migrations.AddField(
            model_name='measurementopening',
            name='desired_door_width',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Желаемая ширина двери'),
        ),
        # Шаг 2: переносим данные new_door_* → desired_door_*
        migrations.RunPython(migrate_new_to_desired, reverse_code=migrate_desired_to_new),
        # Шаг 3: удаляем устаревшие поля
        migrations.RemoveField(
            model_name='measurementopening',
            name='door_height_by_order',
        ),
        migrations.RemoveField(
            model_name='measurementopening',
            name='door_width_by_order',
        ),
        migrations.RemoveField(
            model_name='measurementopening',
            name='change_target',
        ),
        migrations.RemoveField(
            model_name='measurementopening',
            name='new_door_height',
        ),
        migrations.RemoveField(
            model_name='measurementopening',
            name='new_door_width',
        ),
    ]
