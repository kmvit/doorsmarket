"""
Middleware для предотвращения редиректов на API запросы
"""
from django.http import JsonResponse


class APIAuthenticationMiddleware:
    """
    Middleware, который предотвращает редиректы на страницу логина для API запросов.
    Вместо этого возвращает 401 JSON ответ.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Если это API запрос (начинается с /api/) и получен редирект 302
        if request.path.startswith('/api/') and response.status_code == 302:
            # Проверяем, что редирект идет на страницу логина
            location = response.get('Location', '')
            if 'login' in location.lower() or '/login' in location:
                # Возвращаем 401 JSON вместо редиректа
                return JsonResponse(
                    {'detail': 'Authentication credentials were not provided.'},
                    status=401,
                    headers={
                        'WWW-Authenticate': 'Bearer',
                    }
                )
        return response

