"""
Ссылка на бота с телефоном клиента: https://max.ru/<бот>?start=<payload>.

В payload телефон и подпись, чтобы по ссылке нельзя было подставить чужой
номер. Формат «79161234567_<16 hex>», укладывается в лимит MAX (128 символов).
"""
from django.conf import settings
from django.utils.crypto import constant_time_compare, salted_hmac

from orders.serializers import normalize_phone

_SALT = 'maxbot.start'


def _sign(digits: str) -> str:
    return salted_hmac(_SALT, digits).hexdigest()[:16]


def start_payload(phone) -> str:
    """Payload для диплинка; пустая строка, если номер не российский."""
    normalized = normalize_phone(phone)
    if not normalized:
        return ''
    digits = normalized[1:]
    return f'{digits}_{_sign(digits)}'


def phone_from_payload(payload) -> str | None:
    """Телефон +7XXXXXXXXXX из payload; None, если подпись не сходится."""
    digits, _, signature = (payload or '').partition('_')
    if not digits or not constant_time_compare(signature, _sign(digits)):
        return None
    return normalize_phone(digits)


def bot_link(phone) -> str:
    """Ссылка на бота для клиента; пустая, если бот не настроен."""
    bot_name = getattr(settings, 'MAX_BOT_NAME', '')
    payload = start_payload(phone)
    if not bot_name or not payload:
        return ''
    return f'https://max.ru/{bot_name}?start={payload}'
