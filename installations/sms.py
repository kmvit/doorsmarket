"""
Уведомления клиенту по монтажу: тексты и отправка (MAX, если клиент
подключил бота, иначе SMS). На время теста отключаются флагом
INSTALLATIONS_SMS_ENABLED — тогда сообщение только пишется в историю.
"""
from django.conf import settings

from orders.models import ActivityKind

from .models import EventKind

BRAND = 'Академия Дверей.'


def _format_date(value):
    return value.strftime('%d.%m.%Y') if value else ''


def _contact(name, phone):
    name = (name or 'сервис-менеджер').strip()
    phone = (phone or '').strip()
    return f'{name}, {phone}' if phone else name


def staff_name_phone(user):
    if not user:
        return '', ''
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return name, (user.phone_number or '').strip()


def installation_scheduled(date_from, sm):
    return (f'{BRAND} По Вашему заказу запланирован монтаж на {_format_date(date_from)}. '
            f'Руководитель сервисной службы {_contact(*staff_name_phone(sm))}')


def installation_rescheduled(date_from, sm):
    return (f'{BRAND} Монтаж по Вашему заказу перенесён на {_format_date(date_from)}. '
            f'Руководитель сервисной службы {_contact(*staff_name_phone(sm))}')


def call_failed(sm):
    return (f'{BRAND} Мы не дозвонились до вас по монтажу. '
            f'Перезвоните пожалуйста {_contact(*staff_name_phone(sm))}')


def installer_call_failed(installer):
    return (f'{BRAND} Монтажник до вас не дозвонился по согласованию времени встречи. '
            f'Перезвоните пожалуйста {_contact(*staff_name_phone(installer))}')


def client_link(installation):
    """Короткая ссылка клиенту на страницу подписи акта."""
    from orders.sms_templates import _base_url
    return f'{_base_url()}/m/{installation.client_code}'


def act_sign_request(installation):
    return (f'{BRAND} Монтаж по вашему заказу завершен. Подпишите пожалуйста акт выполненных работ, '
            f'пройдя по ссылке {client_link(installation)}')


def act_rejected(installation, reason):
    return (f'{BRAND} Акт выполненных работ не принят: {reason}. Приложите пожалуйста подписанный акт '
            f'ещё раз по ссылке {client_link(installation)}')


def rating_request(installation):
    return (f'{BRAND} Монтаж по вашему заказу завершен. Оцените пожалуйста нашу работу, '
            f'пройдя по ссылке {client_link(installation)}')


def send(installation, message, *, actor=None, purpose=''):
    """
    Отправляет сообщение контактному лицу монтажа и пишет его в историю
    монтажа и журнал заказа. True — ушло или намеренно отключено (тест-режим).
    """
    from maxbot.sending import send_client_message

    phone = installation.contact_phone or installation.order.contact_phone
    enabled = getattr(settings, 'INSTALLATIONS_SMS_ENABLED', False)
    channel = None
    if enabled and phone:
        try:
            channel = send_client_message(phone, message)
        except Exception:  # noqa: BLE001
            channel = None
    meta = {'phone': phone or '', 'sms_ok': channel is not None, 'channel': channel or '',
            'suppressed': not enabled, 'purpose': purpose}
    note = ' (СМС по монтажу отключены — не отправлено)' if not enabled else (
        '' if channel else ' (не удалось отправить)')
    installation.log(EventKind.SMS_SENT, actor=actor, description=message[:480] + note, meta=meta)
    installation.order.log_activity(ActivityKind.SMS_SENT, actor=actor, description=message[:500],
                                    meta={**meta, 'installation_id': installation.id})
    return channel is not None or not enabled
