"""
Количество позиции комплектации переезжает в отдельную связь.

Раньше связь проёма с сопутствующей позицией была обычной M2M, и в КП
печаталось количество из самой позиции заказа — общее на весь заказ («петли
12 шт.»). На слайде проёма нужно столько, сколько уходит в этот проём, а это
знает только менеджер, — поэтому количество теперь хранится в связи.

Автосвязь в `through` Django на месте не переделывает, отсюда ручной порядок:
создать модель связи → перенести выбранное → снять старое поле → добавить
новое с `through`.
"""
import django.db.models.deletion
from django.db import migrations, models


def copy_addons(apps, schema_editor):
    """
    Переносит уже выбранные позиции в новую связь.

    Количество берём из позиции заказа: именно оно печаталось в КП до сих пор,
    и молча менять уже согласованные предложения нельзя. Дальше менеджер
    поправит его руками.
    """
    PrettyOfferItem = apps.get_model('orders', 'PrettyOfferItem')
    Link = apps.get_model('orders', 'PrettyOfferItemAddon')
    OldLink = PrettyOfferItem.addons.through

    positions = {}
    rows = []
    for old in OldLink.objects.select_related('orderaddon').order_by('id'):
        position = positions.get(old.prettyofferitem_id, 0)
        positions[old.prettyofferitem_id] = position + 1
        rows.append(Link(
            offer_item_id=old.prettyofferitem_id,
            addon_id=old.orderaddon_id,
            quantity=old.orderaddon.quantity,
            position=position,
        ))
    Link.objects.bulk_create(rows, batch_size=500)


def restore_addons(apps, schema_editor):
    """Откат: возвращаем связи без количеств — хранить их будет негде."""
    PrettyOfferItem = apps.get_model('orders', 'PrettyOfferItem')
    Link = apps.get_model('orders', 'PrettyOfferItemAddon')
    OldLink = PrettyOfferItem.addons.through

    OldLink.objects.bulk_create(
        [
            OldLink(prettyofferitem_id=link.offer_item_id, orderaddon_id=link.addon_id)
            for link in Link.objects.all()
        ],
        batch_size=500,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0027_alter_offertextpreset_features_text_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PrettyOfferItemAddon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=2, default=1, help_text='Сколько уходит в этот проём. Дробные значения поддерживаются.', max_digits=10, verbose_name='Количество')),
                ('position', models.PositiveSmallIntegerField(default=0, verbose_name='Порядок')),
                ('addon', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pretty_offer_links', to='orders.orderaddon', verbose_name='Позиция заказа')),
                ('offer_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='item_addons', to='orders.prettyofferitem', verbose_name='Проём КП')),
            ],
            options={
                'verbose_name': 'Позиция комплектации проёма',
                'verbose_name_plural': 'Позиции комплектации проёма',
                'ordering': ['position', 'id'],
            },
        ),
        migrations.RunPython(copy_addons, restore_addons),
        migrations.RemoveField(
            model_name='prettyofferitem',
            name='addons',
        ),
        migrations.AddField(
            model_name='prettyofferitem',
            name='addons',
            field=models.ManyToManyField(blank=True, help_text='Сопутствующие позиции заказа, которые показать на слайде проёма.', related_name='pretty_offer_items', through='orders.PrettyOfferItemAddon', to='orders.orderaddon', verbose_name='Позиции комплектации'),
        ),
        migrations.AddConstraint(
            model_name='prettyofferitemaddon',
            constraint=models.UniqueConstraint(fields=('offer_item', 'addon'), name='orders_prettyofferitemaddon_unique_addon'),
        ),
    ]
