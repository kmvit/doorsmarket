"""
Уведомление клиенту: сначала MAX, если клиент подключил бота, иначе SMS.
"""
import logging

from . import api

logger = logging.getLogger(__name__)

CHANNEL_MAX = 'max'
CHANNEL_SMS = 'sms'


def send_via_max(phone, message) -> bool:
    """В MAX, если номер привязан к боту. Остановленный бот снимает привязку."""
    from orders.serializers import normalize_phone
    from .models import MaxContact

    if not api.is_enabled():
        return False
    normalized = normalize_phone(phone)
    if not normalized:
        return False
    contact = MaxContact.objects.filter(phone=normalized, is_active=True).first()
    if not contact:
        return False
    try:
        api.send_message(contact.chat_id, message)
    except api.MaxApiError as exc:
        if exc.status == 403:
            # Клиент остановил бота или удалил диалог — дальше шлём SMS
            contact.is_active = False
            contact.save(update_fields=['is_active', 'updated_at'])
        logger.warning('Не удалось отправить в MAX на %s: %s', normalized, exc)
        return False
    logger.info('Сообщение отправлено в MAX на номер %s', normalized)
    return True


def send_client_message(phone, message) -> str | None:
    """
    Отправляет уведомление клиенту. Возвращает канал, которым ушло
    (CHANNEL_MAX / CHANNEL_SMS), или None, если не ушло никак.
    """
    from users.push_utils import send_sms_to_phone

    if not phone:
        return None
    if send_via_max(phone, message):
        return CHANNEL_MAX
    if send_sms_to_phone(phone, message):
        return CHANNEL_SMS
    return None
