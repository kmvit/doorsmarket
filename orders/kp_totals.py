"""Денежные итоги КП при объединении предложений в одном заказе."""
from decimal import Decimal


PARTS = ('goods_amount', 'glass_amount', 'products_amount', 'services_amount')


def money(value):
    if value in (None, ''):
        return None
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError('Некорректная сумма КП')
    return result


def line_totals(items, addons):
    """Сумма строки приоритетнее цены за единицу. Отсутствующая цена остаётся неизвестной."""
    totals = dict.fromkeys(PARTS, Decimal(0))

    def add(key, row):
        amount = money(row.get('amount'))
        if amount is None:
            price = money(row.get('price'))
            if price is not None:
                amount = (price * Decimal(str(row.get('quantity') or 1))).quantize(Decimal('0.01'))
        if amount is None or totals[key] is None:
            totals[key] = None
        else:
            totals[key] += amount

    for row in items:
        add('goods_amount', row)
    for row in addons:
        key = {'service': 'services_amount', 'glass': 'glass_amount'}.get(row.get('kind'), 'products_amount')
        add(key, row)
    return totals


def order_line_totals(order):
    columns = ('amount', 'price', 'quantity')
    return line_totals(order.items.values(*columns), order.addons.values('kind', *columns))


def combined(a, b):
    return a + b if a is not None and b is not None else None


def offer_totals(footer, lines, original=None):
    """Сохраняем суммы фабрики и учитываем изменение состава строк после разбора PDF."""
    parts = {}
    delta = Decimal(0)
    for key in PARTS:
        change = Decimal(0)
        previous = money(original.get(key)) if original else lines[key]
        if lines[key] != previous:
            change = lines[key] - previous if lines[key] is not None and previous is not None else None
        printed = money(footer.get(key))
        parts[key] = lines[key] if printed is None else combined(printed, change)
        delta = combined(delta, change)

    gross = money(footer.get('total_amount'))
    if gross is None:
        gross = sum(parts.values()) if None not in parts.values() else None
    else:
        gross = combined(gross, delta)
    discount = money(footer.get('discount_amount'))
    net = money(footer.get('total_with_discount'))
    if net is not None:
        net = combined(net, delta)
    elif discount is not None and gross is not None:
        net = gross - discount
    if discount is None and gross is not None and net is not None:
        discount = gross - net
    return {**parts, 'total_amount': gross, 'discount_amount': discount, 'total_with_discount': net}


def latest_kp_change(order_id):
    from django.db.models import Q
    from .models import OrderActivityLog
    return OrderActivityLog.objects.filter(order_id=order_id, kind='items_changed').filter(
        Q(description__startswith='Добавлено КП №') | Q(description__startswith='Заменено КП (')
    ).order_by('-id')


def legacy_append_flag(order_id):
    from django.db.models import Case, Value, When
    return latest_kp_change(order_id).annotate(is_legacy=Case(
        When(meta__totals_combined=True, then=Value(False)),
        When(description__startswith='Добавлено', then=Value(True)),
        default=Value(False),
    )).values_list('is_legacy', flat=True)


def legacy_append(order):
    """До исправления добавление КП оставляло в заказе только подвал первого PDF."""
    return bool(legacy_append_flag(order.pk).first())


def with_workshop_amount(queryset):
    from django.db.models import Case, F, OuterRef, Subquery, When
    from django.db.models.functions import Coalesce
    # Старый объединённый заказ без сохранённой общей скидки имеет неизвестный итог.
    return queryset.alias(legacy_kp=Subquery(legacy_append_flag(OuterRef('pk'))[:1])).annotate(
        order_amount=Coalesce(
            'manual_order_amount', 'pretty_offer__total_with_discount_override',
            Case(When(legacy_kp=True, then=None), default=F('total_with_discount')),
        ),
    )


def legacy_totals(order):
    # Из старых добавлений сохранились строки, но не скидки. Значение со скидкой
    # оставляем для явного заполнения менеджером в редакторе красивого КП.
    return offer_totals({}, order_line_totals(order))
