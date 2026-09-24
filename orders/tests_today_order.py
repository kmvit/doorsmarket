"""
Тест сортировки папки «Сегодня замер».

Замеры на сегодня должны идти по назначенному времени, с самого раннего:
СМ смотрит список как расписание дня и не открывает каждый замер, чтобы
вспомнить, во сколько он назначен.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_today_order
"""
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import (
    Measurement,
    MeasurementRequest,
    Order,
    OrderStatus,
    Salon,
)
from users.models import City

User = get_user_model()


class TodayMeasurementOrderTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    def at(self, hour, minute=0):
        """Сегодняшнее время в текущей таймзоне."""
        naive = datetime.combine(timezone.localdate(), time(hour, minute))
        return timezone.make_aware(naive, timezone.get_current_timezone())

    def make_measurement(self, client_name, when):
        order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name=client_name,
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        req = MeasurementRequest.objects.create(
            order=order, contact_name=client_name, contact_phone='+700',
            created_by=self.manager,
        )
        return Measurement.objects.create(
            request=req, service_manager=self.sm, measurement_date=when,
        )

    def test_today_folder_sorted_by_time(self):
        # Создаём вразнобой: порядок создания не должен влиять на выдачу
        late = self.make_measurement('Поздний', self.at(17, 30))
        early = self.make_measurement('Ранний', self.at(9, 0))
        midday = self.make_measurement('Дневной', self.at(13, 15))
        # Завтрашний замер в папку не попадает
        self.make_measurement('Завтрашний', self.at(8, 0) + timedelta(days=1))

        response = self.client.get('/api/v1/measurements/', {'folder': 'today'})
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data]
        self.assertEqual(ids, [early.pk, midday.pk, late.pk])

    def test_explicit_ordering_wins(self):
        early = self.make_measurement('Ранний', self.at(9, 0))
        late = self.make_measurement('Поздний', self.at(17, 30))

        response = self.client.get(
            '/api/v1/measurements/', {'folder': 'today', 'ordering': '-measurement_date'},
        )
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data]
        self.assertEqual(ids, [late.pk, early.pk])
