"""
Монтажи, этап 4: работу не приняли — акт без подписи уходит клиенту по
ссылке; клиент подтверждает и прикладывает подписанный акт, монтажник
проверяет подпись (подтверждает или отклоняет — тогда ссылка уходит снова).

    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test installations
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from orders.models import OrderAttachment

from .models import ActReview, EventKind, InstallationFile, InstallationStatus
from .tests_installer import InstallerTestBase


def scan(name='signed.jpg', content_type='image/jpeg', size=10):
    return SimpleUploadedFile(name, b'x' * size, content_type=content_type)


class ClientActTestBase(InstallerTestBase):
    def send_act(self):
        self.upload(self.inst1, kind='act_unsigned', name='act_unsigned.jpg')
        response = self.post(self.inst1, 'send_act_to_client')
        self.assertEqual(response.status_code, 200, response.data)
        self.inst.refresh_from_db()
        return response

    def public(self, action='', data=None, method='post'):
        c = APIClient()  # клиент без входа
        url = f'/api/v1/public/installation-acts/{self.inst.client_code}/' + (f'{action}/' if action else '')
        if method == 'get':
            return c.get(url)
        return c.post(url, data or {}, format='multipart')


class SendActTest(ClientActTestBase):
    def test_needs_unsigned_act(self):
        self.assertEqual(self.post(self.inst1, 'send_act_to_client').status_code, 400)

    def test_send_act_sets_status_and_sms_with_link(self):
        response = self.send_act()
        self.assertEqual(self.inst.status, InstallationStatus.AWAITING_SIGNATURE)
        self.assertTrue(self.inst.client_code)
        text = self.send.call_args.args[1]
        self.assertIn('Подпишите пожалуйста акт', text)
        self.assertIn(f'/m/{self.inst.client_code}', text)
        self.assertTrue(response.data['client_link'].endswith(f'/m/{self.inst.client_code}'))
        # Акт без подписи в заказ не попадает
        self.assertFalse(OrderAttachment.objects.filter(order=self.order).exists())

    def test_unsigned_act_does_not_allow_completion(self):
        self.send_act()
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 400)


class PublicPageTest(ClientActTestBase):
    def setUp(self):
        super().setUp()
        self.upload(self.inst1, kind='result', name='door.jpg')
        self.send_act()

    def test_client_sees_act_and_photos(self):
        response = self.public(method='get')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['awaiting_signature'])
        kinds = sorted(d['kind'] for d in response.data['documents'])
        self.assertEqual(kinds, ['act_unsigned', 'result'])
        self.assertEqual(APIClient().get('/api/v1/public/installation-acts/nosuchcode/').status_code, 404)

    def test_confirm_without_act_is_saved_but_not_enough(self):
        response = self.public('confirm')
        self.assertEqual(response.status_code, 200)
        self.inst.refresh_from_db()
        self.assertIsNotNone(self.inst.client_confirmed_at)
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 400)

    def test_upload_validation(self):
        self.assertEqual(self.public('upload', {'file': scan('a.exe', 'application/x-msdownload')}).status_code, 400)
        self.assertEqual(self.public('upload', {}).status_code, 400)

    def test_signed_act_flow_approve(self):
        response = self.public('upload', {'file': scan()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['last_upload']['review_status'], 'pending')
        f = InstallationFile.objects.get(kind='act', review_status=ActReview.PENDING)
        self.assertIsNone(f.uploaded_by)
        # Пока подпись не проверена — завершать нельзя, в заказ акт не идёт
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 400)
        self.assertFalse(OrderAttachment.objects.filter(order=self.order, name__contains='signed').exists())
        rows = self.client_for(self.inst1).get('/api/v1/installations/', {'folder': 'act_review'}).data
        self.assertEqual([r['id'] for r in rows], [self.inst.id])

        self.assertEqual(self.post(self.inst1, 'approve_act', {'file': f.id}).status_code, 200)
        self.assertTrue(OrderAttachment.objects.filter(order=self.order, name__contains='signed').exists())
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 200)
        self.inst.refresh_from_db()
        self.assertEqual(self.inst.status, InstallationStatus.DONE)
        # После завершения страница больше не принимает файлы
        self.assertEqual(self.public('upload', {'file': scan()}).status_code, 400)

    def test_reject_sends_link_again(self):
        self.public('upload', {'file': scan()})
        f = InstallationFile.objects.get(kind='act', review_status=ActReview.PENDING)
        self.send.reset_mock()
        self.assertEqual(self.post(self.inst1, 'reject_act', {'file': f.id}).status_code, 400)  # без причины
        response = self.post(self.inst1, 'reject_act', {'file': f.id, 'reason': 'нет подписи на 2-й странице'})
        self.assertEqual(response.status_code, 200)
        text = self.send.call_args.args[1]
        self.assertIn('нет подписи на 2-й странице', text)
        self.assertIn(f'/m/{self.inst.client_code}', text)
        page = self.public(method='get').data
        self.assertEqual(page['last_upload']['review_status'], 'rejected')
        self.assertTrue(self.inst.events.filter(kind=EventKind.ACT_REJECTED).exists())

    def test_other_installer_cannot_review(self):
        self.public('upload', {'file': scan()})
        f = InstallationFile.objects.get(kind='act', review_status=ActReview.PENDING)
        self.assertEqual(self.post(self.manager, 'approve_act', {'file': f.id}).status_code, 403)

    def test_installer_can_still_attach_signed_paper_act(self):
        self.upload(self.inst1, kind='act', name='paper.jpg')
        self.assertEqual(self.post(self.inst1, 'complete').status_code, 200)
