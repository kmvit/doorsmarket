"""
Генерация PDF-бланка замера (Фаза 4).

WeasyPrint импортируется лениво (внутри функции), т.к. на старте процесса
библиотека подтягивает системные cairo/pango — это медленно и не нужно, пока
PDF реально не запросили. Путь к libs на macOS уже выставлен в settings.py.
"""
import os

from django.conf import settings
from django.template.loader import render_to_string

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif')


def _is_image(name: str) -> bool:
    return bool(name) and name.lower().endswith(IMAGE_EXTS)


def _abs_path(filefield):
    """Абсолютный путь к существующему файлу либо None."""
    try:
        path = filefield.path
    except (ValueError, NotImplementedError):
        return None
    return path if path and os.path.exists(path) else None


def render_measurement_blank(measurement) -> bytes:
    """Рендерит PDF-бланк замера и возвращает его как bytes."""
    from weasyprint import HTML  # ленивый импорт

    req = getattr(measurement, 'request', None)
    order = getattr(req, 'order', None) if req else None
    openings = list(measurement.openings.all().order_by('opening_number'))

    # Пометка «доработать проём»: рек. размеры проёма не совпадают с фактическими.
    # По высоте допускается отклонение до 10 мм включительно — доработка не требуется.
    for op in openings:
        op.needs_rework = bool(
            (op.recommended_opening_height and op.actual_height
             and abs(op.recommended_opening_height - op.actual_height) > 10)
            or (op.recommended_opening_width and op.actual_width
                and op.recommended_opening_width != op.actual_width)
        )

    # Фото-схемы по проёмам — только реально существующие изображения.
    opening_photos = []
    for op in openings:
        images = []
        for att in op.attachments.all():
            if att.file and _is_image(att.file.name):
                path = _abs_path(att.file)
                if path:
                    images.append(path)
        if images:
            opening_photos.append({'opening': op, 'images': images})

    # План открывания (из заявки) — только если это изображение и файл есть.
    plan_path = None
    if req and req.opening_plan and _is_image(req.opening_plan.name):
        plan_path = _abs_path(req.opening_plan)

    # Фото подписанного бланка (для уже подписанного замера).
    signature_path = None
    if measurement.signature_photo and _is_image(measurement.signature_photo.name):
        signature_path = _abs_path(measurement.signature_photo)

    sm = measurement.service_manager
    sm_name = ''
    if sm:
        sm_name = f'{sm.first_name} {sm.last_name}'.strip() or sm.username

    html = render_to_string('orders/measurement_blank.html', {
        'm': measurement,
        'order': order,
        'req': req,
        'openings': openings,
        'opening_photos': opening_photos,
        'plan_path': plan_path,
        'signature_path': signature_path,
        'sm_name': sm_name,
    })

    return HTML(string=html, base_url=str(settings.MEDIA_ROOT)).write_pdf()


def render_recommendations_blank(measurement) -> bytes:
    """
    Рендерит финальный PDF «Рекомендации по подготовке дверных проёмов».
    Формируется менеджером после обработки замера (is_processed).
    """
    from weasyprint import HTML  # ленивый импорт

    from .recommendations import build_recommendation_text

    req = getattr(measurement, 'request', None)
    order = getattr(req, 'order', None) if req else None
    openings = list(
        measurement.openings.select_related('order_item').order_by('opening_number')
    )

    rows = []
    for op in openings:
        item = op.order_item
        if item and (item.door_height or item.door_width):
            # Размеры берём из КП (позиции заказа) — независимо от замера.
            # Правки менеджера в рабочей форме КП автоматически попадают сюда.
            door_h = item.door_height
            door_w = item.door_width
            opening_h = item.recommended_opening_height or (door_h + 70 if door_h else None)
            opening_w = item.recommended_opening_width or (door_w + 100 if door_w else None)
        else:
            # Проём не привязан к позиции КП — фолбэк на данные замера
            door_h = op.recommended_door_height
            door_w = op.recommended_door_width
            opening_h = op.recommended_opening_height
            opening_w = op.recommended_opening_width
        rows.append({
            'op': op,
            'panel_name': item.model_name if item else '',
            'door_h': door_h,
            'door_w': door_w,
            'opening_h': opening_h,
            'opening_w': opening_w,
            'rec_text': build_recommendation_text(
                op.actual_height, op.actual_width, door_h, door_w,
            ),
        })

    html = render_to_string('orders/recommendations_blank.html', {
        'm': measurement,
        'order': order,
        'rows': rows,
    })

    return HTML(string=html, base_url=str(settings.MEDIA_ROOT)).write_pdf()
