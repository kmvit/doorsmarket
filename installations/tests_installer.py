"""
Монтажи, этап 3: работа монтажника — график, «не дозвонился», перенос даты
с подтверждением СМ, акт и фото результата, завершение (полное и частичное).

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
import shutil
import tempfile
from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from orders.models import OrderAttachment

from .models import EventKind, Installation, InstallationStatus, InstallationVisit
from .tests_schedule import ScheduleTestBase

MEDIA = tempfile.mkdtemp()


def photo(name='act.jpg'):
    return SimpleUploadedFile(name, b'jpg', content_type='image/jpeg')


@override_settings(MEDIA_ROOT=MEDIA, INSTALLATIONS_SMS_ENABLED=True)
class InstallerTestBase(ScheduleTestBase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.assign(installers=[self.inst1.id])
        self.send.reset_mock()
        self.inst.refresh_from_db()

    def upload(self, user, kind='act', name='act.jpg'):
        return self.client_for(user).post('/api/v1/installation-files/', {
            'installation': self.inst.id, 'kind': kind, 'file': photo(name),
        }, format='multipart')


class InstallerAccessTest(InstallerTestBase):
    def test_installer_sees_only_own_installations(self):
        other = Installation.objects.create(
            order=self.order, is_paid=True, work_description='Ещё', collection_finish='Х',
        )
        rows = self.client_for(self.inst1).get('/api/v1/installations/').data
        self.assertEqual([r['id'] for r in rows], [self.inst.id])
        self.assertEqual(self.client_for(self.inst2).get('/api/v1/installations/').data, [])
        response = self.client_for(self.inst1).get(f'/api/v1/installations/{other.id}/')
        self.assertEqual(response.status_code, 404)

    def test_installer_schedule_is_limited_to_own_visits(self):
        response = self.client_for(self.inst2).get('/api/v1/installations/schedule/', {
            'date_from': '2026-11-01', 'date_to': '2026-11-30', 'installers': self.inst1.id,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
        own = self.client_for(self.inst1).get('/api/v1/installations/schedule/', {
            'date_from': '2026-11-01', 'date_to': '2026-11-30',
        })
        self.assertEqual([row['installation_id'] for row in own.data], [self.inst.id])

    def test_installer_cannot_edit_or_assign(self):
        c = self.client_for(self.inst1)
        self.assertEqual(c.patch(f'/api/v1/installations/{self.inst.id}/', {'contact_name': 'X'},
                                 format='json').status_code, 403)
        self.assertEqual(self.assign(user=self.inst1).status_code, 403)

    def test_installer_uploads_only_act_and_result(self):
        self.assertEqual(self.upload(self.inst1, kind='final_kp').status_code, 403)
        # Чужой монтаж монтажник не видит вовсе
        self.assertEqual(self.upload(self.inst2).status_code, 400)


class CallFailedTest(InstallerTestBase):
    def test_installer_call_failed_sms(self):
        self.inst1.phone_number = '+79991112233'
        self.inst1.save(update_fields=['phone_number'])
        response = self.post(self.inst1, 'installer_call_failed')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.send.call_args.args[1], 'не дозвонились по монтажу. Перезвоните пжл:) +79991112233')
        self.assertIsNotNone(response.data['installer_notified_at'])
        # Не свой монтаж — нельзя
        self.assertEqual(self.post(self.inst2, 'installer_call_failed').status_code, 404)


class RescheduleTest(InstallerTestBase):
    def reschedule(self, **data):
        payload = {'date_from': '2026-11-15', 'date_to': '2026-11-15', 'reason': 'Клиент в отъезде'}
        payload.update(data)
        return self.post(self.inst1, 'reschedule', payload)

    def test_installer_moves_date_and_sm_confirms(self):
        response = self.reschedule()
        self.assertEqual(response.status_code, 200, response.data)
        visit = InstallationVisit.objects.get()
        # Дата в графике меняется сразу, клиенту — только после подтверждения
        self.assertEqual(visit.date_from, date(2026, 11, 15))
        self.assertEqual(visit.previous_date_from, date(2026, 11, 10))
        self.send.assert_not_called()
        rows = self.client_for(self.sm).get('/api/v1/installations/', {'folder': 'reschedule_requested'}).data
        self.assertEqual([r['id'] for r in rows], [self.inst.id])

        self.assertEqual(self.post(self.manager, 'confirm_reschedule').status_code, 403)
        response = self.post(self.sm, 'confirm_reschedule')
        self.assertEqual(response.status_code, 200)
        self.assertIn('перенесён на 15.11.2026', self.send.call_args.args[1])
        visit.refresh_from_db()
        self.assertIsNone(visit.reschedule_requested_at)

    def test_sm_rejects_and_dates_return(self):
        self.reschedule()
        response = self.post(self.sm, 'reject_reschedule', {'comment': 'Клиент ждёт 10-го'})
        self.assertEqual(response.status_code, 200)
        visit = InstallationVisit.objects.get()
        self.assertEqual((visit.date_from, visit.date_to), (date(2026, 11, 10), date(2026, 11, 11)))
        self.send.assert_not_called()

    def test_reason_required(self):
        self.assertEqual(self.reschedule(reason='').status_code, 400)

    def test_second_move_keeps_original_dates(self):
        self.reschedule()
        self.reschedule(date_from='2026-11-20', date_to='2026-11-20')
        visit = InstallationVisit.objects.get()
        self.assertEqual(visit.previous_date_from, date(2026, 11, 10))


class CompleteTest(InstallerTestBase):
    def test_complete_requires_act(self):
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 400)
        response = self.upload(self.inst1)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['visit'], InstallationVisit.objects.get().id)
        # Акт сразу во вложениях заказа — тот же файл
        att = OrderAttachment.objects.get(order=self.order)
        self.assertIn('Акт выполненных работ', att.name)

        response = self.post(self.inst1, 'complete')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.DONE)
        self.assertTrue(self.inst.events.filter(kind=EventKind.COMPLETED).exists())

    def test_partial_then_next_visit_needs_new_act(self):
        self.upload(self.inst1)
        result = self.post(self.inst1, 'complete_partial', {'reason': 'client_postponed'})
        self.assertEqual(result.status_code, 200, result.data)
        event = self.inst.events.get(kind=EventKind.PARTIALLY_COMPLETED)
        self.assertIn('Клиент отложил', event.description)
        self.assertFalse(self.order.action_reminders.exists())
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.PARTIALLY_DONE)

        # Следующий выезд — другой монтажник; акт прошлого выезда не считается
        self.assign(installers=[self.inst2.id], date_from='2026-11-20', date_to='2026-11-20')
        self.assertEqual(self.post(self.inst2, 'complete').status_code, 400)
        # Прежний монтажник видит монтаж (история), но завершать его — уже не ему
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 403)
        self.upload(self.inst2)
        self.assertEqual(self.post(self.inst2, 'complete').status_code, 200)

    def test_partial_requires_a_listed_reason(self):
        self.upload(self.inst1)
        for payload in ({}, {'reason': 'другое'}, {'reason': ''}):
            self.assertEqual(self.post(self.inst1, 'complete_partial', payload).status_code, 400)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.PLANNED)
        self.assertFalse(self.order.action_reminders.exists())

    @patch('users.push_utils.send_push_notification')
    def test_short_delivery_creates_one_manager_task(self, push):
        self.upload(self.inst1)
        payload = {'reason': 'short_delivery', 'visit_id': self.inst.current_visit.pk}
        with self.captureOnCommitCallbacks(execute=True):
            result = self.post(self.inst1, 'complete_partial', payload)
        self.assertEqual(result.status_code, 200, result.data)
        event = self.inst.events.get(kind=EventKind.PARTIALLY_COMPLETED)
        self.assertIn('Недопоставка', event.description)
        self.assertEqual(event.meta, payload)
        self.assertEqual(self.post(self.inst1, 'complete_partial', payload).status_code, 200)
        task = self.order.action_reminders.get()
        self.assertEqual(task.created_by, self.manager)
        self.assertFalse(task.done)
        self.assertTrue(task.notified)
        self.assertIn('Оформить повторный монтаж', task.action_text)
        self.assertEqual(push.call_args.kwargs['user'], self.manager)
        self.assertIn(f'repeat_from={self.inst.pk}', push.call_args.kwargs['url'])

    @patch('users.push_utils.send_push_notification')
    def test_complaint_only_records_reason(self, push):
        self.upload(self.inst1)
        with self.captureOnCommitCallbacks(execute=True):
            result = self.post(self.inst1, 'complete_partial', {'reason': 'complaint'})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertIn('Рекламация', self.inst.events.get(kind=EventKind.PARTIALLY_COMPLETED).description)
        self.assertFalse(self.order.action_reminders.exists())
        push.assert_not_called()

    def test_installer_deletes_only_own_files(self):
        own = self.upload(self.inst1, kind='result', name='door.jpg').data['id']
        sm_file = self.upload(self.sm, kind='result', name='sm.jpg').data['id']
        c = self.client_for(self.inst1)
        self.assertEqual(c.delete(f'/api/v1/installation-files/{sm_file}/').status_code, 403)
        self.assertEqual(c.delete(f'/api/v1/installation-files/{own}/').status_code, 204)


class ComplaintFromInstallationTest(InstallerTestBase):
    def test_installer_finds_order_of_his_installation(self):
        response = self.client_for(self.inst1).get('/api/v1/complaints/find-order/',
                                                   {'order_number': str(self.order.id)})
        self.assertEqual([o['id'] for o in response.data], [self.order.id])
        response = self.client_for(self.inst2).get('/api/v1/complaints/find-order/',
                                                   {'order_number': str(self.order.id)})
        self.assertEqual(response.data, [])
