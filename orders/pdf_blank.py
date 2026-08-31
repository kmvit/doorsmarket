"""
Генерация PDF-бланка замера (Фаза 4).

WeasyPrint импортируется лениво (внутри функции), т.к. на старте процесса
библиотека подтягивает системные cairo/pango — это медленно и не нужно, пока
PDF реально не запросили. Путь к libs на macOS уже выставлен в settings.py.
"""
import os

from django.conf import settings
from django.template.loader import render_to_string

IMAGE_EXTS = (
    '.jpg', '.jpeg', '.jfif', '.jpe', '.png', '.gif', '.webp', '.bmp',
    '.heic', '.heif', '.avif',
)


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

    # Столбец «Доработать размеры проёмов»: допускается отклонение факта от
    # рекомендуемого до 10 мм включительно; если фактические размеры не сняты,
    # но рекомендуемый проём задан — «Привести размеры проёма к рекомендованным».
    from .recommendations import opening_rework_text
    for op in openings:
        op.rework_text = opening_rework_text(
            op.actual_height, op.actual_width,
            op.recommended_opening_height, op.recommended_opening_width,
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

    # Планы открывания (из заявки) — их может быть несколько. Берём только
    # существующие изображения: PDF-файлы в бланк не вставить.
    plan_paths = []
    if req:
        candidates = []
        if req.opening_plan:
            candidates.append(req.opening_plan)
        candidates.extend(f.file for f in req.files.all())
        for f in candidates:
            if _is_image(f.name):
                path = _abs_path(f)
                if path:
                    plan_paths.append(path)

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
        'plan_paths': plan_paths,
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
        # Двустворчатая: ширину полотен показываем суммой («800 + 800»)
        door_w_text = ''
        if item and (item.door_width_parts or '').strip():
            door_w_text = item.door_width_parts
        elif (op.recommended_door_width_parts or '').strip():
            door_w_text = op.recommended_door_width_parts
        # Открывание — тоже из КП: менеджер мог поменять его после замера
        if item and item.opening_type:
            opening_type_display = item.get_opening_type_display()
        else:
            opening_type_display = op.get_opening_type_display() if op.opening_type else ''
        rows.append({
            'op': op,
            'opening_type_display': opening_type_display,
            'panel_name': item.model_name if item else '',
            'door_h': door_h,
            'door_w': door_w,
            'door_w_text': door_w_text,
            'opening_h': opening_h,
            'opening_w': opening_w,
            'rec_text': build_recommendation_text(
                op.actual_height, op.actual_width, door_h, door_w, op.door_type,
                opening_h, opening_w,
            ),
        })

    html = render_to_string('orders/recommendations_blank.html', {
        'm': measurement,
        'order': order,
        'rows': rows,
    })

    return HTML(string=html, base_url=str(settings.MEDIA_ROOT)).write_pdf()
