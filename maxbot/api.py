"""
Обёртка над MAX Bot API (https://dev.max.ru/docs-api).

Токен бота — settings.MAX_BOT_TOKEN. Пустой токен означает, что бот выключен:
`is_enabled()` вернёт False, и уведомления идут по SMS, как раньше.
"""
import logging
import os
import tempfile

import certifi
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_URL = 'https://platform-api2.max.ru'
TIMEOUT = 10

# Сертификат MAX выдан УЦ Минцифры (Russian Trusted Root CA) — его нет ни в
# certifi, ни в системном хранилище сервера. Проверяем по certifi + этому корню;
# срок корня — до 2032 года. Остальные запросы проекта (sms.ru и т. п.) не трогаем.
RUSSIAN_ROOT_CA = os.path.join(os.path.dirname(__file__), 'certs', 'russian_trusted_root_ca.crt')
_ca_bundle = None


def _ca_bundle_path():
    global _ca_bundle
    if _ca_bundle is None or not os.path.exists(_ca_bundle):
        with open(certifi.where()) as base, open(RUSSIAN_ROOT_CA) as extra:
            content = base.read() + '\n' + extra.read()
        fd, path = tempfile.mkstemp(prefix='maxbot-ca-', suffix='.pem')
        with os.fdopen(fd, 'w') as bundle:
            bundle.write(content)
        _ca_bundle = path
    return _ca_bundle


class MaxApiError(Exception):
    def __init__(self, status, code='', message=''):
        super().__init__(f'{status} {code}: {message}')
        self.status = status
        self.code = code


def is_enabled() -> bool:
    return bool(getattr(settings, 'MAX_BOT_TOKEN', ''))


def _request(method, path, *, params=None, json=None):
    try:
        response = requests.request(
            method, f'{API_URL}{path}',
            params=params, json=json,
            headers={'Authorization': settings.MAX_BOT_TOKEN},
            timeout=TIMEOUT,
            verify=_ca_bundle_path(),
        )
    except requests.exceptions.RequestException as exc:
        raise MaxApiError(0, 'network', str(exc)) from exc
    if response.status_code != 200:
        try:
            body = response.json()
        except ValueError:
            body = {}
        raise MaxApiError(response.status_code, body.get('code', ''), body.get('message', response.text[:200]))
    try:
        return response.json()
    except ValueError:
        return {}


def send_message(chat_id, text, *, attachments=None):
    """Сообщение в диалог. Ошибки — MaxApiError (403: клиент остановил бота)."""
    body = {'text': text}
    if attachments:
        body['attachments'] = attachments
    return _request('POST', '/messages', params={'chat_id': chat_id}, json=body)


def request_contact_keyboard(text='Поделиться номером'):
    """Кнопка, по которой клиент отправляет боту свой контакт с телефоном."""
    return [{
        'type': 'inline_keyboard',
        'payload': {'buttons': [[{'type': 'request_contact', 'text': text}]]},
    }]


def get_me():
    return _request('GET', '/me')


def get_subscriptions():
    return _request('GET', '/subscriptions')


def subscribe(url, secret, update_types):
    return _request('POST', '/subscriptions', json={
        'url': url, 'secret': secret, 'update_types': update_types,
    })


def unsubscribe(url):
    return _request('DELETE', '/subscriptions', params={'url': url})
