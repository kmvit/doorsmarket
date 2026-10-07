"""
Менеджер возвращает заказ из «Не актуален» в «Создан».

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_restore_cancelled
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()


class RestoreCancelledOrderTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def _order(self, status):
        return Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Клиент', status=status,
        )

    def _restore(self, order):
        return self.client.post(f'/api/v1/orders/{order.id}/transition/', {'status': 'active'})

    def _folder_ids(self, folder):
        response = self.client.get('/api/v1/orders/', {'folder': folder})
        self.assertEqual(response.status_code, 200)
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in data}

    def test_restore_cancelled(self):
        order = self._order(OrderStatus.CANCELLED)
        response = self._restore(order)
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.ACTIVE)
        self.assertIn(order.id, self._folder_ids('created'))

    def test_restore_clears_irrelevant_measurement(self):
        order = self._order(OrderStatus.CANCELLED)
        mr = MeasurementRequest.objects.create(
            order=order, contact_name='Клиент', contact_phone='+700',
            created_by=self.manager, is_irrelevant=True, irrelevant_reason='Отказ',
        )
        self.assertEqual(self._restore(order).status_code, 200)
        mr.refresh_from_db()
        self.assertFalse(mr.is_irrelevant)
        self.assertEqual(mr.irrelevant_reason, '')
        self.assertIn(order.id, self._folder_ids('created'))

    def test_only_from_cancelled(self):
        order = self._order(OrderStatus.PAID)
        self.assertEqual(self._restore(order).status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.PAID)

    def test_installer_forbidden(self):
        order = self._order(OrderStatus.CANCELLED)
        installer = User.objects.create_user(
            username='inst', password='x', role='installer', city=self.city,
        )
        self.client.force_authenticate(installer)
        self.assertIn(self._restore(order).status_code, (403, 404))
