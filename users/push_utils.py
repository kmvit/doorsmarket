"""
Утилиты для отправки Web Push уведомлений и SMS
"""
import json
import logging
from typing import Dict, Optional
from urllib.parse import urlparse
from django.conf import settings
from pywebpush import webpush, WebPushException
import requests
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
            
            # Формируем VAPID claims
            endpoint_url = urlparse(subscription.endpoint)
            endpoint_origin = f"{endpoint_url.scheme}://{endpoint_url.netloc}"

            claim_subject = settings.VAPID_CLAIM_EMAIL.strip() if settings.VAPID_CLAIM_EMAIL else ''
            if claim_subject.startswith('mailto:'):
                sub_claim = claim_subject
            elif '@' in claim_subject:
                sub_claim = f'mailto:{claim_subject}'
            elif claim_subject.startswith('http://') or claim_subject.startswith('https://'):
                sub_claim = claim_subject
            else:
                sub_claim = 'mailto:support@marketingdoors.ru'

            vapid_claims = {
                'sub': sub_claim,
                'aud': endpoint_origin,
            }

            # Отправляем push-уведомление
            # pywebpush автоматически определит формат приватного ключа (base64url или PEM)
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(notification_data),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
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


def send_sms_notification(
    user: User,
    message: str,
) -> bool:
    """
    Отправляет SMS-уведомление пользователю через sms.ru
    
    Args:
        user: Пользователь, которому отправляется SMS
        message: Текст сообщения
    
    Returns:
        True если SMS успешно отправлено
    """
    if not settings.SMS_RU_API_ID:
        logger.warning('SMS_RU_API_ID не настроен, SMS-уведомления недоступны')
        return False
    
    # Проверяем наличие номера телефона у пользователя
    if not user.phone_number:
        logger.debug(f'У пользователя {user.username} не указан номер телефона')
        return False
    
    # Очищаем номер телефона от пробелов и других символов
    phone_number = user.phone_number.strip().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    
    # Убираем + если есть
    if phone_number.startswith('+'):
        phone_number = phone_number[1:]
    
    if not phone_number:
        logger.warning(f'Номер телефона пользователя {user.username} пустой после очистки')
        return False
    
    try:
        # Формируем URL для отправки SMS
        url = 'https://sms.ru/sms/send'
        params = {
            'api_id': settings.SMS_RU_API_ID,
            'to': phone_number,
            'msg': message,
            'json': 1,
        }
        
        # Отправляем запрос
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        # Парсим ответ
        result = response.json()
        
        if result.get('status') == 'OK' and result.get('status_code') == 100:
            # Проверяем статус отправки для конкретного номера
            sms_data = result.get('sms', {})
            phone_key = phone_number
            # Если номер в ответе с другим форматом, ищем его
            if phone_key not in sms_data:
                # Пробуем найти номер в любом формате
                for key in sms_data.keys():
                    if key.replace('+', '').replace(' ', '') == phone_number:
                        phone_key = key
                        break
            
            if phone_key in sms_data:
                sms_status = sms_data[phone_key]
                if sms_status.get('status') == 'OK' and sms_status.get('status_code') == 100:
                    logger.info(
                        'SMS отправлено пользователю %s на номер %s (ID: %s)',
                        user.username,
                        phone_number,
                        sms_status.get('sms_id', 'N/A')
                    )
                    return True
                else:
                    logger.error(
                        'Ошибка отправки SMS пользователю %s: %s (код: %s)',
                        user.username,
                        sms_status.get('status_text', 'Неизвестная ошибка'),
                        sms_status.get('status_code', 'N/A')
                    )
                    return False
            else:
                logger.warning(
                    'Номер %s не найден в ответе sms.ru для пользователя %s',
                    phone_number,
                    user.username
                )
                return False
        else:
            logger.error(
                'Ошибка API sms.ru для пользователя %s: %s (код: %s)',
                user.username,
                result.get('status', 'ERROR'),
                result.get('status_code', 'N/A')
            )
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(
            'Ошибка сети при отправке SMS пользователю %s: %s',
            user.username,
            e,
            exc_info=True
        )
        return False
    except Exception as e:
        logger.error(
            'Неожиданная ошибка при отправке SMS пользователю %s: %s',
            user.username,
            e,
            exc_info=True
        )
        return False


def send_sms_to_phone(
    phone_number: str,
    message: str,
) -> bool:
    """
    Отправляет SMS-уведомление на указанный номер телефона через sms.ru
    
    Args:
        phone_number: Номер телефона получателя
        message: Текст сообщения
    
    Returns:
        True если SMS успешно отправлено
    """
    if not settings.SMS_RU_API_ID:
        logger.warning('SMS_RU_API_ID не настроен, SMS-уведомления недоступны')
        return False
    
    if not phone_number:
        logger.debug('Номер телефона не указан')
        return False
    
    # Очищаем номер телефона от пробелов и других символов
    cleaned_phone = phone_number.strip().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    
    # Убираем + если есть
    if cleaned_phone.startswith('+'):
        cleaned_phone = cleaned_phone[1:]
    
    if not cleaned_phone:
        logger.warning('Номер телефона пустой после очистки')
        return False
    
    try:
        # Формируем URL для отправки SMS
        url = 'https://sms.ru/sms/send'
        params = {
            'api_id': settings.SMS_RU_API_ID,
            'to': cleaned_phone,
            'msg': message,
            'json': 1,
        }
        
        # Отправляем запрос
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        # Парсим ответ
        result = response.json()
        
        if result.get('status') == 'OK' and result.get('status_code') == 100:
            # Проверяем статус отправки для конкретного номера
            sms_data = result.get('sms', {})
            phone_key = cleaned_phone
            # Если номер в ответе с другим форматом, ищем его
            if phone_key not in sms_data:
                # Пробуем найти номер в любом формате
                for key in sms_data.keys():
                    if key.replace('+', '').replace(' ', '') == cleaned_phone:
                        phone_key = key
                        break
            
            if phone_key in sms_data:
                sms_status = sms_data[phone_key]
                if sms_status.get('status') == 'OK' and sms_status.get('status_code') == 100:
                    logger.info(
                        'SMS отправлено на номер %s (ID: %s)',
                        cleaned_phone,
                        sms_status.get('sms_id', 'N/A')
                    )
                    return True
                else:
                    logger.error(
                        'Ошибка отправки SMS на номер %s: %s (код: %s)',
                        cleaned_phone,
                        sms_status.get('status_text', 'Неизвестная ошибка'),
                        sms_status.get('status_code', 'N/A')
                    )
                    return False
            else:
                logger.warning(
                    'Номер %s не найден в ответе sms.ru',
                    cleaned_phone
                )
                return False
        else:
            logger.error(
                'Ошибка API sms.ru для номера %s: %s (код: %s)',
                cleaned_phone,
                result.get('status', 'ERROR'),
                result.get('status_code', 'N/A')
            )
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(
            'Ошибка сети при отправке SMS на номер %s: %s',
            cleaned_phone,
            e,
            exc_info=True
        )
        return False
    except Exception as e:
        logger.error(
            'Неожиданная ошибка при отправке SMS на номер %s: %s',
            cleaned_phone,
            e,
            exc_info=True
        )
        return False

