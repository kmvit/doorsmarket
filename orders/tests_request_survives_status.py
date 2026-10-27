"""
Смена статуса заказа не снимает заявку на замер — кроме «Выполнен» и «Не актуален».

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_request_survives_status
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Measurement, OrderActivityLog, MeasurementRequest, Order, OrderStatus, Salon
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
        # Как в работе: смена статуса пишется в журнал
        self.order.change_status(status, actor=self.manager, notify=False)

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

    def _order_folder(self, folder='measurement_requested'):
        self.client.force_authenticate(self.manager)
        data = self.client.get('/api/v1/orders/', {'folder': folder}).data
        counts = {f['folder']: f['count'] for f in self.client.get('/api/v1/orders/folder_counts/', {'mine': 'true'}).data}
        rows = data['results'] if isinstance(data, dict) else data
        return {r['id'] for r in rows}, counts[folder]

    def test_paid_order_in_manager_requested_folder(self):
        self._set_status(OrderStatus.PAID)
        ids, count = self._order_folder()
        self.assertIn(self.order.id, ids)
        self.assertEqual(count, 1)
        # Замер создан без даты — заявка всё ещё ждёт
        m = Measurement.objects.create(request=self.mr, service_manager=self.sm)
        self.assertIn(self.order.id, self._order_folder()[0])
        # Дату назначили — из «Заявка на замер» уходит в «Замер запланирован»
        m.measurement_date = timezone.now() + timedelta(days=3)
        m.save()
        self.assertNotIn(self.order.id, self._order_folder()[0])
        self.assertIn(self.order.id, self._order_folder('measurement_scheduled')[0])

    def test_finished_or_done_order_not_in_requested_folder(self):
        Measurement.objects.create(request=self.mr, service_manager=self.sm, is_done=True)
        self._set_status(OrderStatus.PAID)
        self.assertNotIn(self.order.id, self._order_folder()[0])
        Measurement.objects.all().delete()
        for status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED):
            self._set_status(status)
            self.assertNotIn(self.order.id, self._order_folder()[0], status)
        self._set_status(OrderStatus.PAID)
        self.mr.is_irrelevant = True
        self.mr.save()
        self.assertNotIn(self.order.id, self._order_folder()[0])


class OwnFlowOrderMeasurementFoldersTest(TestCase):
    """
    Оплаченный заказ с заявкой проходит по всем папкам замера по состоянию
    замера, а его собственный статус («Оплачен») замер не меняет.
    """

    _order_folder = RequestSurvivesStatusChangeTest._order_folder

    def setUp(self):
        RequestSurvivesStatusChangeTest.setUp(self)
        self.order.lift_available = True
        self.order.stairs_available = True
        self.order.carry_to_entrance = False
        self.order.floor_number = '3'
        self.order.save()
        # Оплатили, пока заявка ждала замера — как в журнале через change_status
        self.order.change_status(OrderStatus.PAID, actor=self.manager, notify=False)
        self.m = Measurement.objects.create(
            request=self.mr, service_manager=self.sm, measurement_date=timezone.now() + timedelta(days=1),
        )

    def _paid_days_ago(self, days):
        OrderActivityLog.objects.filter(order=self.order).update(created_at=timezone.now() - timedelta(days=days))

    def _in(self, folder):
        return self.order.id in self._order_folder(folder)[0]

    def test_scheduled_and_tomorrow(self):
        self.assertTrue(self._in('measurement_scheduled'))
        self.assertTrue(self._in('tomorrow_measurement'))
        self.assertFalse(self._in('measurement_requested'))
        self.assertTrue(self._in('paid'))  # и в своей папке «Оплачен»

    def test_overdue_visit_is_not_done(self):
        self._paid_days_ago(3)
        self.m.measurement_date = timezone.now() - timedelta(hours=2)
        self.m.save()
        self.assertTrue(self._in('measurement_not_done'))
        self.assertFalse(self._in('measurement_scheduled'))

    def test_request_waiting_long_is_not_planned(self):
        self.m.delete()
        MeasurementRequest.objects.filter(pk=self.mr.pk).update(created_at=timezone.now() - timedelta(days=7))
        self.assertTrue(self._in('measurement_not_planned'))
        self.assertFalse(self._in('measurement_requested'))

    def test_done_and_processed_keep_paid_status(self):
        self.client.force_authenticate(self.sm)
        self.assertEqual(self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/').status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.PAID)
        self.assertTrue(self._in('measurement_done'))
        self.assertFalse(self._in('measurement_scheduled'))

        self.assertEqual(self.client.post(f'/api/v1/measurements/{self.m.id}/mark_processed/').status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.PAID)
        self.assertTrue(self._in('measurement_processed'))
        self.assertFalse(self._in('measurement_done'))

        # Менеджер перевёл заказ дальше — замер для папок закрыт
        self.order.change_status(OrderStatus.IN_PRODUCTION, actor=self.manager, notify=False)
        self.assertFalse(self._in('measurement_processed'))

    def test_done_long_ago_is_not_processed(self):
        self._paid_days_ago(10)
        Measurement.objects.filter(pk=self.m.pk).update(is_done=True, done_at=timezone.now() - timedelta(days=7))
        self.assertTrue(self._in('measurement_not_processed'))

    def test_normal_paid_order_not_in_measurement_folders(self):
        # Обычный цикл: замер обработан, потом заказ оплатили — в папках замера его нет
        Measurement.objects.filter(pk=self.m.pk).update(
            is_done=True, done_at=timezone.now() - timedelta(days=3),
            is_processed=True, processed_at=timezone.now() - timedelta(days=2),
        )
        for folder in ('measurement_processed', 'measurement_done', 'measurement_scheduled', 'measurement_requested'):
            self.assertFalse(self._in(folder), folder)

    def test_order_moved_on_after_visit_closes_measurement(self):
        # Выезд был, СМ не нажал «Выполнен», менеджер перевёл заказ дальше сам
        Measurement.objects.filter(pk=self.m.pk).update(measurement_date=timezone.now() - timedelta(days=5))
        self.assertFalse(self._in('measurement_not_done'))
        self.assertTrue(self._in('paid'))

    def test_order_moved_on_after_done_closes_processing(self):
        Measurement.objects.filter(pk=self.m.pk).update(is_done=True, done_at=timezone.now() - timedelta(days=7))
        self.assertFalse(self._in('measurement_not_processed'))
        self.assertFalse(self._in('measurement_done'))
