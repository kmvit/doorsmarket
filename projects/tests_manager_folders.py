"""
Папка менеджера «Отгрузка просрочена» — только его рекламации, а не всего
города (на главной было 4, а в списке с «Мои» — пусто).

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_manager_folders
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification', return_value=False)
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_client_message')
class ManagerShippingOverdueFolderTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.me = User.objects.create_user(username='me', password='x', role='manager', city=city)
        self.other = User.objects.create_user(username='other', password='x', role='manager', city=city)
        self.mine = self._overdue(self.me)
        self._overdue(self.other)
        self._overdue(self.other)
        self.api = APIClient()
        self.api.force_authenticate(self.me)

    def _overdue(self, manager):
        complaint = Complaint.objects.create(
            initiator=manager, manager=manager,
            production_site=ProductionSite.objects.get_or_create(name='Фабрика')[0],
            reason=ComplaintReason.objects.get_or_create(name='Брак')[0],
            order_number='1', client_name='Клиент', address='Адрес', contact_person='Клиент',
            contact_phone='+79270000000',
        )
        Complaint.objects.filter(pk=complaint.pk).update(status=ComplaintStatus.SHIPPING_OVERDUE)
        return complaint

    def test_dashboard_counts_only_own(self, *_):
        stats = {s['key']: s['count'] for s in self.api.get('/api/v1/dashboard/stats/').data['stats']}
        self.assertEqual(stats['shipping_overdue'], 1)

    def test_folder_list_matches_dashboard(self, *_):
        data = self.api.get('/api/v1/complaints/?my_tasks=shipping_overdue').data
        rows = data['results'] if isinstance(data, dict) else data
        self.assertEqual([r['id'] for r in rows], [self.mine.id])
