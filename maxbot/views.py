"""
Вебхук бота MAX: принимает события и привязывает телефон клиента к диалогу.

MAX повторяет доставку при любом ответе кроме 200 (до 8 часов), поэтому
на всё, что не смогли разобрать, всё равно отвечаем 200.
"""
import logging
import re

from django.conf import settings
from django.http import Http404
from django.utils.crypto import constant_time_compare
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.serializers import normalize_phone

from . import api
from .links import phone_from_payload
from .models import MaxContact

logger = logging.getLogger(__name__)

TEXT_LINKED = 'Готово! Теперь уведомления по вашему заказу будут приходить сюда, а не по SMS.'
TEXT_ASK_CONTACT = ('Здравствуйте! Чтобы получать сюда уведомления по заказу, '
                    'поделитесь, пожалуйста, номером телефона, указанным в заказе.')
TEXT_NOT_OWN_CONTACT = 'Нужен ваш собственный номер — нажмите кнопку «Поделиться номером».'


class MaxWebhookView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, 'MAX_WEBHOOK_SECRET', '')
        if not secret or not api.is_enabled():
            raise Http404
        received = request.headers.get('X-Max-Bot-Api-Secret', '')
        if not constant_time_compare(received, secret):
            return Response(status=403)

        update = request.data if isinstance(request.data, dict) else {}
        handler = {
            'bot_started': _on_bot_started,
            'bot_stopped': _on_bot_stopped,
            'message_created': _on_message_created,
        }.get(update.get('update_type'))
        if handler:
            try:
                handler(update)
            except Exception:  # noqa: BLE001
                logger.exception('Ошибка обработки события MAX: %s', update.get('update_type'))
        return Response({'ok': True})


def _link(phone, chat_id, user):
    name = ' '.join(filter(None, [user.get('first_name'), user.get('last_name')])) or user.get('name') or ''
    contact, _ = MaxContact.objects.update_or_create(
        phone=phone,
        defaults={
            'chat_id': chat_id,
            'max_user_id': user.get('user_id') or 0,
            'name': name[:255],
            'is_active': True,
        },
    )
    logger.info('Номер %s привязан к диалогу MAX %s', phone, chat_id)
    return contact


def _reply(chat_id, text, attachments=None):
    try:
        api.send_message(chat_id, text, attachments=attachments)
    except api.MaxApiError as exc:
        logger.warning('Не удалось ответить в диалог MAX %s: %s', chat_id, exc)


def _on_bot_started(update):
    chat_id = update.get('chat_id')
    user = update.get('user') or {}
    phone = phone_from_payload(update.get('payload'))
    if phone:
        _link(phone, chat_id, user)
        _reply(chat_id, TEXT_LINKED)
    else:
        _reply(chat_id, TEXT_ASK_CONTACT, api.request_contact_keyboard())


def _on_bot_stopped(update):
    MaxContact.objects.filter(chat_id=update.get('chat_id')).update(is_active=False)


def _phone_from_vcf(vcf) -> str | None:
    match = re.search(r'^TEL[^:]*:(.+)$', vcf or '', re.MULTILINE)
    return normalize_phone(match.group(1)) if match else None


def _on_message_created(update):
    message = update.get('message') or {}
    sender = message.get('sender') or {}
    chat_id = (message.get('recipient') or {}).get('chat_id')
    if not chat_id or sender.get('is_bot'):
        return
    attachments = (message.get('body') or {}).get('attachments') or []
    contact = next((a.get('payload') or {} for a in attachments if a.get('type') == 'contact'), None)
    if contact is None:
        # Обычный текст: если номер ещё не привязан — снова просим контакт
        if not MaxContact.objects.filter(chat_id=chat_id, is_active=True).exists():
            _reply(chat_id, TEXT_ASK_CONTACT, api.request_contact_keyboard())
        return
    # Принимаем только свой контакт (кнопка «Поделиться номером»), не пересланный чужой
    owner_id = (contact.get('max_info') or {}).get('user_id')
    phone = _phone_from_vcf(contact.get('vcf_info'))
    if not phone or owner_id != sender.get('user_id'):
        _reply(chat_id, TEXT_NOT_OWN_CONTACT, api.request_contact_keyboard())
        return
    _link(phone, chat_id, sender)
    _reply(chat_id, TEXT_LINKED)
