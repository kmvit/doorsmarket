import logging

from django.conf import settings
from django.db import models
from django.utils import timezone
from datetime import timedelta
from users.push_utils import send_sms_notification, send_sms_to_phone

logger = logging.getLogger(__name__)


class ProductionSite(models.Model):
    """Производственная площадка"""
    name = models.CharField(max_length=255, verbose_name='Название площадки')
    address = models.TextField(blank=True, verbose_name='Адрес')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Производственная площадка'
        verbose_name_plural = 'Производственные площадки'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class ComplaintReason(models.Model):
    """Причины рекламации"""
    name = models.CharField(max_length=255, unique=True, verbose_name='Название причины')
    description = models.TextField(blank=True, verbose_name='Описание')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    order = models.PositiveIntegerField(default=0, verbose_name='Порядок сортировки')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Причина рекламации'
        verbose_name_plural = 'Причины рекламации'
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.name


class ComplaintStatus(models.TextChoices):
    """Статусы рекламации"""
    # Основные статусы
    NEW = 'new', 'Новая'
    IN_PROGRESS = 'in_progress', 'В работе'
    COMPLETED = 'completed', 'Выполнена'
    IN_PRODUCTION = 'in_production', 'Заказ в производстве'
    ON_WAREHOUSE = 'on_warehouse', 'Товар на складе'
    SHIPPING_OVERDUE = 'shipping_overdue', 'Отгрузка просрочена'
    FACTORY_DISPUTE = 'factory_dispute', 'Спор с фабрикой'
    FACTORY_RESPONSE_OVERDUE = 'factory_response_overdue', 'Ответ фабрики просрочен'
    FACTORY_APPROVED = 'factory_approved', 'Ответ получен'
    FACTORY_REJECTED = 'factory_rejected', 'Отказ'
    SM_RESPONSE_OVERDUE = 'sm_response_overdue', 'СМ просрочил ответ'
    UNDER_SM_REVIEW = 'under_sm_review', 'На проверке у СМ'
    
    # Планирование
    WAITING_INSTALLER_DATE = 'waiting_installer_date', 'Ожидает дату от монтажника'
    NEEDS_PLANNING = 'needs_planning', 'Нужно запланировать'
    INSTALLER_NOT_PLANNED = 'installer_not_planned', 'Монтажник не запланировал'
    INSTALLER_OVERDUE = 'installer_overdue', 'Просрочена монтажником'
    SHIPPING_PLANNED = 'shipping_planned', 'Отгрузка запланирована'
    INSTALLATION_PLANNED = 'installation_planned', 'Монтаж запланирован'
    BOTH_PLANNED = 'both_planned', 'Отгрузка и монтаж запланированы'
    
    # Финальные статусы
    RESOLVED = 'resolved', 'Решена'
    CLOSED = 'closed', 'Закрыта'
    REJECTED = 'rejected', 'Отклонена'
    SENT = 'sent', 'Отправлена'


class ComplaintType(models.TextChoices):
    """Типы рекламаций"""
    MANAGER = 'manager', 'Менеджер'
    INSTALLER = 'installer', 'Монтажник'
    FACTORY = 'factory', 'Фабрика'


class Complaint(models.Model):
    """Рекламация (заявка)"""
    
    # Автоматические поля
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания заявки')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='initiated_complaints',
        verbose_name='Инициатор заявки'
    )
    
    # Тип рекламации
    complaint_type = models.CharField(
        max_length=20,
        choices=ComplaintType.choices,
        blank=True,
        null=True,
        verbose_name='Тип рекламации'
    )
    
    # Назначение
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='received_complaints',
        verbose_name='Получатель заявки',
        help_text='Если инициатор менеджер или монтажник, то автоматически СМ'
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='managed_complaints',
        verbose_name='Менеджер заказа',
        limit_choices_to={'role': 'manager'}
    )
    
    # Производство
    production_site = models.ForeignKey(
        ProductionSite,
        on_delete=models.PROTECT,
        verbose_name='Производственная площадка'
    )
    
    # Информация о заказе
    reason = models.ForeignKey(
        ComplaintReason,
        on_delete=models.PROTECT,
        verbose_name='Причина рекламации'
    )
    order_number = models.CharField(max_length=100, verbose_name='Номер заказа')
    client_name = models.CharField(max_length=255, verbose_name='Наименование клиента')
    address = models.TextField(verbose_name='Адрес')
    contact_person = models.CharField(max_length=255, verbose_name='Контактное лицо от клиента')
    contact_phone = models.CharField(max_length=20, verbose_name='Телефон контактного лица')
    additional_info = models.TextField(blank=True, verbose_name='Дополнительная информация')
    assignee_comment = models.TextField(
        blank=True,
        verbose_name='Комментарий менеджеру/монтажнику',
        help_text='Необязательное пояснение для менеджера или монтажника'
    )
    
    # Документы и ссылки
    document_package_link = models.URLField(
        blank=True,
        verbose_name='Ссылка на пакет документов'
    )
    commercial_offer = models.FileField(
        upload_to='complaints/commercial_offers/%Y/%m/',
        blank=True,
        null=True,
        verbose_name='Коммерческое предложение'
    )
    commercial_offer_text = models.TextField(
        blank=True,
        verbose_name='Описание коммерческого предложения'
    )
    
    # Статус
    status = models.CharField(
        max_length=30,
        choices=ComplaintStatus.choices,
        default=ComplaintStatus.NEW,
        verbose_name='Статус'
    )
    
    # Планирование и даты
    planned_installation_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Запланированная дата монтажа'
    )
    planned_shipping_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Запланированная дата отгрузки'
    )
    production_deadline = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Срок готовности производства'
    )
    installer_assigned = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='assigned_complaints',
        blank=True,
        null=True,
        verbose_name='Назначенный монтажник',
        limit_choices_to={'role': 'installer'}
    )
    installer_assigned_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата назначения монтажника'
    )
    
    # Дополнительные поля для логики
    factory_response_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата ответа фабрики'
    )
    sm_response_deadline = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дедлайн ответа СМ'
    )
    factory_reject_reason = models.TextField(
        blank=True,
        verbose_name='Причина отказа фабрики'
    )
    factory_approve_comment = models.TextField(
        blank=True,
        verbose_name='Комментарий при одобрении фабрикой'
    )
    dispute_arguments = models.TextField(
        blank=True,
        verbose_name='Аргументы спора с фабрикой'
    )
    client_agreement_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата согласования с клиентом'
    )
    completion_date = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Дата завершения'
    )
    
    # Поле для связи с реестром отгрузки
    added_to_shipping_registry_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='Добавлено в реестр на отгрузку'
    )
    
    class Meta:
        verbose_name = 'Рекламация'
        verbose_name_plural = 'Рекламации'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['order_number']),
        ]
    
    def __str__(self):
        return f"Рекламация #{self.id} - {self.order_number}"

    @staticmethod
    def _add_business_days(start_date, days):
        """Добавляет указанное количество рабочих дней (пн-пт)."""
        result = start_date
        added = 0
        while added < days:
            result += timedelta(days=1)
            if result.weekday() < 5:
                added += 1
        return result
    
    def save(self, *args, **kwargs):
        """Автоматическая установка получателя и статуса"""
        is_new = self.pk is None
        
        # Отслеживаем назначение монтажника
        if self.installer_assigned_id:
            # Проверяем, был ли монтажник назначен ранее
            if self.pk:
                try:
                    old_complaint = Complaint.objects.get(pk=self.pk)
                    # Если монтажник изменился или был назначен впервые
                    if not old_complaint.installer_assigned_id or old_complaint.installer_assigned_id != self.installer_assigned_id:
                        self.installer_assigned_at = timezone.now()
                except Complaint.DoesNotExist:
                    self.installer_assigned_at = timezone.now()
            else:
                # Новая рекламация с монтажником
                self.installer_assigned_at = timezone.now()

        if is_new and not self.recipient_id:
            # Если инициатор - менеджер или монтажник, получатель - сервис-менеджер
            if self.initiator.role in ['manager', 'installer']:
                from users.models import User
                # Найти первого доступного сервис-менеджера
                service_manager = User.objects.filter(role='service_manager').first()
                if service_manager:
                    self.recipient = service_manager
        
        # Автоматически устанавливаем статус "Новая" при создании
        if is_new:
            self.status = ComplaintStatus.NEW
            
        super().save(*args, **kwargs)

        if is_new:
            self._notify_recipient_on_creation()
    
    def set_type_installer(self, installer=None):
        """СМ выбирает тип 'Монтажник'"""
        self.complaint_type = ComplaintType.INSTALLER
        self.status = ComplaintStatus.WAITING_INSTALLER_DATE
        
        # Устанавливаем монтажника, если передан
        if installer:
            self.installer_assigned = installer
            if not self.installer_assigned_at:
                self.installer_assigned_at = timezone.now()
        
        self.save()
        self._create_notification(
            recipient=self.initiator,
            notification_type='push',
            title='Требуется планирование монтажа',
            message=f'Рекламация #{self.id} требует назначения даты монтажа'
        )
        
        # Определяем монтажника для отправки SMS (используем переданный или уже установленный)
        installer_for_sms = installer or self.installer_assigned
        
        # Отправка SMS монтажнику, если он назначен
        if installer_for_sms:
            try:
                # Формируем ссылку на рекламацию
                frontend_url = getattr(settings, 'FRONTEND_URL', '')
                if frontend_url:
                    complaint_url = f"{frontend_url.rstrip('/')}/complaints/{self.id}"
                else:
                    # Если FRONTEND_URL не настроен, используем относительную ссылку
                    complaint_url = f"/complaints/{self.id}"
                
                # Формируем текст SMS
                sms_text = f"Нужно запланировать работы по рекламации #{self.id} {complaint_url}"
                
                sms_sent = send_sms_notification(
                    user=installer_for_sms,
                    message=sms_text,
                )
                if sms_sent:
                    logger.info('SMS отправлено монтажнику %s для рекламации #%s', installer_for_sms.username, self.id)
            except Exception as exc:
                logger.error(
                    'Ошибка отправки SMS монтажнику %s: %s',
                    installer_for_sms.username if installer_for_sms else 'None',
                    exc,
                    exc_info=True,
                )
    
    def set_type_manager(self):
        """СМ выбирает тип 'Менеджер'"""
        if not self.manager:
            raise ValueError('Необходимо назначить менеджера заказа перед установкой типа "Менеджер"')
        
        self.complaint_type = ComplaintType.MANAGER
        self.status = ComplaintStatus.IN_PROGRESS
        self.save()
        self._create_notification(
            recipient=self.manager,
            notification_type='pc',
            title='Требуется оформление заказа',
            message=f'Рекламация #{self.id} требует оформления заказа на производство'
        )
    
    def set_type_factory(self):
        """СМ выбирает тип 'Фабрика'"""
        self.complaint_type = ComplaintType.FACTORY
        self.status = ComplaintStatus.SENT
        self.save()
        # Уведомление для ОР в личный кабинет
        from users.models import User
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            self._create_notification(
                recipient=or_user,
                notification_type='pc',
                title='Новая рекламация',
                message=f'Рекламация #{self.id} (заказ {self.order_number}) требует решения отдела рекламаций. Срок ответа: 2 рабочих дня. Клиент: {self.client_name}'
            )
        
        # Email уведомление будет отправлено отдельно после создания всех связанных объектов
    
    def send_factory_email_notification(self):
        """Отправка email уведомления в отдел рекламаций при передаче рекламации на фабрику"""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f'Начинаем отправку email для рекламации #{self.id}')
        
        or_email = getattr(settings, 'OR_EMAIL', '')
        if not or_email:
            logger.warning(f'OR_EMAIL не настроен, email для рекламации #{self.id} не отправлен')
            return
            
        try:
            from users.push_utils import send_email_notification
            
            # Формируем ссылку на рекламацию
            frontend_url = getattr(settings, 'FRONTEND_URL', '')
            if frontend_url:
                complaint_url = f"{frontend_url.rstrip('/')}/complaints/{self.id}"
            else:
                complaint_url = f"/complaints/{self.id}"
            
            # Вспомогательная функция для форматирования даты
            def format_date(dt):
                if dt:
                    return dt.strftime('%d.%m.%Y %H:%M')
                return 'не указана'
            
            # Получаем все данные рекламации
            attachments = self.attachments.all()
            defective_products = self.defective_products.all()
            comments = self.comments.all()
            
            logger.info(f'Рекламация #{self.id}: найдено {defective_products.count()} бракованных изделий, {attachments.count()} вложений')
            
            # Формируем HTML для дополнительной информации
            additional_info_html = ''
            if self.additional_info and self.additional_info.strip():
                additional_info_html = f'''
                <h3>Дополнительная информация</h3>
                <p>{self.additional_info}</p>
                '''
            
            # Формируем HTML для комментария исполнителю
            assignee_comment_html = ''
            if self.assignee_comment and self.assignee_comment.strip():
                assignee_comment_html = f'''
                <h3>Комментарий для исполнителя</h3>
                <p>{self.assignee_comment}</p>
                '''
            
            # Формируем HTML для комментариев (переписка)
            comments_html = []
            if comments.exists():
                comments_html.append('<h3>Комментарии (переписка):</h3><ul>')
                for comment in comments:
                    author_name = comment.author.get_full_name() or comment.author.username
                    comment_date = format_date(comment.created_at)
                    comments_html.append(
                        f'<li><strong>{author_name}</strong> ({comment_date}):<br>{comment.text}</li>'
                    )
                comments_html.append('</ul>')
                comments_html = '\n'.join(comments_html)
            else:
                comments_html = ''
            
            # Формируем HTML для вложений
            attachments_list_html = []
            if attachments.exists():
                attachments_list_html.append('<h3>Вложения:</h3><ul>')
                for attachment in attachments:
                    file_url = attachment.get_absolute_url()
                    file_name = attachment.file.name.split('/')[-1] if attachment.file.name else 'Без имени'
                    file_size = attachment.file_size
                    attachment_type = attachment.get_attachment_type_display()
                    desc_html = f'<br><small>{attachment.description}</small>' if attachment.description else ''
                    attachments_list_html.append(
                        f'<li><strong>{attachment_type}:</strong> {file_name} ({file_size})<br>'
                        f'<a href="{file_url}">{file_url}</a>{desc_html}</li>'
                    )
                attachments_list_html.append('</ul>')
                attachments_html = '\n'.join(attachments_list_html)
            else:
                attachments_html = '<p><em>Вложения отсутствуют.</em></p>'
            
            # Формируем HTML для бракованных изделий
            defective_products_html = []
            if defective_products.exists():
                defective_products_html.append('<h3>Бракованные изделия:</h3><ul>')
                for product in defective_products:
                    product_html = f'<li>'
                    product_html += f'<strong>Наименование бракованного изделия:</strong> {product.product_name}<br>'
                    if product.size:
                        product_html += f'<strong>Размер изделия:</strong> {product.size}<br>'
                    if product.opening_type:
                        product_html += f'<strong>Открывание:</strong> {product.opening_type}<br>'
                    product_html += f'<strong>Описание проблемы:</strong> {product.problem_description}'
                    product_html += f'</li>'
                    defective_products_html.append(product_html)
                defective_products_html.append('</ul>')
                defective_products_html = '\n'.join(defective_products_html)
            else:
                defective_products_html = '<p><em>Бракованные изделия отсутствуют.</em></p>'
            
            # Формируем тему и текст письма (plain text)
            subject = f'Новая рекламация #{self.id} - требует решения отдела рекламаций'
            message = (
                f'Поступила новая рекламация #{self.id}, требующая решения отдела рекламаций.\n\n'
                f'Срок ответа: 2 рабочих дня\n\n'
                f'Ссылка на рекламацию: {complaint_url}'
            )
            
            # HTML версия письма с указанными полями
            html_message = f'''
            <html>
            <body>
                <h2>Новая рекламация #{self.id}</h2>
                <p><strong>Срок ответа:</strong> 2 рабочих дня</p>
                
                <h3>Основная информация</h3>
                <p><strong>Дата создания заявки:</strong> {format_date(self.created_at)}<br>
                <strong>Инициатор заявки:</strong> {self.initiator.get_full_name() or self.initiator.username}<br>
                <strong>Получатель заявки:</strong> {self.recipient.get_full_name() or self.recipient.username}<br>
                {'<strong>Менеджер заказа:</strong> ' + (self.manager.get_full_name() or self.manager.username) + '<br>' if self.manager else ''}
                <strong>Производственная площадка:</strong> {self.production_site.name}<br>
                <strong>Причина рекламации:</strong> {self.reason.name}<br>
                <strong>Номер заказа:</strong> {self.order_number}</p>
                
                <h3>Информация о клиенте</h3>
                <p><strong>Наименование клиента:</strong> {self.client_name}<br>
                <strong>Адрес:</strong> {self.address}<br>
                <strong>Контактное лицо от клиента:</strong> {self.contact_person}<br>
                <strong>Телефон контактного лица:</strong> {self.contact_phone}</p>
                
                {additional_info_html}
                
                {assignee_comment_html}
                
                {defective_products_html}
                
                {attachments_html}
                
                {comments_html}
                
                <p><a href="{complaint_url}">Открыть рекламацию в системе</a></p>
            </body>
            </html>
            '''
            
            email_sent = send_email_notification(
                to_email=or_email,
                subject=subject,
                message=message,
                html_message=html_message,
            )
            if email_sent:
                logger.info('Email отправлен на адрес %s для рекламации #%s', or_email, self.id)
        except Exception as exc:
            logger.error(
                'Ошибка отправки email на адрес %s для рекламации #%s: %s',
                or_email,
                self.id,
                exc,
                exc_info=True,
            )

    def send_factory_dispute_email_notification(self):
        """Отправка email уведомления в ОР при оспаривании СМ решения фабрики (рекламация снова уходит в ОР)"""
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f'Начинаем отправку email о споре для рекламации #{self.id}')

        or_email = getattr(settings, 'OR_EMAIL', '')
        if not or_email:
            logger.warning(f'OR_EMAIL не настроен, email о споре для рекламации #{self.id} не отправлен')
            return

        try:
            from users.push_utils import send_email_notification

            frontend_url = getattr(settings, 'FRONTEND_URL', '')
            if frontend_url:
                complaint_url = f"{frontend_url.rstrip('/')}/complaints/{self.id}"
            else:
                complaint_url = f"/complaints/{self.id}"

            def format_date(dt):
                if dt:
                    return dt.strftime('%d.%m.%Y %H:%M')
                return 'не указана'

            attachments = self.attachments.all()
            defective_products = self.defective_products.all()
            comments = self.comments.all()

            # Комментарии СМ (аргументы оспаривания) — обязательно добавляем
            dispute_arguments_html = ''
            if self.dispute_arguments and self.dispute_arguments.strip():
                dispute_arguments_html = f'''
                <h3 style="color: #b91c1c;">⚠ Комментарии сервис-менеджера (оспаривание решения фабрики)</h3>
                <p style="background: #fef2f2; padding: 12px; border-left: 4px solid #b91c1c;">{self.dispute_arguments}</p>
                '''

            additional_info_html = ''
            if self.additional_info and self.additional_info.strip():
                additional_info_html = f'''
                <h3>Дополнительная информация</h3>
                <p>{self.additional_info}</p>
                '''

            assignee_comment_html = ''
            if self.assignee_comment and self.assignee_comment.strip():
                assignee_comment_html = f'''
                <h3>Комментарий для исполнителя</h3>
                <p>{self.assignee_comment}</p>
                '''

            comments_html = []
            if comments.exists():
                comments_html.append('<h3>Комментарии (переписка):</h3><ul>')
                for comment in comments:
                    author_name = comment.author.get_full_name() or comment.author.username
                    comment_date = format_date(comment.created_at)
                    comments_html.append(
                        f'<li><strong>{author_name}</strong> ({comment_date}):<br>{comment.text}</li>'
                    )
                comments_html.append('</ul>')
                comments_html = '\n'.join(comments_html)
            else:
                comments_html = ''

            attachments_list_html = []
            if attachments.exists():
                attachments_list_html.append('<h3>Вложения:</h3><ul>')
                for attachment in attachments:
                    file_url = attachment.get_absolute_url()
                    file_name = attachment.file.name.split('/')[-1] if attachment.file.name else 'Без имени'
                    file_size = attachment.file_size
                    attachment_type = attachment.get_attachment_type_display()
                    desc_html = f'<br><small>{attachment.description}</small>' if attachment.description else ''
                    attachments_list_html.append(
                        f'<li><strong>{attachment_type}:</strong> {file_name} ({file_size})<br>'
                        f'<a href="{file_url}">{file_url}</a>{desc_html}</li>'
                    )
                attachments_list_html.append('</ul>')
                attachments_html = '\n'.join(attachments_list_html)
            else:
                attachments_html = '<p><em>Вложения отсутствуют.</em></p>'

            defective_products_html = []
            if defective_products.exists():
                defective_products_html.append('<h3>Бракованные изделия:</h3><ul>')
                for product in defective_products:
                    product_html = f'<li>'
                    product_html += f'<strong>Наименование бракованного изделия:</strong> {product.product_name}<br>'
                    if product.size:
                        product_html += f'<strong>Размер изделия:</strong> {product.size}<br>'
                    if product.opening_type:
                        product_html += f'<strong>Открывание:</strong> {product.opening_type}<br>'
                    product_html += f'<strong>Описание проблемы:</strong> {product.problem_description}'
                    product_html += f'</li>'
                    defective_products_html.append(product_html)
                defective_products_html.append('</ul>')
                defective_products_html = '\n'.join(defective_products_html)
            else:
                defective_products_html = '<p><em>Бракованные изделия отсутствуют.</em></p>'

            subject = f'СМ оспорил решение фабрики - рекламация #{self.id} требует повторного рассмотрения'
            dispute_preview = (self.dispute_arguments or '')[:200]
            if len(self.dispute_arguments or '') > 200:
                dispute_preview += '...'
            message = (
                f'Сервис-менеджер не удовлетворён ответом фабрики по рекламации #{self.id}.\n\n'
                f'Рекламация снова направлена в отдел рекламаций для повторного рассмотрения.\n\n'
                f'Комментарии СМ: {dispute_preview}\n\n'
                f'Ссылка на рекламацию: {complaint_url}'
            )

            html_message = f'''
            <html>
            <body>
                <h2 style="color: #b91c1c;">⚠ СМ оспорил решение фабрики - рекламация #{self.id}</h2>
                <p><strong>Рекламация снова направлена в отдел рекламаций для повторного рассмотрения.</strong></p>

                {dispute_arguments_html}

                <h3>Основная информация</h3>
                <p><strong>Дата создания заявки:</strong> {format_date(self.created_at)}<br>
                <strong>Инициатор заявки:</strong> {self.initiator.get_full_name() or self.initiator.username}<br>
                <strong>Получатель заявки:</strong> {self.recipient.get_full_name() or self.recipient.username}<br>
                {'<strong>Менеджер заказа:</strong> ' + (self.manager.get_full_name() or self.manager.username) + '<br>' if self.manager else ''}
                <strong>Производственная площадка:</strong> {self.production_site.name}<br>
                <strong>Причина рекламации:</strong> {self.reason.name}<br>
                <strong>Номер заказа:</strong> {self.order_number}</p>

                <h3>Информация о клиенте</h3>
                <p><strong>Наименование клиента:</strong> {self.client_name}<br>
                <strong>Адрес:</strong> {self.address}<br>
                <strong>Контактное лицо от клиента:</strong> {self.contact_person}<br>
                <strong>Телефон контактного лица:</strong> {self.contact_phone}</p>

                {additional_info_html}

                {assignee_comment_html}

                {defective_products_html}

                {attachments_html}

                {comments_html}

                <p><a href="{complaint_url}">Открыть рекламацию в системе</a></p>
            </body>
            </html>
            '''

            email_sent = send_email_notification(
                to_email=or_email,
                subject=subject,
                message=message,
                html_message=html_message,
            )
            if email_sent:
                logger.info('Email о споре отправлен на адрес %s для рекламации #%s', or_email, self.id)
        except Exception as exc:
            logger.error(
                'Ошибка отправки email о споре на адрес %s для рекламации #%s: %s',
                or_email,
                self.id,
                exc,
                exc_info=True,
            )

    def factory_approve(self, approve_comment=None):
        """ОР одобряет рекламацию - ответ получен"""
        response_dt = timezone.now()
        self.status = ComplaintStatus.FACTORY_APPROVED
        self.factory_response_date = response_dt
        self.sm_response_deadline = self._add_business_days(response_dt, 2)
        if approve_comment:
            self.factory_approve_comment = approve_comment
        self.save()
        
        # Уведомление СМ о решении фабрики
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            print(f"[DEBUG] Создание уведомления СМ для рекламации #{self.id}, получатель: {sm_recipient.username}")
            
            # Формируем сообщение с комментарием, если он есть
            base_message = f'Рекламация #{self.id} (заказ {self.order_number}) одобрена фабрикой. Озвучьте клиенту решение и при необходимости оспорьте его.'
            if approve_comment:
                base_message += f'\n\nКомментарий от ОР: {approve_comment}'
            
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Получен ответ от фабрики',
                message=base_message
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Ответ от фабрики',
                message=f'Получен ответ фабрики по рекламации #{self.id}. Озвучьте клиенту решение.'
            )
            print(f"[DEBUG] Уведомление создано успешно")
    
    def factory_reject(self, reject_reason):
        """ОР отказывает в рекламации"""
        self.status = ComplaintStatus.FACTORY_REJECTED
        self.factory_reject_reason = reject_reason
        self.factory_response_date = timezone.now()
        self.save()
        
        # Уведомление СМ об отказе
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Отказ в рекламации',
                message=f'Рекламация #{self.id} (заказ {self.order_number}) отклонена фабрикой. Причина: {reject_reason}'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Отказ от фабрики',
                message=f'Рекламация #{self.id} отклонена фабрикой'
            )
    
    def sm_agree_with_client(self, production_deadline):
        """СМ назначает дату готовности — клиенту отправляется SMS, статус → в производстве"""
        self.status = ComplaintStatus.IN_PRODUCTION
        self.client_agreement_date = timezone.now()
        self.production_deadline = production_deadline
        self.save()
        
        # Уведомление ОР о назначении даты
        from users.models import User
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            self._create_notification(
                recipient=or_user,
                notification_type='pc',
                title='Дата готовности назначена',
                message=f'СМ назначил дату по рекламации #{self.id} (заказ {self.order_number}). Срок готовности: {production_deadline.strftime("%d.%m.%Y")}. Клиенту отправлено SMS. Следите за производством.'
            )
        
        # Отправка SMS клиенту
        if self.contact_phone:
            try:
                # Формируем текст SMS с датой производства
                production_date_str = production_deadline.strftime("%d.%m.%Y")
                sms_text = f"Приносим извинения! Срок пр-ва по Вашей рекламации {production_date_str}."
                
                sms_sent = send_sms_to_phone(
                    phone_number=self.contact_phone,
                    message=sms_text,
                )
                if sms_sent:
                    logger.info('SMS отправлено клиенту на номер %s для рекламации #%s', self.contact_phone, self.id)
            except Exception as exc:
                logger.error(
                    'Ошибка отправки SMS клиенту на номер %s для рекламации #%s: %s',
                    self.contact_phone,
                    self.id,
                    exc,
                    exc_info=True,
                )
    
    def sm_dispute_factory_decision(self, arguments):
        """СМ оспаривает решение фабрики"""
        # Если рекламация была отклонена, при повторной отправке ставим статус "отправлена" (ожидает ответа)
        if self.status == ComplaintStatus.FACTORY_REJECTED:
            self.status = ComplaintStatus.SENT
            notification_title = 'Рекламация отправлена повторно'
            notification_message = f'СМ дополнил и отправил повторно рекламацию #{self.id} (заказ {self.order_number}) на фабрику. Ожидается ответ.'
        else:
            # Для других случаев (например, оспаривание одобренного решения) оставляем статус "спор"
            self.status = ComplaintStatus.FACTORY_DISPUTE
            notification_title = '🔴 Спор с фабрикой'
            notification_message = f'СМ оспаривает решение фабрики по рекламации #{self.id} (заказ {self.order_number}). Требуется повторное рассмотрение.'
        
        self.dispute_arguments = arguments
        self.save()

        # Уведомления ОР (в системе)
        from users.models import User
        or_users = User.objects.filter(role='complaint_department')
        for or_user in or_users:
            self._create_notification(
                recipient=or_user,
                notification_type='pc',
                title=notification_title,
                message=notification_message
            )

        # Email уведомление в ОР (как при назначении, плюс комментарии СМ)
        try:
            self.send_factory_dispute_email_notification()
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception('Ошибка отправки email в ОР при оспаривании СМ: %s', e)

    def plan_installation(self, installer, installation_date):
        """Монтажник планирует дату монтажа"""
        self.installer_assigned = installer
        if not self.installer_assigned_at:
            self.installer_assigned_at = timezone.now()
        self.planned_installation_date = installation_date
        self.status = ComplaintStatus.INSTALLATION_PLANNED
        self.save()
        
        # Уведомление СМ о планировании
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Монтаж запланирован',
                message=f'Монтажник {installer.get_full_name()} запланировал монтаж на {installation_date.strftime("%d.%m.%Y")}'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Монтаж запланирован',
                message=f'Рекламация #{self.id} (заказ {self.order_number}): Монтажник {installer.get_full_name()} запланировал монтаж на {installation_date.strftime("%d.%m.%Y %H:%M")}. Клиент: {self.client_name}'
            )
        
        # Отправка SMS клиенту
        if self.contact_phone:
            try:
                # Формируем текст SMS с датой монтажа
                installation_date_str = installation_date.strftime("%d.%m.%Y %H:%M")
                sms_text = f"По Вашей рекламации запланирован монтаж на {installation_date_str}."
                
                sms_sent = send_sms_to_phone(
                    phone_number=self.contact_phone,
                    message=sms_text,
                )
                if sms_sent:
                    logger.info('SMS отправлено клиенту на номер %s для рекламации #%s', self.contact_phone, self.id)
            except Exception as exc:
                logger.error(
                    'Ошибка отправки SMS клиенту на номер %s для рекламации #%s: %s',
                    self.contact_phone,
                    self.id,
                    exc,
                    exc_info=True,
            )
    
    def mark_completed(self):
        """Монтажник отмечает работу выполненной"""
        self.status = ComplaintStatus.UNDER_SM_REVIEW
        self.save()
        
        # Отправляем уведомление СМ
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Требуется проверка',
                message=f'Рекламация #{self.id} выполнена монтажником, требуется проверка'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Требуется проверка',
                message=f'Рекламация #{self.id} (заказ {self.order_number}) выполнена монтажником. Клиент: {self.client_name}. Требуется проверка качества работы.'
            )

    def request_reorder(self, requested_by, comment_text=''):
        """Монтажник запрашивает перезаказ товара — рекламация возвращается СМ для повторной обработки."""
        # Сбрасываем тип и статус, чтобы СМ заново выбрал направление (как новая рекламация)
        self.complaint_type = None
        self.status = ComplaintStatus.NEW
        self.save(update_fields=['complaint_type', 'status'])

        # Сохраняем причину перезаказа как комментарий к рекламации
        comment_body = '⚠️ Запрос на перезаказ товара от монтажника.'
        if comment_text:
            comment_body += f'\nКомментарий: {comment_text}'
        ComplaintComment.objects.create(
            complaint=self,
            author=requested_by,
            text=comment_body,
        )

        # Уведомляем СМ
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Запрос на перезаказ товара',
                message=f'Монтажник по рекламации #{self.id} (заказ {self.order_number}) сообщил о необходимости перезаказа товара. Обработайте рекламацию заново.'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Перезаказ товара',
                message=f'Рекламация #{self.id} требует перезаказа — обработайте заново.'
            )

    def check_installer_overdue(self):
        """Проверяет просрочку выполнения монтажником (более месяца с момента назначения)"""
        if not self.installer_assigned or not self.installer_assigned_at:
            return False
        
        # Проверяем, не завершена ли уже рекламация
        if self.status in [ComplaintStatus.COMPLETED, ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED]:
            return False
        
        # Проверяем, прошло ли более месяца (30 дней)
        month_ago = timezone.now() - timedelta(days=30)
        if self.installer_assigned_at <= month_ago:
            # Если еще не помечена как просроченная
            if self.status != ComplaintStatus.INSTALLER_OVERDUE:
                self.status = ComplaintStatus.INSTALLER_OVERDUE
                self.save(update_fields=['status'])
                
                # Отправляем push и SMS монтажнику
                try:
                    # Формируем ссылку на рекламацию
                    frontend_url = getattr(settings, 'FRONTEND_URL', '')
                    if frontend_url:
                        complaint_url = f"{frontend_url.rstrip('/')}/complaints/{self.id}"
                    else:
                        complaint_url = f"/complaints/{self.id}"
                    
                    # Текст уведомления
                    message_text = f"Рекламация не завершена! Просрочена! {complaint_url}"
                    
                    # Push-уведомление
                    from users.push_utils import send_push_notification
                    send_push_notification(
                        user=self.installer_assigned,
                        title='Рекламация просрочена',
                        body=message_text,
                        url=complaint_url,
                    )
                    
                    # SMS-уведомление
                    send_sms_notification(
                        user=self.installer_assigned,
                        message=message_text,
                    )
                    
                    logger.info(
                        'Рекламация #%s помечена как просроченная монтажником %s',
                        self.id,
                        self.installer_assigned.username
                    )
                except Exception as exc:
                    logger.error(
                        'Ошибка отправки уведомлений о просрочке для рекламации #%s: %s',
                        self.id,
                        exc,
                        exc_info=True,
                    )
            
            return True
        
        return False
    
    def approve_by_sm(self):
        """СМ проверяет и одобряет выполнение"""
        self.status = ComplaintStatus.COMPLETED
        self.completion_date = timezone.now()
        self.save()
        # Уведомление клиенту для оценки
        self._create_notification(
            recipient=None,  # TODO: добавить поле для клиента
            notification_type='sms',
            title='Работа выполнена',
            message=f'Рекламация #{self.id} выполнена. Пожалуйста, оцените качество работы.'
        )
    
    def start_production(self, deadline):
        """Менеджер запускает производство"""
        self.status = ComplaintStatus.IN_PRODUCTION
        self.production_deadline = deadline
        self.save()
        
        # Уведомление менеджеру о запуске производства
        if self.manager:
            self._create_notification(
                recipient=self.manager,
                notification_type='pc',
                title='Заказ запущен в производство',
                message=f'Рекламация #{self.id} (заказ {self.order_number}) запущена в производство. Срок готовности: {deadline.strftime("%d.%m.%Y")}'
            )
        
        # Уведомление СМ о запуске производства
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Заказ в производстве',
                message=f'Менеджер запустил в производство рекламацию #{self.id} (заказ {self.order_number}). Срок готовности: {deadline.strftime("%d.%m.%Y")}'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Заказ в производстве',
                message=f'Рекламация #{self.id} запущена в производство'
            )
    
    def mark_on_warehouse(self):
        """Товар готов на складе"""
        self.status = ComplaintStatus.ON_WAREHOUSE
        self.save(update_fields=['status'])

        # Гарантируем наличие записи в реестре
        self.add_to_shipping_registry()

        print(f"[DEBUG] Товар на складе для рекламации #{self.id}, тип: {self.complaint_type}")

        # Уведомления менеджеру и СМ
        if self.manager:
            # Уведомление менеджеру в личный кабинет
            print(f"[DEBUG] Отправка уведомления менеджеру: {self.manager.username}")
            self._create_notification(
                recipient=self.manager,
                notification_type='pc',
                title='Товар по рекламации на складе',
                message=f'Товар по рекламации #{self.id} (заказ {self.order_number}) на складе, поставьте в реестр на отгрузку'
            )
        else:
            print(f"[DEBUG] Менеджер не назначен для рекламации #{self.id}")

        # Уведомление СМ в личный кабинет
        sm_recipient = self._get_service_manager()
        if sm_recipient:
            print(f"[DEBUG] Отправка уведомления СМ: {sm_recipient.username}")
            self._create_notification(
                recipient=sm_recipient,
                notification_type='pc',
                title='Товар по рекламации на складе',
                message=f'Товар по рекламации #{self.id} (заказ {self.order_number}) на складе, запланируйте монтаж'
            )
            self._create_notification(
                recipient=sm_recipient,
                notification_type='push',
                title='Товар на складе',
                message=f'Рекламация #{self.id} - товар на складе, запланируйте монтаж'
            )

    def add_to_shipping_registry(self, doors_count=1, lift_type='our', lift_method='elevator',
                                  payment_status='', delivery_destination='client', comments=''):
        """Добавляет рекламацию в реестр на отгрузку"""
        from .models import ShippingRegistry

        # Проверяем, нет ли уже записи
        try:
            return self.shipping_entry
        except ShippingRegistry.DoesNotExist:
            pass

        # Создаем новую запись
        entry = ShippingRegistry.objects.create(
            complaint=self,
            order_number=self.order_number,
            manager=self.manager,
            client_name=self.client_name,
            address=self.address,
            contact_person=self.contact_person,
            contact_phone=self.contact_phone,
            doors_count=doors_count,
            lift_type=lift_type,
            lift_method=lift_method,
            order_type=ShippingRegistry.OrderType.COMPLAINT,  # Автоматически "Рекламация"
            payment_status=payment_status,
            delivery_destination=delivery_destination,
            comments=comments,
            planned_shipping_date=self.planned_shipping_date,
        )
        self.added_to_shipping_registry_at = timezone.now()
        self.save(update_fields=['added_to_shipping_registry_at'])

        return entry
    
    def plan_shipping(self, shipping_date):
        """Менеджер планирует отгрузку"""
        self.planned_shipping_date = shipping_date
        if self.planned_installation_date:
            self.status = ComplaintStatus.BOTH_PLANNED
        else:
            self.status = ComplaintStatus.SHIPPING_PLANNED
        self.save()

        # Добавляем запись в реестр на отгрузку
        self.add_to_shipping_registry()
        
        # Отправка SMS клиенту
        if self.contact_phone:
            try:
                # Формируем текст SMS
                sms_text = "По рекламации планируется доставка. В теч. 5 р.д. с Вами свяжутся."
                
                sms_sent = send_sms_to_phone(
                    phone_number=self.contact_phone,
                    message=sms_text,
                )
                if sms_sent:
                    logger.info('SMS отправлено клиенту на номер %s для рекламации #%s', self.contact_phone, self.id)
            except Exception as exc:
                logger.error(
                    'Ошибка отправки SMS клиенту на номер %s для рекламации #%s: %s',
                    self.contact_phone,
                    self.id,
                    exc,
                    exc_info=True,
                )
    
    def plan_installation_by_sm(self, installer, installation_date):
        """СМ планирует монтаж"""
        self.installer_assigned = installer
        self.planned_installation_date = installation_date
        if self.planned_shipping_date:
            self.status = ComplaintStatus.BOTH_PLANNED
        else:
            self.status = ComplaintStatus.INSTALLATION_PLANNED
        self.save()
        
        # Уведомление монтажнику в личный кабинет
        self._create_notification(
            recipient=installer,
            notification_type='pc',
            title='Назначен монтаж',
            message=f'Вам назначен монтаж по рекламации #{self.id} ({self.order_number}). Дата: {installation_date.strftime("%d.%m.%Y %H:%M")}. Клиент: {self.client_name}, адрес: {self.address}, тел: {self.contact_phone}'
        )
        
        # Отправка SMS клиенту
        if self.contact_phone:
            try:
                # Формируем текст SMS с датой монтажа
                installation_date_str = installation_date.strftime("%d.%m.%Y %H:%M")
                sms_text = f"По Вашей рекламации запланирован монтаж на {installation_date_str}."
                
                sms_sent = send_sms_to_phone(
                    phone_number=self.contact_phone,
                    message=sms_text,
                )
                if sms_sent:
                    logger.info('SMS отправлено клиенту на номер %s для рекламации #%s', self.contact_phone, self.id)
            except Exception as exc:
                logger.error(
                    'Ошибка отправки SMS клиенту на номер %s для рекламации #%s: %s',
                    self.contact_phone,
                    self.id,
                    exc,
                    exc_info=True,
        )
    
    def _get_service_manager(self):
        """Определяет СМ для этой рекламации"""
        # Если получатель - СМ, возвращаем его
        if self.recipient and self.recipient.role == 'service_manager':
            return self.recipient
        
        # Ищем СМ по городу инициатора
        from users.models import User
        if self.initiator.city:
            sm = User.objects.filter(role='service_manager', city=self.initiator.city).first()
            if sm:
                return sm
        
        # Если не нашли по городу, берем первого доступного СМ
        return User.objects.filter(role='service_manager').first()
    
    def _create_notification(self, recipient, notification_type, title, message):
        """Создание уведомления и отправка push"""
        if not recipient:
            return

        logger = logging.getLogger(__name__)

        # Вся логика "pc" переводится в push-канал
        notify_type = notification_type or 'push'
        if notify_type == 'pc':
            notify_type = 'push'

        notification = Notification.objects.create(
            complaint=self,
            recipient=recipient,
            notification_type=notify_type,
            title=title,
            message=message,
            is_sent=False,
        )

        push_sent = False
        try:
            from users.push_utils import send_push_notification

            push_sent = send_push_notification(
                user=recipient,
                title=title,
                body=message,
                url=f'/complaints/{self.id}' if self.id else '/notifications',
            )
            logger.info('Push отправлен пользователю %s для рекламации #%s', recipient.username, self.id)
        except Exception as exc:
            logger.error(
                'Ошибка отправки push-уведомления пользователю %s: %s',
                recipient.username,
                exc,
                exc_info=True,
            )

        # Помечаем уведомление как отправленное, если push отправлен
        if push_sent:
            notification.is_sent = True
            notification.sent_at = timezone.now()
        notification.save(update_fields=['is_sent', 'sent_at'])

    def _notify_recipient_on_creation(self):
        """Уведомление первичного получателя о создании рекламации"""
        if not self.recipient or self.recipient == self.initiator:
            return

        initiator_name = self.initiator.get_full_name() or self.initiator.username
        message_parts = [
            f'Поступила новая рекламация #{self.id} от {initiator_name}.',
            f'Заказ: {self.order_number}',
            f'Клиент: {self.client_name}',
        ]

        comment = (self.assignee_comment or '').strip()
        if comment:
            message_parts.append(f'Комментарий: {comment}')

        self._create_notification(
            recipient=self.recipient,
            notification_type='pc',
            title='Новая рекламация',
            message='\n'.join(message_parts)
        )


class DefectiveProduct(models.Model):
    """Бракованное изделие"""
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='defective_products',
        verbose_name='Рекламация'
    )
    product_name = models.CharField(max_length=255, blank=True, default='', verbose_name='Наименование бракованного изделия')
    size = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Размер изделия'
    )
    opening_type = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Открывание'
    )
    problem_description = models.TextField(verbose_name='Описание проблемы')
    order = models.PositiveIntegerField(default=0, verbose_name='Порядок')
    
    class Meta:
        verbose_name = 'Бракованное изделие'
        verbose_name_plural = 'Бракованные изделия'
        ordering = ['complaint', 'order']
    
    def __str__(self):
        if self.size:
            return f"{self.product_name} ({self.size})"
        return f"{self.product_name}"


class ComplaintAttachment(models.Model):
    """Вложение к рекламации (фото/видео/документы)"""
    
    ATTACHMENT_TYPE_CHOICES = [
        ('photo', 'Фото'),
        ('video', 'Видео'),
        ('document', 'Документ'),
        ('commercial_offer', 'Коммерческое предложение'),
    ]
    
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='attachments',
        verbose_name='Рекламация'
    )
    file = models.FileField(
        upload_to='complaints/attachments/%Y/%m/',
        verbose_name='Файл',
        help_text='Загрузка без сжатия и изменения формата'
    )
    attachment_type = models.CharField(
        max_length=20,
        choices=ATTACHMENT_TYPE_CHOICES,
        verbose_name='Тип вложения'
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Описание'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата загрузки')
    
    class Meta:
        verbose_name = 'Вложение'
        verbose_name_plural = 'Вложения'
        ordering = ['uploaded_at']
    
    def __str__(self):
        return f"{self.get_attachment_type_display()} - {self.file.name}"
    
    @property
    def file_size(self):
        """Размер файла в читаемом формате"""
        if self.file:
            size = self.file.size
            for unit in ['B', 'KB', 'MB', 'GB']:
                if size < 1024.0:
                    return f"{size:.1f} {unit}"
                size /= 1024.0
        return "0 B"
    
    def get_absolute_url(self):
        """Возвращает абсолютный URL файла"""
        if not self.file:
            return None
        
        # Используем BASE_URL, если он настроен
        base_url = getattr(settings, 'BASE_URL', None)
        if base_url:
            file_url = self.file.url
            # file.url уже содержит ведущий слэш и MEDIA_URL, просто добавляем BASE_URL
            return f"{base_url.rstrip('/')}{file_url}"
        
        # Если BASE_URL не настроен, используем первый ALLOWED_HOST
        allowed_hosts = getattr(settings, 'ALLOWED_HOSTS', [])
        if allowed_hosts and allowed_hosts[0] and allowed_hosts[0] != '*':
            scheme = 'https' if not settings.DEBUG else 'http'
            base_url = f"{scheme}://{allowed_hosts[0]}"
            file_url = self.file.url
            return f"{base_url.rstrip('/')}{file_url}"
        
        # Если ничего не подошло, возвращаем относительный URL
        return self.file.url


class ComplaintComment(models.Model):
    """Комментарий к рекламации"""
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='Рекламация'
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name='Автор'
    )
    text = models.TextField(verbose_name='Текст комментария')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Комментарий'
        verbose_name_plural = 'Комментарии'
        ordering = ['created_at']
    
    def __str__(self):
        return f"Комментарий от {self.author.username} - {self.created_at.strftime('%d.%m.%Y %H:%M')}"


class ShippingRegistry(models.Model):
    """Реестр на отгрузку"""
    
    class LiftType(models.TextChoices):
        """Тип подъема"""
        OUR = 'our', 'Наш'
        CLIENT = 'client', 'Клиент'
    
    class LiftMethod(models.TextChoices):
        """Способ подъема"""
        ELEVATOR = 'elevator', 'Лифт'
        MANUAL = 'manual', 'Ручной'
    
    class OrderType(models.TextChoices):
        """Вид заказа"""
        MAIN = 'main', 'Основной'
        COMPLAINT = 'complaint', 'Рекламация'
    
    class DeliveryDestination(models.TextChoices):
        """Куда везем"""
        CLIENT = 'client', 'Клиент'
        WAREHOUSE = 'warehouse', 'На склад'
    
    class DeliveryStatus(models.TextChoices):
        """Статус доставки"""
        PENDING = 'pending', 'Ожидает отгрузки'
        IN_TRANSIT = 'in_transit', 'В пути'
        DELIVERED = 'delivered', 'Доставлено'
        CANCELLED = 'cancelled', 'Отменено'
    
    # Связь с рекламацией (опционально)
    complaint = models.OneToOneField(
        'Complaint',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='shipping_entry',
        verbose_name='Рекламация'
    )
    
    # Основная информация
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата добавления в реестр')
    order_number = models.CharField(max_length=100, verbose_name='Номер заказа')
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='shipping_orders',
        verbose_name='Менеджер',
        limit_choices_to={'role': 'manager'}
    )
    
    # Информация о клиенте
    client_name = models.CharField(max_length=255, verbose_name='Клиент')
    address = models.TextField(verbose_name='Адрес')
    contact_person = models.CharField(max_length=255, verbose_name='Контактное лицо')
    contact_phone = models.CharField(max_length=20, verbose_name='Телефон')
    
    # Информация о заказе
    doors_count = models.PositiveIntegerField(default=1, verbose_name='Количество дверей')
    lift_type = models.CharField(
        max_length=10,
        choices=LiftType.choices,
        verbose_name='Чей подъем'
    )
    lift_method = models.CharField(
        max_length=10,
        choices=LiftMethod.choices,
        verbose_name='Как подъем'
    )
    order_type = models.CharField(
        max_length=10,
        choices=OrderType.choices,
        default=OrderType.MAIN,
        verbose_name='Вид заказа'
    )
    payment_status = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Оплата'
    )
    delivery_destination = models.CharField(
        max_length=10,
        choices=DeliveryDestination.choices,
        default=DeliveryDestination.CLIENT,
        verbose_name='Куда везем'
    )
    
    # Дополнительно
    comments = models.TextField(blank=True, verbose_name='Комментарии')
    delivery_status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        verbose_name='Статус доставки'
    )
    client_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name='Оценка клиента (доставка)',
        help_text='От 1 до 5'
    )
    
    # Даты
    planned_shipping_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Запланированная дата отгрузки'
    )
    actual_shipping_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Фактическая дата отгрузки'
    )
    
    class Meta:
        verbose_name = 'Запись в реестре отгрузки'
        verbose_name_plural = 'Реестр на отгрузку'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Отгрузка {self.order_number} - {self.client_name}"
    
    def save(self, *args, **kwargs):
        # Если создается из рекламации, автоматически ставим тип "Рекламация"
        if self.complaint and not self.pk:
            self.order_type = self.OrderType.COMPLAINT
        super().save(*args, **kwargs)


class Notification(models.Model):
    """Уведомления"""
    
    NOTIFICATION_TYPES = [
        ('push', 'Push-уведомление'),
        ('sms', 'SMS'),
        ('email', 'Email'),
        ('pc', 'Уведомление на ПК'),
    ]
    
    complaint = models.ForeignKey(
        Complaint,
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name='Рекламация'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='notifications',
        verbose_name='Получатель'
    )
    notification_type = models.CharField(
        max_length=10,
        choices=NOTIFICATION_TYPES,
        verbose_name='Тип уведомления'
    )
    title = models.CharField(max_length=255, verbose_name='Заголовок')
    message = models.TextField(verbose_name='Сообщение')
    is_sent = models.BooleanField(default=False, verbose_name='Отправлено')
    is_read = models.BooleanField(default=False, verbose_name='Прочитано')
    sent_at = models.DateTimeField(blank=True, null=True, verbose_name='Дата отправки')
    read_at = models.DateTimeField(blank=True, null=True, verbose_name='Дата прочтения')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    
    class Meta:
        verbose_name = 'Уведомление'
        verbose_name_plural = 'Уведомления'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read', '-created_at']),
            models.Index(fields=['complaint', '-created_at']),
        ]
    
    def __str__(self):
        return f"{self.get_notification_type_display()} - {self.recipient.username}"
    
    def mark_as_read(self):
        """Отметить уведомление как прочитанное"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()


