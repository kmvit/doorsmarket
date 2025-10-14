# Marketing Doors - Backend API

Django REST API для PWA приложения Marketing Doors с системой управления пользователями по ролям и городам.

## Технологии

- **Django 5.2.7** - основной фреймворк
- **Django REST Framework 3.16.1** - создание REST API
- **Simple JWT 5.5.1** - JWT аутентификация
- **Django CORS Headers 4.9.0** - поддержка CORS для фронтенда

## Роли пользователей

1. **Сервис-менеджер** (`service_manager`) - по умолчанию
2. **Менеджер** (`manager`)
3. **Монтажник** (`installer`)
4. **Отдел рекламаций** (`complaint_department`)
5. **Администратор** (`admin`)
6. **Руководитель подразделения** (`leader`) - видит все по своему городу

## Установка и запуск

### 1. Клонирование и настройка виртуального окружения

```bash
# Перейдите в директорию проекта
cd /Users/home/PycharmProjects/marketingdoors

# Активируйте виртуальное окружение
source venv/bin/activate

# Установите зависимости
pip install -r requirements.txt
```

### 2. Применение миграций

```bash
# Создайте миграции для кастомной модели User
python manage.py makemigrations

# Примените миграции
python manage.py migrate
```

### 3. Создание суперпользователя

```bash
python manage.py createsuperuser
```

### 4. Создание городов (опционально)

Войдите в Django shell и создайте города:

```bash
python manage.py shell
```

```python
from users.models import City

City.objects.create(name='Москва')
City.objects.create(name='Санкт-Петербург')
City.objects.create(name='Казань')
# ... добавьте другие города
```

### 5. Запуск сервера

```bash
python manage.py runserver
```

Сервер будет доступен по адресу: `http://localhost:8000`

## Админ-панель

Доступ к админ-панели Django: `http://localhost:8000/admin/`

## API Документация

Подробная документация API находится в файле [API_DOCS.md](API_DOCS.md)

### Основные эндпоинты:

- `POST /api/v1/auth/register/` - регистрация пользователя
- `POST /api/v1/auth/login/` - вход (получение JWT токенов)
- `POST /api/v1/auth/token/refresh/` - обновление access token
- `POST /api/v1/auth/logout/` - выход
- `GET /api/v1/auth/me/` - получение данных текущего пользователя
- `PUT/PATCH /api/v1/auth/me/` - обновление профиля
- `POST /api/v1/auth/change-password/` - смена пароля
- `GET /api/v1/cities/` - список городов

## Структура проекта

```
marketingdoors/
├── marketingdoors/          # Главный модуль проекта
│   ├── settings.py         # Настройки Django
│   ├── urls.py             # Главные URL маршруты
│   └── wsgi.py
├── users/                  # Приложение пользователей
│   ├── models.py           # Модели User, City, Role
│   ├── serializers.py      # DRF сериализаторы
│   ├── views.py            # API views
│   ├── urls.py             # URL маршруты приложения
│   └── admin.py            # Админ-панель
├── manage.py
├── requirements.txt
├── README.md
└── API_DOCS.md
```

## Настройки для фронтенда

### CORS
Разрешены запросы с доменов:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Для добавления других доменов измените `CORS_ALLOWED_ORIGINS` в `settings.py`.

### JWT Токены
- **Access Token**: действителен 1 день
- **Refresh Token**: действителен 7 дней
- Токены автоматически ротируются при обновлении

## Разработка

### Создание миграций после изменения моделей

```bash
python manage.py makemigrations
python manage.py migrate
```

### Запуск в режиме разработки

```bash
python manage.py runserver
```

## Безопасность

⚠️ **Важно для продакшена:**

1. Измените `SECRET_KEY` в `settings.py`
2. Установите `DEBUG = False`
3. Настройте `ALLOWED_HOSTS`
4. Используйте HTTPS
5. Настройте правильную базу данных (PostgreSQL)
6. Настройте правильные CORS домены

## Лицензия

Proprietary

