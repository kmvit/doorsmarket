"""
Монтажи, этап 6: рекламационные монтажи в общем списке и графиках.
Планируются они в рекламациях — здесь только видны, со своим статусом.

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
from datetime import datetime

from django.utils import timezone

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite

from .tests_schedule import ScheduleTestBase


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
            self.assertEqual(sm.post(url, {'assignments': assignments}, format='json').status_code, 400)
            self.to_plan.refresh_from_db()
            self.assertEqual(self.to_plan.status, ComplaintStatus.SHIPPING_PLANNED)
            sms.assert_not_called()
            installer.delete(f"{block_url}{block.data['id']}/")
            for _ in range(2):
                result = sm.post(url, {'assignments': assignments}, format='json')
                self.assertEqual(result.status_code, 200, result.data)
                self.assertEqual([r['date_to'] for r in result.data['installation_assignments']], ['2030-05-12', '2030-05-16'])
            listing = sm.get('/api/v1/installations/complaints/').data
            row = next(row for row in listing if row['id'] == self.to_plan.pk)
            self.assertEqual(row['team_schedule'], ['Иван · 10.05.2030–12.05.2030', 'Олег · 14.05.2030–16.05.2030'])
            self.assertEqual(sms.call_count, 1)
            self.assertIn('14.05.2030–16.05.2030', sms.call_args.args[1])
            self.assertEqual(installer.get(f'/api/v1/complaints/{self.to_plan.pk}/').status_code, 200)
            schedule = installer.get('/api/v1/installations/schedule/', {
                'date_from': '2030-05-15', 'date_to': '2030-05-15',
            }).data
            self.assertEqual([(r['complaint_id'], r['date_from'], r['date_to']) for r in schedule],
                             [(self.to_plan.pk, '2030-05-14', '2030-05-16')])
            self.assertEqual(installer.post(block_url, day_off, format='json').status_code, 400)
            self.assertEqual(sm.post(url, {'assignments': assignments[:1]}, format='json').status_code, 200)
            self.assertEqual(installer.post(block_url, day_off, format='json').status_code, 201)
