"""
Поля замера: удалённость объекта (кто платит, км), панели в проёме,
открывания и рабочая створка двустворчатой двери.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_measurement_fields
"""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
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


class MeasurementDonePushTest(MeasurementTestBase):
    """Замер выполнен — push менеджеру заказа."""

    @patch('users.push_utils.send_push_notification')
    def test_manager_gets_push(self, push):
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/')
        self.assertEqual(response.status_code, 200, response.data)
        push.assert_called_once()
        kwargs = push.call_args.kwargs
        self.assertEqual(kwargs['user'], self.order.manager)
        self.assertEqual(kwargs['url'], f'/orders/{self.order.id}')
        self.assertIn('Иванов', kwargs['body'])

    @patch('users.push_utils.send_push_notification')
    def test_no_push_when_not_done(self, push):
        Order.objects.filter(pk=self.order.pk).update(floor_number='')
        response = self.client.post(f'/api/v1/measurements/{self.m.id}/mark_done/')
        self.assertEqual(response.status_code, 400)
        push.assert_not_called()


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


class SlidingDoorOpeningTest(MeasurementTestBase):
    """Сдвижная дверь: открывание только вправо или влево."""

    def setUp(self):
        super().setUp()
        self.opening = MeasurementOpening.objects.create(measurement=self.m, opening_number=1, door_type='sliding')

    def patch(self, **data):
        return self.client.patch(f'/api/v1/measurement-openings/{self.opening.id}/', data, format='json')

    def test_sliding_accepts_right_and_left(self):
        for opening in ('right', 'left'):
            response = self.patch(opening_type=opening)
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['opening_type_display'], 'Влево')

    def test_sliding_rejects_swing_and_double_openings(self):
        self.assertEqual(self.patch(opening_type='A').status_code, 400)
        self.assertEqual(self.patch(opening_type='B_D').status_code, 400)

    def test_swing_door_rejects_right_left(self):
        MeasurementOpening.objects.filter(pk=self.opening.pk).update(door_type='interior')
        self.assertEqual(self.patch(opening_type='right').status_code, 400)

    def test_old_sliding_with_swing_opening_still_editable(self):
        MeasurementOpening.objects.filter(pk=self.opening.pk).update(opening_type='A')
        response = self.patch(opening_type='A', room_name='Гардеробная')
        self.assertEqual(response.status_code, 200, response.data)


class FrameAndSlopesTypeTest(SimpleTestCase):
    """Обрамление проёма и откосы на входную дверь: без авторекомендаций, как «Другое»."""

    def test_no_auto_recommendations(self):
        from orders.recommendations import build_recommendation_text, calculate_door_recommendation
        # Контроль: у межкомнатной с тем же проёмом рекомендации есть
        self.assertEqual(calculate_door_recommendation(2100, 900, 'interior'), (2030, 800))
        self.assertTrue(build_recommendation_text(2100, 900, 2000, 800, 'interior'))
        for door_type in ('opening_frame', 'entrance_slopes'):
            self.assertEqual(calculate_door_recommendation(2100, 900, door_type), (None, None))
            self.assertEqual(build_recommendation_text(2100, 900, 2000, 800, door_type), '')


class OpeningCreateRetryTest(MeasurementTestBase):
    """Повтор создания проёма из офлайн-очереди (ответ потерялся) не делает дубль."""

    def post(self, **data):
        return self.client.post('/api/v1/measurement-openings/', {'measurement': self.m.id, **data}, format='json')

    def test_same_client_uid_returns_existing_opening(self):
        first = self.post(opening_number=1, room_name='Спальня', client_uid='abc-1')
        self.assertEqual(first.status_code, 201, first.data)
        again = self.post(opening_number=1, room_name='Спальня', client_uid='abc-1')
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data['id'], first.data['id'])
        self.assertEqual(MeasurementOpening.objects.filter(measurement=self.m).count(), 1)

    def test_different_uids_and_no_uid_create_separate_openings(self):
        self.post(opening_number=1, client_uid='abc-1')
        self.post(opening_number=2, client_uid='abc-2')
        self.post(opening_number=3)
        self.post(opening_number=4)
        self.assertEqual(MeasurementOpening.objects.filter(measurement=self.m).count(), 4)


class BlankSizeBreaksTest(SimpleTestCase):
    """Размеры в бланке переносятся только после «×» и «+», числа целиком."""

    def test_double_door_width_gets_break_points_only_at_signs(self):
        from orders.templatetags.blank_sizes import ZWSP, size_breaks
        self.assertEqual(size_breaks('670 + 670'), f'670+{ZWSP}670')
        self.assertEqual(size_breaks('800+800+400'), f'800+{ZWSP}800+{ZWSP}400')
        self.assertEqual(size_breaks(1340), '1340')
        self.assertEqual(size_breaks(None), '')
