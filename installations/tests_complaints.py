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
