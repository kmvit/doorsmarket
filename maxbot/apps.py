from django.apps import AppConfig


class MaxbotConfig(AppConfig):
    """
    Бот в мессенджере MAX: уведомления клиентам вместо SMS.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'maxbot'
    verbose_name = 'Бот MAX'
