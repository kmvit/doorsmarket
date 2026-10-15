"""
Подключение вебхука бота MAX.

    python manage.py max_webhook status       # бот и текущие подписки
    python manage.py max_webhook subscribe    # подписать {BASE_URL}/api/v1/max/webhook/
    python manage.py max_webhook unsubscribe
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from maxbot import api

UPDATE_TYPES = ['bot_started', 'bot_stopped', 'message_created']


def webhook_url():
    base = (getattr(settings, 'BASE_URL', '') or getattr(settings, 'FRONTEND_URL', '')).rstrip('/')
    return f'{base}/api/v1/max/webhook/'


class Command(BaseCommand):
    help = 'Статус, подписка и отписка вебхука бота MAX'

    def add_arguments(self, parser):
        parser.add_argument('action', choices=['status', 'subscribe', 'unsubscribe'])

    def handle(self, *args, action, **options):
        if not api.is_enabled():
            raise CommandError('MAX_BOT_TOKEN не задан в .env')
        try:
            if action == 'status':
                me = api.get_me()
                self.stdout.write(f"Бот: {me.get('name')} (@{me.get('username')})")
                subs = api.get_subscriptions().get('subscriptions') or []
                if not subs:
                    self.stdout.write('Подписок нет')
                for sub in subs:
                    self.stdout.write(f"Вебхук: {sub.get('url')} {sub.get('update_types') or ''}")
            elif action == 'subscribe':
                secret = getattr(settings, 'MAX_WEBHOOK_SECRET', '')
                if len(secret) < 5:
                    raise CommandError('MAX_WEBHOOK_SECRET не задан (5–256 символов: A-Z, a-z, 0-9, _ и -)')
                url = webhook_url()
                api.subscribe(url, secret, UPDATE_TYPES)
                self.stdout.write(self.style.SUCCESS(f'Вебхук подключён: {url}'))
            else:
                url = webhook_url()
                api.unsubscribe(url)
                self.stdout.write(self.style.SUCCESS(f'Вебхук отключён: {url}'))
        except api.MaxApiError as exc:
            raise CommandError(f'Ошибка MAX API: {exc}') from exc
