"""
Монтажник видит замеры своего города, но ничего в них не меняет.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_installer_measurements
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import (
    Measurement, MeasurementOpening, MeasurementRequest, Order, OrderStatus, Salon,
)
from users.models import City

User = get_user_model()


class InstallerMeasurementsTest(TestCase):
    def setUp(self):
        kazan = City.objects.create(name='Казань')
        moscow = City.objects.create(name='Москва')
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager')
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager')
        self.own = self._measurement(Salon.objects.create(name='Казанский', city=kazan))
        self.foreign = self._measurement(Salon.objects.create(name='Московский', city=moscow))
        self.opening = MeasurementOpening.objects.create(measurement=self.own, opening_number=1)

        self.installer = User.objects.create_user(
            username='inst', password='x', role='installer', city=kazan,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.installer)

    def _measurement(self, salon):
        order = Order.objects.create(
            manager=self.manager, salon=salon, client_name='Клиент',
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        mr = MeasurementRequest.objects.create(
            order=order, contact_name='Клиент', contact_phone='+700', created_by=self.manager,
        )
        return Measurement.objects.create(request=mr, service_manager=self.sm)

    def test_sees_only_own_city(self):
        response = self.client.get('/api/v1/measurements/', {'folder': ''})
        self.assertEqual(response.status_code, 200)
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual({row['id'] for row in data}, {self.own.id})
        self.assertEqual(self.client.get(f'/api/v1/measurements/{self.own.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/measurements/{self.foreign.id}/').status_code, 404)

    def test_cannot_change(self):
        m = self.own.id
        self.assertEqual(
            self.client.patch(f'/api/v1/measurements/{m}/', {'comment': 'x'}).status_code, 403,
        )
        self.assertEqual(self.client.post(f'/api/v1/measurements/{m}/mark_done/').status_code, 403)
        self.assertEqual(
            self.client.post('/api/v1/measurement-openings/', {'measurement': m}).status_code, 403,
        )
        self.assertEqual(
            self.client.patch(
                f'/api/v1/measurement-openings/{self.opening.id}/', {'room_name': 'x'},
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f'/api/v1/measurement-openings/{self.opening.id}/').status_code, 403,
        )
        self.assertTrue(MeasurementOpening.objects.filter(id=self.opening.id).exists())
