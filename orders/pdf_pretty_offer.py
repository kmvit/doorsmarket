"""
Генерация PDF красивого КП по шаблону Академии Дверей.

Шаблон — презентация 720×540 pt (10×7.5 дюйма, как исходный PDF), по слайду
на проём: обложка → проёмы → итоги. Размер страницы задан прямо в CSS
шаблона. Вёрстка в HTML, рендер WeasyPrint — тем же способом, что бланк
замера в `pdf_blank.py`.

Картинки отдаём абсолютными путями файловой системы: WeasyPrint читает их
как `file://…`, не ходя по сети.
"""
import os

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'static', 'orders', 'pretty_offer')

# Постоянные картинки шаблона: обложка, слайды «о компании» и контакты.
# Вырезаны из исходного PDF Академии, лежат рядом с шаблоном.
ASSET_FILES = {
    'wordmark': 'academy-wordmark.png',
    'logo_academy': 'logo-academy.png',
    'logo_academy_red': 'logo-academy-red.png',
    'logo_jaguar': 'logo-jaguar.png',
    'cover_door': 'cover-door.jpg',
    'cover_handle': 'cover-handle.png',
    'about_salon': 'about-salon.jpg',
    'about_moto': 'about-moto.jpg',
    'about_worker': 'about-worker.jpg',
    'about_folder': 'about-folder.jpg',
}


def _abs_path(filefield):
    """Абсолютный путь к существующему файлу либо None."""
    if not filefield:
        return None
    try:
        path = filefield.path
    except (ValueError, NotImplementedError):
        return None
    return path if path and os.path.exists(path) else None


def _side_image_path(custom_field, catalog_image):
    """Своя картинка менеджера в приоритете над каталожной."""
    return _abs_path(custom_field) or _abs_path(getattr(catalog_image, 'image', None))


def _door_size(order_item):
    """Размер полотна строкой: «2100 × 800» либо «2100 × 800 + 800»."""
    height, width = order_item.door_height, order_item.door_width
    if not height and not width:
        return ''
    width_text = order_item.door_width_parts or (str(width) if width else '')
    return ' × '.join(part for part in (str(height) if height else '', width_text) if part)


def build_context(offer):
    """Данные для шаблона: обложка, слайды по проёмам, итоги."""
    order = offer.order
    default_preset = offer.preset

    slides = []
    items = offer.items.select_related(
        'order_item', 'preset', 'front_image', 'front_image__door_model',
        'front_image__color', 'back_image', 'back_image__door_model', 'back_image__color',
    ).prefetch_related('attachments')

    for item in items:
        order_item = item.order_item
        preset = item.preset or default_preset
        slides.append({
            'item': item,
            'order_item': order_item,
            'opening_title': ' — '.join(
                part for part in (
                    f'Проём № {order_item.opening_number}', order_item.room_name,
                ) if part
            ),
            'model_name': order_item.model_name,
            'description': item.description,
            'size': _door_size(order_item),
            'opening_type': order_item.get_opening_type_display() or '',
            'front_path': _side_image_path(item.front_custom_image, item.front_image),
            'back_path': (
                _side_image_path(item.back_custom_image, item.back_image)
                if item.two_sided else None
            ),
            'header_lines': preset.header_lines() if preset else [],
            'included_lines': preset.included_lines() if preset else [],
            'feature_lines': preset.feature_lines() if preset else [],
            'extra_paths': [
                path for path in (
                    _abs_path(attachment.image) for attachment in item.attachments.all()
                ) if path
            ],
        })

    general_attachments = [
        path for path in (
            _abs_path(attachment.image)
            for attachment in offer.attachments.filter(offer_item__isnull=True)
        ) if path
    ]

    manager = order.manager
    manager_name = ''
    if manager:
        manager_name = f'{manager.first_name} {manager.last_name}'.strip() or manager.username

    salon = order.salon
    return {
        'offer': offer,
        'order': order,
        'slides': slides,
        'totals': offer.resolved_totals(),
        'general_attachments': general_attachments,
        'manager_name': manager_name,
        'salon_address': getattr(salon, 'address', '') or '',
        'salon_phone': getattr(salon, 'phone', '') or '',
        # Год на обложке — из даты КП, иначе текущий.
        'offer_year': (order.kp_date or timezone.localdate()).year,
        'assets': {
            key: os.path.join(ASSETS_DIR, filename)
            for key, filename in ASSET_FILES.items()
        },
        'wordmark_path': os.path.join(ASSETS_DIR, ASSET_FILES['wordmark']),
    }


def render_pretty_offer(offer) -> bytes:
    """Рендерит PDF красивого КП и возвращает его как bytes."""
    from weasyprint import HTML  # ленивый импорт, как в pdf_blank

    html = render_to_string('orders/pretty_offer.html', build_context(offer))
    return HTML(string=html, base_url=str(settings.MEDIA_ROOT)).write_pdf()
