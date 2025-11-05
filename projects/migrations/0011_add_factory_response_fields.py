# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0010_make_manager_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='complaint',
            name='factory_reject_reason',
            field=models.TextField(blank=True, verbose_name='Причина отказа фабрики'),
        ),
        migrations.AddField(
            model_name='complaint',
            name='dispute_arguments',
            field=models.TextField(blank=True, verbose_name='Аргументы спора с фабрикой'),
        ),
    ]

