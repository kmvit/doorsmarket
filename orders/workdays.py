"""
Расчёт рабочих дней для кронов просрочек (Фаза 5).

Учитываются только будни (пн–пт). Праздники не учитываются —
по ТЗ достаточно «рабочих дней» в смысле выходных.
"""
import datetime


def _as_date(value):
    if isinstance(value, datetime.datetime):
        return value.date()
    return value


def workdays_between(start, end) -> int:
    """
    Кол-во рабочих дней (пн–пт), прошедших строго ПОСЛЕ start и до end включительно.
    Пример: start=пятница, end=понедельник → 1 (только понедельник).
    Если end <= start → 0.
    """
    start = _as_date(start)
    end = _as_date(end)
    if start is None or end is None or end <= start:
        return 0
    count = 0
    day = start + datetime.timedelta(days=1)
    while day <= end:
        if day.weekday() < 5:  # 0..4 = пн..пт
            count += 1
        day += datetime.timedelta(days=1)
    return count
