"""
Смена статуса заказа не снимает заявку на замер — кроме «Выполнен» и «Не актуален».

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_request_survives_status
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()


class RequestSurvivesStatusChangeTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.city)
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Клиент',
            status=OrderStatus.MEASUREMENT_REQUESTED,
        )
        self.mr = MeasurementRequest.objects.create(
            order=self.order, contact_name='Клиент', contact_phone='+700', created_by=self.manager,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    def _set_status(self, status):
        self.order.status = status
        self.order.save()

    def _rows(self, folder=None):
        params = {'folder': folder} if folder else {}
        data = self.client.get('/api/v1/measurements/', params).data
        return data['results'] if isinstance(data, dict) else data

    def _request_ids(self, folder=None):
        return {r['request_id'] for r in self._rows(folder) if r.get('is_request_only')}

    def _measurement_ids(self, folder=None):
        return {r['id'] for r in self._rows(folder) if r.get('id')}

    def test_paid_order_request_stays_unscheduled(self):
        for status in (OrderStatus.PAID, OrderStatus.IN_PRODUCTION, OrderStatus.SHIPPED):
            self._set_status(status)
            self.assertIn(self.mr.id, self._request_ids('unscheduled'), status)
            self.assertIn(self.mr.id, self._request_ids(), status)

    def test_completed_and_cancelled_drop_request(self):
        for status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED):
            self._set_status(status)
            self.assertNotIn(self.mr.id, self._request_ids('unscheduled'), status)

    def test_paid_order_measurement_stays_in_work(self):
        m = Measurement.objects.create(request=self.mr, service_manager=self.sm)
        self._set_status(OrderStatus.PAID)
        self.assertIn(m.id, self._measurement_ids('unscheduled'))
        self._set_status(OrderStatus.COMPLETED)
        self.assertNotIn(m.id, self._measurement_ids('unscheduled'))
        self.assertNotIn(m.id, self._measurement_ids())
