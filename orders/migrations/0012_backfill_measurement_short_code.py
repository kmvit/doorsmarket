from django.db import migrations


def backfill_short_codes(apps, schema_editor):
    Measurement = apps.get_model('orders', 'Measurement')
    from orders.models import generate_short_code
    existing = set(
        Measurement.objects.exclude(short_code__isnull=True).values_list('short_code', flat=True)
    )
    for m in Measurement.objects.filter(short_code__isnull=True):
        code = generate_short_code()
        while code in existing:
            code = generate_short_code()
        existing.add(code)
        m.short_code = code
        m.save(update_fields=['short_code'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_measurement_short_code'),
    ]

    operations = [
        migrations.RunPython(backfill_short_codes, noop),
    ]
