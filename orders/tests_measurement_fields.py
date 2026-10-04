"""
Поля замера: удалённость объекта (кто платит, км), панели в проёме,
открывания и рабочая створка двустворчатой двери.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_measurement_fields
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementOpening, MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

User = get_user_model()


class MeasurementTestBase(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        salon = Salon.objects.create(name='Салон', city=city)
        manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city, salon=salon)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.order = Order.objects.create(
            manager=manager, salon=salon, client_name='Иванов', status=OrderStatus.MEASUREMENT_SCHEDULED,
            lift_available=True, stairs_available=True, carry_to_entrance=False, floor_number='3',
        )
        req = MeasurementRequest.objects.create(order=self.order, contact_name='К', contact_phone='+7', created_by=manager)
        self.m = Measurement.objects.create(request=req, service_manager=self.sm)
        self.client = APIClient()
        self.client.force_authenticate(self.sm)


class MeasurementDistanceTest(MeasurementTestBase):
    def conditions(self, **data):
        return self.client.post(f'/api/v1/measurements/{self.m.id}/set_site_conditions/', data, format='json')

    def test_saves_payment_and_distance(self):
        response = self.conditions(distance_payment='invoice', distance_km='12,5')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['distance_payment'], 'invoice')
        self.m.refresh_from_db()
        self.assertEqual(self.m.distance_km, Decimal('12.5'))

    def test_clearing_values(self):
        self.conditions(distance_payment='on_site', distance_km='5')
        self.conditions(distance_payment='', distance_km='')
        self.m.refresh_from_db()
        self.assertEqual(self.m.distance_payment, '')
        self.assertIsNone(self.m.distance_km)

    def test_rejects_bad_values(self):
        self.assertEqual(self.conditions(distance_payment='cash').status_code, 400)
        self.assertEqual(self.conditions(distance_km='далеко').status_code, 400)
        self.assertEqual(self.conditions(distance_km='-3').status_code, 400)

    def test_other_conditions_still_saved_alongside(self):
        self.conditions(floor_number='7', distance_km='3')
        self.order.refresh_from_db()
        self.assertEqual(self.order.floor_number, '7')

    def test_mark_done_requires_distance_when_payment_chosen(self):
        self.conditions(distance_payment='invoice')
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('расстояние', response.data['detail'])
        self.conditions(distance_km='20')
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_distance_is_optional(self):
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)


class OpeningPanelsTest(MeasurementTestBase):
    """Галочка «Панели» в проёме и количество."""

    def setUp(self):
        super().setUp()
        self.opening = MeasurementOpening.objects.create(measurement=self.m, opening_number=1)

    def patch(self, **data):
        return self.client.patch(f'/api/v1/measurement-openings/{self.opening.id}/', data, format='json')

    def test_panels_with_count(self):
        response = self.patch(has_panels=True, panels_count=3)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['has_panels'], response.data['panels_count']), (True, 3))

    def test_checked_panels_need_count(self):
        response = self.patch(has_panels=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn('panels_count', response.data)

    def test_unchecking_drops_count(self):
        self.patch(has_panels=True, panels_count=2)
        response = self.patch(has_panels=False)
        self.assertEqual(response.status_code, 200, response.data)
        self.opening.refresh_from_db()
        self.assertIsNone(self.opening.panels_count)

    def test_count_is_whole_number(self):
        self.assertEqual(self.patch(has_panels=True, panels_count='1.5').status_code, 400)


class DoubleDoorOpeningTest(MeasurementTestBase):
    """Двустворчатая дверь: открывания A+C / B+D / B+D Inverso и рабочая створка."""

    def setUp(self):
        super().setUp()
        self.opening = MeasurementOpening.objects.create(measurement=self.m, opening_number=1, door_type='double')

    def patch(self, **data):
        return self.client.patch(f'/api/v1/measurement-openings/{self.opening.id}/', data, format='json')

    def test_double_door_opening_and_working_leaf(self):
        response = self.patch(opening_type='B_D', working_leaf='A')
        self.assertEqual(response.status_code, 200, response.data)
        self.opening.refresh_from_db()
        self.assertEqual(self.opening.opening_display_full, 'B+D, рабочая A')

    def test_double_door_rejects_single_opening(self):
        self.assertEqual(self.patch(opening_type='A').status_code, 400)

    def test_single_door_rejects_double_opening_and_drops_leaf(self):
        MeasurementOpening.objects.filter(pk=self.opening.pk).update(door_type='interior')
        self.assertEqual(self.patch(opening_type='A_C').status_code, 400)
        response = self.patch(opening_type='C', working_leaf='B')
        self.assertEqual(response.status_code, 200, response.data)
        self.opening.refresh_from_db()
        self.assertEqual(self.opening.working_leaf, '')

    def test_working_leaf_only_letters(self):
        self.assertEqual(self.patch(working_leaf='E').status_code, 400)

    def test_old_double_opening_with_single_type_still_editable(self):
        # Старый двустворчатый проём с одиночным открыванием: правка других полей проходит
        MeasurementOpening.objects.filter(pk=self.opening.pk).update(opening_type='A')
        response = self.patch(opening_type='A', room_name='Зал')
        self.assertEqual(response.status_code, 200, response.data)

    def test_double_inverso_warning(self):
        response = self.patch(opening_type='B_D_INVERSO')
        self.assertIsNotNone(response.data['inverso_warning'])

    def test_blank_pdf_html_shows_working_leaf(self):
        self.patch(opening_type='A_C', working_leaf='C')
        from django.template.loader import render_to_string
        html = render_to_string('orders/measurement_blank.html', {
            'm': self.m, 'order': self.order, 'openings': [MeasurementOpening.objects.get(pk=self.opening.pk)],
        })
        self.assertIn('A+C, рабочая C', html)
