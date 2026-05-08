"""
Cron-команда: проверяет наступившие сроки напоминаний (наработок) по заказам
и шлёт push-уведомление менеджеру.

Запуск: `python manage.py check_action_reminders`
Рекомендуется через crontab каждые 5–10 минут.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from orders.models import OrderActionReminder
from users.push_utils import send_push_notification


class Command(BaseCommand):
    help = 'Шлёт уведомления по напоминаниям с наступившим сроком (done=False, notified=False)'

    def handle(self, *args, **options):
        now = timezone.now()
        due = OrderActionReminder.objects.filter(
            done=False,
            notified=False,
            due_at__lte=now,
        ).select_related('order', 'order__manager')

        sent = 0
        for reminder in due:
            recipient = reminder.created_by or reminder.order.manager
            if not recipient:
                continue
            try:
                send_push_notification(
                    user=recipient,
                    title=f'Напоминание по заказу #{reminder.order_id}',
                    body=reminder.action_text,
                    data={'orderId': reminder.order_id, 'reminderId': reminder.id},
                )
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(f'reminder #{reminder.id}: {exc}')
                continue
            reminder.notified = True
            reminder.save(update_fields=['notified'])
            sent += 1

        self.stdout.write(self.style.SUCCESS(f'Обработано: {due.count()}, отправлено push: {sent}'))
