"""
История рекламации: смены статуса пишутся в журнал с автором, а для времени
до журнала показываются разосланные уведомления.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test projects.tests_history
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from projects.models import (
    Complaint, ComplaintEvent, ComplaintReason, ComplaintStatus, Notification, ProductionSite,
)
from users.models import City

User = get_user_model()


@patch('users.push_utils.send_push_notification', return_value=False)
@patch('projects.models.send_sms_notification')
@patch('projects.models.send_client_message')
class ComplaintHistoryTest(TestCase):
    def setUp(self):
        city = City.objects.create(name='Казань')
        self.manager = User.objects.create_user(username='mgr', password='x', role='manager', city=city)
        self.sm = User.objects.create_user(username='sm', password='x', role='service_manager', city=city)
        self.op = User.objects.create_user(username='op', password='x', role='complaint_department', city=city,
                                           first_name='Мила', last_name='Сумынина')
        self.complaint = Complaint.objects.create(
            initiator=self.manager, recipient=self.sm, manager=self.manager,
            production_site=ProductionSite.objects.create(name='Фабрика'),
            reason=ComplaintReason.objects.create(name='Брак'),
            order_number='1', complaint_type='factory', client_name='Клиент', address='Адрес',
            contact_person='Клиент', contact_phone='+79270000000',
        )
        self.api = APIClient()

    def _history(self, user):
        self.api.force_authenticate(user)
        response = self.api.get(f'/api/v1/complaints/{self.complaint.id}/history/')
        self.assertEqual(response.status_code, 200)
        return response.data['events']

    def test_creation_is_not_logged_as_status_change(self, *_):
        self.assertFalse(ComplaintEvent.objects.exists())

    def test_status_change_logged_without_request_as_system(self, *_):
        self.complaint.status = ComplaintStatus.FACTORY_APPROVED
        self.complaint.save()
        event = ComplaintEvent.objects.get()
        self.assertEqual((event.old_status, event.new_status, event.actor),
                         (ComplaintStatus.NEW, ComplaintStatus.FACTORY_APPROVED, None))

    def test_same_status_not_logged(self, *_):
        self.complaint.address = 'Другой адрес'
        self.complaint.save()
        Complaint.objects.get(pk=self.complaint.pk).save()
        self.assertFalse(ComplaintEvent.objects.exists())

    def test_warehouse_by_op_logged_with_author(self, *_):
        self.complaint.status = ComplaintStatus.FACTORY_APPROVED
        self.complaint.save()
        self.api.force_authenticate(self.op)
        with patch('projects.api_views.send_email_notification', create=True):
            response = self.api.post(f'/api/v1/complaints/{self.complaint.id}/mark_warehouse_or/')
        self.assertEqual(response.status_code, 200, response.data)
        event = ComplaintEvent.objects.filter(new_status=ComplaintStatus.ON_WAREHOUSE).get()
        self.assertEqual(event.actor, self.op)

        events = self._history(self.manager)
        warehouse = next(e for e in events if e['title'] == 'Статус: Товар на складе')
        self.assertEqual(warehouse['user']['username'], 'op')
        self.assertIn('Ответ получен → Товар на складе', warehouse['description'])

    def test_overdue_check_is_system(self, *_):
        self.complaint.status = ComplaintStatus.INSTALLATION_PLANNED
        self.complaint.installer_assigned = self.sm
        self.complaint.planned_installation_date = timezone.now() - timedelta(days=1)
        self.complaint.save()
        ComplaintEvent.objects.all().delete()
        self._history(self.manager)  # не меняет статус
        self.api.get('/api/v1/complaints/')  # список пересчитывает просрочку
        event = ComplaintEvent.objects.get(new_status=ComplaintStatus.INSTALLER_OVERDUE)
        self.assertIsNone(event.actor)

    def test_old_notifications_shown_once_before_log(self, *_):
        for recipient in (self.manager, self.sm):
            Notification.objects.create(
                complaint=self.complaint, recipient=recipient, notification_type='push',
                title='Товар по рекламации на складе', message='Товар на складе', is_sent=False,
            )
        events = self._history(self.manager)
        notes = [e for e in events if e['title'] == 'Товар по рекламации на складе']
        self.assertEqual(len(notes), 1)
        self.assertIn('Кому:', notes[0]['description'])

        # После появления журнала новые уведомления не дублируют смену статуса
        self.complaint.status = ComplaintStatus.ON_WAREHOUSE
        self.complaint.save()
        Notification.objects.create(
            complaint=self.complaint, recipient=self.sm, notification_type='push',
            title='Новое', message='после журнала',
        )
        titles = [e['title'] for e in self._history(self.manager)]
        self.assertIn('Товар по рекламации на складе', titles)
        self.assertNotIn('Новое', titles)
        self.assertIn('Статус: Товар на складе', titles)
        self.assertNotIn('Рекламация обновлена', titles)
