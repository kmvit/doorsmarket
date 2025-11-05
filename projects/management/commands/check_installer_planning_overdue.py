"""
Management команда для проверки просроченного планирования монтажа
Должна запускаться по расписанию (например, через cron каждый день в 9:00)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from projects.models import Complaint, ComplaintStatus, ComplaintComment
from users.models import User


class Command(BaseCommand):
    help = 'Проверяет просроченное планирование монтажа и отправляет уведомления'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Находим рекламации со статусом "Ожидает дату от монтажника", 
        # которые были назначены более 2 рабочих дней назад
        waiting_complaints = Complaint.objects.filter(
            complaint_type='installer',
            status=ComplaintStatus.WAITING_INSTALLER_DATE
        ).select_related('installer_assigned', 'recipient', 'manager')
        
        overdue_count = 0
        
        for complaint in waiting_complaints:
            # Вычисляем рабочие дни с момента обновления (назначения монтажника)
            days_passed = self.count_business_days(complaint.updated_at, now)
            
            if days_passed >= 2:
                # Меняем статус на просроченный
                complaint.status = ComplaintStatus.INSTALLER_NOT_PLANNED
                complaint.save()
                
                # Создаем комментарий о просрочке
                ComplaintComment.objects.create(
                    complaint=complaint,
                    author=complaint.recipient,  # От имени СМ
                    text=f'⚠️ ПРОСРОЧКА: Монтажник не запланировал дату монтажа в течение {days_passed} рабочих дней'
                )
                
                # Отправляем уведомления монтажнику и СМ
                self.send_overdue_notifications(complaint, days_passed)
                
                overdue_count += 1
                
                self.stdout.write(
                    self.style.WARNING(
                        f'Рекламация #{complaint.id} - монтажник не запланировал ({days_passed} р.д.)'
                    )
                )
        
        # Ежедневные напоминания для уже просроченных
        overdue_complaints = Complaint.objects.filter(
            complaint_type='installer',
            status=ComplaintStatus.INSTALLER_NOT_PLANNED
        ).select_related('installer_assigned', 'recipient')
        
        reminder_count = 0
        
        for complaint in overdue_complaints:
            days_overdue = self.count_business_days(complaint.updated_at, now)
            self.send_daily_reminder(complaint, days_overdue)
            reminder_count += 1
            
            self.stdout.write(
                self.style.ERROR(
                    f'Рекламация #{complaint.id} - просрочка {days_overdue} р.д. (напоминание отправлено)'
                )
            )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Проверка завершена. Новых просрочек: {overdue_count}, Напоминаний: {reminder_count}'
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
    
    def send_overdue_notifications(self, complaint, days_passed):
        """Отправка уведомлений о просрочке планирования"""
        # Уведомление монтажнику
        if complaint.installer_assigned:
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='push',
                title='⚠️ Просрочка планирования монтажа!',
                message=f'Вы не запланировали монтаж по рекламации #{complaint.id} в течение 2 рабочих дней! Назначьте дату срочно!'
            )
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='sms',
                title='Просрочка планирования!',
                message=f'Рекламация #{complaint.id} ({complaint.order_number}). Вы не запланировали монтаж в срок! Назначьте дату срочно. Клиент: {complaint.client_name}'
            )
        
        # Уведомление СМ
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='push',
            title='⚠️ Монтажник не запланировал монтаж',
            message=f'Монтажник {complaint.installer_assigned.get_full_name() or complaint.installer_assigned.username} не запланировал монтаж по рекламации #{complaint.id} в течение 2 р.д.'
        )
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='pc',
            title='⚠️ Монтажник не запланировал монтаж',
            message=f'Монтажник {complaint.installer_assigned.get_full_name() or complaint.installer_assigned.username} не запланировал монтаж по рекламации #{complaint.id} в течение 2 р.д.'
        )
    
    def send_daily_reminder(self, complaint, days_overdue):
        """Ежедневные напоминания о просроченном планировании"""
        # Уведомление монтажнику
        if complaint.installer_assigned:
            complaint._create_notification(
                recipient=complaint.installer_assigned,
                notification_type='push',
                title=f'🔴 Просрочка {days_overdue} р.д.!',
                message=f'Рекламация #{complaint.id} всё ещё ожидает планирования монтажа! Назначьте дату срочно!'
            )
        
        # Уведомление СМ
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='push',
            title=f'🔴 Просрочка планирования {days_overdue} р.д.',
            message=f'Рекламация #{complaint.id} всё ещё не запланирована монтажником'
        )

