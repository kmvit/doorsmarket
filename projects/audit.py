"""
Кто меняет рекламацию: текущий пользователь запроса для журнала событий.

Смену статуса пишет Complaint.save(), а пользователя туда никто не передаёт —
поэтому middleware запоминает запрос, а автор берётся из него в момент записи.
DRF после аутентификации по JWT кладёт пользователя и в исходный запрос, так
что работает и для API, и для веб-страниц.

Автоматические смены (просрочки при открытии списка, ночные команды) идут
от имени системы — см. `as_system`.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps

_request = ContextVar('complaint_audit_request', default=None)
_system = ContextVar('complaint_audit_system', default=False)


class CurrentRequestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _request.set(request)
        try:
            return self.get_response(request)
        finally:
            _request.reset(token)


def current_actor():
    """Пользователь, от имени которого идёт изменение; None — система."""
    if _system.get():
        return None
    user = getattr(_request.get(), 'user', None)
    return user if user is not None and user.is_authenticated else None


@contextmanager
def system_actor():
    token = _system.set(True)
    try:
        yield
    finally:
        _system.reset(token)


def as_system(method):
    """Изменения внутри метода записываются от имени системы."""
    @wraps(method)
    def wrapper(*args, **kwargs):
        with system_actor():
            return method(*args, **kwargs)
    return wrapper
