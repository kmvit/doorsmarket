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
        self.installed = Order.objects.create(
            manager=self.manager, salon=salon, client_name='Монтаж завершён',
            status=OrderStatus.INSTALLATION_COMPLETED,
        )
        past = timezone.now() - timedelta(hours=1)
        for order in (self.open_order, self.done_order, self.cancelled, self.installed):
            OrderActionReminder.objects.create(order=order, action_text='Позвонить', due_at=past, created_by=self.manager)
        self.api = APIClient()
        self.api.force_authenticate(self.manager)

    def _ids(self, query):
        data = self.api.get(f'/api/v1/action-reminders/?{query}').data
        rows = data['results'] if isinstance(data, dict) else data
        return {r['order'] for r in rows}

    def test_overdue_and_today_without_closed_orders(self):
        self.assertEqual(self._ids('overdue=true'), {self.open_order.id})
        OrderActionReminder.objects.update(due_at=timezone.now())
        self.assertEqual(self._ids('today=true'), {self.open_order.id})

    def test_order_page_still_shows_its_tasks(self):
        self.assertEqual(self._ids(f'order={self.done_order.id}'), {self.done_order.id})

    def _workshop_rows(self, params=None):
        response = self.api.get('/api/v1/workshop/', params or {})
        self.assertEqual(response.status_code, 200)
        return response.data['results'] if isinstance(response.data, dict) else response.data

    def test_workshop_reminder_filters_exclude_closed_orders(self):
        now = timezone.localtime()
        for name, due_at in (
            ('with_overdue_reminder', now - timedelta(days=1)),
            ('with_reminder_today', now),
            ('with_reminder_tomorrow', now + timedelta(days=1)),
        ):
            with self.subTest(filter=name):
                OrderActionReminder.objects.update(due_at=due_at)
                rows = self._workshop_rows({name: 'true', 'mine': 'true'})
                self.assertEqual({row['id'] for row in rows}, {self.open_order.id})

    def test_workshop_completed_order_has_no_active_next_action(self):
        rows = {row['id']: row for row in self._workshop_rows()}
        for order in (self.done_order, self.installed):
            self.assertIsNone(rows[order.id]['next_action_at'])
            self.assertEqual(rows[order.id]['next_action_text'], '')
        self.assertIsNotNone(rows[self.open_order.id]['next_action_at'])
        self.assertNotIn(self.cancelled.id, rows)

    @patch('orders.management.commands.check_action_reminders.send_push_notification')
    def test_no_push_for_closed_orders(self, push):
        call_command('check_action_reminders', stdout=StringIO())
        self.assertEqual(push.call_count, 1)
        self.assertFalse(OrderActionReminder.objects.get(order=self.done_order).notified)
        self.assertTrue(OrderActionReminder.objects.get(order=self.open_order).notified)
