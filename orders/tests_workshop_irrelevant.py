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

    def test_manual_amount_and_inclusive_filters(self):
        payload = {
            'salon': self.salon.pk, 'client_name': 'Ручной заказ', 'has_designer': False,
            'next_action_text': 'Позвонить', 'next_action_due_at': timezone.now().isoformat(),
            'manual_order_amount': '1200.50',
        }
        result = self.client.post('/api/v1/orders/', payload, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        manual = result.data['id']
        self.live.total_with_discount = 0
        self.live.save()
        limits = {'amount_min': '1200.50', 'amount_max': '1200.50'}
        self.assertEqual(self.ids(limits), {manual})
        self.assertEqual(self.ids({'amount_min': '1200.51'}), set())
        self.assertEqual(self.ids({'amount_max': '0'}), {self.live.pk})
        self.assertEqual(self.client.get('/api/v1/workshop/', {'amount_min': '3', 'amount_max': '2'}).status_code, 400)
        self.assertEqual(self.client.post('/api/v1/orders/', {**payload, 'manual_order_amount': '-1'}, format='json').status_code, 400)

        kp = {'kp_number': 'КП-1', 'items': [{'model_name': 'Дверь', 'amount': '800'}],
              'totals': {'total_amount': '800', 'total_with_discount': '745.25'}}
        response = self.client.post(f'/api/v1/orders/{manual}/append_from_parsed/', kp, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.ids({'amount_max': '745.25'}), {self.live.pk, manual})
        self.assertEqual(self.ids(limits), set())

    def test_unknown_amount_is_not_zero(self):
        self.assertEqual(self.ids(), {self.live.pk})
        self.assertEqual(self.ids({'amount_min': '0'}), set())

    def test_list_hides_irrelevant(self):
        self.assertEqual(self.ids(), {self.live.id})

    def test_reminder_today_count_hides_irrelevant(self):
        self.assertEqual(self.ids({'with_reminder_today': 'true'}), {self.live.id})

    def test_overdue_reminders_hide_irrelevant(self):
        self.assertEqual(self.ids({'with_overdue_reminder': 'true'}), {self.live.id})
