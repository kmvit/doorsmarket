"""
Дизайнер, месяц оплаты и вероятность оформления при создании заказа.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_designer
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
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
            full_name='Петрова Анна', phone='+79171234567', studio='Лофт', bonus_percent=10, city=self.city,
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
        # Без учёта регистра и для кириллицы — независимо от локали базы
        self.assertEqual(self.search('петрова'), [self.designer.id])
        self.assertEqual(self.search('АННА'), [self.designer.id])
        self.assertEqual(self.search('лоф'), [self.designer.id])
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

    def test_workshop_list_shows_designer_payment_month_and_probability(self):
        self.create_manual(
            has_designer=True, designer=self.designer.id,
            payment_month='2026-12-01', order_probability='low',
        )
        row = self.client.get('/api/v1/workshop/').data[0]
        self.assertEqual(row['designer']['full_name'], 'Петрова Анна')
        self.assertEqual(row['designer']['studio'], 'Лофт')
        self.assertEqual(row['payment_month'], '2026-12-01')
        self.assertEqual(row['order_probability_display'], 'Низкая')


class DesignerPayoutTest(DesignerTestBase):
    """Папка «Выплаты дизайнерам» и отметка выплаты менеджером."""

    def make_order(self, status, designer=True, **extra):
        return Order.objects.create(
            manager=self.manager, salon=self.salon, client_name=f'{status}-{designer}',
            status=status, has_designer=designer, designer=self.designer if designer else None, **extra,
        )

    def folder_ids(self):
        response = self.client.get('/api/v1/orders/', {'folder': 'designer_payouts', 'exclude_finished': 'true'})
        self.assertEqual(response.status_code, 200)
        return {row['id'] for row in response.data}

    def test_folder_has_orders_with_designer_from_production_on(self):
        expected = {self.make_order(s).id for s in ('in_production', 'on_warehouse', 'shipped', 'completed')}
        self.make_order('paid')                      # ещё не в производстве
        self.make_order('in_production', designer=False)  # без дизайнера
        self.make_order('completed', designer_paid_at=timezone.now())  # уже выплачено
        # «Кроме выполненных» не должно прятать выполненный заказ из этой папки
        self.assertEqual(self.folder_ids(), expected)

    def test_folder_count_on_dashboard(self):
        self.make_order('shipped')
        counts = self.client.get('/api/v1/orders/folder_counts/', {'mine': 'true'}).data
        payouts = next(f for f in counts if f['folder'] == 'designer_payouts')
        self.assertEqual(payouts['label'], 'Выплаты дизайнерам')
        self.assertEqual(payouts['count'], 1)

    def test_mark_paid_removes_order_from_folder(self):
        order = self.make_order('shipped')
        response = self.client.post(f'/api/v1/orders/{order.id}/designer_paid/', {'amount': '15 000,50'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        order.refresh_from_db()
        self.assertEqual(order.designer_paid_amount, Decimal('15000.50'))
        self.assertEqual(order.designer_paid_by, self.manager)
        self.assertIsNotNone(order.designer_paid_at)
        self.assertEqual(self.folder_ids(), set())
        self.assertTrue(order.activity_logs.filter(kind='designer_paid').exists())

    def test_amount_is_required(self):
        order = self.make_order('shipped')
        for bad in ('', '0', '-5', 'abc'):
            response = self.client.post(f'/api/v1/orders/{order.id}/designer_paid/', {'amount': bad}, format='json')
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn('amount', response.data)

    def test_cannot_pay_twice_or_too_early(self):
        early = self.make_order('paid')
        response = self.client.post(f'/api/v1/orders/{early.id}/designer_paid/', {'amount': '100'}, format='json')
        self.assertEqual(response.status_code, 400)
        paid = self.make_order('completed', designer_paid_at=timezone.now(), designer_paid_amount=100)
        response = self.client.post(f'/api/v1/orders/{paid.id}/designer_paid/', {'amount': '100'}, format='json')
        self.assertEqual(response.status_code, 400)


class DesignerCityTest(DesignerTestBase):
    """Дизайнеры по городам: свой список, телефон уникален в пределах города, правка карточки."""

    def setUp(self):
        super().setUp()
        self.samara = City.objects.create(name='Самара')
        self.far_salon = Salon.objects.create(name='Самарский', city=self.samara)
        self.far_manager = User.objects.create_user(
            username='far', password='x', role='manager', city=self.samara, salon=self.far_salon,
        )
        self.far_designer = Designer.objects.create(full_name='Волков Игорь', phone='+79270000000', city=self.samara)

    def ids(self, client, **params):
        response = client.get('/api/v1/designers/', params)
        self.assertEqual(response.status_code, 200)
        return {d['id'] for d in response.data}

    def test_manager_sees_only_own_city(self):
        self.assertEqual(self.ids(self.client), {self.designer.id})
        self.assertEqual(self.ids(self.client, search='Волков'), set())

    def test_created_designer_gets_managers_city(self):
        response = self.client.post('/api/v1/designers/', {'full_name': 'Новиков', 'phone': '+79170001122'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Designer.objects.get(pk=response.data['id']).city, self.city)
        self.assertEqual(response.data['city_name'], 'Казань')

    def test_same_phone_allowed_in_other_city(self):
        far_client = APIClient()
        far_client.force_authenticate(self.far_manager)
        response = far_client.post('/api/v1/designers/', {
            'full_name': 'Петрова Анна', 'phone': '+79171234567',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Designer.objects.filter(phone='+79171234567').count(), 2)

    def test_manager_edits_designer(self):
        response = self.client.patch(f'/api/v1/designers/{self.designer.id}/', {
            'full_name': 'Петрова Анна Сергеевна', 'studio': 'Лофт-2', 'bonus_percent': 15, 'phone': '8 917 123-45-67',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.designer.refresh_from_db()
        self.assertEqual((self.designer.full_name, self.designer.studio, self.designer.bonus_percent),
                         ('Петрова Анна Сергеевна', 'Лофт-2', 15))
        # Правка не переносит дизайнера в другой город
        self.assertEqual(self.designer.city, self.city)

    def test_cannot_edit_designer_of_other_city(self):
        response = self.client.patch(f'/api/v1/designers/{self.far_designer.id}/', {'studio': 'X'}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_edit_to_duplicate_phone_rejected(self):
        other = Designer.objects.create(full_name='Другой', phone='+79170000099', city=self.city)
        response = self.client.patch(f'/api/v1/designers/{other.id}/', {'phone': '+79171234567'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.data)

    def test_order_rejects_designer_of_other_city(self):
        response = self.create_manual(has_designer=True, designer=self.far_designer.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn('designer', response.data)

    def test_admin_sees_all_and_filters_by_city(self):
        admin = User.objects.create_user(username='adm', password='x', role='admin')
        client = APIClient()
        client.force_authenticate(admin)
        self.assertEqual(self.ids(client), {self.designer.id, self.far_designer.id})
        self.assertEqual(self.ids(client, city=self.samara.id), {self.far_designer.id})
        response = client.post('/api/v1/designers/', {
            'full_name': 'Админский', 'phone': '+79990000000', 'city': self.samara.id,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Designer.objects.get(pk=response.data['id']).city, self.samara)


class DesignerDirectoryTest(DesignerTestBase):
    """Справочник дизайнеров: весь список города с числом заказов."""

    def test_all_returns_full_city_list_with_orders_count(self):
        for i in range(35):
            Designer.objects.create(full_name=f'Дизайнер {i:02d}', phone=f'+7917000{i:04d}', city=self.city)
        Order.objects.create(manager=self.manager, salon=self.salon, client_name='К', has_designer=True, designer=self.designer)
        limited = self.client.get('/api/v1/designers/').data
        self.assertEqual(len(limited), 30)                 # поиск в заказе — по-прежнему до 30
        full = self.client.get('/api/v1/designers/', {'all': '1'}).data
        self.assertEqual(len(full), 36)
        anna = next(d for d in full if d['id'] == self.designer.id)
        self.assertEqual(anna['orders_count'], 1)
