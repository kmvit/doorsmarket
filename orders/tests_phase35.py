"""
E2E smoke-тест Фазы 3.5: свободный замер + ручная связка менеджером.
Запуск: venv/bin/python manage.py test orders.tests_phase35 -v 2
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from users.models import City
from orders.models import (
    Salon, Order, OrderItem, OrderStatus,
    MeasurementRequest, Measurement, MeasurementOpening,
)

User = get_user_model()


class Phase35FlowTest(TestCase):
    def setUp(self):
        self.city = City.objects.create(name='Тест-город')
        self.salon = Salon.objects.create(name='Тест-салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=self.city,
        )
        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Иванов',
            status=OrderStatus.MEASUREMENT_REQUESTED,
        )
        self.item1 = OrderItem.objects.create(
            order=self.order, opening_number=1, room_name='Спальня',
            model_name='Дверь A', door_height=2000, door_width=800, position=0,
        )
        self.item2 = OrderItem.objects.create(
            order=self.order, opening_number=2, room_name='Кухня',
            model_name='Дверь B', door_height=2050, door_width=900, position=1,
        )
        self.mr = MeasurementRequest.objects.create(
            order=self.order, contact_name='Иванов', contact_phone='+700',
            created_by=self.manager,
        )

    def test_full_flow(self):
        sm_client = APIClient()
        sm_client.force_authenticate(self.sm)
        mgr_client = APIClient()
        mgr_client.force_authenticate(self.manager)

        # 1. СМ создаёт замер из заявки — должен быть ПУСТОЙ (без openings)
        r = sm_client.post('/api/v1/measurements/create_from_request/', {'request_id': self.mr.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        measurement_id = r.data['id']
        self.assertEqual(len(r.data['openings']), 0, 'замер должен создаваться пустым')

        # 2. СМ добавляет проём через POST без opening_number → должен стать 1
        r = sm_client.post('/api/v1/measurement-openings/', {
            'measurement': measurement_id,
            'room_name': 'Спальня',
            'door_type': 'interior',
            'actual_height': 2080,
            'actual_width': 910,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        op1_id = r.data['id']
        self.assertEqual(r.data['opening_number'], 1, 'opening_number должен авто-проставиться = 1')

        # Перечитаем — рекомендации должны быть пересчитаны на сервере
        op1 = MeasurementOpening.objects.get(id=op1_id)
        self.assertEqual(op1.recommended_door_height, 2080 - 70)   # 2010
        self.assertEqual(op1.recommended_door_width, 910 - 100)    # 810
        # без desired — рек.проём от рек.двери: 2010+70=2080, 810+100=910
        self.assertEqual(op1.recommended_opening_height, 2080)
        self.assertEqual(op1.recommended_opening_width, 910)

        # 3. Второй проём без номера → должен стать 2
        r = sm_client.post('/api/v1/measurement-openings/', {
            'measurement': measurement_id, 'room_name': 'Кухня',
            'actual_height': 2100, 'actual_width': 950,
        }, format='json')
        self.assertEqual(r.data['opening_number'], 2)
        op2_id = r.data['id']

        # 4. Желаемый размер двери на op1 → рек.проём считается от него
        r = sm_client.patch(f'/api/v1/measurement-openings/{op1_id}/', {
            'desired_door_height': 1900, 'desired_door_width': 700,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        op1.refresh_from_db()
        self.assertEqual(op1.recommended_opening_height, 1900 + 70)  # 1970
        self.assertEqual(op1.recommended_opening_width, 700 + 100)   # 800

        # 5. СМ закрывает замер (нужен план открывания → приложим через mark_done validation;
        #    у MR нет opening_plan, поэтому отметим вручную, имитируя наличие вложения)
        m = Measurement.objects.get(id=measurement_id)
        m.is_done = True
        m.save(update_fields=['is_done'])

        # 6. Менеджер связывает проёмы с позициями через batch_link
        r = mgr_client.post('/api/v1/measurement-openings/batch_link/', {
            'links': [
                {'measurement_opening_id': op1_id, 'order_item_id': self.item1.id},
                {'measurement_opening_id': op2_id, 'order_item_id': self.item2.id},
            ],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        op1.refresh_from_db()
        self.assertEqual(op1.order_item_id, self.item1.id)

        # 6b. Валидация: нельзя связать с позицией чужого заказа
        other_order = Order.objects.create(manager=self.manager, salon=self.salon, client_name='Чужой')
        other_item = OrderItem.objects.create(order=other_order, opening_number=1)
        r = mgr_client.post(f'/api/v1/measurement-openings/{op1_id}/link/',
                            {'order_item_id': other_item.id}, format='json')
        self.assertEqual(r.status_code, 400, 'связь с чужим заказом должна отклоняться')

        # 7. Менеджер применяет замер к позициям
        r = mgr_client.post(f'/api/v1/orders/{self.order.id}/apply_measurement_to_items/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.item1.refresh_from_db()
        # door_height = desired(1900) ?? rec_door; door_width = desired(700)
        self.assertEqual(self.item1.door_height, 1900)
        self.assertEqual(self.item1.door_width, 700)
        self.assertEqual(self.item1.door_type, 'interior')  # тип из замера перезаписал
        # рек.проём из замера
        self.assertEqual(self.item1.recommended_opening_height, 1970)
        self.assertEqual(self.item1.recommended_opening_width, 800)

        # item2: desired не задан → door = recommended_door (2100-70=2030, 950-100=850)
        self.item2.refresh_from_db()
        self.assertEqual(self.item2.door_height, 2030)
        self.assertEqual(self.item2.door_width, 850)

        # 8. measurement_data в OrderItemSerializer отдаётся для связанной позиции
        r = mgr_client.get(f'/api/v1/orders/{self.order.id}/')
        items = {i['opening_number']: i for i in r.data['items']}
        md = items[1]['measurement_data']
        self.assertIsNotNone(md)
        self.assertEqual(md['actual_height'], 2080)
        self.assertEqual(md['opening_id'], op1_id)

        # 9. Точечный PATCH позиции через /order-items/ (кнопка «Изменить размер двери»)
        r = mgr_client.patch(f'/api/v1/order-items/{self.item2.id}/', {
            'door_height': 2030, 'door_width': 850,
            'recommended_opening_height': 2100, 'recommended_opening_width': 950,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)

        # 10. Копирование проёма: создаём дубль → opening_number = max+1 = 3
        r = sm_client.post('/api/v1/measurement-openings/', {
            'measurement': measurement_id, 'room_name': 'Спальня (копия)',
            'opening_number': 3, 'actual_height': 2080, 'actual_width': 910,
        }, format='json')
        self.assertEqual(r.data['opening_number'], 3)

        # 11. Удаление проёма
        r = sm_client.delete(f'/api/v1/measurement-openings/{op2_id}/')
        self.assertIn(r.status_code, (204, 200))
        self.assertFalse(MeasurementOpening.objects.filter(id=op2_id).exists())
