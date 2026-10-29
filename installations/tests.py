"""
Монтажи, этап 1: оформление монтажа, общий список города, папка
«Оформить монтаж» и «Монтаж не нужен».

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from orders.models import ActivityKind, Measurement, MeasurementRequest, Order, OrderStatus, Salon
from users.models import City

from .models import EventKind, Installation, InstallationFile, InstallationStatus

User = get_user_model()

MEDIA = tempfile.mkdtemp()


def pdf(name):
    return SimpleUploadedFile(name, b'%PDF-1.4 test', content_type='application/pdf')


@override_settings(MEDIA_ROOT=MEDIA)
class InstallationTestBase(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.other_city = City.objects.create(name='Самара')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.salon2 = Salon.objects.create(name='Второй салон', city=self.city)
        self.other_salon = Salon.objects.create(name='Чужой', city=self.other_city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', salon=self.salon,
        )
        self.manager2 = User.objects.create_user(
            username='mgr2', password='x', role='manager', salon=self.salon2,
        )
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.city)
        self.installer = User.objects.create_user(username='inst', password='x', role='installer', city=self.city)
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            address='ул. Баумана, 1', contact_phone='+79990000000', status=OrderStatus.ON_WAREHOUSE,
        )

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def create_payload(self, order=None, **extra):
        data = {
            'order': (order or self.order).id,
            'is_paid': 'true',
            'work_description': '3 межкомнатные двери',
            'collection_finish': 'Модена, эмаль белая',
            'planned_delivery_date': '2026-11-10',
            'contact_name': 'Иванов Иван',
            'contact_phone': '+79991112233',
            'measurement_blank': pdf('blank.pdf'),
            'final_kp': pdf('kp.pdf'),
            'installation_kp': pdf('kp_install.pdf'),
        }
        data.update(extra)
        return {k: v for k, v in data.items() if v is not None}

    def create(self, user=None, **extra):
        return self.client_for(user or self.manager).post(
            '/api/v1/installations/', self.create_payload(**extra), format='multipart',
        )


class CreateInstallationTest(InstallationTestBase):
    def test_manager_creates_installation_with_documents(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        inst = Installation.objects.get()
        self.assertEqual(inst.status, InstallationStatus.NOT_PLANNED)
        self.assertTrue(inst.is_paid)
        self.assertEqual(inst.created_by, self.manager)
        self.assertEqual(
            sorted(inst.files.values_list('kind', flat=True)),
            ['final_kp', 'installation_kp', 'measurement_blank'],
        )
        self.assertEqual(response.data['client_name'], 'Иванов')
        self.assertTrue(inst.events.filter(kind=EventKind.CREATED).exists())
        self.assertTrue(self.order.activity_logs.filter(kind=ActivityKind.INSTALLATION_CREATED).exists())

    def test_paid_flag_is_required(self):
        response = self.create(is_paid=None)
        self.assertEqual(response.status_code, 400)
        self.assertIn('is_paid', response.data)

    def test_required_documents(self):
        response = self.create(final_kp=None, installation_kp=None)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Финальное КП', response.data['files'][0])
        self.assertIn('КП на монтаж', response.data['files'][0])
        self.assertFalse(Installation.objects.exists())

    def test_measurement_blank_required_only_without_done_measurement(self):
        self.assertEqual(self.create(measurement_blank=None).status_code, 400)

        mr = MeasurementRequest.objects.create(
            order=self.order, contact_name='Петров', contact_phone='+79995554433',
        )
        Measurement.objects.create(request=mr, service_manager=self.sm, is_done=True)
        response = self.create(measurement_blank=None)
        self.assertEqual(response.status_code, 201, response.data)
        # Бланк выполненного замера сам попадает в пакет документов
        kinds = [d['kind'] for d in response.data['order_documents']]
        self.assertIn('order_measurement', kinds)

    def test_several_installations_per_order(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.order.installations.count(), 2)

    def test_service_manager_and_installer_cannot_create(self):
        self.assertEqual(self.create(user=self.sm).status_code, 403)
        self.assertEqual(self.create(user=self.installer).status_code, 403)

    def test_manager_cannot_create_for_foreign_salon_order(self):
        other = Order.objects.create(manager=self.manager2, salon=self.salon2, client_name='Сидоров')
        response = self.create(order=other)
        self.assertEqual(response.status_code, 400)

    def test_prefill_takes_contact_from_measurement_request(self):
        MeasurementRequest.objects.create(order=self.order, contact_name='Петров', contact_phone='+79995554433')
        response = self.client_for(self.manager).get('/api/v1/installations/prefill/', {'order': self.order.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['contact_name'], 'Петров')
        self.assertTrue(response.data['measurement_blank_required'])


class InstallationListTest(InstallationTestBase):
    def setUp(self):
        super().setUp()
        self.inst = Installation.objects.create(
            order=self.order, is_paid=False, work_description='Двери', collection_finish='Модена',
        )
        order2 = Order.objects.create(manager=self.manager2, salon=self.salon2, client_name='Сидоров')
        self.inst2 = Installation.objects.create(
            order=order2, is_paid=True, work_description='Двери', collection_finish='Модена',
            status=InstallationStatus.DONE,
        )
        foreign = Order.objects.create(manager=self.manager2, salon=self.other_salon, client_name='Чужой')
        self.foreign = Installation.objects.create(
            order=foreign, is_paid=True, work_description='Двери', collection_finish='Модена',
        )

    def ids(self, user, **params):
        response = self.client_for(user).get('/api/v1/installations/', params)
        self.assertEqual(response.status_code, 200)
        return {row['id'] for row in response.data}

    def test_list_is_shared_by_city(self):
        # Менеджер видит монтажи всего города, а не только своего салона
        self.assertEqual(self.ids(self.manager), {self.inst.id, self.inst2.id})
        self.assertEqual(self.ids(self.sm), {self.inst.id, self.inst2.id})

    def test_installer_sees_only_installations_he_is_assigned_to(self):
        # Монтажник видит только монтажи, где он на выезде (этап 3); здесь — ни одного
        response = self.client_for(self.installer).get('/api/v1/installations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_filters(self):
        self.assertEqual(self.ids(self.sm, exclude_closed='true'), {self.inst.id})
        # Явно выбранный закрытый статус показываем и при «кроме выполненных»
        self.assertEqual(self.ids(self.sm, exclude_closed='true', status='done'), {self.inst2.id})
        self.assertEqual(self.ids(self.sm, is_paid='false'), {self.inst.id})
        self.assertEqual(self.ids(self.sm, is_paid='true'), {self.inst2.id})
        self.assertEqual(self.ids(self.sm, search='Сидоров'), {self.inst2.id})
        self.assertEqual(self.ids(self.sm, search=f'#{self.order.id}'), {self.inst.id})
        self.assertEqual(self.ids(self.manager, mine='true'), {self.inst.id})

    def test_service_manager_edits_installation(self):
        response = self.client_for(self.sm).patch(
            f'/api/v1/installations/{self.inst.id}/',
            {'contact_name': 'Новый контакт', 'is_paid': True}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.contact_name, 'Новый контакт')
        self.assertTrue(self.inst.is_paid)
        event = self.inst.events.get(kind=EventKind.UPDATED)
        self.assertEqual(event.actor, self.sm)
        self.assertIn('Контактное лицо', event.description)

    def test_order_is_not_changed_by_edit(self):
        order2 = Order.objects.create(manager=self.manager, salon=self.salon, client_name='Другой')
        self.client_for(self.manager).patch(
            f'/api/v1/installations/{self.inst.id}/', {'order': order2.id}, format='json',
        )
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.order, self.order)

    def test_closed_installation_is_read_only(self):
        response = self.client_for(self.manager).patch(
            f'/api/v1/installations/{self.inst2.id}/', {'contact_name': 'X'}, format='json',
        )
        self.assertEqual(response.status_code, 400)


class InstallationFilesTest(InstallationTestBase):
    def setUp(self):
        super().setUp()
        response = self.create()
        self.inst = Installation.objects.get(pk=response.data['id'])

    def test_last_required_file_cannot_be_deleted(self):
        kp = self.inst.files.get(kind='final_kp')
        response = self.client_for(self.manager).delete(f'/api/v1/installation-files/{kp.id}/')
        self.assertEqual(response.status_code, 400)

        upload = self.client_for(self.sm).post('/api/v1/installation-files/', {
            'installation': self.inst.id, 'kind': 'final_kp', 'file': pdf('kp2.pdf'),
        }, format='multipart')
        self.assertEqual(upload.status_code, 201, upload.data)
        response = self.client_for(self.manager).delete(f'/api/v1/installation-files/{kp.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(list(self.inst.files.filter(kind='final_kp').values_list('name', flat=True)), ['kp2.pdf'])

    def test_optional_files_can_be_deleted(self):
        upload = self.client_for(self.manager).post('/api/v1/installation-files/', {
            'installation': self.inst.id, 'kind': 'photo',
            'file': SimpleUploadedFile('door.jpg', b'jpg', content_type='image/jpeg'),
        }, format='multipart')
        self.assertEqual(upload.status_code, 201)
        self.assertEqual(upload.data['attachment_type'], 'photo')
        response = self.client_for(self.manager).delete(f'/api/v1/installation-files/{upload.data["id"]}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(InstallationFile.objects.filter(kind='photo').exists())

    def test_installer_cannot_upload_to_foreign_installation(self):
        response = self.client_for(self.installer).post('/api/v1/installation-files/', {
            'installation': self.inst.id, 'kind': 'act', 'file': pdf('x.pdf'),
        }, format='multipart')
        self.assertEqual(response.status_code, 400)


class InstallationNeededFolderTest(InstallationTestBase):
    def folder_ids(self):
        response = self.client_for(self.manager).get('/api/v1/orders/', {'folder': 'installation_needed'})
        self.assertEqual(response.status_code, 200)
        return {row['id'] for row in response.data}

    def test_folder_lists_orders_on_warehouse_and_shipped(self):
        shipped = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Б', status=OrderStatus.SHIPPED,
        )
        Order.objects.create(manager=self.manager, salon=self.salon, client_name='В', status=OrderStatus.PAID)
        self.assertEqual(self.folder_ids(), {self.order.id, shipped.id})

    def test_order_leaves_folder_after_installation_created(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.folder_ids(), set())

    def test_not_needed_and_restore(self):
        url = '/api/v1/installations/set_not_needed/'
        response = self.client_for(self.manager).post(url, {'order': self.order.id, 'not_needed': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.folder_ids(), set())
        self.order.refresh_from_db()
        self.assertEqual(self.order.installation_not_needed_by, self.manager)

        response = self.client_for(self.manager).post(url, {'order': self.order.id, 'not_needed': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.folder_ids(), {self.order.id})

    def test_creating_installation_clears_not_needed(self):
        self.order.installation_not_needed_at = '2026-10-01T10:00:00Z'
        self.order.save()
        self.assertEqual(self.create().status_code, 201)
        self.order.refresh_from_db()
        self.assertIsNone(self.order.installation_not_needed_at)

    def test_folder_counts_include_installation_needed(self):
        response = self.client_for(self.manager).get('/api/v1/orders/folder_counts/', {'mine': 'true'})
        folder = next(f for f in response.data if f['folder'] == 'installation_needed')
        self.assertEqual(folder['count'], 1)
