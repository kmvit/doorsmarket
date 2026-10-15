"""
Management команда для проверки просроченных ответов от фабрики
Должна запускаться по расписанию (например, через cron каждый час)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from projects.models import Complaint, ComplaintStatus
from users.models import User


class Command(BaseCommand):
    help = 'Проверяет просроченные ответы от фабрики и отправляет уведомления'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Находим рекламации со статусом "Отправлена", которые были отправлены более 2 рабочих дней назад
        # Для простоты считаем рабочими днями все дни, кроме субботы и воскресенья
        # 2 рабочих дня = примерно 2.8 календарных дня (учитывая выходные)
        sent_complaints = Complaint.objects.filter(
            complaint_type='factory',
            status=ComplaintStatus.SENT
        )
        
        for complaint in sent_complaints:
            # Вычисляем рабочие дни с момента создания
            days_passed = self.count_business_days(complaint.updated_at, now)
            
            if days_passed >= 2:
                # Меняем статус на просроченный
                complaint.status = ComplaintStatus.FACTORY_RESPONSE_OVERDUE
                complaint.save()
                
                # Отправляем уведомления СМ и ОР
                self.send_overdue_notifications(complaint)
                
                self.stdout.write(
                    self.style.WARNING(
                        f'Рекламация #{complaint.id} просрочена ({days_passed} р.д.)'
                    )
                )
        
        # Ежедневные напоминания для уже просроченных
        overdue_complaints = Complaint.objects.filter(
            complaint_type='factory',
            status=ComplaintStatus.FACTORY_RESPONSE_OVERDUE
        )
        
        for complaint in overdue_complaints:
            days_overdue = self.count_business_days(complaint.updated_at, now)
            self.send_daily_reminder(complaint, days_overdue)
            
            self.stdout.write(
                self.style.ERROR(
                    f'Рекламация #{complaint.id} просрочена на {days_overdue} р.д.'
                )
            )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Проверка завершена. Просрочено: {sent_complaints.count()}, Напоминаний: {overdue_complaints.count()}'
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
        # Уведомление СМ в личный кабинет
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='pc',
            title='⚠️ Просрочен ответ фабрики',
            message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) не получила ответ от фабрики в течение 2 рабочих дней! Клиент: {complaint.client_name}'
        )
        
        # Уведомления всем ОР в личный кабинет
        or_users = User.objects.filter(role='complaint_department', is_active=True)
        for or_user in or_users:
            complaint._create_notification(
                recipient=or_user,
                notification_type='pc',
                title='⚠️ Просрочен ответ фабрики',
                message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) требует срочного ответа! Просрочка более 2 рабочих дней. Клиент: {complaint.client_name}'
            )
    
    def send_daily_reminder(self, complaint, days_overdue):
        """Ежедневные напоминания о просроченных рекламациях"""
        # Уведомление СМ в личный кабинет
        complaint._create_notification(
            recipient=complaint.recipient,
            notification_type='pc',
            title=f'🔴 Напоминание: просрочка {days_overdue} р.д.',
            message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) всё ещё ожидает ответ от фабрики! Клиент: {complaint.client_name}'
        )
        
        # Уведомления всем ОР в личный кабинет
        or_users = User.objects.filter(role='complaint_department', is_active=True)
        for or_user in or_users:
            complaint._create_notification(
                recipient=or_user,
                notification_type='pc',
                title=f'🔴 Напоминание: просрочка {days_overdue} р.д.',
                message=f'Рекламация #{complaint.id} (заказ {complaint.order_number}) всё ещё ожидает ответ от фабрики! Клиент: {complaint.client_name}'
            )

