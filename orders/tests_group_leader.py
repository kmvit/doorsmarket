"""
Руководитель группы салонов: права руководителя, но видит только закреплённые
за ним салоны — заказы, замеры, салоны, рекламации, реестр на отгрузку.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_group_leader
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest, Order, OrderStatus, Salon
from projects.models import Complaint, ComplaintReason, ProductionSite, ShippingRegistry
from users.models import City

User = get_user_model()


def _rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class GroupLeaderScopeTest(TestCase):
    def setUp(self):
        kazan = City.objects.create(name='Казань')
        self.own_salon = Salon.objects.create(name='Свой', city=kazan)
        self.other_salon = Salon.objects.create(name='Чужой в том же городе', city=kazan)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=kazan)

        self.own_mgr = User.objects.create_user(
            username='m1', password='x', role='manager', city=kazan, salon=self.own_salon,
        )
        self.other_mgr = User.objects.create_user(
            username='m2', password='x', role='manager', city=kazan, salon=self.other_salon,
        )
        self.own_order, self.own_m = self._order(self.own_mgr, self.own_salon)
        self.other_order, self.other_m = self._order(self.other_mgr, self.other_salon)

        site = ProductionSite.objects.create(name='Фабрика')
        reason = ComplaintReason.objects.create(name='Брак')
        self.own_complaint = self._complaint(self.own_mgr, site, reason)
        self.other_complaint = self._complaint(self.other_mgr, site, reason)
        self.own_ship = self._shipping(self.own_mgr)
        self._shipping(self.other_mgr)

        self.gl = User.objects.create_user(
            username='gl', password='x', role='group_leader', city=kazan,
        )
        self.gl.managed_salons.add(self.own_salon)
        self.client = APIClient()
        self.client.force_authenticate(self.gl)

    def _order(self, manager, salon):
        order = Order.objects.create(
            manager=manager, salon=salon, client_name='Клиент', status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        mr = MeasurementRequest.objects.create(
            order=order, contact_name='Клиент', contact_phone='+700', created_by=manager,
        )
        return order, Measurement.objects.create(request=mr, service_manager=self.sm)

    def _complaint(self, manager, site, reason):
        return Complaint.objects.create(
            initiator=manager, recipient=self.sm, manager=manager,
            production_site=site, reason=reason, order_number='1',
            client_name='Клиент', address='Адрес', contact_person='Клиент', contact_phone='+700',
        )

    def _shipping(self, manager):
        return ShippingRegistry.objects.create(
            order_number='1', manager=manager, client_name='Клиент', address='Адрес',
            contact_person='Клиент', contact_phone='+700',
        )

    def _ids(self, url, params=None):
        response = self.client.get(url, params or {})
        self.assertEqual(response.status_code, 200, response.data)
        return {row['id'] for row in _rows(response)}

    def test_orders_and_measurements_only_own_salons(self):
        self.assertEqual(self._ids('/api/v1/orders/'), {self.own_order.id})
        self.assertEqual(self._ids('/api/v1/measurements/', {'folder': ''}), {self.own_m.id})
        self.assertEqual(self.client.get(f'/api/v1/orders/{self.other_order.id}/').status_code, 404)
        self.assertEqual(self._ids('/api/v1/salons/'), {self.own_salon.id})

    def test_complaints_and_registry_only_own_salons(self):
        self.assertEqual(self._ids('/api/v1/complaints/'), {self.own_complaint.id})
        self.assertEqual(self.client.get(f'/api/v1/complaints/{self.own_complaint.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/complaints/{self.other_complaint.id}/').status_code, 404)
        self.assertEqual(self._ids('/api/v1/shipping-registry/'), {self.own_ship.id})

    def test_has_leader_rights_in_own_salon(self):
        self.own_order.status = OrderStatus.CANCELLED
        self.own_order.save(update_fields=['status'])
        response = self.client.post(f'/api/v1/orders/{self.own_order.id}/transition/', {'status': 'active'})
        self.assertEqual(response.status_code, 200)
        response = self.client.post(f'/api/v1/orders/{self.other_order.id}/transition/', {'status': 'active'})
        self.assertEqual(response.status_code, 404)

    def test_no_salons_sees_nothing(self):
        self.gl.managed_salons.clear()
        self.client.force_authenticate(User.objects.get(pk=self.gl.pk))
        self.assertEqual(self._ids('/api/v1/orders/'), set())
        self.assertEqual(self._ids('/api/v1/complaints/'), set())
