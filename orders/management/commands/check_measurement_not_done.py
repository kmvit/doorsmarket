"""
Cron: дата назначенного замера прошла, но замер не выполнен
→ статус measurement_not_done + push сервис-менеджеру.

Запуск: `python manage.py check_measurement_not_done`
Рекомендуется через crontab раз в час.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import OrderStatus, Measurement
from users.push_utils import send_push_notification


class Command(BaseCommand):
    help = 'Помечает просроченные назначенные замеры как «Замер не выполнен» и шлёт push СМ'

    def handle(self, *args, **options):
        now = timezone.now()
        measurements = Measurement.objects.filter(
            is_done=False,
            measurement_date__lt=now,
            request__order__status=OrderStatus.MEASUREMENT_SCHEDULED,
        ).select_related('request__order', 'service_manager')

        flagged = 0
        for m in measurements:
            order = m.request.order
            order.change_status(
                OrderStatus.MEASUREMENT_NOT_DONE,
                actor=None,
                description='Авто: замер не выполнен (дата назначения прошла)',
                notify=False,
            )
            recipient = m.service_manager
            if recipient:
                try:
                    send_push_notification(
                        user=recipient,
                        title=f'Замер не выполнен — заказ #{order.id}',
                        body=f'{order.client_name}: дата замера прошла',
                        url=f'/orders/{order.id}',
                        data={'orderId': order.id, 'measurementId': m.id},
                    )
                except Exception as exc:  # noqa: BLE001
                    self.stderr.write(f'measurement #{m.id}: {exc}')
            flagged += 1

        self.stdout.write(self.style.SUCCESS(
            f'Проверено замеров: {measurements.count()}, помечено просроченных: {flagged}'
        ))
