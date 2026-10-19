"""
Файлы в S3: адреса /media/ не меняются, /media/ отдаётся через nginx из бакета,
PDF получают файл на диске.

Запуск: DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
    python manage.py test marketingdoors.tests_storage
"""
import io
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from marketingdoors import storage as media
from marketingdoors.storage import MediaS3Storage, local_path

S3 = dict(S3_BUCKET='bucket', S3_ACCESS_KEY_ID='key', S3_SECRET_ACCESS_KEY='secret')


@override_settings(**S3)
class MediaS3StorageTest(SimpleTestCase):
    def test_url_stays_on_our_domain(self):
        url = MediaS3Storage().url('complaints/2026/10/фото 1.jpg')
        self.assertEqual(url, '/media/complaints/2026/10/%D1%84%D0%BE%D1%82%D0%BE%201.jpg')

    def test_does_not_overwrite_and_private(self):
        s = MediaS3Storage()
        self.assertFalse(s.file_overwrite)
        self.assertIsNone(s.default_acl)
        self.assertEqual(s.endpoint_url, 'https://storage.yandexcloud.net')


class MediaViewTest(SimpleTestCase):
    @override_settings(USE_S3_MEDIA=True, DEBUG=False, **S3)
    def test_s3_served_by_nginx(self):
        fake = SimpleNamespace(signed_url=lambda name: f'https://storage.yandexcloud.net/bucket/{name}?sig=1')
        with patch.object(media, 'media_storage', return_value=fake):
            response = self.client.get('/media/orders/plan.pdf')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['X-Accel-Redirect'], '/s3internal/')
        self.assertEqual(response['X-S3-Url'], 'https://storage.yandexcloud.net/bucket/orders/plan.pdf?sig=1')
        self.assertFalse(response.has_header('Content-Type'))

    @override_settings(USE_S3_MEDIA=True, DEBUG=False, **S3)
    def test_parent_dir_rejected(self):
        self.assertEqual(self.client.get('/media/a/../../etc/passwd').status_code, 404)

    @override_settings(USE_S3_MEDIA=False)
    def test_disk_mode_serves_from_media_root(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, 'orders'))
            with open(os.path.join(root, 'orders', 'a.txt'), 'w') as fh:
                fh.write('hello')
            with override_settings(MEDIA_ROOT=root):
                response = self.client.get('/media/orders/a.txt')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(b''.join(response.streaming_content), b'hello')


class LocalPathTest(SimpleTestCase):
    def test_disk_file_path_returned(self):
        with tempfile.NamedTemporaryFile() as tmp:
            field = SimpleNamespace(path=tmp.name, name='x', __bool__=lambda self: True)
            self.assertEqual(local_path(field), tmp.name)

    def test_s3_file_downloaded_to_cache_once(self):
        storage = MagicMock()
        storage.open.side_effect = lambda name, mode: io.BytesIO(b'image-bytes')

        class Field:
            name = 'catalog/doors/test-cache.png'

            @property
            def path(self):
                raise NotImplementedError

        field = Field()
        field.storage = storage
        with tempfile.TemporaryDirectory() as cache, patch.object(media, 'LOCAL_CACHE_DIR', cache):
            path = local_path(field)
            with open(path, 'rb') as fh:
                self.assertEqual(fh.read(), b'image-bytes')
            self.assertEqual(local_path(field), path)
            storage.open.assert_called_once()

    def test_missing_in_s3_gives_none(self):
        storage = MagicMock()
        storage.open.side_effect = FileNotFoundError

        class Field:
            name = 'nope.png'

            @property
            def path(self):
                raise NotImplementedError

        field = Field()
        field.storage = storage
        with tempfile.TemporaryDirectory() as cache, patch.object(media, 'LOCAL_CACHE_DIR', cache):
            self.assertIsNone(local_path(field))

    def test_empty_field(self):
        self.assertIsNone(local_path(None))
