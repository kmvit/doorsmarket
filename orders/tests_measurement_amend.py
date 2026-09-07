"""
Тесты дополнения замера после кнопки «Замер выполнен».

СМ нередко обнаруживает пропущенный проём или уточняет размеры уже после того,
как закрыл замер. Раньше ради этого менеджер назначал повторный замер — теперь
СМ дополняет замер сам, пока менеджер его не обработал.

Запуск:
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_measurement_amend
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from orders.models import (
    Measurement,
    MeasurementOpening,
    MeasurementRequest,
    Order,
    OrderStatus,
    Salon,
)
from users.models import City

User = get_user_model()


class AmendMeasurementAfterDoneTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            status=OrderStatus.MEASUREMENT_DONE,
            lift_available=True, stairs_available=True, carry_to_entrance=False,
            floor_number='5',
        )
        self.request = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+70000000000',
            created_by=self.manager,
        )
        self.measurement = Measurement.objects.create(
            request=self.request, service_manager=self.sm,
            measurement_date=timezone.now(), is_done=True, done_at=timezone.now(),
        )
        self.opening = MeasurementOpening.objects.create(
            measurement=self.measurement, opening_number=1, room_name='Спальня',
            actual_height=2100, actual_width=900,
        )

        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    # ---------- пока замер не обработан ----------

    def test_sm_can_add_opening_after_marking_done(self):
        response = self.client.post(
            '/api/v1/measurement-openings/',
            {'measurement': self.measurement.pk, 'room_name': 'Кухня'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        # Номер проёма продолжает нумерацию.
        self.assertEqual(response.data['opening_number'], 2)
        self.assertEqual(self.measurement.openings.count(), 2)

    def test_sm_can_fill_data_of_existing_opening_after_done(self):
        response = self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150, 'actual_depth': 180},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.opening.refresh_from_db()
        self.assertEqual(self.opening.actual_height, 2150)
        self.assertEqual(self.opening.actual_depth, 180)

    def test_amending_marks_measurement_and_logs_once(self):
        self.assertIsNone(self.measurement.updated_after_done_at)

        self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        self.measurement.refresh_from_db()
        first_mark = self.measurement.updated_after_done_at
        self.assertIsNotNone(first_mark)

        logs = self.order.activity_logs.filter(
            description__icontains='дополнен после выполнения',
        )
        self.assertEqual(logs.count(), 1)
        self.assertEqual(logs.first().actor, self.sm)

        # Правки полей идут по одной на blur — журнал не должен ими забиваться.
        self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_width': 950}, format='json',
        )
        self.assertEqual(
            self.order.activity_logs.filter(
                description__icontains='дополнен после выполнения',
            ).count(),
            1,
        )
        # Но отметка обновляется — менеджер видит время последней правки.
        self.measurement.refresh_from_db()
        self.assertGreaterEqual(self.measurement.updated_after_done_at, first_mark)

    def test_editing_unfinished_measurement_does_not_mark_anything(self):
        self.measurement.is_done = False
        self.measurement.save(update_fields=['is_done'])

        self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        self.measurement.refresh_from_db()
        self.assertIsNone(self.measurement.updated_after_done_at)
        self.assertFalse(self.order.activity_logs.filter(
            description__icontains='дополнен после выполнения',
        ).exists())

    def test_sm_can_delete_opening_after_done(self):
        extra = MeasurementOpening.objects.create(
            measurement=self.measurement, opening_number=2, room_name='Лишний',
        )
        response = self.client.delete(f'/api/v1/measurement-openings/{extra.pk}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.measurement.openings.count(), 1)
        self.measurement.refresh_from_db()
        self.assertIsNotNone(self.measurement.updated_after_done_at)

    # ---------- после обработки менеджером ----------

    def test_processed_measurement_is_locked(self):
        self.measurement.is_processed = True
        self.measurement.processed_at = timezone.now()
        self.measurement.save(update_fields=['is_processed', 'processed_at'])

        patch = self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        self.assertEqual(patch.status_code, 400)
        self.assertIn('повторный замер', str(patch.data).lower())

        create = self.client.post(
            '/api/v1/measurement-openings/',
            {'measurement': self.measurement.pk, 'room_name': 'Кухня'}, format='json',
        )
        self.assertEqual(create.status_code, 400)

        delete = self.client.delete(f'/api/v1/measurement-openings/{self.opening.pk}/')
        self.assertEqual(delete.status_code, 400)

        self.opening.refresh_from_db()
        self.assertEqual(self.opening.actual_height, 2100)

    def test_repeat_measurement_clears_the_amend_mark(self):
        self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        self.measurement.refresh_from_db()
        self.assertIsNotNone(self.measurement.updated_after_done_at)

        manager_client = APIClient()
        manager_client.force_authenticate(self.manager)
        response = manager_client.post(
            f'/api/v1/measurements/{self.measurement.pk}/request_repeat/',
            {'reason': 'Не хватает проёма'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        self.measurement.refresh_from_db()
        self.assertFalse(self.measurement.is_done)
        self.assertIsNone(self.measurement.updated_after_done_at)

    # ---------- доступ ----------

    def test_measurement_exposes_the_mark_to_the_manager(self):
        self.client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        manager_client = APIClient()
        manager_client.force_authenticate(self.manager)
        response = manager_client.get(f'/api/v1/measurements/{self.measurement.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data['updated_after_done_at'])

    def test_stranger_cannot_touch_openings(self):
        other_city = City.objects.create(name='Москва')
        stranger = User.objects.create_user(
            username='sm2', password='x', role='service_manager', city=other_city,
        )
        stranger_client = APIClient()
        stranger_client.force_authenticate(stranger)
        response = stranger_client.patch(
            f'/api/v1/measurement-openings/{self.opening.pk}/',
            {'actual_height': 2150}, format='json',
        )
        self.assertEqual(response.status_code, 404)
