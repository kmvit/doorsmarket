"""
«Просрочена монтажником»: монтаж не выполнен к запланированной дате.

С 10.06.2026 просрочку считали только у рекламаций типа «Монтажник», а у
«Менеджера» и «Фабрики» монтаж планирует СМ — поэтому, когда дату ставил СМ,
просрочка не загоралась.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_installer_overdue
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification')
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_sms_to_phone')
class InstallerOverdueTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city)
        self.installer = User.objects.create_user(username='inst', password='x', role='installer', city=city)
        self.site = ProductionSite.objects.create(name='Фабрика')
        self.reason = ComplaintReason.objects.create(name='Брак')
        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    def _complaint(self, complaint_type):
        return Complaint.objects.create(
            initiator=self.manager, recipient=self.sm, manager=self.manager,
            production_site=self.site, reason=self.reason, order_number='1', complaint_type=complaint_type,
            client_name='Клиент', address='Адрес', contact_person='Клиент', contact_phone='+79270000000',
        )

    def _status(self, complaint):
        response = self.client.get(f'/api/v1/complaints/{complaint.id}/')
        self.assertEqual(response.status_code, 200)
        return response.data['status']

    def test_sm_planned_installation_in_past_is_overdue(self, *_):
        complaint = self._complaint('installer')
        complaint.plan_installation_by_sm(self.installer, timezone.now() - timedelta(days=1))
        self.assertEqual(self._status(complaint), ComplaintStatus.INSTALLER_OVERDUE)

    def test_manager_type_shipping_and_installation_overdue(self, *_):
        complaint = self._complaint('manager')
        complaint.planned_shipping_date = timezone.now() - timedelta(days=5)
        complaint.save()
        complaint.plan_installation_by_sm(self.installer, timezone.now() - timedelta(days=1))
        self.assertEqual(complaint.status, ComplaintStatus.BOTH_PLANNED)
        self.assertEqual(self._status(complaint), ComplaintStatus.INSTALLER_OVERDUE)

    def test_overdue_also_in_list(self, *_):
        complaint = self._complaint('manager')
        complaint.plan_installation_by_sm(self.installer, timezone.now() - timedelta(days=1))
        self.client.get('/api/v1/complaints/')
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, ComplaintStatus.INSTALLER_OVERDUE)

    def test_future_installation_not_overdue(self, *_):
        complaint = self._complaint('manager')
        complaint.plan_installation_by_sm(self.installer, timezone.now() + timedelta(days=2))
        self.assertEqual(self._status(complaint), ComplaintStatus.INSTALLATION_PLANNED)

    def test_redirected_complaint_does_not_return_to_overdue(self, *_):
        """Защита из прошлой правки: переадресованная рекламация не откатывается в просрочку."""
        complaint = self._complaint('installer')
        complaint.plan_installation_by_sm(self.installer, timezone.now() - timedelta(days=1))
        complaint.set_type_manager()
        self.assertEqual(self._status(complaint), ComplaintStatus.IN_PROGRESS)

    def test_backlog_marked_silently(self, sms_phone, sms, push):
        """Разовая команда: накопившиеся просрочки — статус без push и SMS."""
        from io import StringIO
        from django.core.management import call_command

        complaint = self._complaint('manager')
        complaint.plan_installation_by_sm(self.installer, timezone.now() - timedelta(days=20))
        sms.reset_mock()
        push.reset_mock()
        call_command('mark_installer_overdue_silently', stdout=StringIO())
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, ComplaintStatus.INSTALLER_OVERDUE)
        sms.assert_not_called()
        push.assert_not_called()
        # Открытие рекламации уже не шлёт уведомление — статус стоит
        self._status(complaint)
        sms.assert_not_called()
