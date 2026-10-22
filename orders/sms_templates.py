"""
SMS-шаблоны для уведомлений клиента/контактного лица по замеру (Фаза 5).

Каждая функция возвращает готовый текст сообщения. Отправка — через
`users.push_utils.send_sms_to_phone`. Помощник `public_pdf_url` собирает
публичную ссылку на PDF-бланк замера (доступен без авторизации по токену).
"""
from django.conf import settings


def _format_dt(value) -> str:
    """Дата+время замера в человекочитаемом виде."""
    if not value:
        return ''
    try:
        from django.utils import timezone
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        return local.strftime('%d.%m.%Y %H:%M')
    except Exception:  # noqa: BLE001
        return str(value)


def _base_url() -> str:
    return (getattr(settings, 'BASE_URL', '') or getattr(settings, 'FRONTEND_URL', '') or '').rstrip('/')


def public_pdf_url(measurement) -> str:
    """Полная публичная ссылка на PDF-бланк замера по client_access_token."""
    base = _base_url()
    path = f'/api/v1/public/measurements/{measurement.client_access_token}/pdf/'
    return f'{base}{path}' if base else path


def short_pdf_url(measurement) -> str:
    """Короткая ссылка /z/{код} на PDF-бланк (для SMS). Fallback — полная ссылка."""
    code = getattr(measurement, 'short_code', None)
    if not code:
        return public_pdf_url(measurement)
    base = _base_url()
    path = f'/z/{code}/'
    return f'{base}{path}' if base else path


def max_invite(client_phone) -> str:
    """
    Приглашение в бота MAX. Ссылка короткая, без телефона в ней (так SMS дешевле):
    после «Начать» бот сам попросит поделиться номером. Пусто, если бот не
    настроен или клиент уже подключён.
    """
    from django.conf import settings
    from maxbot.models import MaxContact
    from orders.serializers import normalize_phone

    bot_name = getattr(settings, 'MAX_BOT_NAME', '')
    if not bot_name:
        return ''
    link = f'https://max.ru/{bot_name}'
    if MaxContact.objects.filter(phone=normalize_phone(client_phone), is_active=True).exists():
        return ''
    return f' Уведомления о статусе заказа в MAX: {link}'


def request_created(sm_name: str, sm_phone: str, client_phone: str = '') -> str:
    """При взятии заявки СМ: клиенту обещаем звонок СМ в течение 2 раб. дней."""
    name = (sm_name or 'сервис-менеджер').strip()
    phone = (sm_phone or '').strip()
    tail = f' {phone}' if phone else ''
    return f'Вам позвонит {name}{tail} по замеру в течение 2 раб. дн.{max_invite(client_phone)}'


def measurement_scheduled(measurement_date) -> str:
    """При назначении даты замера."""
    return f'Замер назначен на {_format_dt(measurement_date)}'


def measurement_rescheduled(measurement_date) -> str:
    """При перепланировке замера на новую дату."""
    return f'Замер перенесён на {_format_dt(measurement_date)}'


def measurement_done(measurement) -> str:
    """При выполнении замера — короткая ссылка на PDF-бланк."""
    return f'Замер выполнен. Скачать: {short_pdf_url(measurement)}'


def call_failed(sm_name: str, sm_phone: str) -> str:
    """При недозвоне до клиента по замеру."""
    name = (sm_name or 'сервис-менеджер').strip()
    phone = (sm_phone or '').strip()
    tail = f', {phone}' if phone else ''
    return f'Мы не дозвонились по замеру. Перезвоните пожалуйста {name}{tail}'
