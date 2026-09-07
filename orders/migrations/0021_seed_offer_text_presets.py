"""
Заводит текстовые блоки слайдов красивого КП по образцу
«КП Академия Дверей EVO.pdf»: покрытие EVO и комплект Secret.

Тексты в шаблоне фиксированные, но у разных покрытий разные, поэтому они
заводятся записями справочника — дальше менеджер правит их в админке,
не трогая код и шаблон.
"""
from django.db import migrations

PRESETS = [
    {
        'name': 'EVO',
        'is_default': True,
        'position': 0,
        'header_text': (
            'Искусственное покрытие EVO\n'
            'современное решение для мебели и интерьеров'
        ),
        'included_text': '\n'.join([
            'Полотно глухое высота 2000/2100 мм',
            'Короб компланарный',
            'Наличник прямой 90 мм с 1-ой стороны',
            'Без добора',
            'Петли карточные — 2 шт.',
            'Защёлка магнитная (пр-во Италия)',
        ]),
        'features_text': '\n'.join([
            'Искусственное покрытие EVO',
            'Толщина полотна 40 мм',
            'Фабричная врезка под фурнитуру',
            'Большой выбор стандартных цветов',
            'Не боится влаги и солнечного света',
            'Износостойкое покрытие',
            'Можно рисовать детскими фломастерами',
        ]),
    },
    {
        'name': 'Secret',
        'is_default': False,
        'position': 1,
        'header_text': 'Покрытие грунт (под отделку)',
        'included_text': '\n'.join([
            'Полотно глухое высота 2000/2100 мм',
            'Короб алюминиевый Secret (цвет матовый хром)',
            'Полотно без алюминиевой кромки',
            'Петли скрытые (пр-во Италия) — 2 шт.',
            'Защёлка магнитная (пр-во Италия)',
        ]),
        'features_text': '\n'.join([
            'Покрытие грунт (под отделку)',
            'Толщина полотна 40 мм',
            'Фабричная врезка под фурнитуру',
        ]),
    },
]


def create_presets(apps, schema_editor):
    OfferTextPreset = apps.get_model('orders', 'OfferTextPreset')
    for preset in PRESETS:
        OfferTextPreset.objects.get_or_create(
            name=preset['name'], defaults={k: v for k, v in preset.items() if k != 'name'},
        )


def delete_presets(apps, schema_editor):
    OfferTextPreset = apps.get_model('orders', 'OfferTextPreset')
    OfferTextPreset.objects.filter(name__in=[p['name'] for p in PRESETS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0020_offertextpreset_prettyoffer_prettyofferitem_and_more'),
    ]

    operations = [migrations.RunPython(create_presets, delete_presets)]
