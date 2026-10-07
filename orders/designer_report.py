"""
Отчёт по дизайнерам: за период, по городу, салону, менеджерам и статусам —
дизайнеры с заказами, суммами и выплаченными бонусами. С ?designer=ID — тот
же отчёт по одному дизайнеру (страница дизайнера).
"""
from datetime import date
from decimal import Decimal

from django.db.models import F
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .api_views import get_orders_queryset_for_user
from .models import OrderStatus

REPORT_ROLES = ('leader', 'group_leader', 'admin')
# Отчёт по дизайнерам: менеджеру — по его салону (get_orders_queryset_for_user)
DESIGNER_REPORT_ROLES = (*REPORT_ROLES, 'manager')


def _ids(request, name):
    """?name=1,2 → {1, 2}; мусор отбрасываем."""
    values = set()
    for chunk in request.query_params.getlist(name):
        values.update(int(v) for v in chunk.split(',') if v.strip().isdigit())
    return values


def _date(request, name):
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _money(value):
    return f'{(value or Decimal(0)):.2f}'


def _user_name(u):
    if not u:
        return ''
    return f'{u.first_name} {u.last_name}'.strip() or u.username


class DesignerReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Менеджер тоже видит отчёт, но только по своему салону — это даёт ACL ниже
        if request.user.role not in DESIGNER_REPORT_ROLES:
            return Response({'detail': 'Отчёт доступен руководителю и менеджеру.'}, status=status.HTTP_403_FORBIDDEN)

        # Видимость — как у списка заказов: менеджеру его салон, руководителю город, админу всё
        # Позиции и вложения, которые подгружает базовый запрос, отчёту не нужны
        qs = (
            get_orders_queryset_for_user(request.user)
            .prefetch_related(None)
            .filter(has_designer=True, designer__isnull=False)
        )

        # Период — по дате создания заказа («когда оформлялись»)
        date_from, date_to = _date(request, 'date_from'), _date(request, 'date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if cities := _ids(request, 'city'):
            qs = qs.filter(salon__city_id__in=cities)
        if salons := _ids(request, 'salon'):
            qs = qs.filter(salon_id__in=salons)
        if managers := _ids(request, 'manager__in'):
            qs = qs.filter(manager_id__in=managers)
        if designers := _ids(request, 'designer'):
            qs = qs.filter(designer_id__in=designers)
        statuses = {
            s for chunk in request.query_params.getlist('status__in')
            for s in chunk.split(',') if s in OrderStatus.values
        }
        if statuses:
            qs = qs.filter(status__in=statuses)

        # Сумма заказа: итог со скидкой, если он есть, иначе итог по КП
        orders = (
            qs.select_related('designer', 'designer__city', 'designer_paid_by')
            .annotate(report_amount=Coalesce(F('total_with_discount'), F('total_amount')))
            .order_by('-created_at')
        )

        groups = {}
        for o in orders:
            g = groups.get(o.designer_id)
            if g is None:
                d = o.designer
                g = groups[o.designer_id] = {
                    'designer': {
                        'id': d.id, 'full_name': d.full_name, 'phone': d.phone,
                        'studio': d.studio, 'bonus_percent': d.bonus_percent,
                        'city_name': d.city.name if d.city_id else '',
                    },
                    'orders_count': 0,
                    'orders_amount': Decimal(0),
                    'bonus_paid': Decimal(0),
                    'bonus_paid_count': 0,
                    'status_counts': {},
                    'orders': [],
                }
            amount = o.report_amount
            g['orders_count'] += 1
            g['orders_amount'] += amount or 0
            if o.designer_paid_at:
                g['bonus_paid'] += o.designer_paid_amount or 0
                g['bonus_paid_count'] += 1
            g['status_counts'][o.status] = g['status_counts'].get(o.status, 0) + 1
            g['orders'].append({
                'id': o.id,
                'created_at': o.created_at,
                'client_name': o.client_name,
                'kp_number': o.kp_number,
                'address': o.address,
                'status': o.status,
                'status_display': o.get_status_display(),
                'salon_name': o.salon.name,
                'manager_name': _user_name(o.manager),
                'amount': _money(amount) if amount is not None else None,
                'designer_paid_amount': _money(o.designer_paid_amount) if o.designer_paid_at else None,
                'designer_paid_at': o.designer_paid_at,
                'designer_paid_by_name': _user_name(o.designer_paid_by),
            })

        rows = sorted(groups.values(), key=lambda g: (-g['orders_amount'], g['designer']['full_name']))
        totals = {
            'designers_count': len(rows),
            'orders_count': sum(g['orders_count'] for g in rows),
            'orders_amount': _money(sum((g['orders_amount'] for g in rows), Decimal(0))),
            'bonus_paid': _money(sum((g['bonus_paid'] for g in rows), Decimal(0))),
        }
        for g in rows:
            g['orders_amount'] = _money(g['orders_amount'])
            g['bonus_paid'] = _money(g['bonus_paid'])
        return Response({'totals': totals, 'designers': rows})
