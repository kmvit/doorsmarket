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

from orders.models import Order, OrderStatus, Salon
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
