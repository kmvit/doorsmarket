"""Размеры в бланках замера: перенос только по знакам «×» и «+», числа целиком."""
from django import template
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

# Невидимая точка возможного переноса
ZWSP = '​'


@register.filter
def size_breaks(value):
    """
    «670 + 670» → «670+670» с точками переноса после «×» и «+». Ширины полотен
    двустворчатой двери не помещались в ячейку и наезжали на соседнюю колонку,
    а переносить посреди числа нельзя — так размер не прочитать.
    """
    text = ''.join(str(value).split()) if value not in (None, '') else ''
    text = escape(text)
    return mark_safe(text.replace('×', '×' + ZWSP).replace('+', '+' + ZWSP))
