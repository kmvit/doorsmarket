"""
Фильтр по нескольким статусам сразу (?status__in=a,b) во всех списках.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_multi_status
"""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest, Order, OrderStatus, Salon
from projects.models import Complaint, ReturnRegistry, ShippingRegistry
from projects.api_views import ComplaintViewSet, ReturnRegistryViewSet, ShippingRegistryViewSet
from users.models import City

User = get_user_model()


def rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) else data


class OrdersMultiStatusTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)
        self.orders = {
            st: Order.objects.create(
                manager=self.manager, salon=self.salon, client_name=st, status=st,
            )
            for st in (OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DRAFT, OrderStatus.COMPLETED)
        }

    def ids(self, url, params):
        response = self.client.get(url, params)
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in rows(response)}

    def expected(self, *statuses):
        return {self.orders[s].id for s in statuses}

    def test_orders_list_filters_by_several_statuses(self):
        self.assertEqual(
            self.ids('/api/v1/orders/', {'status__in': 'paid,shipped'}),
            self.expected(OrderStatus.PAID, OrderStatus.SHIPPED),
        )

    def test_finished_status_among_several_is_not_hidden(self):
        # «Кроме выполненных» не должно прятать «Выполнен», выбранный явно
        self.assertEqual(
            self.ids('/api/v1/orders/', {'status__in': 'paid,completed', 'exclude_finished': 'true'}),
            self.expected(OrderStatus.PAID, OrderStatus.COMPLETED),
        )

    def test_single_status_still_works(self):
        self.assertEqual(
            self.ids('/api/v1/orders/', {'status': 'draft'}),
            self.expected(OrderStatus.DRAFT),
        )

    def test_workshop_filters_by_several_statuses(self):
        self.assertEqual(
            self.ids('/api/v1/workshop/', {'status__in': 'paid,draft'}),
            self.expected(OrderStatus.PAID, OrderStatus.DRAFT),
        )


class RegistriesAcceptSeveralStatusesTest(SimpleTestCase):
    """Рекламации и реестры: у вьюх подключён фильтр field__in."""

    def check(self, view_class, model, field):
        filterset = DjangoFilterBackend().get_filterset_class(view_class(), model.objects.all())
        self.assertIn(f'{field}__in', filterset.base_filters)
        self.assertIn(field, filterset.base_filters)

    def test_complaints(self):
        self.check(ComplaintViewSet, Complaint, 'status')

    def test_shipping_registry(self):
        self.check(ShippingRegistryViewSet, ShippingRegistry, 'delivery_status')

    def test_return_registry(self):
        self.check(ReturnRegistryViewSet, ReturnRegistry, 'return_status')


class ManagerFilterTest(TestCase):
    """Фильтр руководителя по менеджерам: ?manager__in=1,2 и список менеджеров."""

    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.other_city = City.objects.create(name='Самара')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.other_salon = Salon.objects.create(name='Чужой', city=self.other_city)
        self.leader = User.objects.create_user(
            username='boss', password='x', role='leader', city=self.city,
        )
        self.m1, self.m2, self.m3 = (
            User.objects.create_user(
                username=f'm{i}', password='x', role='manager', city=self.city, salon=self.salon,
            )
            for i in (1, 2, 3)
        )
        self.stranger = User.objects.create_user(
            username='far', password='x', role='manager', city=self.other_city, salon=self.other_salon,
        )
        self.orders = {
            m: Order.objects.create(manager=m, salon=m.salon, client_name=m.username, status=OrderStatus.PAID)
            for m in (self.m1, self.m2, self.m3, self.stranger)
        }
        self.client = APIClient()
        self.client.force_authenticate(self.leader)

    def ids(self, url, params):
        response = self.client.get(url, params)
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in rows(response) if row.get('id')}

    def test_orders_filtered_by_managers(self):
        self.assertEqual(
            self.ids('/api/v1/orders/', {'manager__in': f'{self.m1.id},{self.m2.id}'}),
            {self.orders[self.m1].id, self.orders[self.m2].id},
        )

    def test_workshop_filtered_by_managers(self):
        self.assertEqual(
            self.ids('/api/v1/workshop/', {'manager__in': str(self.m3.id)}),
            {self.orders[self.m3].id},
        )

    def test_measurements_filtered_by_managers(self):
        sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.city)
        m1_measurement = Measurement.objects.create(
            request=MeasurementRequest.objects.create(
                order=self.orders[self.m1], contact_name='К', contact_phone='+7', created_by=self.m1,
            ),
            service_manager=sm,
        )
        Measurement.objects.create(
            request=MeasurementRequest.objects.create(
                order=self.orders[self.m2], contact_name='К', contact_phone='+7', created_by=self.m2,
            ),
            service_manager=sm,
        )
        self.assertEqual(
            self.ids('/api/v1/measurements/', {'manager__in': str(self.m1.id)}),
            {m1_measurement.id},
        )

    def test_managers_list_is_limited_to_leaders_city(self):
        response = self.client.get('/api/v1/orders/managers/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({m['id'] for m in response.data}, {self.m1.id, self.m2.id, self.m3.id})


class CitySalonFilterTest(TestCase):
    """Фильтры по городам и салонам: ?city__in, ?salon__in — у админа и руководителя."""

    def setUp(self):
        self.kazan = City.objects.create(name='Казань')
        self.samara = City.objects.create(name='Самара')
        self.s1 = Salon.objects.create(name='Академи', city=self.kazan)
        self.s2 = Salon.objects.create(name='Тандем', city=self.kazan)
        self.s3 = Salon.objects.create(name='Самарский', city=self.samara)
        self.admin = User.objects.create_user(username='adm', password='x', role='admin')
        self.leader = User.objects.create_user(username='boss', password='x', role='leader', city=self.kazan)
        self.managers = {}
        self.orders = {}
        for salon in (self.s1, self.s2, self.s3):
            m = User.objects.create_user(
                username=f'm{salon.id}', password='x', role='manager', city=salon.city, salon=salon,
            )
            self.managers[salon] = m
            self.orders[salon] = Order.objects.create(
                manager=m, salon=salon, client_name=salon.name, status=OrderStatus.PAID,
            )
        self.client = APIClient()

    def ids(self, url, params):
        response = self.client.get(url, params)
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in rows(response) if row.get('id')}

    def order_ids(self, *salons):
        return {self.orders[s].id for s in salons}

    def test_admin_filters_orders_by_city(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.ids('/api/v1/orders/', {'city__in': str(self.samara.id)}), self.order_ids(self.s3))
        self.assertEqual(self.ids('/api/v1/orders/', {'city__in': str(self.kazan.id)}), self.order_ids(self.s1, self.s2))

    def test_admin_filters_by_several_salons(self):
        self.client.force_authenticate(self.admin)
        params = {'salon__in': f'{self.s1.id},{self.s3.id}'}
        self.assertEqual(self.ids('/api/v1/orders/', params), self.order_ids(self.s1, self.s3))
        self.assertEqual(self.ids('/api/v1/workshop/', params), self.order_ids(self.s1, self.s3))

    def test_leader_salon_filter_and_city_cannot_widen_access(self):
        self.client.force_authenticate(self.leader)
        self.assertEqual(self.ids('/api/v1/orders/', {'salon__in': str(self.s2.id)}), self.order_ids(self.s2))
        # Чужой город в фильтре не открывает чужие заказы
        self.assertEqual(self.ids('/api/v1/orders/', {'city__in': str(self.samara.id)}), set())

    def test_measurements_filtered_by_city(self):
        self.client.force_authenticate(self.admin)
        sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.samara)
        far = Measurement.objects.create(
            request=MeasurementRequest.objects.create(
                order=self.orders[self.s3], contact_name='К', contact_phone='+7', created_by=self.managers[self.s3],
            ),
            service_manager=sm,
        )
        Measurement.objects.create(
            request=MeasurementRequest.objects.create(
                order=self.orders[self.s1], contact_name='К', contact_phone='+7', created_by=self.managers[self.s1],
            ),
            service_manager=sm,
        )
        self.assertEqual(self.ids('/api/v1/measurements/', {'city__in': str(self.samara.id)}), {far.id})

    def test_managers_list_narrows_by_city_and_salon(self):
        self.client.force_authenticate(self.admin)
        by_city = {m['id'] for m in self.client.get('/api/v1/orders/managers/', {'city__in': str(self.kazan.id)}).data}
        self.assertEqual(by_city, {self.managers[self.s1].id, self.managers[self.s2].id})
        by_salon = {m['id'] for m in self.client.get('/api/v1/orders/managers/', {'salon__in': str(self.s2.id)}).data}
        self.assertEqual(by_salon, {self.managers[self.s2].id})
