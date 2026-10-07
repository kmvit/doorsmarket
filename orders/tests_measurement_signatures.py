"""
Несколько фото подписанных бланков у замера: СМ добавляет, удаляет, все
попадают в PDF.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_measurement_signatures
"""
import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from orders.models import (
    Measurement, MeasurementRequest, MeasurementSignature, Order, OrderStatus, Salon,
)
from users.models import City

User = get_user_model()
MEDIA = tempfile.mkdtemp()


def _png(name):
    buf = io.BytesIO()
    Image.new('RGB', (20, 20), 'white').save(buf, 'PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=MEDIA)
class MeasurementSignaturesTest(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        city = City.objects.create(name='Казань')
        salon = Salon.objects.create(name='Салон', city=city)
        manager = User.objects.create_user(username='mgr', password='x', role='manager', salon=salon)
        self.sm = User.objects.create_user(
            username='sm', password='x', role='service_manager', city=city,
        )
        order = Order.objects.create(
            manager=manager, salon=salon, client_name='Клиент',
            status=OrderStatus.MEASUREMENT_SCHEDULED,
        )
        mr = MeasurementRequest.objects.create(
            order=order, contact_name='Клиент', contact_phone='+700', created_by=manager,
        )
        self.m = Measurement.objects.create(request=mr, service_manager=self.sm)
        self.client = APIClient()
        self.client.force_authenticate(self.sm)

    def _upload(self, name):
        return self.client.post(
            f'/api/v1/measurements/{self.m.id}/upload_signature/',
            {'signature': _png(name)}, format='multipart',
        )

    def test_upload_adds_not_replaces(self):
        self.assertEqual(self._upload('a.png').status_code, 200)
        response = self._upload('b.png')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['signatures']), 2)
        self.assertEqual(self.m.signatures.count(), 2)
        self.assertEqual(response.data['signature_photo_url'], response.data['signatures'][0]['url'])

    def test_delete_one(self):
        self._upload('a.png')
        self._upload('b.png')
        first, second = self.m.signatures.all()
        response = self.client.post(
            f'/api/v1/measurements/{self.m.id}/delete_signature/',
            {'signature_id': first.id}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s['id'] for s in response.data['signatures']], [second.id])

    def test_pdf_has_page_per_signature(self):
        from unittest import mock
        from orders import pdf_blank

        self._upload('a.png')
        self._upload('b.png')
        m = Measurement.objects.get(pk=self.m.pk)
        with mock.patch.object(pdf_blank, 'render_to_string', wraps=pdf_blank.render_to_string) as render:
            pdf_blank.render_measurement_blank(m)
        context = render.call_args.args[1]
        self.assertEqual(len(context['signature_paths']), 2)
        page_html = pdf_blank.render_to_string('orders/measurement_blank.html', context)
        self.assertIn('Фото подписанного бланка 1 из 2', page_html)
        self.assertIn('Фото подписанного бланка 2 из 2', page_html)

    def test_migration_copies_single_signature(self):
        import importlib
        from django.apps import apps
        migration = importlib.import_module('orders.migrations.0037_measurement_signatures')
        Measurement.objects.filter(pk=self.m.pk).update(signature_photo='orders/signatures/old.png')
        migration.copy_single_signatures(apps, None)
        self.assertEqual(
            list(MeasurementSignature.objects.filter(measurement=self.m).values_list('file', flat=True)),
            ['orders/signatures/old.png'],
        )
