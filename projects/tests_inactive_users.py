"""
Уволенный сотрудник: в админке снимают «Активен», а его записи остаются.

Выключенному не уходят push и SMS, его нельзя выбрать заново и он не
подставляется автоматически, но в старых рекламациях он остаётся, как был.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_inactive_users
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import serializers

from projects.models import Complaint, ComplaintReason, ProductionSite
from projects.serializers import keep_or_active
from users.models import City
from users.push_utils import send_push_notification, send_sms_notification

User = get_user_model()


class InactiveUserTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.fired = User.objects.create_user(
            username='fired', password='x', role='manager', city=self.city,
            phone_number='+79270000001', is_active=False,
        )
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=self.city)

    def _complaint(self, manager):
        return Complaint.objects.create(
            initiator=manager, recipient=manager, manager=manager,
            production_site=ProductionSite.objects.create(name='Фабрика'),
            reason=ComplaintReason.objects.create(name='Брак'),
            order_number='1', client_name='Клиент', address='Адрес',
            contact_person='Клиент', contact_phone='+79270000000',
        )

    @override_settings(VAPID_PUBLIC_KEY='pub', VAPID_PRIVATE_KEY='priv', SMS_RU_API_ID='id')
    @patch('users.push_utils.requests.get')
    def test_no_push_or_sms_to_inactive(self, sms_get):
        self.assertFalse(send_push_notification(user=self.fired, title='t', body='b'))
        self.assertFalse(send_sms_notification(user=self.fired, message='m'))
        sms_get.assert_not_called()

    def test_inactive_cannot_be_chosen_anew(self):
        new_record = SimpleNamespace(instance=None)
        with self.assertRaises(serializers.ValidationError):
            keep_or_active(new_record, self.fired, 'manager')
        self.assertEqual(keep_or_active(new_record, self.manager, 'manager'), self.manager)

    def test_inactive_can_stay_on_old_record(self):
        complaint = self._complaint(self.fired)
        self.assertEqual(keep_or_active(SimpleNamespace(instance=complaint), self.fired, 'manager'), self.fired)

    def test_inactive_service_manager_not_auto_assigned(self):
        User.objects.create_user(username='sm_fired', password='x', role='service_manager',
                                 city=self.city, is_active=False)
        sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.city)
        complaint = self._complaint(self.manager)
        self.assertEqual(complaint._get_service_manager(), sm)

    def test_records_survive_deactivation(self):
        complaint = self._complaint(self.manager)
        self.manager.is_active = False
        self.manager.save()
        complaint.refresh_from_db()
        self.assertEqual(complaint.manager, self.manager)
