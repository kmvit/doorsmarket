"""
Заказ «Выполнен» / «Не актуален»: его задачи («Следующее действие») не попадают
в списки на сегодня / завтра / просрочено и не напоминаются push'ем.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_closed_order_reminders
"""
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Order, OrderActionReminder, OrderStatus, Salon
from users.models import City

User = get_user_model()


class ClosedOrderRemindersTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        salon = Salon.objects.create(name='Салон', city=city)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city, salon=salon)
        self.open_order = Order.objects.create(manager=self.manager, salon=salon, client_name='Открытый')
        self.done_order = Order.objects.create(
            manager=self.manager, salon=salon, client_name='Выполнен', status=OrderStatus.COMPLETED,
        )
        self.cancelled = Order.objects.create(
            manager=self.manager, salon=salon, client_name='Не актуален', status=OrderStatus.CANCELLED,
        )
        past = timezone.now() - timedelta(hours=1)
        for order in (self.open_order, self.done_order, self.cancelled):
            OrderActionReminder.objects.create(order=order, action_text='Позвонить', due_at=past, created_by=self.manager)
        self.api = APIClient()
        self.api.force_authenticate(self.manager)

    def _ids(self, query):
        data = self.api.get(f'/api/v1/action-reminders/?{query}').data
        rows = data['results'] if isinstance(data, dict) else data
        return {r['order'] for r in rows}

    def test_overdue_and_today_without_closed_orders(self):
        self.assertEqual(self._ids('overdue=true'), {self.open_order.id})
        self.assertEqual(self._ids('today=true'), {self.open_order.id})

    def test_order_page_still_shows_its_tasks(self):
        self.assertEqual(self._ids(f'order={self.done_order.id}'), {self.done_order.id})

    @patch('orders.management.commands.check_action_reminders.send_push_notification')
    def test_no_push_for_closed_orders(self, push):
        call_command('check_action_reminders', stdout=StringIO())
        self.assertEqual(push.call_count, 1)
        self.assertFalse(OrderActionReminder.objects.get(order=self.done_order).notified)
        self.assertTrue(OrderActionReminder.objects.get(order=self.open_order).notified)
