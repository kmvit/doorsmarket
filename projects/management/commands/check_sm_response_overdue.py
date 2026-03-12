"""
Management команда для проверки просроченных ответов от СМ
Должна запускаться по расписанию (например, через cron каждый час)
СМ должен в течение 2 р.д. озвучить клиенту решение и назначить дату готовности.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from projects.models import Complaint, ComplaintStatus, Notification
from users.models import User


class Command(BaseCommand):
    help = 'Проверяет просроченные ответы СМ по назначению даты и отправляет уведомления'

    def handle(self, *args, **options):
        now = timezone.now()
        newly_overdue_count = 0
        reminder_count = 0
        
        # Находим рекламации со статусом "Ответ получен",
        # которые были отправлены более 2 рабочих дней назад
        waiting_complaints = Complaint.objects.filter(
            complaint_type='factory',
            status=ComplaintStatus.FACTORY_APPROVED
        )
        
        for complaint in waiting_complaints:
            # Вычисляем рабочие дни с момента ответа фабрики
            if complaint.factory_response_date:
                days_passed = self.count_business_days(complaint.factory_response_date, now)
                
                if days_passed >= 2:
                    # Меняем статус на просроченный
                    complaint.status = ComplaintStatus.SM_RESPONSE_OVERDUE
                    complaint.save()
                    
                    # Отправляем уведомления СМ (в т.ч. push на телефон) и ОР
                    self.send_overdue_notifications(complaint)
                    newly_overdue_count += 1
                    
                    self.stdout.write(
                        self.style.WARNING(
                            f'СМ просрочил ответ по рекламации #{complaint.id} ({days_passed} р.д.)'
                        )
                    )
        
        # Ежедневные напоминания для уже просроченных (только 1 раз в день)
        overdue_complaints = Complaint.objects.filter(
            complaint_type='factory',
            status=ComplaintStatus.SM_RESPONSE_OVERDUE
        )
        
        for complaint in overdue_complaints:
            if complaint.factory_response_date:
                days_overdue = self.count_business_days(complaint.factory_response_date, now)
                if self.send_daily_reminder(complaint, days_overdue, now):
                    reminder_count += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f'СМ просрочил ответ по рекламации #{complaint.id} на {days_overdue} р.д. (напоминание отправлено)'
                        )
                    )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Проверка завершена. Новых просрочек: {newly_overdue_count}, Напоминаний: {reminder_count}'
            )
        )
    
    def count_business_days(self, start_date, end_date):
        """Подсчет рабочих дней между двумя датами"""
        current = start_date
        business_days = 0
        
        while current.date() < end_date.date():
            # Понедельник = 0, Воскресенье = 6
            if current.weekday() < 5:  # Пн-Пт
                business_days += 1
            current += timedelta(days=1)
        
        return business_days
    
    def send_overdue_notifications(self, complaint):
        """Отправка уведомлений о просрочке (при первой просрочке)"""
        # Push-уведомление СМ на телефон
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='push',
            title='⚠️ СМ просрочил ответ',
            message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) — в течение 2 р.д. нужно было озвучить клиенту решение и назначить дату. Назначьте дату готовности.'
        )
        
        # Уведомления всем ОР
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            complaint._create_notification(
                recipient=or_user,
                notification_type='pc',
                title='⚠️ СМ просрочил информирование клиента',
                message=f'СМ не озвучил решение фабрики по рекламации #{complaint.id} (заказ {complaint.order_number}) клиенту в течение 2 рабочих дней.'
            )
    
    def send_daily_reminder(self, complaint, days_overdue, now):
        """Ежедневные напоминания о просроченных рекламациях (только 1 раз в день)"""
        today = now.date()
        # Проверяем, не отправляли ли уже напоминание сегодня
        sm_reminder_sent_today = Notification.objects.filter(
            complaint=complaint,
            title__startswith='🔴 Напоминание',
            created_at__date=today
        ).exists()
        if sm_reminder_sent_today:
            return False

        # Push-уведомление СМ на телефон
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='push',
            title=f'🔴 Напоминание: просрочка {days_overdue} р.д.',
            message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) — назначьте дату готовности, клиенту уйдёт SMS.'
        )
        
        # Уведомления всем ОР
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            complaint._create_notification(
                recipient=or_user,
                notification_type='pc',
                title=f'🔴 Напоминание: просрочка СМ {days_overdue} р.д.',
                message=f'СМ всё ещё не назначил дату по рекламации #{complaint.id} (заказ {complaint.order_number}).'
            )
        return True


