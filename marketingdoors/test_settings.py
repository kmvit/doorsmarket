"""Тестовые настройки: SQLite in-memory, чтобы не требовать прав создания БД в Postgres."""
from .settings import *  # noqa

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}
