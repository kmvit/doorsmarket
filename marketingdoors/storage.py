"""
Файлы (media) в Yandex Object Storage.

Включается флагом USE_S3_MEDIA=True в .env (плюс S3_ACCESS_KEY_ID,
S3_SECRET_ACCESS_KEY, S3_BUCKET). Без флага всё лежит на диске, как раньше.

Адреса файлов не меняются: /media/<путь>. На них построен офлайн-кеш PWA
(services/prefetch.ts, sw.ts — кешируется только свой домен и /media/), поэтому
ссылок прямо на S3 приложению не отдаём. Запрос /media/... приходит в
MediaView: она подписывает ссылку на объект и отдаёт nginx заголовок
X-Accel-Redirect — nginx сам забирает файл из бакета и стримит клиенту
(Django файл не качает). Бакет закрыт: без подписи его не прочитать.
"""
import os
import shutil
import tempfile

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.utils.encoding import filepath_to_uri
from django.views.static import serve
from storages.backends.s3 import S3Storage

S3_ENDPOINT = 'https://storage.yandexcloud.net'
S3_REGION = 'ru-central1'
# Подпись ссылки, которую nginx тут же использует, — минуты хватает с запасом
SIGNED_URL_TTL = 60
# Скачанные из S3 файлы для PDF (weasyprint берёт картинки с диска)
LOCAL_CACHE_DIR = os.path.join(tempfile.gettempdir(), 'doorsmarket-media-cache')


class MediaS3Storage(S3Storage):
    """S3 с прежними адресами /media/<путь> и без перезаписи одноимённых файлов."""

    def __init__(self, **kwargs):
        kwargs.setdefault('bucket_name', settings.S3_BUCKET)
        kwargs.setdefault('access_key', settings.S3_ACCESS_KEY_ID)
        kwargs.setdefault('secret_key', settings.S3_SECRET_ACCESS_KEY)
        kwargs.setdefault('endpoint_url', S3_ENDPOINT)
        kwargs.setdefault('region_name', S3_REGION)
        kwargs.setdefault('signature_version', 's3v4')
        kwargs.setdefault('default_acl', None)
        # Как у FileSystemStorage: одноимённый файл получает суффикс, а не затирает старый
        kwargs.setdefault('file_overwrite', False)
        super().__init__(**kwargs)

    def url(self, name, parameters=None, expire=None, http_method=None):
        return f'{settings.MEDIA_URL}{filepath_to_uri(name)}'

    def signed_url(self, name):
        return super().url(name, expire=SIGNED_URL_TTL)


def media_in_s3() -> bool:
    return getattr(settings, 'USE_S3_MEDIA', False)


def media_storage():
    from django.core.files.storage import default_storage
    return default_storage


def local_path(filefield):
    """
    Путь к файлу на диске для weasyprint/pdfplumber; None, если файла нет.
    Файл из S3 скачивается во временный кеш — имена не перезаписываются,
    поэтому закешированный файл не устаревает.
    """
    if not filefield:
        return None
    try:
        path = filefield.path
    except (ValueError, NotImplementedError):
        path = None
    if path:
        return path if os.path.exists(path) else None

    name = filefield.name
    cached = os.path.join(LOCAL_CACHE_DIR, name)
    if os.path.exists(cached):
        return cached
    try:
        source = filefield.storage.open(name, 'rb')
    except Exception:  # noqa: BLE001 — нет в бакете, сеть: картинку просто не покажем
        return None
    os.makedirs(os.path.dirname(cached), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(cached))
    with source, os.fdopen(fd, 'wb') as out:
        shutil.copyfileobj(source, out)
    os.replace(tmp, cached)
    return cached


def media_view(request, path):
    """/media/<path>: из бакета через nginx (X-Accel-Redirect) или с диска."""
    if not media_in_s3():
        return serve(request, path, document_root=settings.MEDIA_ROOT)
    if '..' in path.split('/'):
        raise Http404
    storage = media_storage()
    if settings.DEBUG:
        # Локально nginx нет — отдаём сами
        try:
            return FileResponse(storage.open(path, 'rb'))
        except Exception:  # noqa: BLE001
            raise Http404
    response = HttpResponse()
    response['X-Accel-Redirect'] = '/s3internal/'
    response['X-S3-Url'] = storage.signed_url(path)
    # Тип и длину возьмёт nginx из ответа S3
    del response['Content-Type']
    return response
