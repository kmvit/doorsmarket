"""Форматирование сумм для красивого КП."""
from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()

# Неразрывный пробел: «826 570 ₽» не должно переноситься по строкам.
NBSP = ' '


@register.filter
def money(value):
    """
    Сумма в виде «826 570 ₽». Копейки показываем, только если они есть,
    — в КП суммы почти всегда круглые, и «.00» лишь зашумляет слайд.
    Пусто или не число → «—»: «не посчитано» это не ноль.
    """
    if value in (None, ''):
        return '—'
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return '—'

    whole = int(amount)
    kopecks = (amount - whole).copy_abs()
    text = f'{whole:,}'.replace(',', NBSP)
    if kopecks:
        text += f',{str(kopecks).split(".")[1][:2].ljust(2, "0")}'
    return f'{text}{NBSP}₽'
