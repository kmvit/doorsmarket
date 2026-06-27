"""
Cron: замер выполнен, но менеджер не обработал его больше 2 раб. дней
→ статус measurement_not_processed + push менеджеру заказа.

Запуск: `python manage.py check_measurement_not_processed`
Рекомендуется через crontab раз в час.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import OrderStatus, Measurement
from orders.workdays import workdays_between
from users.push_utils import send_push_notification

THRESHOLD_WORKDAYS = 2


class Command(BaseCommand):
    help = 'Помечает необработанные выполненные замеры как «Замер не обработан» и шлёт push менеджеру'

    def handle(self, *args, **options):
        today = timezone.localdate()
        measurements = Measurement.objects.filter(
            is_done=True,
            is_processed=False,
            request__order__status=OrderStatus.MEASUREMENT_DONE,
        ).select_related('request__order', 'request__order__manager')

        flagged = 0
        for m in measurements:
            if not m.done_at:
                continue
            if workdays_between(m.done_at, today) <= THRESHOLD_WORKDAYS:
                continue

            order = m.request.order
            order.change_status(
                OrderStatus.MEASUREMENT_NOT_PROCESSED,
                actor=None,
                description='Авто: замер не обработан (>2 раб. дней)',
                notify=False,
            )
            recipient = order.manager
            if recipient:
                try:
                    send_push_notification(
                        user=recipient,
                        title=f'Замер не обработан — заказ #{order.id}',
                        body=f'{order.client_name}: обработайте замер',
                        url=f'/orders/{order.id}',
                        data={'orderId': order.id, 'measurementId': m.id},
                    )
                except Exception as exc:  # noqa: BLE001
                    self.stderr.write(f'measurement #{m.id}: {exc}')
            flagged += 1

        self.stdout.write(self.style.SUCCESS(
            f'Проверено замеров: {measurements.count()}, помечено просроченных: {flagged}'
        ))
