"""
Перенос файлов из MEDIA_ROOT в бакет S3 с теми же путями.

    python manage.py sync_media_to_s3 --dry-run   # что будет загружено
    python manage.py sync_media_to_s3             # загрузить недостающие
    python manage.py sync_media_to_s3 --verify    # сверить: всё ли есть в бакете

Работает и до включения USE_S3_MEDIA. Повторный запуск докачивает только то,
чего в бакете нет или что отличается размером, — можно прерывать и запускать снова.
"""
import mimetypes
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from marketingdoors.storage import MediaS3Storage


class Command(BaseCommand):
    help = 'Загружает файлы из MEDIA_ROOT в бакет S3 (пути те же)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--verify', action='store_true', help='только сверить, ничего не загружать')

    def handle(self, *args, dry_run, verify, **options):
        if not (settings.S3_BUCKET and settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY):
            raise CommandError('Не заданы S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY в .env')
        storage = MediaS3Storage()
        client = storage.connection.meta.client
        bucket = settings.S3_BUCKET

        remote = {}
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
            for obj in page.get('Contents', []):
                remote[obj['Key']] = obj['Size']
        self.stdout.write(f'В бакете {bucket}: {len(remote)} файлов')

        root = str(settings.MEDIA_ROOT)
        todo, total, total_bytes = [], 0, 0
        for dirpath, _, filenames in os.walk(root):
            for filename in filenames:
                path = os.path.join(dirpath, filename)
                key = os.path.relpath(path, root).replace(os.sep, '/')
                if key.startswith('.') or filename == '.gitkeep':
                    continue
                size = os.path.getsize(path)
                total += 1
                if remote.get(key) != size:
                    todo.append((path, key, size))
                    total_bytes += size
        self.stdout.write(
            f'На диске: {total} файлов, загрузить: {len(todo)} ({total_bytes / 1024 ** 3:.2f} ГБ)'
        )
        if verify:
            for _, key, _ in todo[:20]:
                self.stdout.write(f'  нет в бакете: {key}')
            if todo:
                raise CommandError(f'Не хватает в бакете: {len(todo)} файлов')
            self.stdout.write(self.style.SUCCESS('Все файлы с диска есть в бакете'))
            return
        if dry_run:
            for _, key, _ in todo[:20]:
                self.stdout.write(f'  {key}')
            return

        done_bytes = 0
        for i, (path, key, size) in enumerate(todo, 1):
            content_type = mimetypes.guess_type(key)[0] or 'application/octet-stream'
            client.upload_file(path, bucket, key, ExtraArgs={'ContentType': content_type})
            done_bytes += size
            if i % 200 == 0 or i == len(todo):
                self.stdout.write(f'{i}/{len(todo)} ({done_bytes / 1024 ** 3:.2f} ГБ)')
        self.stdout.write(self.style.SUCCESS(f'Загружено файлов: {len(todo)}'))
