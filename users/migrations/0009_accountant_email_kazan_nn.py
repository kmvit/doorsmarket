from django.db import migrations

# Бухгалтер по монтажам Казани и Нижнего Новгорода (решение заказчика 23.10.2026).
# У остальных городов адрес заполняют в админке.
ACCOUNTANT_EMAIL = 'oplata-academy@yandex.ru'
CITIES = ['Казань', 'Нижний Новгород']


def fill(apps, schema_editor):
    City = apps.get_model('users', 'City')
    City.objects.filter(name__in=CITIES, accountant_email='').update(accountant_email=ACCOUNTANT_EMAIL)


class Migration(migrations.Migration):
    dependencies = [('users', '0008_city_accountant_email')]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
