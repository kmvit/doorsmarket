"""
Монтаж назначают интервалом «с … до …» в пределах дня.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_installation_window
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import (
    Complaint, ComplaintReason, ComplaintStatus, ProductionSite, format_installation_window,
)
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification', return_value=False)
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_client_message')
class InstallationWindowTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.installer = User.objects.create_user(username='inst', password='x', role='installer', city=city)
        self.complaint = Complaint.objects.create(
            initiator=self.manager, recipient=self.sm, manager=self.manager,
            production_site=ProductionSite.objects.create(name='Фабрика'),
            reason=ComplaintReason.objects.create(name='Брак'),
            order_number='1', complaint_type='installer', installer_assigned=self.installer,
            client_name='Клиент', address='Адрес', contact_person='Клиент', contact_phone='+79270000000',
        )
        Complaint.objects.filter(pk=self.complaint.pk).update(status=ComplaintStatus.WAITING_INSTALLER_DATE)
        self.api = APIClient()

    def _plan(self, user, **data):
        self.api.force_authenticate(user)
        return self.api.post(f'/api/v1/complaints/{self.complaint.id}/plan_installation/',
                             {'installer_id': self.installer.id, **data}, format='json')

    def test_installer_plans_interval_and_client_gets_it(self, client_msg, *_):
        response = self._plan(self.installer, installation_date='2030-05-14T10:00',
                              installation_end='2030-05-14T12:30')
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertEqual(timezone.localtime(self.complaint.planned_installation_end).strftime('%H:%M'), '12:30')
        self.assertEqual(self.complaint.installation_window_text, '14.05.2030 с 10:00 до 12:30')
        client_msg.assert_called_once_with(
            '+79270000000', 'По Вашей рекламации запланирован монтаж 14.05.2030 с 10:00 до 12:30.',
        )
        self.assertIsNotNone(response.data['planned_installation_end'])

    def test_sm_plans_interval(self, *_):
        response = self._plan(self.sm, installation_date='2030-05-14T09:00', installation_end='2030-05-14T11:00')
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.installation_window_text, '14.05.2030 с 09:00 до 11:00')

    def test_bad_intervals_rejected(self, *_):
        for end in ('2030-05-14T10:00', '2030-05-14T09:00', '2030-05-15T11:00'):
            response = self._plan(self.installer, installation_date='2030-05-14T10:00', installation_end=end)
            self.assertEqual(response.status_code, 400, end)
        self.complaint.refresh_from_db()
        self.assertIsNone(self.complaint.planned_installation_date)

    def test_old_client_without_end_still_works(self, client_msg, *_):
        response = self._plan(self.installer, installation_date='2030-05-14T10:00')
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertIsNone(self.complaint.planned_installation_end)
        self.assertEqual(self.complaint.installation_window_text, '14.05.2030 10:00')

    def test_overdue_counts_from_interval_end(self, *_):
        now = timezone.now()
        self.complaint.plan_installation(self.installer, now - timedelta(hours=1), now + timedelta(hours=1))
        self.assertFalse(self.complaint.check_installer_overdue())
        self.assertEqual(self.complaint.status, ComplaintStatus.INSTALLATION_PLANNED)
        self.complaint.planned_installation_end = now - timedelta(minutes=1)
        self.complaint.save()
        self.assertTrue(self.complaint.check_installer_overdue())
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.status, ComplaintStatus.INSTALLER_OVERDUE)

    def test_reschedule_moves_both_ends(self, *_):
        self._plan(self.installer, installation_date='2030-05-14T10:00', installation_end='2030-05-14T12:00')
        response = self.api.post(f'/api/v1/complaints/{self.complaint.id}/reschedule_installation/',
                                 {'installation_date': '2030-05-16T14:00', 'installation_end': '2030-05-16T15:00'},
                                 format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.complaint.refresh_from_db()
        self.assertEqual(self.complaint.installation_window_text, '16.05.2030 с 14:00 до 15:00')
        comment = self.complaint.comments.latest('id').text
        self.assertEqual(comment, 'Дата монтажа перенесена: 14.05.2030 с 10:00 до 12:00 → 16.05.2030 с 14:00 до 15:00')

    def test_format_helper(self, *_):
        self.assertEqual(format_installation_window(None), '')
