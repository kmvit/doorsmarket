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


class MeasurementBlankSignatureTest(TestCase):
    """
    Подпись сервис-менеджера на бланке замера должна быть одна. Их было две
    рядом: в строке подписей вместе с клиентом и следом в подвале
    («Замер произвёл (СМ) ____»), и подписывать предлагалось дважды.
    """

    def setUp(self):
        self.city = City.objects.create(name='Тест-город')
        self.salon = Salon.objects.create(name='Тест-салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr_blank', password='x', role='manager',
            city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm_blank', password='x', role='service_manager',
            city=self.city, first_name='Пётр', last_name='Петров',
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
        from orders.pdf_blank import render_measurement_blank

        with mock.patch('weasyprint.HTML', FakeHTML):
            render_measurement_blank(self.m)
        return FakeHTML.captured['html']

    def test_signature_row_keeps_both_parties(self):
        html = self._render()
        self.assertIn('Клиент (ФИО, подпись)', html)
        self.assertIn('Сервис-менеджер: Пётр Петров', html)

    def test_duplicate_signature_in_the_footer_is_gone(self):
        self.assertNotIn('Замер произвёл', self._render())

    def test_footer_warnings_are_still_there(self):
        html = self._render()
        self.assertIn('ЧИСТОГО» ПОЛА', html)
        self.assertIn('ответственность за любые изменения размеров', html)


class MeasurementBlankSizesTest(TestCase):
    """
    Размер проёма в таблице бланка рвался посреди числа: «2100×2520×100»
    печаталось как «2100×2520×10 / 0», а «2090×2520» — как «2090×252 / 0».
    Прочитать такое нельзя, поэтому размер набирается одной строкой.
    """

    def setUp(self):
        self.city = City.objects.create(name='Тест-город')
        self.salon = Salon.objects.create(name='Тест-салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr_sizes', password='x', role='manager',
            city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm_sizes', password='x', role='service_manager', city=self.city,
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
        MeasurementOpening.objects.create(
            measurement=self.m, opening_number=1, room_name='Оп вход',
            actual_height=2100, actual_width=2520, actual_depth=100,
            recommended_opening_height=2090, recommended_opening_width=2520,
            recommended_door_height=2010, recommended_door_width=620,
        )

    def _render(self):
        from orders.pdf_blank import render_measurement_blank

        with mock.patch('weasyprint.HTML', FakeHTML):
            render_measurement_blank(self.m)
        return FakeHTML.captured['html']

    def test_size_cells_are_not_broken_inside_a_number(self):
        html = self._render()
        self.assertIn('table.openings td.size { white-space: nowrap; }', html)
        # Все три колонки размеров помечены: факт, рек. дверь, рек. проём.
        self.assertEqual(html.count('<td class="size">'), 3)

    def test_sizes_are_printed_as_a_whole(self):
        html = self._render()
        self.assertIn('2100×2520×100', html)
        self.assertIn('2090×2520', html)
        self.assertIn('2010×620', html)

    def test_columns_still_fill_the_page(self):
        """Ширины колонок перераспределены — в сумме должно остаться 100%."""
        import re

        html = self._render()
        widths = [float(w) for w in re.findall(r'<col style="width:([\d.]+)%">', html)]
        self.assertEqual(len(widths), 14)
        self.assertEqual(sum(widths), 100)
