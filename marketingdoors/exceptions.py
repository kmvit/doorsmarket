"""
Кастомный exception handler для DRF.

Нормализует ответ для неаутентифицированных API-запросов до 401,
чтобы фронтенд мог отличить отсутствие/истечение токена от прочих ошибок
и не получал редирект на страницу логина.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework.exceptions import NotAuthenticated, AuthenticationFailed
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    request = context.get('request')
    if (
        request
        and request.path.startswith('/api/v1/')
        and isinstance(exc, (NotAuthenticated, AuthenticationFailed))
    ):
        return Response(
            {'detail': exc.detail},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return response
