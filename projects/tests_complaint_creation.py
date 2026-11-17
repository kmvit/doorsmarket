from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite
from users.models import Role, User


class ComplaintCreationPermissionsTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users = {role: User.objects.create_user(username=role, role=role) for role in Role}
        cls.measurer = User.objects.create_user(
            username='measurer', role=Role.SERVICE_MANAGER, measurements_only=True,
        )
        cls.payload = {
            'complaint_type': 'installer',
            'installer_assigned_id': cls.users[Role.INSTALLER].pk,
            'manager_id': cls.users[Role.MANAGER].pk,
            'production_site_id': ProductionSite.objects.create(name='Фабрика').pk,
            'reason_id': ComplaintReason.objects.create(name='Брак').pk,
            'order_number': '1',
            'client_name': 'Клиент',
            'address': 'Адрес',
            'contact_person': 'Клиент',
            'contact_phone': '+79270000000',
        }

    def test_creation_denied_to_other_roles_and_measurement_only_sm(self):
        api = APIClient()
        form_url = reverse('projects:complaint_create')
        denied_users = [user for role, user in self.users.items() if role not in (Role.MANAGER, Role.SERVICE_MANAGER)]
        for user in [*denied_users, self.measurer]:
            with self.subTest(username=user.username):
                api.force_authenticate(user)
                self.client.force_login(user)
                self.assertEqual(api.post('/api/v1/complaints/', self.payload, format='json').status_code, 403)
                self.assertEqual(self.client.get(form_url).status_code, 403)
                self.assertEqual(self.client.post(form_url).status_code, 403)
        self.assertFalse(Complaint.objects.exists())

    @patch('projects.models.send_sms_notification', return_value=False)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_service_manager_can_create_and_route_to_installer(self, *_):
        sm = self.users[Role.SERVICE_MANAGER]
        self.client.force_login(sm)
        self.assertEqual(self.client.get(reverse('projects:complaint_create')).status_code, 200)

        api = APIClient()
        api.force_authenticate(sm)
        response = api.post('/api/v1/complaints/', self.payload, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        self.assertEqual(complaint.initiator, sm)
        self.assertEqual(complaint.installer_assigned, self.users[Role.INSTALLER])
        self.assertEqual(complaint.status, ComplaintStatus.WAITING_INSTALLER_DATE)

    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_manager_can_create_new_complaint_for_service_manager(self, _):
        manager = self.users[Role.MANAGER]
        self.client.force_login(manager)
        self.assertEqual(self.client.get(reverse('projects:complaint_create')).status_code, 200)

        api = APIClient()
        api.force_authenticate(manager)
        payload = self.payload.copy()
        del payload['complaint_type'], payload['installer_assigned_id']
        response = api.post('/api/v1/complaints/', payload, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        self.assertEqual(complaint.initiator, manager)
        self.assertEqual(complaint.recipient, self.users[Role.SERVICE_MANAGER])
        self.assertEqual(complaint.status, ComplaintStatus.NEW)
