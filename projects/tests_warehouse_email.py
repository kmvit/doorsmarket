"""
«Товар на складе» от ОР: письмо уходит на почту склада города рекламации,
а не города сотрудника ОР (ОР — в Москве, рекламации — по всем городам).

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_warehouse_email
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
@patch('projects.api_views.send_email_notification')
class WarehouseEmailTest(TestCase):
    def setUp(self):
        self.moscow = City.objects.create(name='Москва')
        self.spb = City.objects.create(name='Санкт-Петербург', warehouse_notification_email='sklad-spb@example.com')
        self.op = User.objects.create_user(username='op', password='x', role='complaint_department', city=self.moscow)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=self.spb)
        self.api = APIClient()
        self.api.force_authenticate(self.op)

    def _complaint(self, manager_city):
        manager = User.objects.create_user(
            username=f'mgr-{manager_city.id}', password='x', role='manager', city=manager_city,
        )
        complaint = Complaint.objects.create(
            initiator=manager, recipient=self.sm, manager=manager,
            production_site=ProductionSite.objects.create(name='Фабрика'),
            reason=ComplaintReason.objects.create(name='Брак'),
            order_number='31-1', complaint_type='factory', client_name='Клиент', address='Адрес',
            contact_person='Клиент', contact_phone='+79270000000',
        )
        Complaint.objects.filter(pk=complaint.pk).update(status=ComplaintStatus.FACTORY_APPROVED)
        return complaint

    def _mark(self, complaint):
        return self.api.post(f'/api/v1/complaints/{complaint.id}/mark_warehouse_or/')

    def test_spb_complaint_mails_spb_warehouse(self, send_email, *_):
        response = self._mark(self._complaint(self.spb))
        self.assertEqual(response.status_code, 200, response.data)
        send_email.assert_called_once()
        self.assertEqual(send_email.call_args.kwargs['to_email'], 'sklad-spb@example.com')
        self.assertIn('Санкт-Петербург', send_email.call_args.kwargs['html_message'])

    def test_city_without_email_sends_nothing(self, send_email, *_):
        response = self._mark(self._complaint(self.moscow))
        self.assertEqual(response.status_code, 200, response.data)
        send_email.assert_not_called()

    def test_op_city_email_not_used(self, send_email, *_):
        # Даже если у Москвы (город ОР) есть адрес — питерская рекламация идёт в Питер
        self.moscow.warehouse_notification_email = 'sklad-msk@example.com'
        self.moscow.save()
        self._mark(self._complaint(self.spb))
        self.assertEqual(send_email.call_args.kwargs['to_email'], 'sklad-spb@example.com')
