# Cron-команды (Фаза 5)

Management-команды Django, которые запускаются системным cron'ом. Помечают
просроченные замеры и шлют push-уведомления.

## Команды

| Команда | Что делает | Кому push | Частота |
|---------|------------|-----------|---------|
| `check_measurement_not_planned` | Заявка в `measurement_requested` > 1 раб. дня без даты → `measurement_not_planned` | СМ города | раз в час |
| `check_measurement_not_done` | Дата назначенного замера прошла, не выполнен → `measurement_not_done` | СМ замера | раз в час |
| `check_measurement_not_processed` | Замер выполнен > 2 раб. дней, не обработан → `measurement_not_processed` | менеджер заказа | раз в час |
| `check_action_reminders` | Наступил срок напоминания (наработки) → push | автор/менеджер | каждые 10 мин |

Рабочие дни считаются по `orders/workdays.py` (пн–пт, без учёта праздников).
Команды идемпотентны: переводят статус только из ожидаемого исходного статуса.

## Запуск вручную (проверка)

```bash
venv/bin/python manage.py check_measurement_not_planned
venv/bin/python manage.py check_measurement_not_done
venv/bin/python manage.py check_measurement_not_processed
venv/bin/python manage.py check_action_reminders
```

## Crontab (продакшен)

Заменить `/path/to/project` на абсолютный путь к проекту.
Запуск только в рабочее время (9–19, пн–пт) — чтобы не плодить ночные push.

```cron
PROJECT=/path/to/project
PYTHON=$PROJECT/venv/bin/python

# Просрочки замеров — каждый час в рабочее время
0 9-19 * * 1-5 cd $PROJECT && $PYTHON manage.py check_measurement_not_planned   >> $PROJECT/logs/cron.log 2>&1
5 9-19 * * 1-5 cd $PROJECT && $PYTHON manage.py check_measurement_not_done      >> $PROJECT/logs/cron.log 2>&1
10 9-19 * * 1-5 cd $PROJECT && $PYTHON manage.py check_measurement_not_processed >> $PROJECT/logs/cron.log 2>&1

# Напоминания (наработки) — каждые 10 минут в рабочее время
*/10 9-19 * * 1-5 cd $PROJECT && $PYTHON manage.py check_action_reminders        >> $PROJECT/logs/cron.log 2>&1
```

Установка: `crontab -e` и вставить блок выше (создать каталог `logs/` заранее).

## Тестовый прогон просрочек

Подменить даты в БД (django shell), затем запустить команду вручную:

```python
# пример: «состарить» заявку, чтобы попала в not_planned
from orders.models import MeasurementRequest
from django.utils import timezone
import datetime
mr = MeasurementRequest.objects.get(order_id=123)
mr.created_at = timezone.now() - datetime.timedelta(days=5)
mr.save(update_fields=['created_at'])
```
