from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import Order, OrderActionReminder, OrderStatus, Salon
from users.models import City


class OrderRefusalTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        salon = Salon.objects.create(name='Салон', city=city)
        self.manager = get_user_model().objects.create_user(username='manager', role='manager', city=city, salon=salon)
        self.client = APIClient()
        self.client.force_authenticate(self.manager)
        self.order = Order.objects.create(salon=salon, manager=self.manager, client_name='Клиент', status='active')
        self.url = f'/api/v1/orders/{self.order.pk}/'

    def transition(self, **payload):
        return self.client.post(self.url + 'transition/', {'status': 'cancelled', **payload}, format='json')

    def test_transition_requires_complete_answers(self):
        for reason in ({}, {'reason': 'unknown'}, {'reason': 'other', 'detail': '  '},
                       {'reason': 'bought_elsewhere', 'purchase_reason': 'price'},
                       {'reason': 'bought_elsewhere', 'store': 'Магазин'},
                       {'reason': 'bought_elsewhere', 'store': 'Магазин', 'purchase_reason': 'other'}):
            with self.subTest(reason=reason):
                self.assertEqual(self.transition(refusal=reason).status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.ACTIVE)
        reason = {'reason': 'bought_elsewhere', 'store': 'Магазин', 'purchase_reason': 'other', 'detail': 'Условия доставки'}
        self.assertEqual(self.transition(refusal=reason).data['refusal'], reason)
        self.assertEqual(self.client.post(self.url + 'transition/', {'status': 'active'}).data['refusal'], {})

    def test_reminder_only_closes_with_valid_refusal(self):
        reminder = OrderActionReminder.objects.create(order=self.order, due_at=timezone.now())
        url = f'/api/v1/action-reminders/{reminder.pk}/mark_done/'
        payload = {'new_status': 'cancelled'}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 400)
        reminder.refresh_from_db()
        self.assertFalse(reminder.done)
        payload['refusal'] = {'reason': 'postponed'}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.refusal, payload['refusal'])

    def test_edit_and_filter_including_legacy_orders(self):
        self.assertEqual(self.client.patch(self.url, {'status': 'cancelled'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(self.url, {'status': 'cancelled', 'refusal': {}}, format='json').status_code, 400)
        refusal = {'reason': 'bought_elsewhere', 'store': 'Магазин', 'purchase_reason': 'price'}
        result = self.client.patch(self.url, {'status': 'cancelled', 'refusal': refusal}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        legacy = Order.objects.create(salon=self.order.salon, manager=self.manager, status='cancelled')
        def ids(**params):
            rows = self.client.get('/api/v1/workshop/', params).data
            return {row['id'] for row in rows}
        self.assertEqual(ids(), set())
        self.assertEqual(ids(status__in='cancelled'), {legacy.pk, self.order.pk})
        self.assertEqual(ids(refusal_reason='bought_elsewhere', purchase_reason='price'), {self.order.pk})
        self.assertEqual(ids(purchase_reason='color'), set())
        self.assertEqual(self.client.patch(self.url, {'status': 'active'}, format='json').status_code, 200)
        self.assertEqual(ids(purchase_reason='price'), set())
