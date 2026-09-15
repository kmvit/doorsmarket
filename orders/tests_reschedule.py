"""
Тесты переноса даты замера.

Главное: замер с прошедшей датой крон помечает «Замер не выполнен», и СМ
переносит его именно из этого состояния. Заказ обязан вернуться в
«Замер запланирован», иначе он навсегда остаётся в папке «Не выполнен»
с уже назначенной новой датой.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_reschedule
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import (
    Measurement,
    MeasurementRequest,
    Order,
    OrderStatus,
    Salon,
)
from users.models import City

User = get_user_model()


class RescheduleMeasurementTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        self.request_obj = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+700',
            created_by=self.manager,
        )
        self.measurement = Measurement.objects.create(
            request=self.request_obj, service_manager=self.sm,
            measurement_date=timezone.now() - timedelta(days=2),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    def reschedule(self, when=None):
        when = when or (timezone.now() + timedelta(days=1))
        return self.client.post(
            f'/api/v1/measurements/{self.measurement.pk}/schedule/',
            {'measurement_date': when.isoformat()}, format='json',
        )

    def test_overdue_measurement_returns_to_scheduled(self):
        """Тот самый случай: крон пометил «не выполнен», СМ переносит дату."""
        self.order.status = OrderStatus.MEASUREMENT_NOT_DONE
        self.order.save(update_fields=['status'])

        response = self.reschedule()
        self.assertEqual(response.status_code, 200, response.data)

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.MEASUREMENT_SCHEDULED)

    def test_not_planned_order_also_returns_to_scheduled(self):
        self.order.status = OrderStatus.MEASUREMENT_NOT_PLANNED
        self.order.save(update_fields=['status'])

        self.reschedule()

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.MEASUREMENT_SCHEDULED)

    def test_new_date_is_saved(self):
        when = timezone.now() + timedelta(days=3)
        self.reschedule(when)

        self.measurement.refresh_from_db()
        self.assertEqual(
            self.measurement.measurement_date.date(), when.date(),
        )

    def test_done_measurement_does_not_roll_status_back(self):
        """
        Выполненный замер переносить нечего: если дата всё же придёт, статус
        заказа не должен откатываться из «Замер выполнен» в «запланирован».
        """
        self.measurement.is_done = True
        self.measurement.save(update_fields=['is_done'])
        self.order.status = OrderStatus.MEASUREMENT_DONE
        self.order.save(update_fields=['status'])

        self.reschedule()

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.MEASUREMENT_DONE)

    def test_later_stage_status_is_not_touched(self):
        """Оплаченный заказ не должен откатываться в «замер запланирован»."""
        self.order.status = OrderStatus.PAID
        self.order.save(update_fields=['status'])

        self.reschedule()

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.PAID)

    def test_date_is_required(self):
        response = self.client.post(
            f'/api/v1/measurements/{self.measurement.pk}/schedule/', {}, format='json',
        )
        self.assertEqual(response.status_code, 400)
