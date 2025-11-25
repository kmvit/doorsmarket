# REST API Endpoints для Marketing Doors

## Базовый URL
```
/api/v1/
```

## Аутентификация
Все endpoints требуют JWT токен в заголовке:
```
Authorization: Bearer <access_token>
```

---

## Complaints (Рекламации)

### Список рекламаций
```
GET /api/v1/complaints/
```

**Query параметры:**
- `status` - фильтр по статусу
- `complaint_type` - фильтр по типу
- `production_site` - фильтр по производственной площадке
- `reason` - фильтр по причине
- `my_complaints` - только мои рекламации (как инициатор)
- `my_orders` - только мои заказы (как менеджер/СМ/монтажник)
- `needs_planning` - требуют планирования (для монтажника)
- `exclude_closed` - исключить закрытые (по умолчанию: 1)
- `city` - фильтр по городу
- `search` - поиск по номеру заказа, клиенту, адресу
- `ordering` - сортировка (created_at, updated_at, status, order_number)
- `page` - номер страницы (пагинация)

**Пример:**
```
GET /api/v1/complaints/?status=new&my_orders=1&ordering=-created_at
```

### Детали рекламации
```
GET /api/v1/complaints/{id}/
```

### Создание рекламации
```
POST /api/v1/complaints/
```

**Body:**
```json
{
  "production_site_id": 1,
  "reason_id": 1,
  "manager_id": 2,
  "order_number": "ORD-123",
  "client_name": "Иванов Иван",
  "address": "г. Москва, ул. Ленина, д. 1",
  "contact_person": "Иванов И.И.",
  "contact_phone": "+79001234567",
  "additional_info": "Дополнительная информация",
  "assignee_comment": "Комментарий для менеджера"
}
```

### Обновление рекламации
```
PUT /api/v1/complaints/{id}/
PATCH /api/v1/complaints/{id}/
```

### Действия с рекламацией

#### Обработка (выбор типа)
```
POST /api/v1/complaints/{id}/process/
```
**Body:**
```json
{
  "complaint_type": "installer" | "manager" | "factory"
}
```

#### Завершение монтажником
```
POST /api/v1/complaints/{id}/complete/
```

#### Планирование монтажа
```
POST /api/v1/complaints/{id}/plan_installation/
```
**Body:**
```json
{
  "installer_id": 3,
  "installation_date": "2025-01-20T10:00:00Z"
}
```

#### Запуск производства
```
POST /api/v1/complaints/{id}/start_production/
```
**Body:**
```json
{
  "production_deadline": "2025-02-01T00:00:00Z"
}
```

#### Товар на складе
```
POST /api/v1/complaints/{id}/mark_warehouse/
```

#### Планирование отгрузки
```
POST /api/v1/complaints/{id}/plan_shipping/
```
**Body:**
```json
{
  "shipping_date": "2025-01-25T00:00:00Z"
}
```

#### Согласование с клиентом (СМ)
```
POST /api/v1/complaints/{id}/agree_client/
```
**Body:**
```json
{
  "production_deadline": "2025-02-01T00:00:00Z"
}
```

#### Оспаривание решения фабрики (СМ)
```
POST /api/v1/complaints/{id}/dispute_decision/
```
**Body:**
```json
{
  "dispute_arguments": "Аргументы для оспаривания"
}
```

#### Одобрение фабрикой (ОР)
```
POST /api/v1/complaints/{id}/factory_approve/
```

#### Отклонение фабрикой (ОР)
```
POST /api/v1/complaints/{id}/factory_reject/
```
**Body:**
```json
{
  "reject_reason": "Причина отказа"
}
```

#### История изменений
```
GET /api/v1/complaints/{id}/history/
```

---

## Notifications (Уведомления)

### Список уведомлений
```
GET /api/v1/notifications/
```

**Query параметры:**
- `is_read` - фильтр по прочитанности
- `notification_type` - фильтр по типу
- `complaint` - фильтр по рекламации
- `ordering` - сортировка

### Отметить прочитанным
```
POST /api/v1/notifications/{id}/mark_read/
```

### Отметить все прочитанными
```
POST /api/v1/notifications/mark_all_read/
```

---

## Shipping Registry (Реестр отгрузки)

### Список записей
```
GET /api/v1/shipping-registry/
```

**Query параметры:**
- `order_type` - тип заказа
- `delivery_status` - статус доставки
- `manager` - фильтр по менеджеру
- `delivery_destination` - куда везем
- `search` - поиск
- `ordering` - сортировка

### Детали записи
```
GET /api/v1/shipping-registry/{id}/
```

### Создание записи
```
POST /api/v1/shipping-registry/
```

### Обновление записи
```
PUT /api/v1/shipping-registry/{id}/
PATCH /api/v1/shipping-registry/{id}/
```

---

## Production Sites (Производственные площадки)

### Список площадок
```
GET /api/v1/production-sites/
```

**Query параметры:**
- `search` - поиск по названию и адресу

---

## Complaint Reasons (Причины рекламаций)

### Список причин
```
GET /api/v1/complaint-reasons/
```

**Query параметры:**
- `search` - поиск
- `ordering` - сортировка (order, name)

---

## Defective Products (Бракованные изделия)

### Список изделий
```
GET /api/v1/defective-products/?complaint={complaint_id}
```

### Создание
```
POST /api/v1/defective-products/
```

### Обновление
```
PUT /api/v1/defective-products/{id}/
PATCH /api/v1/defective-products/{id}/
```

### Удаление
```
DELETE /api/v1/defective-products/{id}/
```

---

## Attachments (Вложения)

### Список вложений
```
GET /api/v1/attachments/?complaint={complaint_id}
```

### Загрузка файла
```
POST /api/v1/attachments/
```
**Body (multipart/form-data):**
- `complaint` - ID рекламации
- `file` - файл
- `attachment_type` - тип (photo, video, document, commercial_offer)
- `description` - описание

### Удаление
```
DELETE /api/v1/attachments/{id}/
```

---

## Comments (Комментарии)

### Список комментариев
```
GET /api/v1/comments/?complaint={complaint_id}
```

### Создание комментария
```
POST /api/v1/comments/
```
**Body:**
```json
{
  "complaint": 1,
  "text": "Текст комментария"
}
```

### Обновление
```
PUT /api/v1/comments/{id}/
PATCH /api/v1/comments/{id}/
```

### Удаление
```
DELETE /api/v1/comments/{id}/
```

---

## Dashboard (Статистика)

### Статистика для дашборда
```
GET /api/v1/dashboard/stats/
```

Возвращает статистику по задачам в зависимости от роли пользователя.

**Пример ответа:**
```json
{
  "stats": [
    {
      "key": "in_work",
      "label": "В работе",
      "count": 5,
      "url_param": null
    },
    {
      "key": "needs_planning",
      "label": "Требуют планирования",
      "count": 2,
      "url_param": "needs_planning"
    }
  ]
}
```

---

## Права доступа

### По ролям:

- **admin** - полный доступ ко всем рекламациям
- **leader** - доступ к рекламациям своего города
- **service_manager** - доступ к рекламациям своего города и назначенным ему
- **manager** - доступ ко всем рекламациям
- **installer** - доступ только к назначенным ему рекламациям
- **complaint_department** - доступ только к фабричным рекламациям

### По действиям:

- **process** - только service_manager и admin
- **complete** - только назначенный installer
- **start_production** - только назначенный manager
- **mark_warehouse** - только назначенный manager
- **plan_shipping** - только назначенный manager
- **agree_client** - только service_manager и admin
- **dispute_decision** - только service_manager и admin
- **factory_approve/reject** - только complaint_department

---

## Примеры использования

### Получение списка рекламаций с фильтрами
```bash
curl -X GET "http://localhost:8000/api/v1/complaints/?status=new&my_orders=1" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Создание рекламации
```bash
curl -X POST "http://localhost:8000/api/v1/complaints/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "production_site_id": 1,
    "reason_id": 1,
    "order_number": "ORD-123",
    "client_name": "Иванов Иван",
    "address": "г. Москва, ул. Ленина, д. 1",
    "contact_person": "Иванов И.И.",
    "contact_phone": "+79001234567"
  }'
```

### Загрузка файла
```bash
curl -X POST "http://localhost:8000/api/v1/attachments/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "complaint=1" \
  -F "file=@photo.jpg" \
  -F "attachment_type=photo" \
  -F "description=Фото проблемы"
```

---

## Примечания

1. Все даты должны быть в формате ISO 8601 с UTC (например: `2025-01-20T10:00:00Z`)
2. Для загрузки файлов используйте `multipart/form-data`
3. Пагинация включена по умолчанию (размер страницы: 20)
4. Все endpoints возвращают JSON
5. Ошибки возвращаются в формате:
   ```json
   {
     "error": "Описание ошибки",
     "detail": "Детали ошибки"
   }
   ```

