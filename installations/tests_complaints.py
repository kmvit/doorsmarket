"""
Монтажи, этап 6: рекламационные монтажи в общем списке и графиках.
Планируются они в рекламациях — здесь только видны, со своим статусом.

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
from datetime import datetime, timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core import mail
from django.test import override_settings

from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite

from .tests_schedule import ScheduleTestBase
from .tests_installer import photo
from .models import Installation, InstallationFile


class ComplaintInstallationsTest(ScheduleTestBase):
    def setUp(self):
        super().setUp()
        site = ProductionSite.objects.create(name='Фабрика')
        reason = ComplaintReason.objects.create(name='Брак')

        def complaint(status, **extra):
            c = Complaint.objects.create(
                initiator=self.manager, recipient=self.sm, manager=self.manager,
                production_site=site, reason=reason, order_number='КП-7', complaint_type='installer',
                client_name='Петров', address='ул. Ленина, 5', contact_person='Пётр', contact_phone='+79270000000',
                **extra,
            )
            Complaint.objects.filter(pk=c.pk).update(status=status)
            return c

        # Город рекламации — по инициатору; у менеджера город не задан, задаём
        self.manager.city = self.city
        self.manager.save()
        day = timezone.make_aware(datetime(2026, 11, 12, 10, 0))
        self.planned = complaint(ComplaintStatus.INSTALLATION_PLANNED, installer_assigned=self.inst1,
                                 planned_installation_date=day, planned_installation_end=day.replace(hour=12))
        self.to_plan = complaint(ComplaintStatus.SHIPPING_PLANNED)
        self.new = complaint(ComplaintStatus.NEW)

    def test_list_shows_installation_stage_complaints(self):
        rows = self.client_for(self.sm).get('/api/v1/installations/complaints/').data
        self.assertEqual({r['id'] for r in rows}, {self.planned.id, self.to_plan.id})
        planned = next(r for r in rows if r['id'] == self.planned.id)
        self.assertEqual(planned['status_display'], 'Монтаж запланирован')
        self.assertEqual(planned['date'], '2026-11-12')
        self.assertIn('с 10:00 до 12:00', planned['window'])
        self.assertTrue(next(r for r in rows if r['id'] == self.to_plan.id)['needs_planning'])

    def test_to_assign_folder_includes_visible_complaints_and_counts_them(self):
        from users.models import City

        client = self.client_for(self.sm)

        def check_folder(expected_ids):
            params = {'folder': 'to_assign'}
            complaints = client.get('/api/v1/installations/complaints/', params)
            self.assertEqual(complaints.status_code, 200)
            self.assertEqual([row['id'] for row in complaints.data], expected_ids)
            installations = client.get('/api/v1/installations/', params).data
            counts = client.get('/api/v1/installations/folder_counts/').data
            counts = {row['folder']: row['count'] for row in counts}
            self.assertEqual(counts['to_assign'], len(installations) + len(expected_ids))

        check_folder([self.to_plan.id])
        other_city = City.objects.create(name='Другой город')
        self.manager.city = other_city
        self.manager.save(update_fields=['city'])
        check_folder([])

        Complaint.objects.filter(pk=self.to_plan.pk).update(initiator=self.sm)
        check_folder([self.to_plan.id])
        Complaint.objects.filter(pk=self.to_plan.pk).update(status=ComplaintStatus.INSTALLATION_PLANNED)
        check_folder([])

    def test_installer_sees_only_his_complaints(self):
        rows = self.client_for(self.inst1).get('/api/v1/installations/complaints/').data
        self.assertEqual([r['id'] for r in rows], [self.planned.id])
        self.assertEqual(self.client_for(self.inst2).get('/api/v1/installations/complaints/').data, [])

    def test_search(self):
        rows = self.client_for(self.sm).get('/api/v1/installations/complaints/', {'search': f'#{self.planned.id}'}).data
        self.assertEqual([r['id'] for r in rows], [self.planned.id])

    def test_schedule_includes_complaint_visit(self):
        self.assign(installers=[self.inst1.id])
        rows = self.client_for(self.manager).get('/api/v1/installations/schedule/', {
            'date_from': '2026-11-01', 'date_to': '2026-11-30', 'installers': self.inst1.id,
        }).data
        self.assertEqual([r['kind'] for r in rows], ['installation', 'complaint'])
        complaint = rows[1]
        self.assertEqual(complaint['complaint_id'], self.planned.id)
        self.assertEqual(complaint['date_from'], '2026-11-12')

    def test_status_follows_complaint(self):
        # Статус один — тот, что в рекламации: спланировали там — здесь сразу видно
        Complaint.objects.filter(pk=self.to_plan.pk).update(status=ComplaintStatus.NEEDS_PLANNING)
        rows = self.client_for(self.sm).get('/api/v1/installations/complaints/').data
        self.assertEqual(next(r for r in rows if r['id'] == self.to_plan.id)['status_display'], 'Нужно запланировать')

    def test_team_periods_are_atomic_and_visible_to_each_installer(self):
        from unittest.mock import patch

        url = f'/api/v1/complaints/{self.to_plan.pk}/plan_installation/'
        assignments = [
            {'installer_id': self.inst1.pk, 'date_from': '2030-05-10', 'date_to': '2030-05-12'},
            {'installer_id': self.inst2.pk, 'date_from': '2030-05-14', 'date_to': '2030-05-16'},
        ]
        sm = self.client_for(self.sm)
        self.assertEqual(self.client_for(self.inst1).post(url, {'assignments': assignments}, format='json').status_code, 404)
        self.assertEqual(sm.post(url, {'assignments': [assignments[0], assignments[0]]}, format='json').status_code, 400)
        block_url = '/api/v1/installations/calendar-blocks/'
        day_off = {**assignments[1], 'date_from': '2030-05-15', 'date_to': '2030-05-15'}
        installer = self.client_for(self.inst2)
        block = installer.post(block_url, day_off, format='json')
        self.assertEqual(block.status_code, 201, block.data)
        with patch('projects.models.send_client_message') as sms:
            self.assertEqual(sm.post(url, {'assignments': assignments, 'installer_work_paid': False}, format='json').status_code, 400)
            self.to_plan.refresh_from_db()
            self.assertEqual(self.to_plan.status, ComplaintStatus.SHIPPING_PLANNED)
            sms.assert_not_called()
            installer.delete(f"{block_url}{block.data['id']}/")
            for _ in range(2):
                result = sm.post(url, {'assignments': assignments, 'installer_work_paid': False}, format='json')
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual([r['date_to'] for r in result.data['installation_assignments']], ['2030-05-12', '2030-05-16'])
            listing = sm.get('/api/v1/installations/complaints/').data
            row = next(row for row in listing if row['id'] == self.to_plan.pk)
            self.assertEqual(row['team_schedule'], ['Иван · 10.05.2030–12.05.2030', 'Олег · 14.05.2030–16.05.2030'])
            self.assertEqual(sms.call_count, 1)
            self.assertIn('14.05.2030–16.05.2030', sms.call_args.args[1])
            self.assertEqual(installer.get(f'/api/v1/complaints/{self.to_plan.pk}/').status_code, 200)
            own_rows = installer.get('/api/v1/installations/complaints/').data
            own_row = next(row for row in own_rows if row['id'] == self.to_plan.pk)
            self.assertEqual(own_row['scheduled_at'], '2030-05-14')
            schedule = installer.get('/api/v1/installations/schedule/', {
                'date_from': '2030-05-15', 'date_to': '2030-05-15',
            }).data
            self.assertEqual([(r['complaint_id'], r['date_from'], r['date_to']) for r in schedule],
                             [(self.to_plan.pk, '2030-05-14', '2030-05-16')])
            self.assertEqual(installer.post(block_url, day_off, format='json').status_code, 400)
            self.assertEqual(sm.post(url, {'assignments': assignments[:1]}, format='json').status_code, 200)
            self.assertEqual(installer.post(block_url, day_off, format='json').status_code, 201)


    @patch('projects.models.send_sms_notification', return_value=False)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_routing_requires_explicit_payment_but_unpaid_uses_existing_completion(self, *_):
        sm = self.client_for(self.sm)
        base = f'/api/v1/complaints/{self.new.pk}/'
        data = {'complaint_type': 'installer', 'installer_id': self.inst1.pk}
        missing = sm.post(base + 'process/', data, format='json')
        self.assertEqual(missing.status_code, 400, missing.data)
        no_order = sm.post(base + 'process/', data | {'installer_work_paid': True}, format='json')
        self.assertEqual(no_order.status_code, 400, no_order.data)
        self.new.refresh_from_db()
        self.assertIsNone(self.new.installer_assigned_id)
        response = sm.post(base + 'process/', data | {'installer_work_paid': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        Complaint.objects.filter(pk=self.new.pk).update(
            planned_installation_date=timezone.now() - timedelta(hours=1),
            status=ComplaintStatus.INSTALLATION_PLANNED,
        )
        installer = self.client_for(self.inst1)
        self.assertEqual(installer.post(base + 'complete/').status_code, 200)
        self.assertFalse(Installation.objects.filter(complaint=self.new).exists())
        self.new.refresh_from_db()
        self.assertEqual(self.new.status, ComplaintStatus.UNDER_SM_REVIEW)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    @patch('projects.models.send_sms_notification', return_value=False)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_paid_work_uses_visit_act_order_documents_and_accountant_email(self, *_):
        self.enterContext(override_settings(MEDIA_ROOT=self.enterContext(TemporaryDirectory())))
        self.city.accountant_email = 'accounting@example.test'
        self.city.save(update_fields=['accountant_email'])
        Complaint.objects.filter(pk=self.planned.pk).update(
            installer_work_paid=True, source_order=self.order,
            planned_installation_date=timezone.now() - timedelta(hours=1), planned_installation_end=None,
        )
        InstallationFile.objects.create(
            installation=self.inst, kind='installation_kp', name='КП на монтаж.pdf',
            file='test/installation-offer.pdf',
        )
        base = f'/api/v1/complaints/{self.planned.pk}/'
        installer = self.client_for(self.inst1)
        stranger = self.client_for(self.inst2)
        docs = installer.get(base).data['installer_order_documents']
        self.assertIn('КП на монтаж.pdf', [d['name'] for d in docs])
        self.assertEqual(stranger.post(base + 'paid_work/').status_code, 404)
        self.assertEqual(installer.post(base + 'complete/').status_code, 400)

        work = installer.post(base + 'paid_work/')
        self.assertEqual(work.status_code, 200, work.data)
        self.assertEqual(installer.post(base + 'paid_work/').data['id'], work.data['id'])
        self.assertNotIn(work.data['id'], [row['id'] for row in installer.get('/api/v1/installations/').data])
        work_url = f"/api/v1/installations/{work.data['id']}/"
        visit = {'visit_id': work.data['current_visit']['id']}
        order_status = self.order.status
        self.assertEqual(installer.post(work_url + 'complete/', visit).status_code, 400)
        self.assertEqual(stranger.post(work_url + 'complete/', visit).status_code, 404)
        uploaded = installer.post('/api/v1/installation-files/', {
            'installation': work.data['id'], 'kind': 'act_unsigned', 'file': photo('unsigned.jpg'),
            **visit,
        }, format='multipart')
        self.assertEqual(uploaded.status_code, 201, uploaded.data)
        self.assertEqual(installer.post(work_url + 'send_act_to_client/').status_code, 200)
        work_record = Installation.objects.get(pk=work.data['id'])
        client = APIClient()
        public_url = f'/api/v1/public/installation-acts/{work_record.client_code}/'
        self.assertEqual(client.post(public_url + 'upload/', {'file': photo()}, format='multipart').status_code, 200)
        self.assertEqual(installer.post(work_url + 'complete/', visit).status_code, 400)
        act = work_record.files.get(kind='act')
        reviewed = installer.post(work_url + 'approve_act/', {'file': act.pk})
        self.assertEqual(reviewed.status_code, 200, reviewed.data)
        finished = installer.post(work_url + 'complete/', visit)
        self.assertEqual(finished.status_code, 200, finished.data)
        self.assertTrue(finished.data['payment']['available'])
        self.planned.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.planned.status, ComplaintStatus.UNDER_SM_REVIEW)
        self.assertEqual(self.order.status, order_status)
        payment = installer.post(work_url + 'send_to_payment/', {'estimate': 'Работы — 1000 ₽'})
        self.assertEqual(payment.status_code, 200, payment.data)
        self.assertEqual(mail.outbox[-1].to, ['accounting@example.test'])
        self.assertIn(f'рекламация #{self.planned.pk}', mail.outbox[-1].subject)
        self.assertEqual(mail.outbox[-1].attachments[0].filename, 'act.jpg')
