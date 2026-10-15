from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from maxbot import api
from maxbot.links import bot_link, phone_from_payload, start_payload
from maxbot.models import MaxContact
from maxbot.sending import CHANNEL_MAX, CHANNEL_SMS, send_client_message

SECRET = 'test_secret_123'
URL = '/api/v1/max/webhook/'


class LinksTest(TestCase):
    def test_payload_roundtrip(self):
        payload = start_payload('8 (916) 123-45-67')
        self.assertTrue(payload.startswith('79161234567_'))
        self.assertLessEqual(len(payload), 128)
        self.assertEqual(phone_from_payload(payload), '+79161234567')

    def test_forged_payload_rejected(self):
        payload = start_payload('+79161234567')
        forged = '79990000000' + payload[payload.index('_'):]
        self.assertIsNone(phone_from_payload(forged))
        self.assertIsNone(phone_from_payload(''))
        self.assertIsNone(phone_from_payload(None))

    @override_settings(MAX_BOT_NAME='doors_bot')
    def test_bot_link(self):
        self.assertTrue(bot_link('+79161234567').startswith('https://max.ru/doors_bot?start=79161234567_'))
        self.assertEqual(bot_link('123'), '')

    @override_settings(MAX_BOT_NAME='')
    def test_bot_link_not_configured(self):
        self.assertEqual(bot_link('+79161234567'), '')


@override_settings(MAX_BOT_TOKEN='token', MAX_WEBHOOK_SECRET=SECRET)
@patch('maxbot.api.send_message')
class WebhookTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _post(self, update, secret=SECRET):
        return self.client.post(URL, update, format='json', HTTP_X_MAX_BOT_API_SECRET=secret)

    def _user(self, user_id=42):
        return {'user_id': user_id, 'first_name': 'Иван', 'last_name': 'Петров', 'is_bot': False}

    def test_wrong_secret(self, send):
        resp = self._post({'update_type': 'bot_started'}, secret='nope')
        self.assertEqual(resp.status_code, 403)

    @override_settings(MAX_BOT_TOKEN='')
    def test_disabled_without_token(self, send):
        self.assertEqual(self._post({'update_type': 'bot_started'}).status_code, 404)

    def test_bot_started_with_payload_links_phone(self, send):
        resp = self._post({
            'update_type': 'bot_started', 'timestamp': 1, 'chat_id': 555,
            'user': self._user(), 'payload': start_payload('+79161234567'),
        })
        self.assertEqual(resp.status_code, 200)
        contact = MaxContact.objects.get(phone='+79161234567')
        self.assertEqual((contact.chat_id, contact.max_user_id, contact.name), (555, 42, 'Иван Петров'))
        self.assertTrue(contact.is_active)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0], 555)

    def test_bot_started_without_payload_asks_contact(self, send):
        self._post({'update_type': 'bot_started', 'timestamp': 1, 'chat_id': 555, 'user': self._user()})
        self.assertFalse(MaxContact.objects.exists())
        attachments = send.call_args.kwargs['attachments']
        self.assertEqual(attachments[0]['payload']['buttons'][0][0]['type'], 'request_contact')

    def _contact_message(self, owner_id, sender_id=42, phone='+7 916 123-45-67'):
        return {
            'update_type': 'message_created', 'timestamp': 1,
            'message': {
                'sender': self._user(sender_id),
                'recipient': {'chat_id': 555, 'chat_type': 'dialog'},
                'timestamp': 1,
                'body': {'mid': 'm1', 'seq': 1, 'text': '', 'attachments': [{
                    'type': 'contact',
                    'payload': {
                        'vcf_info': f'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Иван\r\nTEL;TYPE=cell:{phone}\r\nEND:VCARD',
                        'max_info': self._user(owner_id),
                    },
                }]},
            },
        }

    def test_own_contact_links_phone(self, send):
        self._post(self._contact_message(owner_id=42))
        self.assertEqual(MaxContact.objects.get(phone='+79161234567').chat_id, 555)

    def test_foreign_contact_ignored(self, send):
        self._post(self._contact_message(owner_id=99))
        self.assertFalse(MaxContact.objects.exists())

    def test_bot_stopped_deactivates(self, send):
        MaxContact.objects.create(phone='+79161234567', chat_id=555, max_user_id=42)
        self._post({'update_type': 'bot_stopped', 'timestamp': 1, 'chat_id': 555, 'user': self._user()})
        self.assertFalse(MaxContact.objects.get().is_active)

    def test_handler_error_still_200(self, send):
        send.side_effect = RuntimeError('boom')
        resp = self._post({
            'update_type': 'bot_started', 'timestamp': 1, 'chat_id': 555,
            'user': self._user(), 'payload': start_payload('+79161234567'),
        })
        self.assertEqual(resp.status_code, 200)


@patch('users.push_utils.send_sms_to_phone', return_value=True)
@patch('maxbot.api.send_message')
class SendClientMessageTest(TestCase):
    def setUp(self):
        self.contact = MaxContact.objects.create(phone='+79161234567', chat_id=555, max_user_id=42)

    @override_settings(MAX_BOT_TOKEN='token')
    def test_linked_phone_goes_to_max(self, send, sms):
        self.assertEqual(send_client_message('8 916 123 45 67', 'Замер назначен'), CHANNEL_MAX)
        send.assert_called_once_with(555, 'Замер назначен')
        sms.assert_not_called()

    @override_settings(MAX_BOT_TOKEN='token')
    def test_unlinked_phone_goes_to_sms(self, send, sms):
        self.assertEqual(send_client_message('+79990000000', 'текст'), CHANNEL_SMS)
        send.assert_not_called()

    @override_settings(MAX_BOT_TOKEN='')
    def test_bot_disabled_goes_to_sms(self, send, sms):
        self.assertEqual(send_client_message('+79161234567', 'текст'), CHANNEL_SMS)
        send.assert_not_called()

    @override_settings(MAX_BOT_TOKEN='token')
    def test_blocked_bot_falls_back_and_unlinks(self, send, sms):
        send.side_effect = api.MaxApiError(403, 'chat.denied')
        self.assertEqual(send_client_message('+79161234567', 'текст'), CHANNEL_SMS)
        self.contact.refresh_from_db()
        self.assertFalse(self.contact.is_active)

    @override_settings(MAX_BOT_TOKEN='token')
    def test_network_error_falls_back_keeps_link(self, send, sms):
        send.side_effect = api.MaxApiError(0, 'network')
        self.assertEqual(send_client_message('+79161234567', 'текст'), CHANNEL_SMS)
        self.contact.refresh_from_db()
        self.assertTrue(self.contact.is_active)

    def test_nothing_sent(self, send, sms):
        sms.return_value = False
        self.assertIsNone(send_client_message('+79990000000', 'текст'))
        self.assertIsNone(send_client_message('', 'текст'))
