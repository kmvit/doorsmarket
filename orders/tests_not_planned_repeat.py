"""
«Замер не запланирован» (cron check_measurement_not_planned) и повторный замер:
день на планирование считается от отправки на повтор, а не от создания заявки.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_not_planned_repeat
"""
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()


@patch('orders.management.commands.check_measurement_not_planned.send_push_notification')
class NotPlannedRepeatTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        salon = Salon.objects.create(name='Салон', city=city)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city, salon=salon)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.order = Order.objects.create(
            manager=self.manager, salon=salon, client_name='Иванов', status=OrderStatus.MEASUREMENT_DONE,
        )
        self.req = MeasurementRequest.objects.create(
            order=self.order, contact_name='К', contact_phone='+7', created_by=self.manager,
        )
        # Заявке 10 дней — по старой логике она давно «просрочена»
        MeasurementRequest.objects.filter(pk=self.req.pk).update(created_at=timezone.now() - timedelta(days=10))
        self.m = Measurement.objects.create(
            request=self.req, service_manager=self.sm, is_done=True, done_at=timezone.now() - timedelta(days=1),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def run_cron(self):
        call_command('check_measurement_not_planned', stdout=StringIO())
        self.order.refresh_from_db()
        return self.order.status

    def test_fresh_repeat_stays_in_assign_folder(self, _push):
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/request_repeat/', {'reason': 'Пересчитать'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.run_cron(), OrderStatus.MEASUREMENT_REQUESTED)

    def test_repeat_not_planned_for_long_is_flagged(self, _push):
        self.client.post(f'/api/v1/measurements/{self.m.id}/request_repeat/', {}, format='json')
        Measurement.objects.filter(pk=self.m.pk).update(repeat_requested_at=timezone.now() - timedelta(days=7))
        self.assertEqual(self.run_cron(), OrderStatus.MEASUREMENT_NOT_PLANNED)

    def test_old_request_without_date_is_flagged(self, _push):
        Measurement.objects.filter(pk=self.m.pk).delete()
        Order.objects.filter(pk=self.order.pk).update(status=OrderStatus.MEASUREMENT_REQUESTED)
        self.assertEqual(self.run_cron(), OrderStatus.MEASUREMENT_NOT_PLANNED)
