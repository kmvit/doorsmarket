"""
Management команда для проверки просроченных сервисных заявок Москва
Должна запускаться по расписанию (например, через cron каждый час)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from projects.models import Complaint, ComplaintStatus
from users.models import User


class Command(BaseCommand):
    help = 'Проверяет просроченные сервисные заявки Москва и отправляет уведомления'

    def handle(self, *args, **options):
        now = timezone.now()

        # Переводим активные заявки с истёкшим сроком в просрочку
        # (check_moscow_service_overdue сам отправляет уведомления ОР при первой просрочке)
        active_complaints = Complaint.objects.filter(
            status=ComplaintStatus.MOSCOW_SERVICE,
            moscow_service_deadline__lt=now
        )

        overdue_count = 0
        for complaint in active_complaints:
            if complaint.check_moscow_service_overdue():
                overdue_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'Рекламация #{complaint.id}: сервисная заявка Москва просрочена '
                        f'(срок был {complaint.moscow_service_deadline.strftime("%d.%m.%Y")})'
                    )
                )

        # Ежедневные напоминания по уже просроченным заявкам
        overdue_complaints = Complaint.objects.filter(
            status=ComplaintStatus.MOSCOW_SERVICE_OVERDUE
        )

        for complaint in overdue_complaints:
            days_overdue = (now - complaint.moscow_service_deadline).days if complaint.moscow_service_deadline else 0
            self.send_daily_reminder(complaint, days_overdue)

            self.stdout.write(
                self.style.ERROR(
                    f'Рекламация #{complaint.id}: просрочка сервиса Москва {days_overdue} дн.'
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Проверка завершена. Новых просрочек: {overdue_count}, Напоминаний: {overdue_complaints.count()}'
            )
        )

    def send_daily_reminder(self, complaint, days_overdue):
        """Ежедневные напоминания о просроченных сервисных заявках"""
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            complaint._create_notification(
                recipient=or_user,
                notification_type='pc',
                title=f'🔴 Просрочка сервиса Москва: {days_overdue} дн.',
                message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}): сервисная заявка Москва всё ещё не решена! Клиент: {complaint.client_name}'
            )
