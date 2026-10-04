"""
Дизайнер, месяц оплаты и вероятность оформления при создании заказа.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_designer
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import Designer, Order, Salon
from users.models import City

User = get_user_model()


class DesignerTestBase(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)
        self.designer = Designer.objects.create(
            full_name='Петрова Анна', phone='+79171234567', studio='Лофт', bonus_percent=10,
        )

    def order_payload(self, **extra):
        return {
            'salon': self.salon.id,
            'client_name': 'Иванов',
            'next_action_text': 'Позвонить',
            'next_action_due_at': '2026-10-10T10:00:00Z',
            **extra,
        }

    def create_manual(self, **extra):
        return self.client.post('/api/v1/orders/', self.order_payload(**extra), format='json')

    def create_from_kp(self, **extra):
        payload = self.order_payload(items=[], addons=[], **extra)
        return self.client.post('/api/v1/orders/create_from_parsed/', payload, format='json')


class DesignerApiTest(DesignerTestBase):
    def search(self, query):
        response = self.client.get('/api/v1/designers/', {'search': query})
        self.assertEqual(response.status_code, 200)
        return [d['id'] for d in response.data]

    def test_search_by_name_and_studio(self):
        # Регистр как в карточке: SQLite в тестах не приводит кириллицу к одному
        # регистру (на проде Postgres — найдёт и «петрова»)
        self.assertEqual(self.search('Петрова'), [self.designer.id])
        self.assertEqual(self.search('Лоф'), [self.designer.id])
        self.assertEqual(self.search('Сидоров'), [])

    def test_search_by_phone_in_any_format(self):
        self.assertEqual(self.search('8 917 123'), [self.designer.id])
        self.assertEqual(self.search('+7 (917) 123-45'), [self.designer.id])
        self.assertEqual(self.search('4567'), [self.designer.id])

    def test_create_normalizes_phone(self):
        response = self.client.post('/api/v1/designers/', {
            'full_name': 'Сидоров Олег', 'phone': '8 (937) 000-11-22', 'studio': '', 'bonus_percent': 5,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['phone'], '+79370001122')
        self.assertEqual(Designer.objects.get(pk=response.data['id']).created_by, self.manager)

    def test_same_phone_cannot_be_added_twice(self):
        response = self.client.post('/api/v1/designers/', {
            'full_name': 'Двойник', 'phone': '89171234567',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Петрова Анна', str(response.data['phone']))

    def test_name_and_phone_are_required(self):
        response = self.client.post('/api/v1/designers/', {'full_name': ' ', 'phone': '123'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('full_name', response.data)
        self.assertIn('phone', response.data)

    def test_bonus_is_two_digits_max(self):
        response = self.client.post('/api/v1/designers/', {
            'full_name': 'Щедрый', 'phone': '+79990001122', 'bonus_percent': 150,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('bonus_percent', response.data)


class OrderSalesFieldsTest(DesignerTestBase):
    def test_designer_answer_is_required_on_manual_create(self):
        response = self.create_manual()
        self.assertEqual(response.status_code, 400)
        self.assertIn('has_designer', response.data)

    def test_designer_answer_is_required_on_kp_create(self):
        response = self.create_from_kp()
        self.assertEqual(response.status_code, 400)
        self.assertIn('has_designer', response.data)

    def test_yes_requires_designer(self):
        response = self.create_manual(has_designer=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn('designer', response.data)

    def test_manual_create_with_designer_and_sales_fields(self):
        response = self.create_manual(
            has_designer=True, designer=self.designer.id,
            payment_month='2026-12-15', order_probability='high',
        )
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(client_name='Иванов')
        # По id из ответа форма открывает созданный заказ
        self.assertEqual(response.data['id'], order.id)
        self.assertTrue(order.has_designer)
        self.assertEqual(order.designer, self.designer)
        # Храним месяц — первым числом
        self.assertEqual(order.payment_month, date(2026, 12, 1))
        self.assertEqual(order.order_probability, 'high')

    def test_kp_create_without_designer(self):
        response = self.create_from_kp(has_designer=False, order_probability='low')
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(client_name='Иванов')
        self.assertIs(order.has_designer, False)
        self.assertIsNone(order.designer)
        self.assertEqual(order.order_probability, 'low')

    def test_no_designer_drops_selected_designer(self):
        self.create_manual(has_designer=False, designer=self.designer.id)
        self.assertIsNone(Order.objects.get(client_name='Иванов').designer)

    def test_old_order_can_be_edited_without_answer(self):
        order = Order.objects.create(manager=self.manager, salon=self.salon, client_name='Старый')
        response = self.client.patch(f'/api/v1/orders/{order.id}/', {'comment': 'правка'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_detail_returns_designer_card(self):
        self.create_manual(has_designer=True, designer=self.designer.id, order_probability='medium')
        order = Order.objects.get(client_name='Иванов')
        data = self.client.get(f'/api/v1/orders/{order.id}/').data
        self.assertEqual(data['designer']['full_name'], 'Петрова Анна')
        self.assertEqual(data['order_probability_display'], 'Средняя')
