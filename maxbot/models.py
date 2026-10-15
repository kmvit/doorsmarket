from django.db import models


class MaxContact(models.Model):
    """
    Телефон клиента, привязанный к диалогу с ботом MAX.

    Привязка появляется, когда клиент запускает бота по ссылке со своим
    телефоном или делится контактом в чате. Пока привязка активна, уведомления
    на этот номер уходят в MAX, а не SMS.
    """
    phone = models.CharField(max_length=12, unique=True, verbose_name='Телефон')
    chat_id = models.BigIntegerField(verbose_name='ID диалога')
    max_user_id = models.BigIntegerField(verbose_name='ID пользователя MAX')
    name = models.CharField(max_length=255, blank=True, verbose_name='Имя в MAX')
    is_active = models.BooleanField(
        default=True, verbose_name='Активна',
        help_text='Снимается, когда клиент остановил бота: тогда снова уходит SMS.',
    )
    linked_at = models.DateTimeField(auto_now_add=True, verbose_name='Привязан')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлён')

    class Meta:
        verbose_name = 'Клиент в MAX'
        verbose_name_plural = 'Клиенты в MAX'
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.phone} ({self.name or self.max_user_id})'
