"""
Утилиты для отправки Web Push уведомлений
"""
import json
import logging
from typing import Dict, Optional
from urllib.parse import urlparse
from django.conf import settings
from pywebpush import webpush, WebPushException
from .models import PushSubscription, User

logger = logging.getLogger(__name__)


def send_push_notification(
    user: User,
    title: str,
    body: str,
    url: Optional[str] = None,
    icon: Optional[str] = None,
    tag: Optional[str] = None,
    data: Optional[Dict] = None,
) -> bool:
    """
    Отправляет push-уведомление пользователю
    
    Args:
        user: Пользователь, которому отправляется уведомление
        title: Заголовок уведомления
        body: Текст уведомления
        url: URL для открытия при клике
        icon: URL иконки
        tag: Тег уведомления (для группировки)
        data: Дополнительные данные
    
    Returns:
        True если уведомление успешно отправлено хотя бы на одно устройство
    """
    if not settings.VAPID_PUBLIC_KEY or not settings.VAPID_PRIVATE_KEY:
        logger.warning('VAPID ключи не настроены, push-уведомления недоступны')
        return False
    
    # Получаем активные подписки пользователя
    subscriptions = PushSubscription.objects.filter(user=user, is_active=True)
    
    if not subscriptions.exists():
        logger.debug(f'У пользователя {user.username} нет активных push-подписок')
        return False
    
    success_count = 0
    failed_count = 0
    
    # Данные для уведомления
    notification_data = {
        'title': title,
        'body': body,
        'icon': icon or '/icon-192x192.png',
        'badge': '/icon-192x192.png',
        'tag': tag or f'notification-{user.id}',
        'data': {
            'url': url or '/notifications',
            **(data or {}),
        },
        'vibrate': [200, 100, 200],
        'requireInteraction': False,
        'actions': [
            {'action': 'open', 'title': 'Открыть'},
            {'action': 'close', 'title': 'Закрыть'},
        ],
    }
    
    # Отправляем уведомление на каждую активную подписку
    for subscription in subscriptions:
        try:
            subscription_info = {
                'endpoint': subscription.endpoint,
                'keys': {
                    'p256dh': subscription.p256dh,
                    'auth': subscription.auth,
                },
            }
            
            # Извлекаем origin из endpoint'а для VAPID audience claim
            endpoint_url = urlparse(subscription.endpoint)
            endpoint_origin = f"{endpoint_url.scheme}://{endpoint_url.netloc}"
            
            # VAPID claims с правильным aud (audience) для каждого endpoint'а
            vapid_claims = {
                'sub': f'mailto:{settings.VAPID_CLAIM_EMAIL}',
                'aud': endpoint_origin,
            }
            
            # Отправляем push-уведомление
            # pywebpush автоматически определит формат приватного ключа (base64url или PEM)
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(notification_data),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_public_key=settings.VAPID_PUBLIC_KEY,
                vapid_claims=vapid_claims,
            )
            
            success_count += 1
            logger.info(f'Push-уведомление отправлено пользователю {user.username} на {subscription.endpoint}')
            
        except WebPushException as e:
            failed_count += 1
            logger.error(f'Ошибка отправки push-уведомления: {e}')
            error_body = ''
            status_code = None
            if e.response is not None:
                status_code = e.response.status_code
                try:
                    error_body = e.response.text
                except Exception:
                    error_body = str(e.response)
            logger.debug(
                'Подробнее об ошибке push: status=%s, body=%s',
                status_code,
                error_body,
            )
            
            # Если подписка невалидна (410 Gone, 404 Not Found), деактивируем её
            should_deactivate = False
            if status_code in (410, 404):
                should_deactivate = True
            elif status_code == 403 and error_body and 'BadJwtToken' in error_body:
                should_deactivate = True

            if should_deactivate:
                subscription.is_active = False
                subscription.save(update_fields=['is_active'])
                logger.info(
                    'Подписка %s помечена как неактивная (status=%s)',
                    subscription.id,
                    status_code,
                )
            
        except Exception as e:
            failed_count += 1
            logger.error(f'Неожиданная ошибка при отправке push-уведомления: {e}', exc_info=True)
    
    logger.info(
        f'Push-уведомление для {user.username}: отправлено {success_count}, ошибок {failed_count}'
    )
    
    return success_count > 0


def send_push_to_multiple_users(
    users,
    title: str,
    body: str,
    url: Optional[str] = None,
    icon: Optional[str] = None,
    tag: Optional[str] = None,
    data: Optional[Dict] = None,
) -> int:
    """
    Отправляет push-уведомление нескольким пользователям
    
    Args:
        users: QuerySet или список пользователей
        title: Заголовок уведомления
        body: Текст уведомления
        url: URL для открытия при клике
        icon: URL иконки
        tag: Тег уведомления
        data: Дополнительные данные
    
    Returns:
        Количество успешно отправленных уведомлений
    """
    success_count = 0
    
    for user in users:
        if send_push_notification(user, title, body, url, icon, tag, data):
            success_count += 1
    
    return success_count

