"""
Неактуальные заказы не попадают в «Наработки» и в счётчики задач на дашборде.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_workshop_irrelevant
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import (
    MeasurementRequest,
    Order,
    OrderActionReminder,
    OrderStatus,
    Salon,
)
from users.models import City

User = get_user_model()


class WorkshopHidesIrrelevantTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

        self.live = self._order('Живой', OrderStatus.MEASUREMENT_SCHEDULED)
        self.cancelled = self._order('Отменён', OrderStatus.CANCELLED)
        self.irrelevant = self._order('Отказ от замера', OrderStatus.MEASUREMENT_REQUESTED)
        MeasurementRequest.objects.create(
            order=self.irrelevant, contact_name='Клиент', contact_phone='+700',
            created_by=self.manager, is_irrelevant=True,
        )

    def _order(self, name, status):
        order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name=name, status=status,
        )
        OrderActionReminder.objects.create(
            order=order, due_at=timezone.now(), action_text='Позвонить',
            created_by=self.manager,
        )
        return order

    def ids(self, params=None):
        response = self.client.get('/api/v1/workshop/', params or {})
        self.assertEqual(response.status_code, 200)
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in data}

    def test_list_hides_irrelevant(self):
        self.assertEqual(self.ids(), {self.live.id})

    def test_reminder_today_count_hides_irrelevant(self):
        self.assertEqual(self.ids({'with_reminder_today': 'true'}), {self.live.id})
