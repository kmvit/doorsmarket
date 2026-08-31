"""
Комментарий менеджера из заявки на замер должен быть виден СМ в самом замере.
Запуск: venv/bin/python manage.py test orders.tests_measurement_request_comment -v 2
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from users.models import City
from orders.models import (
    Salon, Order, OrderStatus, MeasurementRequest, Measurement,
)

User = get_user_model()


class MeasurementRequestCommentTest(TestCase):
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
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        self.mr = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+700',
            created_by=self.manager,
            comment='Код домофона 45, позвонить за час до выезда',
        )
        self.m = Measurement.objects.create(request=self.mr, service_manager=self.sm)

    def test_request_comment_visible_in_measurement(self):
        client = APIClient()
        client.force_authenticate(self.sm)
        r = client.get(f'/api/v1/measurements/{self.m.id}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(
            r.data['request_comment'],
            'Код домофона 45, позвонить за час до выезда',
        )

    def test_empty_comment_returns_blank_string(self):
        self.mr.comment = ''
        self.mr.save(update_fields=['comment'])
        client = APIClient()
        client.force_authenticate(self.sm)
        r = client.get(f'/api/v1/measurements/{self.m.id}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['request_comment'], '')
