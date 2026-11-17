from datetime import date
from unittest.mock import patch

from orders.models import Measurement, MeasurementRequest, Order, OrderStatus, Salon
from projects.models import Complaint, ComplaintReason, ComplaintStatus, ProductionSite

from .models import Installation, InstallationStatus
from .tests_schedule import ScheduleTestBase, User


class CombinedServiceManagerTest(ScheduleTestBase):
    def setUp(self):
        super().setUp()
        self.manager.performs_service_manager_duties = True
        self.manager.save(update_fields=['performs_service_manager_duties'])
        self.api = self.client_for(self.manager)
        other_salon = Salon.objects.create(name='Другой салон', city=self.city)
        self.other_manager = User.objects.create_user(
            username='other-manager', role='manager', salon=other_salon, city=self.city,
        )
        self.other_order = Order.objects.create(
            manager=self.other_manager, salon=other_salon, client_name='Клиент другого салона',
            status=OrderStatus.ON_WAREHOUSE,
        )

    def test_manager_uses_service_actions_for_measurements_in_own_salon(self):
        def make_request(order):
            return MeasurementRequest.objects.create(order=order, contact_name='Клиент')

        self.order.status = OrderStatus.MEASUREMENT_REQUESTED
        self.order.save(update_fields=['status'])
        own_request = make_request(self.order)
        foreign_request = make_request(self.other_order)
        endpoint = '/api/v1/measurements/create_from_request/'
        response = self.api.post(endpoint, {'request_id': foreign_request.pk}, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        response = self.api.post(endpoint, {'request_id': own_request.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Measurement.objects.get(request=own_request).service_manager, self.manager)
        response = self.api.post(f'/api/v1/orders/{self.order.pk}/mark_measurement_irrelevant/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_manager_schedules_own_installation_but_sees_only_busy_slot_for_other_salon(self):
        other_installation = Installation.objects.create(order=self.other_order, is_paid=True)
        other_url = f'/api/v1/installations/{other_installation.pk}/assign/'
        payload = {'installers': [self.inst1.pk], 'date_from': '2026-11-10'}
        denied = self.api.post(other_url, payload, format='json')
        self.assertEqual(denied.status_code, 404, denied.data)
        response = self.client_for(self.sm).post(other_url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        response = self.assign(user=self.manager, date_from='2026-11-12', date_to='2026-11-12')
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.PLANNED)
        response = self.api.get('/api/v1/installations/schedule/', {
            'date_from': date(2026, 11, 10).isoformat(), 'date_to': date(2026, 11, 12).isoformat(),
        })
        self.assertEqual(response.status_code, 200, response.data)
        busy, own_visit = response.data
        self.assertEqual(busy['kind'], 'busy')
        self.assertIsNone(busy['installation_id'])
        self.assertIsNone(busy['order'])
        self.assertNotIn(self.other_order.client_name, str(busy))
        self.assertEqual(own_visit['installation_id'], self.inst.pk)

    @patch('users.push_utils.send_push_notification', return_value=False)
    def test_manager_processes_complaint_in_own_salon(self, _):
        site = ProductionSite.objects.create(name='Фабрика')
        reason = ComplaintReason.objects.create(name='Брак')
        payload = {
            'manager_id': self.manager.pk, 'source_order_id': self.order.pk,
            'production_site_id': site.pk, 'reason_id': reason.pk,
            'order_number': '1', 'client_name': 'Клиент', 'address': 'Адрес',
            'contact_person': 'Клиент', 'contact_phone': '+79270000000',
        }
        rejected = self.api.post('/api/v1/complaints/', {
            **payload, 'source_order_id': self.other_order.pk,
        }, format='json')
        self.assertEqual(rejected.status_code, 400, rejected.data)
        response = self.api.post('/api/v1/complaints/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        complaint = Complaint.objects.get(pk=response.data['id'])
        self.assertEqual(complaint.recipient, self.manager)
        self.assertEqual(complaint._get_service_manager(), self.manager)
        result = self.api.post(f'/api/v1/complaints/{complaint.pk}/process/', {'complaint_type': 'manager'})
        self.assertEqual(result.status_code, 200, result.data)
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, ComplaintStatus.IN_PROGRESS)

        foreign = Complaint.objects.create(
            initiator=self.other_manager, recipient=self.sm, manager=self.other_manager,
            source_order=self.other_order, production_site=site, reason=reason,
        )
        result = self.api.post(f'/api/v1/complaints/{foreign.pk}/process/', {'complaint_type': 'manager'})
        self.assertEqual(result.status_code, 404, result.data)
        result = self.api.post('/api/v1/defective-products/', {
            'complaint': foreign.pk, 'product_name': 'Дверь',
        })
        self.assertEqual(result.status_code, 403, result.data)
