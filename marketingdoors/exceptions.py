"""
Кастомный exception handler для DRF, который предотвращает редиректы на API запросы
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Кастомный обработчик исключений для DRF.
    Возвращает 401 вместо редиректа для неавторизованных API запросов.
    """
    # Получаем стандартный обработчик
    response = exception_handler(exc, context)
    
    # Если это API запрос (путь начинается с /api/) и получен редирект
    request = context.get('request')
    if request and request.path.startswith('/api/') and response is None:
        # Если исключение не обработано стандартным обработчиком
        # и это может быть проблема с аутентификацией
        from django.contrib.auth.exceptions import PermissionDenied
        if isinstance(exc, PermissionDenied):
            return Response(
                {'detail': 'Authentication credentials were not provided.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
    
    return response

