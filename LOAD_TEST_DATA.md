# Загрузка тестовых данных

## 📋 Подготовка

Перед загрузкой тестовых данных убедитесь, что миграции применены:

```bash
python manage.py makemigrations
python manage.py migrate
```

## 🚀 Загрузка всех тестовых данных (в правильном порядке)

Важно загружать в правильной последовательности из-за зависимостей между моделями:

```bash
# 1. Города
python manage.py loaddata users/fixtures/test_cities.json

# 2. Пользователи
python manage.py loaddata users/fixtures/test_users.json

# 3. Производственные площадки
python manage.py loaddata projects/fixtures/test_production_sites.json

# 4. Причины рекламации
python manage.py loaddata projects/fixtures/initial_complaint_reasons.json

# 5. Рекламации
python manage.py loaddata projects/fixtures/test_complaints.json

# 6. Бракованные изделия
python manage.py loaddata projects/fixtures/test_defective_products.json
```

## ⚡ Быстрая загрузка всех данных одной командой:

```bash
python manage.py loaddata users/fixtures/test_cities.json users/fixtures/test_users.json projects/fixtures/test_production_sites.json projects/fixtures/initial_complaint_reasons.json projects/fixtures/test_complaints.json projects/fixtures/test_defective_products.json
```

## 👥 Тестовые пользователи

Все пользователи имеют одинаковый пароль: **`test123456`**

| Username | Роль | Город | Email |
|----------|------|-------|-------|
| `admin` | Администратор | Москва | admin@marketingdoors.ru |
| `sm_petrov` | Сервис-менеджер | Москва | petrov@marketingdoors.ru |
| `manager_ivanov` | Менеджер | Москва | ivanov@marketingdoors.ru |
| `manager_sidorova` | Менеджер | Санкт-Петербург | sidorova@marketingdoors.ru |
| `installer_kozlov` | Монтажник | Москва | kozlov@marketingdoors.ru |
| `leader_volkov` | Руководитель | Москва | volkov@marketingdoors.ru |
| `complaint_dept` | Отдел рекламаций | Москва | smirnova@marketingdoors.ru |

## 🏭 Производственные площадки

- Производство Москва-Восток
- Производство Москва-Запад
- Производство Санкт-Петербург
- Производство Казань

## 📝 Причины рекламации (12 штук)

1. Фабрика Лайт (4-я площадка)
2. Фабрика Академи
3. Фабрика Ягуар
4. Фабрика AG-Style
5. Складская программа
6. Пересорт фурнитуры в Москве
7. Фурнитура брак
8. Транспортный бой
9. Ошибка менеджера
10. Ошибка замера
11. Ошибка монтажа
12. Пошли на встречу клиенту

## 🎫 Тестовые рекламации (5 штук)

1. **ORD-2025-001** - Новая, производственный дефект
2. **ORD-2025-002** - В работе, транспортный бой
3. **ORD-2025-003** - Решена, ошибка монтажа
4. **ORD-2025-004** - Новая, ошибка замера (с 2 изделиями)
5. **ORD-2025-005** - Закрыта, пошли навстречу клиенту

## 🗑️ Очистка БД перед загрузкой (опционально)

Если хотите начать с чистой базы:

```bash
# Удалить базу данных
rm db.sqlite3

# Пересоздать миграции
python manage.py migrate

# Загрузить тестовые данные
python manage.py loaddata users/fixtures/test_cities.json users/fixtures/test_users.json projects/fixtures/test_production_sites.json projects/fixtures/initial_complaint_reasons.json projects/fixtures/test_complaints.json projects/fixtures/test_defective_products.json
```

## ⚠️ Примечание

Хеш пароля в JSON файле соответствует паролю `test123456`. 

Для создания нового хеша пароля:

```python
from django.contrib.auth.hashers import make_password
print(make_password('your_password'))
```

## 🎯 После загрузки

Войдите в систему используя любого из тестовых пользователей:
- **Логин:** `manager_ivanov`
- **Пароль:** `test123456`

Или войдите в админ-панель с правами суперпользователя:
- **Логин:** `admin`
- **Пароль:** `test123456`
- **URL:** http://localhost:8000/admin/

