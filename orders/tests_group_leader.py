"""
Руководитель группы салонов: права руководителя, но видит только закреплённые
за ним салоны — заказы, замеры, салоны, рекламации, реестр на отгрузку.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_group_leader
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementOpening, MeasurementRequest, Order, OrderItem, OrderStatus, Salon
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

    def test_can_create_order_manually_and_from_kp_in_managed_salon(self):
        payload = {
            'salon': self.own_salon.pk,
            'client_name': 'Новый клиент',
            'has_designer': False,
            'next_action_text': 'Позвонить клиенту',
            'next_action_due_at': timezone.now().isoformat(),
        }
        for url in ('/api/v1/orders/', '/api/v1/orders/create_from_parsed/'):
            with self.subTest(url=url):
                response = self.client.post(url, payload, format='json')
                self.assertEqual(response.status_code, 201, response.data)
                order_id = response.data['id']
                order = Order.objects.get(pk=order_id)
                self.assertEqual(order.salon, self.own_salon)
                self.assertEqual(order.manager, self.gl)
                self.assertEqual(self.client.get(f'/api/v1/orders/{order_id}/').status_code, 200)

                response = self.client.post(url, {**payload, 'salon': self.other_salon.pk}, format='json')
                self.assertEqual(response.status_code, 403, response.data)
                self.assertFalse(Order.objects.filter(salon=self.other_salon, manager=self.gl).exists())

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

    def test_edits_order_items_and_reminders_in_managed_salon(self):
        response = self.client.patch(f'/api/v1/orders/{self.own_order.pk}/', {
            'client_name': 'Исправленное имя',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.patch(f'/api/v1/orders/{self.own_order.pk}/', {
            'salon': self.other_salon.pk,
        }, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        item = OrderItem.objects.create(order=self.own_order, opening_number=1, model_name='Дверь')
        response = self.client.patch(f'/api/v1/order-items/{item.pk}/', {'model_name': 'Новая модель'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        for order, expected in ((self.own_order, 201), (self.other_order, 400)):
            response = self.client.post('/api/v1/action-reminders/', {
                'order': order.pk, 'action_text': 'Позвонить', 'due_at': timezone.now().isoformat(),
            }, format='json')
            self.assertEqual(response.status_code, expected, response.data)
            if expected == 201:
                reminder_id = response.data['id']
                response = self.client.patch(f'/api/v1/action-reminders/{reminder_id}/', {
                    'action_text': 'Уточнить заказ',
                }, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                response = self.client.post(f'/api/v1/action-reminders/{reminder_id}/mark_done/', {
                    'new_status': 'paid',
                }, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.own_order.refresh_from_db()
                self.assertEqual(self.own_order.status, OrderStatus.PAID)

    def test_links_and_processes_measurement_in_managed_salon(self):
        item = OrderItem.objects.create(order=self.own_order, opening_number=1, model_name='Дверь')
        opening = MeasurementOpening.objects.create(measurement=self.own_m, opening_number=1)
        response = self.client.post(f'/api/v1/orders/{self.own_order.pk}/set_link_measurement/', {
            'measurement_id': self.own_m.pk,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(f'/api/v1/measurement-openings/{opening.pk}/link/', {
            'order_item_id': item.pk,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post('/api/v1/measurement-openings/batch_link/', {
            'links': [{'measurement_opening_id': opening.pk, 'order_item_id': item.pk}],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(f'/api/v1/orders/{self.own_order.pk}/apply_measurement_to_items/')
        self.assertEqual(response.status_code, 200, response.data)
        self.own_m.is_done = True
        self.own_m.save(update_fields=['is_done'])
        response = self.client.post(f'/api/v1/measurements/{self.own_m.pk}/mark_processed/')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(f'/api/v1/orders/{self.other_order.pk}/set_link_measurement/', {
            'measurement_id': self.other_m.pk,
        }, format='json')
        self.assertEqual(response.status_code, 404, response.data)

    def test_manager_actions_on_complaint_and_group_leader_as_manager(self):
        response = self.client.post(f'/api/v1/complaints/{self.own_complaint.pk}/mark_warehouse/')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(f'/api/v1/complaints/{self.other_complaint.pk}/mark_warehouse/')
        self.assertEqual(response.status_code, 404, response.data)
        response = self.client.patch(f'/api/v1/complaints/{self.own_complaint.pk}/', {
            'manager_id': self.gl.pk, 'source_order': self.own_order.pk,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(f'/api/v1/complaints/{self.own_complaint.pk}/').status_code, 200)
