"""
ОР: «На рассмотрении у производства» со сроком ответа; папки на главной
«На рассмотрении у производства» и «Просроченные рекламации».

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_production_review
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification', return_value=False)
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_client_message')
class ProductionReviewTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        self.op = User.objects.create_user(username='op', password='x', role='complaint_department', city=city)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city)
        self.complaint = self._complaint()
        self.api = APIClient()
        self.api.force_authenticate(self.op)

    def _complaint(self, status=ComplaintStatus.SENT):
        complaint = Complaint.objects.create(
            initiator=self.manager, recipient=self.sm, manager=self.manager,
            production_site=ProductionSite.objects.get_or_create(name='Фабрика')[0],
            reason=ComplaintReason.objects.get_or_create(name='Брак')[0],
            order_number='1', complaint_type='factory', client_name='Клиент', address='Адрес',
            contact_person='Клиент', contact_phone='+79270000000',
        )
        Complaint.objects.filter(pk=complaint.pk).update(status=status)
        complaint.refresh_from_db()
        return complaint

    def _review(self, complaint, deadline, user=None):
        self.api.force_authenticate(user or self.op)
        return self.api.post(f'/api/v1/complaints/{complaint.id}/production_review/',
                             {'deadline': deadline}, format='json')

    def _day(self, delta):
        return (timezone.localdate() + timedelta(days=delta)).isoformat()

    def _stats(self):
        self.api.force_authenticate(self.op)
        return {s['key']: s['count'] for s in self.api.get('/api/v1/dashboard/stats/').data['stats']}

    def test_op_sends_to_production_review(self, *_):
        response = self._review(self.complaint, self._day(5))
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, ComplaintStatus.PRODUCTION_REVIEW)
        self.assertEqual(self.complaint.production_review_deadline.isoformat(), self._day(5))
        self.assertIn('на рассмотрении у производства', self.complaint.comments.latest('id').text.lower())
        self.assertEqual(response.data['production_review_deadline'], self._day(5))

    def test_repeat_moves_deadline(self, *_):
        self._review(self.complaint, self._day(3))
        self._review(self.complaint, self._day(7))
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.production_review_deadline.isoformat(), self._day(7))
        self.assertIn('перенесён', self.complaint.comments.latest('id').text)

    def test_validation(self, *_):
        self.assertEqual(self._review(self.complaint, '').status_code, 400)
        self.assertEqual(self._review(self.complaint, self._day(-1)).status_code, 400)
        self.assertEqual(self._review(self.complaint, self._day(3), user=self.sm).status_code, 403)
        done = self._complaint(status=ComplaintStatus.FACTORY_APPROVED)
        self.assertEqual(self._review(done, self._day(3)).status_code, 400)

    def test_auto_overdue_skips_production_review(self, *_):
        self._review(self.complaint, self._day(3))
        Complaint.objects.filter(pk=self.complaint.pk).update(updated_at=timezone.now() - timedelta(days=10))
        call_command('check_factory_overdue', stdout=open('/dev/null', 'w'))
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, ComplaintStatus.PRODUCTION_REVIEW)

    def test_dashboard_folders(self, *_):
        self._review(self.complaint, self._day(3))
        late = self._complaint()
        self._review(late, self._day(1))
        Complaint.objects.filter(pk=late.pk).update(production_review_deadline=timezone.localdate() - timedelta(days=1))
        stats = self._stats()
        self.assertEqual(stats['production_review'], 2)
        self.assertEqual(stats['production_overdue'], 1)
        self.assertEqual(stats['pending'], 0)

        response = self.api.get('/api/v1/complaints/?my_tasks=production_overdue')
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual([r['id'] for r in rows], [late.id])

    def test_approve_from_production_review(self, *_):
        self._review(self.complaint, self._day(3))
        response = self.api.post(f'/api/v1/complaints/{self.complaint.id}/factory_approve/',
                                 {'approve_comment': 'Замена согласована'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, ComplaintStatus.FACTORY_APPROVED)
        self.assertNotIn(self.complaint.id, [r['id'] for r in (
            lambda d: d['results'] if isinstance(d, dict) else d
        )(self.api.get('/api/v1/complaints/?my_tasks=production_review').data)])
