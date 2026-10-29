"""
Монтажи, этап 5: оценка клиента после монтажа и акт на оплату бухгалтеру.

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
from django.core import mail
from django.test import override_settings
from rest_framework.test import APIClient

from orders.models import Measurement, MeasurementRequest

from .models import InstallationRating, InstallationStatus
from .tests_installer import InstallerTestBase

SCORES = {'overall': 5, 'installation': 4, 'manager': 5}


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   DEFAULT_FROM_EMAIL='robot@academy.test')
class RatingPaymentBase(InstallerTestBase):
    def setUp(self):
        super().setUp()
        self.city.accountant_email = 'oplata-academy@yandex.ru'
        self.city.save()
        self.inst1.email = 'ivan@academy.test'
        self.inst1.save()

    def finish(self, partial=False):
        self.upload(self.inst1, kind='act', name='Акт.jpg')
        response = self.post(self.inst1, 'complete_partial' if partial else 'complete')
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()

    def rate(self, scores=None, comments=None):
        return APIClient().post(f'/api/v1/public/installation-acts/{self.inst.client_code}/rate/',
                                {'scores': scores or SCORES, 'comments': comments or {}}, format='json')


class RatingTest(RatingPaymentBase):
    def test_completion_sends_rating_link(self):
        self.finish()
        text = self.send.call_args.args[1]
        self.assertIn('Оцените пожалуйста нашу работу', text)
        self.assertIn(f'/m/{self.inst.client_code}', text)

    def test_partial_completion_does_not_ask_for_rating(self):
        self.finish(partial=True)
        self.assertNotIn('Оцените', self.send.call_args.args[1] if self.send.called else '')

    def test_client_rates_once_and_sees_only_own_scores(self):
        mr = MeasurementRequest.objects.create(order=self.order, contact_name='М', contact_phone='+7900')
        Measurement.objects.create(request=mr, service_manager=self.sm, is_done=True)
        self.finish()
        page = APIClient().get(f'/api/v1/public/installation-acts/{self.inst.client_code}/').data
        self.assertTrue(page['rating_open'])
        response = self.rate(comments={'installation': 'Чуть задержались'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['rating_open'])
        items = {i['key']: i for i in response.data['rating']['items']}
        self.assertEqual(items['installation']['score'], 4)
        self.assertEqual(items['installation']['comment'], 'Чуть задержались')
        rating = InstallationRating.objects.get()
        # Участники: менеджер, замерщик, монтажник
        self.assertEqual(set(rating.participants.all()), {self.manager, self.sm, self.inst1})
        self.assertEqual(self.rate().status_code, 400)

    def test_rating_validation(self):
        self.finish()
        self.assertEqual(self.rate({'installation': 5}).status_code, 400)  # нет общего впечатления
        self.assertEqual(self.rate({'overall': 7}).status_code, 400)

    def test_not_done_cannot_be_rated(self):
        from .services import ensure_client_code
        ensure_client_code(self.inst)
        self.assertEqual(self.rate().status_code, 400)

    def test_report(self):
        self.finish()
        self.rate()
        c = self.client_for(self.manager)
        data = c.get('/api/v1/installation-ratings/report/', {'group': 'staff'}).data
        names = {row['key']: row for row in data['rows']}
        self.assertIn(self.inst1.id, names)
        self.assertEqual(names[self.inst1.id]['scores']['overall'], 5.0)
        self.assertEqual(names[self.inst1.id]['scores']['installation'], 4.0)
        self.assertEqual(len(data['months']), 1)
        data = c.get('/api/v1/installation-ratings/report/', {'group': 'city'}).data
        self.assertEqual(data['rows'][0]['name'], 'Казань')
        data = c.get('/api/v1/installation-ratings/report/', {'date_from': '2000-01-01', 'date_to': '2000-01-02'}).data
        self.assertEqual(data['rows'], [])
        # Оценка видна в списке монтажей
        rows = c.get('/api/v1/installations/').data
        self.assertEqual(rows[0]['rating_overall'], 5)


class PaymentTest(RatingPaymentBase):
    def send_payment(self, user=None, estimate='Монтаж 3 дверей — 9000 ₽'):
        return self.post(user or self.inst1, 'send_to_payment', {'estimate': estimate})

    def test_send_to_payment(self):
        self.finish()
        response = self.send_payment()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ['oplata-academy@yandex.ru'])
        self.assertEqual(msg.reply_to, ['ivan@academy.test'])
        self.assertIn(f'монтаж #{self.inst.id}', msg.subject)
        self.assertIn(f'заказ #{self.order.id}', msg.subject)
        self.assertIn('Иван', msg.subject)
        self.assertIn('9000', msg.body)
        self.assertIn(f'/orders/installations/{self.inst.id}', msg.body)
        self.assertEqual([a[0] for a in msg.attachments], ['Акт.jpg'])
        self.assertIsNotNone(response.data['payment']['sent_at'])
        # Повторно — можно
        self.assertEqual(self.send_payment().status_code, 200)
        self.assertEqual(len(mail.outbox), 2)

    def test_partial_can_be_sent(self):
        self.finish(partial=True)
        self.assertEqual(self.send_payment().status_code, 200)

    def test_requires_estimate_and_completion(self):
        self.upload(self.inst1, kind='act')
        self.assertEqual(self.send_payment().status_code, 400)  # не завершён
        self.post(self.inst1, 'complete')
        self.assertEqual(self.send_payment(estimate='').status_code, 400)
        self.assertEqual(self.send_payment(user=self.manager).status_code, 403)

    def test_no_accountant_email(self):
        self.city.accountant_email = ''
        self.city.save()
        self.finish()
        response = self.send_payment()
        self.assertEqual(response.status_code, 400)
        self.assertIn('почта бухгалтера', response.data['detail'])

    def test_unsigned_client_act_is_not_enough(self):
        # Акт клиента без проверки подписи на оплату не уходит
        from .services import send_act_to_client
        self.upload(self.inst1, kind='act_unsigned')
        send_act_to_client(self.inst, self.inst1)
        self.inst.status = InstallationStatus.DONE
        self.inst.save()
        response = self.send_payment()
        self.assertEqual(response.status_code, 400)
        self.assertIn('подписанного акта', response.data['detail'])
