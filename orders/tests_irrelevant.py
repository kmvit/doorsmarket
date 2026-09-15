"""
Тесты пометки замера неактуальным.

Сценарий: СМ на объекте понимает, что замер не нужен, и помечает его.
Решение принимает менеджер — до его подтверждения замер остаётся в работе
и виден в заявках, иначе заявка тихо исчезала бы у менеджера из-под носа.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_irrelevant
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
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


class IrrelevantMeasurementTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
            first_name='Пётр', last_name='Петров',
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        self.request_obj = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+700',
            created_by=self.manager,
        )
        self.measurement = Measurement.objects.create(
            request=self.request_obj, service_manager=self.sm,
        )

        self.sm_client = APIClient()
        self.sm_client.force_authenticate(self.sm)
        self.manager_client = APIClient()
        self.manager_client.force_authenticate(self.manager)

    def url(self, action):
        # Действия висят на заказе: отказаться могут до появления замера
        return f'/api/v1/orders/{self.order.pk}/{action}/'

    def folder_ids(self, client, folder):
        response = client.get('/api/v1/measurements/', {'folder': folder})
        self.assertEqual(response.status_code, 200)
        return [row['id'] for row in response.data if row.get('id')]

    # ---------- СМ помечает ----------

    def test_service_manager_marks_measurement_irrelevant(self):
        response = self.sm_client.post(
            self.url('mark_measurement_irrelevant'), {'reason': 'Клиент передумал'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        self.request_obj.refresh_from_db()
        self.assertIsNotNone(self.request_obj.irrelevant_requested_at)
        self.assertEqual(self.request_obj.irrelevant_reason, 'Клиент передумал')
        self.assertEqual(self.request_obj.irrelevant_requested_by, self.sm)
        # Решение за менеджером — сам факт пометки замер ещё не закрывает.
        self.assertFalse(self.measurement.is_irrelevant)
        self.assertEqual(response.data['irrelevant_requested_by_name'], 'Пётр Петров')

    def test_manager_cannot_mark_irrelevant(self):
        response = self.manager_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_done_measurement_cannot_be_marked_irrelevant(self):
        self.measurement.is_done = True
        self.measurement.save(update_fields=['is_done'])
        response = self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_marked_measurement_stays_in_work_until_manager_decides(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {'reason': 'Объект не готов'}, format='json')
        # Пока менеджер не подтвердил — замер продолжает висеть в заявках.
        self.assertIn(self.measurement.pk, self.folder_ids(self.manager_client, 'unscheduled'))
        self.assertNotIn(self.measurement.pk, self.folder_ids(self.manager_client, 'irrelevant'))

    # ---------- менеджер решает ----------

    def test_confirm_moves_measurement_out_of_work(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {'reason': 'Клиент передумал'}, format='json')
        response = self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.request_obj.refresh_from_db()
        self.assertTrue(self.request_obj.is_irrelevant)
        self.assertEqual(self.request_obj.irrelevant_confirmed_by, self.manager)

        self.assertNotIn(self.measurement.pk, self.folder_ids(self.manager_client, 'unscheduled'))
        self.assertIn(self.measurement.pk, self.folder_ids(self.manager_client, 'irrelevant'))

    def test_confirmed_measurement_disappears_from_all_working_folders(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')

        for folder in ('', 'unscheduled', 'scheduled', 'today', 'drafts', 'done', 'mine'):
            self.assertNotIn(
                self.measurement.pk, self.folder_ids(self.manager_client, folder),
                msg=f'Неактуальный замер виден в папке «{folder or "Все"}»',
            )

    def test_keep_relevant_returns_measurement_to_work(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {'reason': 'Клиент передумал'}, format='json')
        response = self.manager_client.post(
            self.url('keep_measurement_relevant'), {'comment': 'Клиент подтвердил заказ'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        self.request_obj.refresh_from_db()
        self.assertFalse(self.request_obj.is_irrelevant)
        # Пометку снимаем целиком: у менеджера не должно остаться висящего окна.
        self.assertIsNone(self.request_obj.irrelevant_requested_at)
        self.assertEqual(self.request_obj.irrelevant_reason, '')
        self.assertIn(self.measurement.pk, self.folder_ids(self.manager_client, 'unscheduled'))

    def test_service_manager_cannot_decide(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.assertEqual(
            self.sm_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json').status_code, 403,
        )
        self.assertEqual(
            self.sm_client.post(self.url('keep_measurement_relevant'), {}, format='json').status_code, 403,
        )

    def test_cannot_decide_on_unmarked_measurement(self):
        self.assertEqual(
            self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json').status_code, 400,
        )
        self.assertEqual(
            self.manager_client.post(self.url('keep_measurement_relevant'), {}, format='json').status_code, 400,
        )

    # ---------- прочее ----------

    def test_irrelevant_measurement_cannot_be_marked_done(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')
        response = self.sm_client.post(f'/api/v1/measurements/{self.measurement.pk}/mark_done/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_irrelevant_measurement_is_still_openable(self):
        # Из списков убран, но карточка должна открываться — по ней остаётся история.
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')
        response = self.manager_client.get(f'/api/v1/measurements/{self.measurement.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_irrelevant'])

    def test_folder_counts_include_irrelevant(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')
        response = self.manager_client.get('/api/v1/measurements/folder_counts/')
        counts = {row['folder']: row['count'] for row in response.data}
        self.assertEqual(counts['irrelevant'], 1)
        self.assertEqual(counts['unscheduled'], 0)


class IrrelevantBeforeMeasurementTest(TestCase):
    """
    Клиент может отказаться от замера до того, как СМ назначил дату: замера
    ещё нет, есть только заявка. Кнопка «Неактуален» должна работать уже здесь.
    """

    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr3', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm3', password='x', role='service_manager', city=self.city,
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Сидоров',
            status=OrderStatus.MEASUREMENT_REQUESTED,
        )
        self.request_obj = MeasurementRequest.objects.create(
            order=self.order, contact_name='Сидоров', contact_phone='+701',
            created_by=self.manager,
        )
        self.sm_client = APIClient(); self.sm_client.force_authenticate(self.sm)
        self.manager_client = APIClient(); self.manager_client.force_authenticate(self.manager)

    def url(self, action):
        return f'/api/v1/orders/{self.order.pk}/{action}/'

    def pending_rows(self, client):
        response = client.get('/api/v1/measurements/', {'folder': 'unscheduled'})
        return [r for r in response.data if r.get('is_request_only')]

    def test_request_without_measurement_can_be_marked(self):
        self.assertFalse(hasattr(self.request_obj, 'measurement'))

        response = self.sm_client.post(
            self.url('mark_measurement_irrelevant'),
            {'reason': 'Клиент отказался от замера'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        self.request_obj.refresh_from_db()
        self.assertIsNotNone(self.request_obj.irrelevant_requested_at)
        self.assertFalse(self.request_obj.is_irrelevant)

    def test_marked_request_stays_in_list_until_manager_decides(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        rows = self.pending_rows(self.manager_client)
        self.assertEqual([r['order_id'] for r in rows], [self.order.pk])
        self.assertIsNotNone(rows[0]['irrelevant_requested_at'])

    def test_confirmed_request_disappears_from_list(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('confirm_measurement_irrelevant'), {}, format='json')

        self.request_obj.refresh_from_db()
        self.assertTrue(self.request_obj.is_irrelevant)
        self.assertEqual(self.pending_rows(self.manager_client), [])

    def test_kept_request_returns_to_list(self):
        self.sm_client.post(self.url('mark_measurement_irrelevant'), {}, format='json')
        self.manager_client.post(self.url('keep_measurement_relevant'), {}, format='json')

        rows = self.pending_rows(self.manager_client)
        self.assertEqual([r['order_id'] for r in rows], [self.order.pk])
        self.assertIsNone(rows[0]['irrelevant_requested_at'])

    def test_order_without_request_is_rejected(self):
        bare = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Без заявки',
            status=OrderStatus.ACTIVE,
        )
        response = self.sm_client.post(
            f'/api/v1/orders/{bare.pk}/mark_measurement_irrelevant/', {}, format='json',
        )
        self.assertEqual(response.status_code, 400)
