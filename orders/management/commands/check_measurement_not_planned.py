"""
Cron: заявка на замер «висит» в статусе measurement_requested больше 1 раб. дня
без назначенной даты → статус measurement_not_planned + push сервис-менеджерам города.

Запуск: `python manage.py check_measurement_not_planned`
Рекомендуется через crontab раз в час в рабочее время.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from orders.models import OrderStatus, MeasurementRequest
from orders.workdays import workdays_between
from users.models import User, Role
from users.push_utils import send_push_notification

THRESHOLD_WORKDAYS = 1


class Command(BaseCommand):
    help = 'Помечает заявки без назначенной даты как «Замер не запланирован» и шлёт push СМ'

    def handle(self, *args, **options):
        today = timezone.localdate()
        requests = MeasurementRequest.objects.filter(
            order__status=OrderStatus.MEASUREMENT_REQUESTED,
        ).select_related('order', 'order__salon', 'order__salon__city', 'order__manager')

        flagged = 0
        for mr in requests:
            order = mr.order
            # Если по заявке уже создан замер с датой — не считаем просрочкой
            measurement = getattr(mr, 'measurement', None)
            if measurement and measurement.measurement_date:
                continue
            if workdays_between(mr.created_at, today) <= THRESHOLD_WORKDAYS:
                continue

            order.change_status(
                OrderStatus.MEASUREMENT_NOT_PLANNED,
                actor=None,
                description='Авто: замер не запланирован (>1 раб. дня без даты)',
                notify=False,
            )
            self._notify_service_managers(order)
            flagged += 1

        self.stdout.write(self.style.SUCCESS(
            f'Проверено заявок: {requests.count()}, помечено просроченных: {flagged}'
        ))

    def _notify_service_managers(self, order):
        city = order.salon.city if order.salon_id else None
        sms = User.objects.filter(role=Role.SERVICE_MANAGER)
        if city:
            sms = sms.filter(city=city)
        for sm in sms:
            try:
                send_push_notification(
                    user=sm,
                    title=f'Замер не запланирован — заказ #{order.id}',
                    body=f'{order.client_name}: нужна дата замера',
                    url=f'/orders/{order.id}',
                    data={'orderId': order.id},
                )
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(f'order #{order.id}: {exc}')
