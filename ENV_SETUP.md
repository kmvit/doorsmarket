# Настройка переменных окружения

## Для локальной разработки

Создайте файл `.env` в корне проекта:

```bash
# Django Settings
SECRET_KEY=django-insecure-3lw19kws0@9*!xma)bft8u%qyj!#py72!1y_o*=j@8*_-a^1=j
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DATABASE_ENGINE=django.db.backends.sqlite3
DATABASE_NAME=db.sqlite3
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_HOST=
DATABASE_PORT=

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# JWT Settings
JWT_ACCESS_TOKEN_LIFETIME_DAYS=1
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# Internationalization
LANGUAGE_CODE=ru-ru
TIME_ZONE=Europe/Moscow
```

## Для production сервера (https://16c90da0e1be.vps.myjino.ru)

Создайте файл `.env` на сервере:

```bash
# Django Settings
SECRET_KEY=ВАШ-СЕКРЕТНЫЙ-КЛЮЧ-СГЕНЕРИРУЙТЕ-НОВЫЙ
DEBUG=False
ALLOWED_HOSTS=16c90da0e1be.vps.myjino.ru,localhost,127.0.0.1

# Database (SQLite или настройте PostgreSQL)
DATABASE_ENGINE=django.db.backends.sqlite3
DATABASE_NAME=db.sqlite3
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_HOST=
DATABASE_PORT=

# CORS Settings
CORS_ALLOWED_ORIGINS=https://16c90da0e1be.vps.myjino.ru

# JWT Settings
JWT_ACCESS_TOKEN_LIFETIME_DAYS=1
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# Internationalization
LANGUAGE_CODE=ru-ru
TIME_ZONE=Europe/Moscow
```

## Генерация SECRET_KEY для продакшена

Выполните в Python:

```python
from django.core.management.utils import get_random_secret_key
print(get_random_secret_key())
```

Или в консоли Django:

```bash
python manage.py shell -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

## Важные замечания

1. **НИКОГДА не коммитьте файл `.env` в Git!** Он уже добавлен в `.gitignore`
2. Для production **обязательно** установите `DEBUG=False`
3. Сгенерируйте новый `SECRET_KEY` для продакшена
4. Добавьте ваш production домен в `ALLOWED_HOSTS`
5. Настройте `CSRF_TRUSTED_ORIGINS` в `settings.py` (уже настроено для `16c90da0e1be.vps.myjino.ru`)

## После настройки .env на сервере

1. Перезапустите Django сервер
2. Проверьте логи на наличие ошибок
3. Убедитесь что регистрация работает без CSRF ошибок

