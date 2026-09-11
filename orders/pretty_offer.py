"""
Сборка красивого КП по заказу.

Разделение обязанностей такое: заказ хранит то, что распарсили из КП фабрики,
и его мы не трогаем; всё, что менеджер добавил или поправил для клиентской
версии, живёт в `PrettyOffer` и переживает повторную сборку.

Картинки дверей подбирает `catalog.matching` по полю «Модель полотна». Что не
подобралось — не выдумываем: проём помечается как требующий уточнения, и
менеджер выбирает модель, цвет и вариант руками (п.5 ТЗ).
"""
import os

from django.core.files.base import ContentFile
from django.db import transaction

from catalog.matching import build_index, match_model_name

from .models import (
    MeasurementAttachment,
    OfferTextPreset,
    OrderAttachment,
    PrettyOffer,
    PrettyOfferAttachment,
    PrettyOfferItem,
)

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp')


def _is_image(name: str) -> bool:
    return bool(name) and name.lower().endswith(IMAGE_EXTS)


@transaction.atomic
def build_or_refresh(order, actor=None) -> PrettyOffer:
    """
    Создаёт красивое КП по заказу или обновляет уже созданное.

    Повторный вызов подтягивает новые проёмы заказа и пробует подобрать
    картинки тем, у кого их ещё нет. Выбор менеджера — картинки, описания,
    правки сумм — не перезаписывается никогда.
    """
    offer, created = PrettyOffer.objects.get_or_create(
        order=order,
        defaults={'created_by': actor, 'preset': OfferTextPreset.get_default()},
    )

    existing = {item.order_item_id: item for item in offer.items.all()}
    order_items = list(order.items.all())

    for position, order_item in enumerate(order_items):
        item = existing.pop(order_item.pk, None)
        if item is None:
            item = PrettyOfferItem.objects.create(
                offer=offer, order_item=order_item, position=position,
            )
        elif item.position != position:
            item.position = position
            item.save(update_fields=['position'])

    # Позиции, удалённые из заказа (например, при замене КП), убираем и здесь.
    for orphan in existing.values():
        orphan.delete()

    match_missing_images(offer)
    return offer


def match_missing_images(offer: PrettyOffer) -> int:
    """
    Подбирает картинки тем проёмам, где их ещё нет. Возвращает число проёмов,
    которым картинку удалось подобрать.
    """
    items = [
        item for item in offer.items.select_related('order_item').all()
        if item.needs_clarification
    ]
    if not items:
        return 0

    index = build_index()
    matched = 0
    for item in items:
        result = match_model_name(item.order_item.model_name, index)
        fields = []
        if not item.front_image_url and result.front.image_pk:
            item.front_image_id = result.front.image_pk
            fields.append('front_image')
        if result.two_sided and not item.two_sided:
            item.two_sided = True
            fields.append('two_sided')
        if result.back and not item.back_image_url and result.back.image_pk:
            item.back_image_id = result.back.image_pk
            fields.append('back_image')
        if fields:
            item.save(update_fields=fields)
        if not item.needs_clarification:
            matched += 1
    return matched


def apply_color_to_items(offer: PrettyOffer, color_id: int) -> dict:
    """
    Проставляет выбранный цвет всем проёмам, где картинка ещё не подобрана.

    В КП фабрики цвет полотна не указан вовсе, зато внутри одного заказа он,
    как правило, один на все двери. Поэтому менеджер выбирает цвет один раз,
    а мы разносим его по остальным проёмам — но только там, где сомнений нет:
    модель узнана и полотно определяется однозначно. Уже выбранное менеджером
    не трогаем никогда.

    Оборот двусторонней двери не заполняем: он для того и двусторонний, что
    отделка сторон разная.
    """
    index = build_index()
    result = {'filled': 0, 'no_model': 0, 'color_unavailable': 0, 'variant_ambiguous': 0}

    for item in offer.items.select_related('order_item').all():
        if item.front_image_url:
            continue

        side = match_model_name(item.order_item.model_name, index).front
        if side.model is None:
            result['no_model'] += 1
            continue

        variants = index.variants_for(side.model.pk, color_id)
        if not variants:
            result['color_unavailable'] += 1
            continue

        variant = side.variant if side.variant in variants else ''
        if not variant and len(variants) == 1:
            variant = next(iter(variants))
        if not variant:
            result['variant_ambiguous'] += 1
            continue

        item.front_image_id = variants[variant]
        item.save(update_fields=['front_image'])
        result['filled'] += 1

    return result


def clarification_items(offer: PrettyOffer):
    """
    Проёмы, по которым нужно уточнить модель и цвет, вместе с тем, что удалось
    распознать, — данные для окна уточнения (п.5 ТЗ).
    """
    items = [
        item for item in offer.items.select_related('order_item').all()
        if item.needs_clarification
    ]
    if not items:
        return []

    index = build_index()
    return [
        {
            'offer_item_id': item.pk,
            'opening_number': item.order_item.opening_number,
            'room_name': item.order_item.room_name,
            'model_name': item.order_item.model_name,
            'match': match_model_name(item.order_item.model_name, index).to_dict(),
        }
        for item in items
    ]


def available_source_images(order):
    """
    Картинки, которые менеджер может подтянуть в КП из уже вложенного в заказ
    (п.11 ТЗ): вложения заказа и его позиций, вложения замера и его проёмов.
    """
    sources = []

    for attachment in OrderAttachment.objects.filter(order=order).select_related('order_item'):
        if not _is_image(attachment.file.name):
            continue
        if attachment.order_item_id:
            where = f'Проём {attachment.order_item.opening_number}'
        else:
            where = 'Заказ'
        sources.append({
            'kind': 'order_attachment',
            'id': attachment.pk,
            'name': attachment.name or os.path.basename(attachment.file.name),
            'url': attachment.file.url,
            'source': where,
        })

    measurement_attachments = MeasurementAttachment.objects.filter(
        measurement__request__order=order
    ).select_related('opening')
    for attachment in measurement_attachments:
        if not _is_image(attachment.file.name):
            continue
        where = 'Замер'
        if attachment.opening_id:
            where = f'Замер, проём {attachment.opening.opening_number}'
        sources.append({
            'kind': 'measurement_attachment',
            'id': attachment.pk,
            'name': attachment.name or os.path.basename(attachment.file.name),
            'url': attachment.file.url,
            'source': where,
        })

    return sources


def copy_source_image(offer: PrettyOffer, kind: str, source_id: int, *, offer_item=None, caption=''):
    """
    Копирует вложение заказа или замера в картинки КП.

    Именно копирует, а не ссылается: исходное вложение могут удалить или
    заменить, а уже согласованное с клиентом КП должно остаться прежним.
    """
    model = {
        'order_attachment': OrderAttachment,
        'measurement_attachment': MeasurementAttachment,
    }.get(kind)
    if model is None:
        raise ValueError(f'Неизвестный источник картинки: {kind}')

    source = model.objects.get(pk=source_id)
    if not _is_image(source.file.name):
        raise ValueError('Вложение не является картинкой')

    last = offer.attachments.filter(offer_item=offer_item).order_by('-position').first()
    attachment = PrettyOfferAttachment(
        offer=offer,
        offer_item=offer_item,
        caption=caption or source.name or '',
        position=(last.position + 1) if last else 0,
    )
    with source.file.open('rb') as fh:
        attachment.image.save(
            os.path.basename(source.file.name), ContentFile(fh.read()), save=False,
        )
    attachment.save()
    return attachment
