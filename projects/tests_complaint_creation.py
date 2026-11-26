from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite
from users.models import Role, User
from orders.models import Salon
from users.models import City


class ComplaintCreationPermissionsTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.users = {role: User.objects.create_user(username=role, role=role) for role in Role}
        salon = Salon.objects.create(name='Салон', city=City.objects.create(name='Казань'))
        cls.users[Role.MANAGER].salon = salon
        cls.users[Role.MANAGER].save(update_fields=['salon'])
        cls.users[Role.GROUP_LEADER].managed_salons.add(salon)
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

    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_every_authenticated_role_can_create_unassigned_complaint(self, _):
        api = APIClient()
        form_url = reverse('projects:complaint_create')
        payload = {**self.payload, 'additional_info': 'Нужна регулировка'}
        del payload['complaint_type'], payload['installer_assigned_id']
        self.assertIn(api.post('/api/v1/complaints/', payload).status_code, (401, 403))
        for user in [*self.users.values(), self.measurer]:
            with self.subTest(username=user.username):
                api.force_authenticate(user)
                self.client.force_login(user)
                response = api.post('/api/v1/complaints/', payload, format='json')
                self.assertEqual(response.status_code, 201, response.data)
                complaint = Complaint.objects.get(pk=response.data['id'])
                self.assertEqual(complaint.initiator_id, user.pk)
                self.assertIsNone(complaint.installer_assigned_id)
                self.assertEqual(self.client.get(form_url).status_code, 200)

    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_manager_and_admin_cannot_assign_installer_via_api(self, _):
        api = APIClient()
        payload = self.payload.copy()
        del payload['complaint_type'], payload['installer_assigned_id']
        installer = self.users[Role.INSTALLER]
        for role in (Role.MANAGER, Role.ADMIN):
            with self.subTest(role=role):
                api.force_authenticate(self.users[role])
                for assignment in ({'installer_assigned_id': installer.pk},
                                   {'recipient_id': installer.pk}, {'complaint_type': 'installer'}):
                    response = api.post('/api/v1/complaints/', {**payload, **assignment}, format='json')
                    self.assertEqual(response.status_code, 403, response.data)
                response = api.post('/api/v1/complaints/', payload, format='json')
                self.assertEqual(response.status_code, 201, response.data)
                url = f"/api/v1/complaints/{response.data['id']}/"
                for method in (api.patch, api.put):
                    response = method(url, payload | {'installer_assigned_id': installer.pk}, format='json')
                    self.assertEqual(response.status_code, 403, response.data)
                response = api.post(url + 'change_installer/', {'new_installer_id': installer.pk})
                self.assertEqual(response.status_code, 403, response.data)

    @patch('projects.models.send_client_message', return_value=None)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_installer_can_schedule_only_their_own_visit(self, *_):
        api = APIClient()
        api.force_authenticate(self.users[Role.SERVICE_MANAGER])
        with patch('projects.models.send_sms_notification', return_value=False):
            response = api.post('/api/v1/complaints/', self.payload | {'installer_work_paid': False}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        another = User.objects.create_user(username='another', role=Role.INSTALLER)
        api.force_authenticate(self.users[Role.INSTALLER])
        url = f'/api/v1/complaints/{complaint.pk}/plan_installation/'
        date = {'installation_date': '2026-12-03T13:00:00+03:00'}
        response = api.post(url, {**date, 'installer_id': another.pk})
        self.assertEqual(response.status_code, 403, response.data)
        response = api.post(url, date)
        self.assertEqual(response.status_code, 200, response.data)
        complaint.refresh_from_db()
        self.assertEqual(complaint.installer_assigned, self.users[Role.INSTALLER])

    @patch('projects.models.send_sms_notification', return_value=False)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_service_manager_can_create_and_route_to_installer(self, *_):
        sm = self.users[Role.SERVICE_MANAGER]
        self.client.force_login(sm)
        self.assertEqual(self.client.get(reverse('projects:complaint_create')).status_code, 200)

        api = APIClient()
        api.force_authenticate(sm)
        response = api.post('/api/v1/complaints/', self.payload | {'installer_work_paid': False}, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        self.assertEqual(complaint.initiator, sm)
        self.assertEqual(complaint.installer_assigned, self.users[Role.INSTALLER])
        self.assertEqual(complaint.status, ComplaintStatus.WAITING_INSTALLER_DATE)

    @patch('projects.models.send_sms_notification', return_value=False)
    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_manager_with_service_duties_can_assign_installer(self, *_):
        manager = self.users[Role.MANAGER]
        manager.performs_service_manager_duties = True
        manager.save(update_fields=['performs_service_manager_duties'])
        api = APIClient()
        api.force_authenticate(manager)
        response = api.post('/api/v1/complaints/', self.payload | {'installer_work_paid': False}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        self.assertEqual(complaint.installer_assigned_id, self.users[Role.INSTALLER].pk)

    def test_self_service_api_cannot_grant_service_manager_role(self):
        manager = self.users[Role.MANAGER]
        api = APIClient()
        api.force_authenticate(manager)
        response = api.patch('/api/v1/auth/me/', {'role': Role.SERVICE_MANAGER}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        manager.refresh_from_db()
        self.assertEqual(manager.role, Role.MANAGER)
        api.force_authenticate(user=None)
        response = api.post('/api/v1/auth/register/', {
            'username': 'self-appointed', 'password': 'long-unique-test-password',
            'password2': 'long-unique-test-password', 'role': Role.SERVICE_MANAGER,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('role', response.data)

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
