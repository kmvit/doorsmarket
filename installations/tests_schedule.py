"""
Монтажи, этап 2: СМ распределяет монтажи по монтажникам, графики,
«не готов к монтажу», «не актуален» с подтверждением менеджера, СМС.

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from orders.models import ActivityKind, Order, OrderStatus, Salon
from users.models import City

from .models import EventKind, Installation, InstallationStatus, InstallationVisit

User = get_user_model()
SEND = 'maxbot.sending.send_client_message'


class ScheduleTestBase(TestCase):
    def setUp(self):
        # Отправку клиенту подменяем во всех тестах: иначе при включённом флаге
        # запрос ушёл бы в настоящий SMS.ru / MAX
        patcher = mock.patch(SEND, return_value='sms')
        self.send = patcher.start()
        self.addCleanup(patcher.stop)
        self.city = City.objects.create(name='Казань')
        other_city = City.objects.create(name='Самара')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', salon=self.salon)
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
            first_name='Пётр', last_name='Петров', phone_number='+79990001122',
        )
        self.inst1 = User.objects.create_user(username='i1', password='x', role='installer', city=self.city,
                                              first_name='Иван')
        self.inst2 = User.objects.create_user(username='i2', password='x', role='installer', city=self.city,
                                              first_name='Олег')
        self.foreign_installer = User.objects.create_user(username='i3', password='x', role='installer',
                                                          city=other_city)
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов', address='ул. Баумана, 1',
            status=OrderStatus.ON_WAREHOUSE,
        )
        self.inst = Installation.objects.create(
            order=self.order, is_paid=True, work_description='3 двери', collection_finish='Модена',
            contact_name='Мария', contact_phone='+79995554433',
        )

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def post(self, user, action, data=None):
        return self.client_for(user).post(
            f'/api/v1/installations/{self.inst.id}/{action}/', data or {}, format='json',
        )

    def assign(self, user=None, installers=None, date_from='2026-11-10', date_to='2026-11-11'):
        return self.post(user or self.sm, 'assign', {
            'installers': installers or [self.inst1.id], 'date_from': date_from, 'date_to': date_to,
        })


@override_settings(INSTALLATIONS_SMS_ENABLED=True)
class AssignTest(ScheduleTestBase):
    def test_sm_assigns_installation(self):
        send = self.send
        response = self.assign(installers=[self.inst1.id, self.inst2.id])
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.PLANNED)
        visit = InstallationVisit.objects.get()
        self.assertEqual((visit.date_from, visit.date_to), (date(2026, 11, 10), date(2026, 11, 11)))
        self.assertEqual(set(visit.installers.all()), {self.inst1, self.inst2})
        self.assertEqual(response.data['current_visit']['date_from'], '2026-11-10')
        # СМС контактному лицу монтажа: дата и руководитель сервисной службы
        phone, text = send.call_args.args
        self.assertEqual(phone, '+79995554433')
        self.assertIn('запланирован монтаж на 10.11.2026', text)
        self.assertIn('Пётр Петров, +79990001122', text)
        self.assertTrue(self.order.activity_logs.filter(kind=ActivityKind.SMS_SENT).exists())

    def test_reassign_keeps_one_visit_and_sms_only_on_date_change(self):
        send = self.send
        self.assign()
        self.assign(installers=[self.inst2.id])  # та же дата — другой монтажник
        self.assertEqual(send.call_count, 1)
        self.assign(installers=[self.inst2.id], date_from='2026-11-12', date_to='2026-11-12')
        self.assertEqual(send.call_count, 2)
        self.assertIn('перенесён на 12.11.2026', send.call_args.args[1])
        self.assertEqual(InstallationVisit.objects.count(), 1)

    def test_only_service_manager_assigns(self):
        self.assertEqual(self.assign(user=self.manager).status_code, 403)

    def test_installers_must_be_from_installation_city(self):
        response = self.assign(installers=[self.foreign_installer.id])
        self.assertEqual(response.status_code, 400)
        response = self.assign(installers=[self.manager.id])
        self.assertEqual(response.status_code, 400)

    def test_date_validation(self):
        self.assertEqual(self.assign(date_from='2026-11-12', date_to='2026-11-10').status_code, 400)
        self.assertEqual(self.assign(date_from='').status_code, 400)

    def test_one_day_installation(self):
        response = self.post(self.sm, 'assign', {'installers': [self.inst1.id], 'date_from': '2026-11-10'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(InstallationVisit.objects.get().date_to, date(2026, 11, 10))

    def test_unassign(self):
        self.assign()
        response = self.post(self.sm, 'unassign')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.NOT_PLANNED)
        self.assertFalse(InstallationVisit.objects.exists())

    def test_partially_done_gets_new_visit(self):
        self.assign()
        Installation.objects.filter(pk=self.inst.pk).update(status=InstallationStatus.PARTIALLY_DONE)
        self.assign(date_from='2026-11-20', date_to='2026-11-20')
        self.assertEqual(InstallationVisit.objects.count(), 2)


class SmsSwitchTest(ScheduleTestBase):
    @override_settings(INSTALLATIONS_SMS_ENABLED=False)
    def test_sms_disabled_is_only_logged(self):
        response = self.assign()
        self.assertEqual(response.status_code, 200)
        self.send.assert_not_called()
        event = self.inst.events.get(kind=EventKind.SMS_SENT)
        self.assertTrue(event.meta['suppressed'])
        self.assertIn('отключены', event.description)

    @override_settings(INSTALLATIONS_SMS_ENABLED=True)
    def test_call_failed_sms(self):
        response = self.post(self.sm, 'notify_call_failed')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('не дозвонились', self.send.call_args.args[1])
        self.assertEqual(self.post(self.manager, 'notify_call_failed').status_code, 403)


class StatusFlowTest(ScheduleTestBase):
    def test_not_ready_and_back(self):
        self.assign()
        response = self.post(self.sm, 'not_ready')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.NOT_READY)
        # Дата освобождается в графике
        self.assertFalse(InstallationVisit.objects.exists())
        self.assertEqual(self.assign().status_code, 400)

        # Клиент готов: менеджер нажимает «Назначить монтаж»
        response = self.post(self.manager, 'ready')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.NOT_PLANNED)

    def test_irrelevant_needs_manager_confirmation(self):
        self.assign()
        response = self.post(self.sm, 'request_irrelevant', {'reason': 'Клиент отказался'})
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        # До решения менеджера монтаж в работе
        self.assertEqual(self.inst.status, InstallationStatus.PLANNED)
        self.assertEqual(self.inst.irrelevant_reason, 'Клиент отказался')
        self.assertEqual(self.post(self.sm, 'confirm_irrelevant').status_code, 403)

        response = self.post(self.manager, 'confirm_irrelevant')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.IRRELEVANT)
        self.assertIsNone(self.inst.irrelevant_requested_at)
        self.assertFalse(InstallationVisit.objects.exists())

    def test_manager_keeps_installation(self):
        self.post(self.sm, 'request_irrelevant', {'reason': 'Не берёт трубку'})
        response = self.post(self.manager, 'keep_relevant', {'comment': 'Клиент ждёт'})
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertIsNone(self.inst.irrelevant_requested_at)
        self.assertEqual(self.inst.status, InstallationStatus.NOT_PLANNED)

    def test_folders(self):
        c = self.client_for(self.manager)
        counts = {f['folder']: f['count'] for f in c.get('/api/v1/installations/folder_counts/').data}
        self.assertEqual(counts['to_assign'], 1)
        self.post(self.sm, 'request_irrelevant')
        rows = c.get('/api/v1/installations/', {'folder': 'irrelevant_requested', 'mine': 'true'}).data
        self.assertEqual([r['id'] for r in rows], [self.inst.id])


class ScheduleViewTest(ScheduleTestBase):
    def test_installers_of_city(self):
        response = self.client_for(self.manager).get('/api/v1/installations/installers/')
        self.assertEqual({u['id'] for u in response.data}, {self.inst1.id, self.inst2.id})

    def test_schedule_shows_visits_in_period(self):
        self.assign(installers=[self.inst1.id])
        c = self.client_for(self.manager)  # смотреть графики могут все
        params = {'date_from': '2026-11-01', 'date_to': '2026-11-30'}
        rows = c.get('/api/v1/installations/schedule/', {**params, 'installers': self.inst1.id}).data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['client_name'], 'Иванов')
        self.assertEqual(rows[0]['work_description'], '3 двери')
        rows = c.get('/api/v1/installations/schedule/', {**params, 'installers': self.inst2.id}).data
        self.assertEqual(rows, [])
        rows = c.get('/api/v1/installations/schedule/', {'date_from': '2026-12-01', 'date_to': '2026-12-31'}).data
        self.assertEqual(rows, [])

    def test_schedule_requires_period(self):
        response = self.client_for(self.sm).get('/api/v1/installations/schedule/')
        self.assertEqual(response.status_code, 400)
