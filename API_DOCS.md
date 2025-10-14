# API Документация - Marketing Doors

## Базовый URL
```
http://localhost:8000/api/v1/
```

## Аутентификация
API использует JWT (JSON Web Token) аутентификацию. После успешного входа или регистрации вы получите два токена:
- **Access Token** - используется для доступа к защищенным эндпоинтам (действителен 1 день)
- **Refresh Token** - используется для обновления access token (действителен 7 дней)

### Использование токенов
Добавьте заголовок к запросам:
```
Authorization: Bearer <access_token>
```

---

## Эндпоинты

### 1. Регистрация пользователя
**POST** `/api/v1/auth/register/`

**Параметры (JSON):**
```json
{
    "username": "string (обязательно)",
    "email": "string (обязательно)",
    "password": "string (обязательно)",
    "password2": "string (обязательно)",
    "first_name": "string (опционально)",
    "last_name": "string (опционально)",
    "role": "string (опционально, по умолчанию: service_manager)",
    "city_id": "integer (опционально)"
}
```

**Доступные роли:**
- `service_manager` - Сервис-менеджер
- `manager` - Менеджер
- `installer` - Монтажник
- `complaint_department` - Отдел рекламаций
- `admin` - Администратор
- `leader` - Руководитель подразделения

**Пример запроса:**
```json
{
    "username": "ivan_ivanov",
    "email": "ivan@example.com",
    "password": "SecurePassword123!",
    "password2": "SecurePassword123!",
    "first_name": "Иван",
    "last_name": "Иванов",
    "role": "manager",
    "city_id": 1,
    "phone_number": "+79991234567"
}
```

**Успешный ответ (201):**
```json
{
    "user": {
        "id": 1,
        "username": "ivan_ivanov",
        "email": "ivan@example.com",
        "first_name": "Иван",
        "last_name": "Иванов",
        "role": "manager",
        "city": {
            "id": 1,
            "name": "Москва"
        },
        "phone_number": "+79991234567",
        "date_joined": "2025-10-13T10:30:00Z"
    },
    "tokens": {
        "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
        "access": "eyJ0eXAiOiJKV1QiLCJhbGc..."
    },
    "message": "Пользователь успешно зарегистрирован"
}
```

**Ошибки:**
- 400 - Невалидные данные (например, пароли не совпадают)

---

### 2. Вход (получение токенов)
**POST** `/api/v1/auth/login/`

**Параметры (JSON):**
```json
{
    "username": "string",
    "password": "string"
}
```

**Успешный ответ (200):**
```json
{
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Ошибки:**
- 401 - Неверные учетные данные

---

### 3. Обновление access token
**POST** `/api/v1/auth/token/refresh/`

**Параметры (JSON):**
```json
{
    "refresh": "string"
}
```

**Успешный ответ (200):**
```json
{
    "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

---

### 4. Выход (добавление токена в черный список)
**POST** `/api/v1/auth/logout/`

**Требуется аутентификация:** ✅

**Параметры (JSON):**
```json
{
    "refresh_token": "string"
}
```

**Успешный ответ (200):**
```json
{
    "message": "Выход выполнен успешно"
}
```

---

### 5. Получение информации о текущем пользователе
**GET** `/api/v1/auth/me/`

**Требуется аутентификация:** ✅

**Успешный ответ (200):**
```json
{
    "id": 1,
    "username": "ivan_ivanov",
    "email": "ivan@example.com",
    "first_name": "Иван",
    "last_name": "Иванов",
    "role": "manager",
    "city": {
        "id": 1,
        "name": "Москва"
    },
    "phone_number": "+79991234567",
    "date_joined": "2025-10-13T10:30:00Z"
}
```

---

### 6. Обновление профиля текущего пользователя
**PUT/PATCH** `/api/v1/auth/me/`

**Требуется аутентификация:** ✅

**Параметры (JSON):**
```json
{
    "email": "string (опционально)",
    "first_name": "string (опционально)",
    "last_name": "string (опционально)",
    "city_id": "integer (опционально)",
    "phone_number": "string (опционально)"
}
```

**Успешный ответ (200):** возвращает обновленные данные пользователя

---

### 7. Смена пароля
**POST** `/api/v1/auth/change-password/`

**Требуется аутентификация:** ✅

**Параметры (JSON):**
```json
{
    "old_password": "string",
    "new_password": "string",
    "new_password2": "string"
}
```

**Успешный ответ (200):**
```json
{
    "message": "Пароль успешно изменен"
}
```

**Ошибки:**
- 400 - Старый пароль неверный или новые пароли не совпадают

---

### 8. Список городов
**GET** `/api/v1/cities/`

**Требуется аутентификация:** ❌

**Успешный ответ (200):**
```json
[
    {
        "id": 1,
        "name": "Москва"
    },
    {
        "id": 2,
        "name": "Санкт-Петербург"
    }
]
```

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Успешный запрос |
| 201 | Ресурс создан |
| 400 | Невалидные данные |
| 401 | Не авторизован |
| 403 | Доступ запрещен |
| 404 | Ресурс не найден |
| 500 | Внутренняя ошибка сервера |

---

## Пример использования в React

```javascript
// Регистрация
const register = async (userData) => {
    const response = await fetch('http://localhost:8000/api/v1/auth/register/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
    });
    const data = await response.json();
    // Сохранить токены
    localStorage.setItem('access_token', data.tokens.access);
    localStorage.setItem('refresh_token', data.tokens.refresh);
    return data;
};

// Вход
const login = async (username, password) => {
    const response = await fetch('http://localhost:8000/api/v1/auth/login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    return data;
};

// Получение данных пользователя
const getMe = async () => {
    const token = localStorage.getItem('access_token');
    const response = await fetch('http://localhost:8000/api/v1/auth/me/', {
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    return await response.json();
};

// Обновление токена
const refreshToken = async () => {
    const refresh = localStorage.getItem('refresh_token');
    const response = await fetch('http://localhost:8000/api/v1/auth/token/refresh/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh })
    });
    const data = await response.json();
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    return data;
};
```

---

## CORS
Сервер настроен на прием запросов от:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Для добавления других доменов обновите `CORS_ALLOWED_ORIGINS` в `settings.py`.

