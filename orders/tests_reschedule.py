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
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
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

    @patch('orders.api_views.send_client_sms')
    def test_interval_and_switch_back_to_exact_time(self, sms):
        start = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=2)
        url = f'/api/v1/measurements/{self.measurement.pk}/schedule/'
        payload = {'measurement_date': start.isoformat(), 'measurement_end': end.isoformat()}
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('12:00–14:00', sms.call_args.args[2])
        self.measurement.refresh_from_db()
        self.assertEqual(self.measurement.measurement_end, end)
        payload['measurement_end'] = start.isoformat()
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 400)
        self.measurement.refresh_from_db()
        self.assertEqual(self.measurement.measurement_end, end)
        self.assertEqual(self.reschedule(start).status_code, 200)
        self.measurement.refresh_from_db()
        self.assertIsNone(self.measurement.measurement_end)

    @patch('orders.api_views.send_client_sms')
    def test_create_interval_and_deadline(self, sms):
        self.measurement.delete()
        start = timezone.now() - timedelta(hours=1)
        end = start + timedelta(hours=2)
        url = '/api/v1/measurements/create_from_request/'
        payload = {'request_id': self.request_obj.pk, 'measurement_end': end.isoformat()}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 400)
        payload['measurement_date'] = start.isoformat()
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        measurement = Measurement.objects.get(pk=response.data['id'])
        self.assertEqual(measurement.measurement_end, end)
        self.assertIn(timezone.localtime(end).strftime('%H:%M'), sms.call_args.args[2])
        call_command('check_measurement_not_done')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.MEASUREMENT_SCHEDULED)

        measurement.measurement_end = start + timedelta(minutes=30)
        measurement.save(update_fields=['measurement_end'])
        with patch('orders.management.commands.check_measurement_not_done.send_push_notification'):
            call_command('check_measurement_not_done')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.MEASUREMENT_NOT_DONE)

    @patch('orders.api_views.send_client_sms')
    def test_sms_sequence_from_request_to_reschedule(self, sms):
        order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            contact_phone='8 (999) 000-00-00',
        )
        self.sm.first_name = 'Александр'
        self.sm.save(update_fields=['first_name'])
        url = f'/api/v1/orders/{order.pk}/measurement-request/'
        self.client.force_authenticate(self.manager)
        response = self.client.post(url, {
            'contact_name': 'Иванов', 'contact_phone': '+79990000000',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(sms.call_count, 1)
        self.assertTrue(sms.call_args.args[2].startswith('Вам позвонит Александр по замеру'))

        self.client.force_authenticate(self.sm)
        create_url = '/api/v1/measurements/create_from_request/'
        payload = {'request_id': response.data['id']}
        response = self.client.post(create_url, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(sms.call_count, 1)
        schedule_url = f"/api/v1/measurements/{response.data['id']}/schedule/"

        with timezone.override('Europe/Moscow'):
            payload['measurement_date'] = '2026-11-24T06:30:00.000Z'
            response = self.client.post(create_url, payload, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(sms.call_args.args[2], 'Замер назначен на 24.11.2026 09:30')
            self.client.post(schedule_url, payload, format='json')
            self.assertEqual(sms.call_count, 2)
            payload['measurement_date'] = '2026-11-25T06:30:00.000Z'
            response = self.client.post(schedule_url, payload, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(sms.call_args.args[2], 'Замер перенесён на 25.11.2026 09:30')
            self.assertEqual(sms.call_count, 3)

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
