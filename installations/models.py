from django.conf import settings
from django.db import models


class InstallationStatus(models.TextChoices):
    NOT_PLANNED = 'not_planned', 'Не запланирован'
    PLANNED = 'planned', 'Запланирован'
    NOT_READY = 'not_ready', 'Не готов к монтажу'
    AWAITING_SIGNATURE = 'awaiting_signature', 'Ожидает подписи клиента'
    PARTIALLY_DONE = 'partially_done', 'Частично завершён'
    DONE = 'done', 'Завершён'
    IRRELEVANT = 'irrelevant', 'Не актуален'


# Монтаж закрыт: по умолчанию скрыт в списке («кроме выполненных»), правки запрещены
CLOSED_INSTALLATION_STATUSES = frozenset({InstallationStatus.DONE, InstallationStatus.IRRELEVANT})


class InstallationFileKind(models.TextChoices):
    MEASUREMENT_BLANK = 'measurement_blank', 'Бланк замера'
    FINAL_KP = 'final_kp', 'Финальное КП'
    INSTALLATION_KP = 'installation_kp', 'КП на монтаж'
    DRAWINGS = 'drawings', 'Чертежи (СНИ)'
    EXTRA = 'extra', 'Дополнительные документы'
    PHOTO = 'photo', 'Фото'
    VIDEO = 'video', 'Видео'
    # Загружает монтажник по факту работ
    ACT = 'act', 'Акт выполненных работ'
    # Работу не приняли: акт без подписи уходит клиенту по ссылке на подпись
    ACT_UNSIGNED = 'act_unsigned', 'Акт без подписи клиента'
    RESULT = 'result', 'Фото/видео результата'


class ActReview(models.TextChoices):
    PENDING = 'pending', 'Ждёт проверки'
    APPROVED = 'approved', 'Подтверждён'
    REJECTED = 'rejected', 'Не принят'


class EventKind(models.TextChoices):
    CREATED = 'created', 'Монтаж оформлен'
    UPDATED = 'updated', 'Монтаж изменён'
    STATUS_CHANGED = 'status_changed', 'Изменён статус'
    FILE_ADDED = 'file_added', 'Добавлен файл'
    FILE_DELETED = 'file_deleted', 'Удалён файл'
    ASSIGNED = 'assigned', 'Назначен монтаж'
    UNASSIGNED = 'unassigned', 'Снят с графика'
    NOT_READY = 'not_ready', 'Клиент не готов к монтажу'
    READY = 'ready', 'Клиент готов к монтажу'
    IRRELEVANT_REQUESTED = 'irrelevant_requested', 'Помечен неактуальным'
    IRRELEVANT_CONFIRMED = 'irrelevant_confirmed', 'Неактуальность подтверждена'
    IRRELEVANT_REJECTED = 'irrelevant_rejected', 'Оставлен в работе'
    SMS_SENT = 'sms_sent', 'СМС клиенту'
    RESCHEDULE_REQUESTED = 'reschedule_requested', 'Монтажник перенёс дату'
    RESCHEDULE_CONFIRMED = 'reschedule_confirmed', 'Перенос подтверждён'
    RESCHEDULE_REJECTED = 'reschedule_rejected', 'Перенос отклонён'
    COMPLETED = 'completed', 'Монтаж завершён'
    PARTIALLY_COMPLETED = 'partially_completed', 'Монтаж завершён частично'
    ACT_SENT = 'act_sent', 'Акт отправлен клиенту на подпись'
    CLIENT_CONFIRMED = 'client_confirmed', 'Клиент подтвердил выполнение работ'
    CLIENT_ACT_UPLOADED = 'client_act_uploaded', 'Клиент приложил подписанный акт'
    ACT_APPROVED = 'act_approved', 'Подпись в акте подтверждена'
    ACT_REJECTED = 'act_rejected', 'Акт от клиента не принят'


class Installation(models.Model):
    """
    Монтаж по заказу. Список монтажей общий на город: его видят и правят все
    пользователи города, кроме монтажников. По одному заказу монтажей может
    быть несколько.
    """
    order = models.ForeignKey(
        'orders.Order', on_delete=models.CASCADE, related_name='installations',
        verbose_name='Заказ',
    )
    status = models.CharField(
        max_length=30, choices=InstallationStatus.choices,
        default=InstallationStatus.NOT_PLANNED, verbose_name='Статус',
    )
    is_paid = models.BooleanField(default=False, verbose_name='Оплачен')
    work_description = models.TextField(verbose_name='Что нужно смонтировать')
    collection_finish = models.CharField(max_length=500, verbose_name='Коллекция, покрытие')
    planned_delivery_date = models.DateField(
        null=True, blank=True, verbose_name='Плановая дата доставки',
        help_text='Менеджер ставит примерно при оформлении, уточняет при составлении реестра на доставку.',
    )
    desired_date_comment = models.TextField(
        blank=True, verbose_name='Желаемая дата монтажа и прочие комментарии',
    )
    # Контактное лицо монтажа: при оформлении берётся из заявки на замер или
    # заказа, дальше его меняют здесь, не трогая заказ
    contact_name = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')
    contact_phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон контактного лица')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Оформлен')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлён')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_installations', verbose_name='Кто оформил',
    )

    # «Не актуален»: СМ помечает, менеджер подтверждает (как у замеров) — до его
    # решения монтаж остаётся в работе
    irrelevant_requested_at = models.DateTimeField(null=True, blank=True, verbose_name='Помечен неактуальным')
    irrelevant_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто пометил неактуальным',
    )
    irrelevant_reason = models.CharField(max_length=500, blank=True, verbose_name='Причина неактуальности')

    # Ссылка клиенту на подпись акта: /m/{код}. Код выдаётся при первой отправке.
    client_code = models.CharField(
        max_length=16, unique=True, null=True, blank=True, verbose_name='Код ссылки для клиента',
    )
    act_sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Акт отправлен клиенту')
    client_confirmed_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Клиент подтвердил выполнение',
        help_text='Подтверждение без подписанного акта сохраняется, но завершить монтаж по нему нельзя.',
    )

    class Meta:
        verbose_name = 'Монтаж'
        verbose_name_plural = 'Монтажи'
        ordering = ['-created_at']

    def __str__(self):
        return f'Монтаж #{self.id} по заказу #{self.order_id}'

    @property
    def is_closed(self):
        return self.status in CLOSED_INSTALLATION_STATUSES

    @property
    def current_visit(self):
        """Последний выезд (назначение в график) или None. Берёт prefetch, если он есть."""
        return max(self.visits.all(), key=lambda v: v.id, default=None)

    def log(self, kind, actor=None, description='', old_status='', new_status='', meta=None):
        return InstallationEvent.objects.create(
            installation=self, kind=kind, actor=actor, description=description or '',
            old_status=old_status or '', new_status=new_status or '', meta=meta or {},
        )


class InstallationVisit(models.Model):
    """
    Выезд: монтаж в графике монтажников на интервал дат. Монтажников на выезде
    может быть несколько; у монтажника в один день — несколько выездов.
    Монтаж, завершённый частично, получает следующий выезд, прежний остаётся.
    """
    installation = models.ForeignKey(
        Installation, on_delete=models.CASCADE, related_name='visits', verbose_name='Монтаж',
    )
    date_from = models.DateField(verbose_name='С')
    date_to = models.DateField(verbose_name='По')
    installers = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name='installation_visits', verbose_name='Монтажники',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто назначил',
    )
    # Перенос монтажником: дата в графике меняется сразу, прежняя хранится до
    # решения СМ (подтвердил — клиенту СМС с новой датой, отклонил — откат)
    reschedule_requested_at = models.DateTimeField(null=True, blank=True, verbose_name='Перенос запрошен')
    reschedule_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто перенёс',
    )
    reschedule_reason = models.CharField(max_length=500, blank=True, verbose_name='Причина переноса')
    previous_date_from = models.DateField(null=True, blank=True, verbose_name='Было с')
    previous_date_to = models.DateField(null=True, blank=True, verbose_name='Было по')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Выезд на монтаж'
        verbose_name_plural = 'Выезды на монтаж'
        ordering = ['date_from', 'id']
        indexes = [models.Index(fields=['date_from', 'date_to'])]

    def __str__(self):
        return f'Монтаж #{self.installation_id}: {self.date_from}–{self.date_to}'


class InstallationFile(models.Model):
    """Файл пакета документов монтажа."""
    installation = models.ForeignKey(
        Installation, on_delete=models.CASCADE, related_name='files', verbose_name='Монтаж',
    )
    kind = models.CharField(max_length=30, choices=InstallationFileKind.choices, verbose_name='Вид')
    # Акт и фото результата относятся к выезду: «Монтаж завершён» требует акт текущего выезда
    visit = models.ForeignKey(
        'InstallationVisit', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='files', verbose_name='Выезд',
    )
    file = models.FileField(upload_to='installations/files/', verbose_name='Файл')
    name = models.CharField(max_length=255, blank=True, verbose_name='Имя файла')
    # Акт, который клиент приложил по ссылке, засчитывается после проверки подписи
    # монтажником. У актов, загруженных сотрудниками, проверки нет (пусто).
    review_status = models.CharField(
        max_length=10, blank=True, choices=ActReview.choices, verbose_name='Проверка подписи',
    )
    review_comment = models.CharField(max_length=500, blank=True, verbose_name='Почему не принят')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто проверил',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name='Когда проверен')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Загрузил',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Загружен')

    class Meta:
        verbose_name = 'Файл монтажа'
        verbose_name_plural = 'Файлы монтажа'
        ordering = ['id']

    def __str__(self):
        return self.name or self.file.name


class InstallationEvent(models.Model):
    """История монтажа: кто, когда и что делал."""
    installation = models.ForeignKey(
        Installation, on_delete=models.CASCADE, related_name='events', verbose_name='Монтаж',
    )
    kind = models.CharField(max_length=30, choices=EventKind.choices, verbose_name='Событие')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+', verbose_name='Кто',
    )
    description = models.TextField(blank=True, verbose_name='Описание')
    old_status = models.CharField(max_length=30, blank=True, verbose_name='Был статус')
    new_status = models.CharField(max_length=30, blank=True, verbose_name='Стал статус')
    meta = models.JSONField(default=dict, blank=True, verbose_name='Подробности')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Когда')

    class Meta:
        verbose_name = 'Событие монтажа'
        verbose_name_plural = 'История монтажей'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.get_kind_display()} — монтаж #{self.installation_id}'
