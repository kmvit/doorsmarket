"""
СМ «только замеры» (галочка у пользователя): замеры как у обычного СМ,
рекламаций, отгрузки и возвратов не видит, рекламации ему не назначаются.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_measurements_only
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import serializers
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest, Order, Salon
from projects.models import Complaint, ComplaintReason, ProductionSite
from projects.serializers import keep_or_active
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification', return_value=False)
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_client_message')
class MeasurementsOnlyTest(TestCase):
    def setUp(self):
        self.spb = City.objects.create(name='Санкт-Петербург')
        # Замерщик заведён раньше — у него меньший id, раньше автоназначение брало его
        self.measurer = User.objects.create_user(
            username='measurer', password='x', role='service_manager', city=self.spb, measurements_only=True,
        )
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.spb)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=self.spb)
        self.complaint = Complaint.objects.create(
            initiator=self.manager, manager=self.manager,
            production_site=ProductionSite.objects.create(name='Фабрика'),
            reason=ComplaintReason.objects.create(name='Брак'),
            order_number='1', client_name='Клиент', address='Адрес', contact_person='Клиент',
            contact_phone='+79270000000',
        )
        self.api = APIClient()

    def _get(self, user, url):
        self.api.force_authenticate(user)
        return self.api.get(url)

    def test_new_complaint_goes_to_full_sm(self, *_):
        self.assertEqual(self.complaint.recipient, self.sm)
        self.assertEqual(self.complaint._get_service_manager(), self.sm)

    def test_complaints_closed_for_measurer(self, *_):
        for url in ['/api/v1/complaints/', f'/api/v1/complaints/{self.complaint.id}/',
                    '/api/v1/dashboard/stats/', '/api/v1/notifications/',
                    '/api/v1/shipping-registry/', '/api/v1/return-registry/', '/api/v1/attachments/']:
            self.assertEqual(self._get(self.measurer, url).status_code, 403, url)

    def test_complaints_open_for_full_sm(self, *_):
        self.assertEqual(self._get(self.sm, '/api/v1/complaints/').status_code, 200)
        self.assertEqual(self._get(self.sm, f'/api/v1/complaints/{self.complaint.id}/').status_code, 200)

    def test_measurer_works_with_measurements(self, *_):
        salon = Salon.objects.create(name='Салон', city=self.spb)
        order = Order.objects.create(manager=self.manager, salon=salon, client_name='Клиент')
        request = MeasurementRequest.objects.create(order=order, contact_name='К', contact_phone='+7')
        measurement = Measurement.objects.create(request=request, service_manager=self.measurer)
        self.assertEqual(self._get(self.measurer, '/api/v1/measurements/').status_code, 200)
        self.assertEqual(self._get(self.measurer, f'/api/v1/measurements/{measurement.id}/').status_code, 200)

    def test_cannot_be_chosen_as_recipient(self, *_):
        with self.assertRaises(serializers.ValidationError):
            keep_or_active(SimpleNamespace(instance=None), self.measurer, 'recipient')

    def test_flag_in_current_user(self, *_):
        response = self._get(self.measurer, '/api/v1/auth/me/')
        self.assertTrue(response.data['measurements_only'])
        self.assertFalse(self._get(self.sm, '/api/v1/auth/me/').data['measurements_only'])
