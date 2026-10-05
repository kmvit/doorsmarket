"""
Отчёт по дизайнерам: фильтры по периоду, городу, салону, менеджеру и статусу,
суммы заказов и выплаченные бонусы.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_designer_report
"""
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Designer, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()
URL = '/api/v1/reports/designers/'


def aware(y, m, d):
    return timezone.make_aware(datetime(y, m, d, 12, 0))


class DesignerReportTest(TestCase):
    def setUp(self):
        self.kazan = City.objects.create(name='Казань')
        self.samara = City.objects.create(name='Самара')
        self.salon = Salon.objects.create(name='Академи', city=self.kazan)
        self.salon2 = Salon.objects.create(name='Тандем', city=self.kazan)
        self.far_salon = Salon.objects.create(name='Самарский', city=self.samara)
        self.leader = User.objects.create_user(username='boss', password='x', role='leader', city=self.kazan)
        self.admin = User.objects.create_user(username='adm', password='x', role='admin')
        self.m1 = User.objects.create_user(
            username='m1', password='x', role='manager', city=self.kazan, salon=self.salon,
        )
        self.m2 = User.objects.create_user(
            username='m2', password='x', role='manager', city=self.kazan, salon=self.salon2,
        )
        self.far_manager = User.objects.create_user(
            username='far', password='x', role='manager', city=self.samara, salon=self.far_salon,
        )
        self.anna = Designer.objects.create(full_name='Петрова Анна', phone='+79170000001', studio='Лофт')
        self.oleg = Designer.objects.create(full_name='Сидоров Олег', phone='+79170000002')

        self.o1 = self.order(self.anna, self.m1, OrderStatus.COMPLETED, '100000', aware(2026, 9, 5),
                             paid=Decimal('5000'))
        self.o2 = self.order(self.anna, self.m2, OrderStatus.IN_PRODUCTION, '50000', aware(2026, 10, 2))
        self.o3 = self.order(self.oleg, self.m1, OrderStatus.PAID, '30000', aware(2026, 10, 3))
        self.far = self.order(self.anna, self.far_manager, OrderStatus.PAID, '999999', aware(2026, 10, 3))
        # Заказ без дизайнера в отчёт не попадает
        Order.objects.create(manager=self.m1, salon=self.salon, client_name='Без дизайнера', has_designer=False)

        self.client = APIClient()
        self.client.force_authenticate(self.leader)

    def order(self, designer, manager, status, total, created, paid=None):
        o = Order.objects.create(
            manager=manager, salon=manager.salon, client_name=f'Клиент {status}',
            address='ул. Пушкина, 1', kp_number=f'КП-{status}', status=status,
            has_designer=True, designer=designer, total_with_discount=Decimal(total),
            designer_paid_amount=paid, designer_paid_at=timezone.now() if paid else None,
        )
        Order.objects.filter(pk=o.pk).update(created_at=created)
        return o

    def get(self, **params):
        response = self.client.get(URL, params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def row(self, data, designer):
        return next(r for r in data['designers'] if r['designer']['id'] == designer.id)

    def test_leader_sees_only_own_city_with_totals(self):
        data = self.get()
        anna = self.row(data, self.anna)
        self.assertEqual(anna['orders_count'], 2)          # самарский заказ не виден
        self.assertEqual(anna['orders_amount'], '150000.00')
        self.assertEqual(anna['bonus_paid'], '5000.00')
        self.assertEqual(anna['bonus_paid_count'], 1)
        self.assertEqual(anna['status_counts'], {'completed': 1, 'in_production': 1})
        self.assertEqual(data['totals'], {
            'designers_count': 2, 'orders_count': 3,
            'orders_amount': '180000.00', 'bonus_paid': '5000.00',
        })
        # Самый «дорогой» дизайнер — первым
        self.assertEqual(data['designers'][0]['designer']['id'], self.anna.id)

    def test_order_details_for_report(self):
        order = next(o for o in self.row(self.get(), self.anna)['orders'] if o['id'] == self.o1.id)
        self.assertEqual(order['kp_number'], 'КП-completed')
        self.assertEqual(order['address'], 'ул. Пушкина, 1')
        self.assertEqual(order['amount'], '100000.00')
        self.assertEqual(order['designer_paid_amount'], '5000.00')
        self.assertIsNotNone(order['designer_paid_at'])

    def test_period_filter(self):
        data = self.get(date_from='2026-10-01', date_to='2026-10-31')
        self.assertEqual(data['totals']['orders_count'], 2)
        self.assertEqual(self.row(data, self.anna)['bonus_paid'], '0.00')

    def test_salon_manager_and_status_filters(self):
        self.assertEqual(self.get(salon=self.salon2.id)['totals']['orders_count'], 1)
        self.assertEqual(self.get(manager__in=str(self.m1.id))['totals']['orders_count'], 2)
        self.assertEqual(self.get(status__in='paid,in_production')['totals']['orders_count'], 2)

    def test_single_designer(self):
        data = self.get(designer=self.oleg.id)
        self.assertEqual([r['designer']['id'] for r in data['designers']], [self.oleg.id])

    def test_admin_filters_by_city(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.get()['totals']['orders_count'], 4)
        data = self.get(city=self.samara.id)
        self.assertEqual(data['totals']['orders_count'], 1)
        self.assertEqual(data['totals']['orders_amount'], '999999.00')

    def test_manager_sees_only_own_salon(self):
        self.client.force_authenticate(self.m1)
        data = self.get()
        # o1 и o3 — салон m1; o2 — другой салон того же города
        self.assertEqual(
            {o['id'] for r in data['designers'] for o in r['orders']},
            {self.o1.id, self.o3.id},
        )
        # Фильтр по чужому салону ничего не открывает
        self.assertEqual(self.get(salon=self.salon2.id)['totals']['orders_count'], 0)

    def test_service_manager_has_no_access(self):
        sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.kazan)
        self.client.force_authenticate(sm)
        self.assertEqual(self.client.get(URL).status_code, 403)
