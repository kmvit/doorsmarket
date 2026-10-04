"""
Отчёт для расчёта зарплаты СМ: выполненные за период замеры по каждому СМ.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_service_manager_report
"""
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementOpening, MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()
URL = '/api/v1/reports/service-managers/'


def aware(y, m, d):
    return timezone.make_aware(datetime(y, m, d, 12, 0))


class ServiceManagerReportTest(TestCase):
    def setUp(self):
        self.kazan = City.objects.create(name='Казань')
        self.samara = City.objects.create(name='Самара')
        self.salon = Salon.objects.create(name='Академи', city=self.kazan)
        self.far_salon = Salon.objects.create(name='Самарский', city=self.samara)
        self.leader = User.objects.create_user(username='boss', password='x', role='leader', city=self.kazan)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.kazan, salon=self.salon,
        )
        self.far_manager = User.objects.create_user(
            username='far', password='x', role='manager', city=self.samara, salon=self.far_salon,
        )
        self.petr = User.objects.create_user(
            username='petr', password='x', role='service_manager', city=self.kazan,
            first_name='Пётр', last_name='Петров',
        )
        self.ivan = User.objects.create_user(
            username='ivan', password='x', role='service_manager', city=self.kazan,
            first_name='Иван', last_name='Иванов',
        )
        self.far_sm = User.objects.create_user(username='farsm', password='x', role='service_manager', city=self.samara)

        self.m1 = self.measurement(self.petr, aware(2026, 9, 10), openings=3)
        self.m2 = self.measurement(self.petr, aware(2026, 10, 2))
        self.m3 = self.measurement(self.ivan, aware(2026, 10, 5))
        self.measurement(self.petr, None)                                 # не выполнен
        self.measurement(self.far_sm, aware(2026, 10, 3), manager=self.far_manager)  # чужой город

        self.client = APIClient()
        self.client.force_authenticate(self.leader)

    def measurement(self, sm, done_at, openings=0, manager=None):
        manager = manager or self.manager
        order = Order.objects.create(
            manager=manager, salon=manager.salon, client_name=f'Клиент {sm.username}',
            address='ул. Ленина, 1', kp_number='КП-1', status=OrderStatus.MEASUREMENT_DONE,
        )
        req = MeasurementRequest.objects.create(order=order, contact_name='К', contact_phone='+7', created_by=manager)
        m = Measurement.objects.create(request=req, service_manager=sm, is_done=bool(done_at), done_at=done_at)
        for n in range(openings):
            MeasurementOpening.objects.create(measurement=m, opening_number=n + 1)
        return m

    def get(self, **params):
        response = self.client.get(URL, params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def counts(self, data):
        return {r['service_manager']['id']: r['measurements_count'] for r in data['service_managers']}

    def test_counts_done_measurements_in_own_city(self):
        data = self.get()
        self.assertEqual(self.counts(data), {self.petr.id: 2, self.ivan.id: 1})
        self.assertEqual(data['totals'], {
            'service_managers_count': 2, 'measurements_count': 3,
            'openings_count': 3, 'panels_count': 0, 'paid_openings_count': 3,
            'distance_km_invoice': '0.0',
        })

    def test_period_is_by_done_date(self):
        data = self.get(date_from='2026-10-01', date_to='2026-10-31')
        self.assertEqual(self.counts(data), {self.petr.id: 1, self.ivan.id: 1})

    def test_measurement_details(self):
        row = next(r for r in self.get()['service_managers'] if r['service_manager']['id'] == self.petr.id)
        self.assertEqual(row['service_manager']['full_name'], 'Пётр Петров')
        first = row['measurements'][0]
        self.assertEqual(first['id'], self.m1.id)
        self.assertEqual(first['openings_count'], 3)
        self.assertEqual(first['address'], 'ул. Ленина, 1')
        self.assertEqual(first['order_id'], self.m1.request.order_id)

    def test_filter_by_service_manager(self):
        self.assertEqual(self.counts(self.get(service_manager=self.ivan.id)), {self.ivan.id: 1})

    def test_service_manager_has_no_access(self):
        self.client.force_authenticate(self.petr)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_invoice_distance_is_summed(self):
        Measurement.objects.filter(pk=self.m1.pk).update(distance_payment='invoice', distance_km=Decimal('12.5'))
        Measurement.objects.filter(pk=self.m2.pk).update(distance_payment='invoice', distance_km=Decimal('30'))
        # «Оплата на месте» в расчёт не идёт
        Measurement.objects.filter(pk=self.m3.pk).update(distance_payment='on_site', distance_km=Decimal('50'))
        data = self.get()
        petr = next(r for r in data['service_managers'] if r['service_manager']['id'] == self.petr.id)
        ivan = next(r for r in data['service_managers'] if r['service_manager']['id'] == self.ivan.id)
        self.assertEqual(petr['distance_km_invoice'], '42.5')
        self.assertEqual(ivan['distance_km_invoice'], '0.0')
        self.assertEqual(data['totals']['distance_km_invoice'], '42.5')
        self.assertEqual(ivan['measurements'][0]['distance_payment_display'], 'Оплата на месте')

    def test_panels_count_as_extra_openings(self):
        # В m1 три проёма: у двух галочка «Панели» (2 и 1 шт.), у третьего количество без галочки не в счёт
        o1, o2, o3 = self.m1.openings.order_by('opening_number')
        MeasurementOpening.objects.filter(pk=o1.pk).update(has_panels=True, panels_count=2)
        MeasurementOpening.objects.filter(pk=o2.pk).update(has_panels=True, panels_count=1)
        MeasurementOpening.objects.filter(pk=o3.pk).update(has_panels=False, panels_count=5)
        data = self.get()
        petr = next(r for r in data['service_managers'] if r['service_manager']['id'] == self.petr.id)
        self.assertEqual(petr['openings_count'], 3)
        self.assertEqual(petr['panels_count'], 3)
        self.assertEqual(petr['paid_openings_count'], 6)
        first = petr['measurements'][0]
        self.assertEqual((first['openings_count'], first['panels_count'], first['paid_openings_count']), (3, 3, 6))
        self.assertEqual(data['totals']['paid_openings_count'], 6)
