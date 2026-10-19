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
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from marketingdoors.storage import MediaS3Storage


class Command(BaseCommand):
    help = 'Загружает файлы из MEDIA_ROOT в бакет S3 (пути те же)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--verify', action='store_true', help='только сверить, ничего не загружать')
        parser.add_argument('--workers', type=int, default=8, help='параллельных загрузок (мелких файлов много)')

    def handle(self, *args, dry_run, verify, workers, **options):
        if not (settings.S3_BUCKET and settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY):
            raise CommandError('Не заданы S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY в .env')
        storage = MediaS3Storage()
        client = storage.connection.meta.client
        bucket = settings.S3_BUCKET
        prefix = f'{storage.location}/' if storage.location else ''

        remote = {}
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get('Contents', []):
                remote[obj['Key'][len(prefix):]] = obj['Size']
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

        def upload(item):
            path, key, size = item
            content_type = mimetypes.guess_type(key)[0] or 'application/octet-stream'
            client.upload_file(path, bucket, prefix + key, ExtraArgs={'ContentType': content_type})
            return size

        done, done_bytes, failed = 0, 0, []
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = {pool.submit(upload, item): item for item in todo}
            for future in as_completed(futures):
                done += 1
                try:
                    done_bytes += future.result()
                except Exception as exc:  # noqa: BLE001 — докачается повторным запуском
                    failed.append((futures[future][1], exc))
                if done % 500 == 0 or done == len(todo):
                    self.stdout.write(f'{done}/{len(todo)} ({done_bytes / 1024 ** 3:.2f} ГБ)', ending='\n')
                    self.stdout.flush()
        for key, exc in failed[:20]:
            self.stdout.write(self.style.ERROR(f'  не загружен: {key}: {exc}'))
        if failed:
            raise CommandError(f'Не загружено: {len(failed)} — запустите команду ещё раз')
        self.stdout.write(self.style.SUCCESS(f'Загружено файлов: {len(todo)}'))
