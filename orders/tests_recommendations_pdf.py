"""
Тест бланка «Рекомендации по подготовке дверных проёмов»:
открывание берётся из позиции КП (правки менеджера после замера),
а не из проёма замера.
Запуск: venv/bin/python manage.py test orders.tests_recommendations_pdf -v 2
"""
from unittest import mock

from django.test import TestCase
from django.contrib.auth import get_user_model

from users.models import City
from orders.models import (
    Salon, Order, OrderItem, OrderStatus,
    MeasurementRequest, Measurement, MeasurementOpening,
)
from orders.pdf_blank import render_recommendations_blank

User = get_user_model()


class FakeHTML:
    """Подменяет weasyprint.HTML, чтобы проверить HTML без рендера PDF."""
    captured = {}

    def __init__(self, string=None, base_url=None):
        FakeHTML.captured['html'] = string

    def write_pdf(self):
        return b'%PDF-fake'


class RecommendationsBlankOpeningTypeTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Тест-город')
        self.salon = Salon.objects.create(name='Тест-салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            status=OrderStatus.MEASUREMENT_DONE,
        )
        self.mr = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+700',
            created_by=self.manager,
        )
        self.m = Measurement.objects.create(request=self.mr, service_manager=self.sm)

    def _render(self):
        with mock.patch('weasyprint.HTML', FakeHTML):
            render_recommendations_blank(self.m)
        return FakeHTML.captured['html']

    def test_opening_type_from_order_item_overrides_measurement(self):
        # В замере СМ указал B Inverso, после замера менеджер поменял в КП на D Inverso
        item = OrderItem.objects.create(
            order=self.order, opening_number=1, room_name='Кухня',
            model_name='Дверь A', door_height=2000, door_width=800,
            opening_type='D_INVERSO',
        )
        MeasurementOpening.objects.create(
            measurement=self.m, opening_number=1, room_name='Кухня',
            door_type='interior', opening_type='B_INVERSO',
            actual_height=2080, actual_width=910, order_item=item,
        )
        html = self._render()
        self.assertIn('D Inverso', html)
        self.assertNotIn('B Inverso', html)

    def test_opening_type_falls_back_to_measurement(self):
        # Открывание в позиции КП не заполнено — берём из замера
        item = OrderItem.objects.create(
            order=self.order, opening_number=1, room_name='Кухня',
            model_name='Дверь A', door_height=2000, door_width=800,
        )
        MeasurementOpening.objects.create(
            measurement=self.m, opening_number=1, room_name='Кухня',
            door_type='interior', opening_type='B_INVERSO',
            actual_height=2080, actual_width=910, order_item=item,
        )
        html = self._render()
        self.assertIn('B Inverso', html)
