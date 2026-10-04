"""
Отчёт для расчёта зарплаты сервис-менеджеров: какие замеры каждый СМ выполнил
за период, сколько в них проёмов (панель в проёме считается ещё одним
проёмом) и сколько километров удалённости «включить в счёт» набежало. Ставки
за проём и за км руководитель вводит на странице отчёта — сервер отдаёт
только количества, километры и список.
"""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .api_views import get_measurements_queryset_for_user
from .designer_report import REPORT_ROLES, _date, _ids, _user_name
from .models import DistancePayment


class ServiceManagerReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in REPORT_ROLES:
            return Response({'detail': 'Отчёт доступен руководителю.'}, status=status.HTTP_403_FORBIDDEN)

        # Видимость — как у раздела «Замеры»: руководителю его город, админу всё.
        # Проёмы, вложения и прочее, что подгружает базовый запрос, отчёту не нужны.
        qs = (
            get_measurements_queryset_for_user(request.user)
            .prefetch_related(None)
            .filter(is_done=True, done_at__isnull=False, service_manager__isnull=False)
        )
        # В расчёт идут замеры, выполненные в выбранном периоде
        date_from, date_to = _date(request, 'date_from'), _date(request, 'date_to')
        if date_from:
            qs = qs.filter(done_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(done_at__date__lte=date_to)
        if cities := _ids(request, 'city'):
            qs = qs.filter(request__order__salon__city_id__in=cities)
        if sms := _ids(request, 'service_manager'):
            qs = qs.filter(service_manager_id__in=sms)

        # Каждая панель в проёме («галочка» + количество) в расчёте — как ещё один проём
        measurements = qs.annotate(
            openings_count=Count('openings', distinct=True),
            panels_count=Sum('openings__panels_count', filter=Q(openings__has_panels=True)),
        ).order_by('done_at')

        groups = {}
        for m in measurements:
            sm = m.service_manager
            g = groups.get(sm.id)
            if g is None:
                g = groups[sm.id] = {
                    'service_manager': {'id': sm.id, 'full_name': _user_name(sm)},
                    'measurements_count': 0,
                    'openings_count': 0,
                    'panels_count': 0,
                    # Проёмы + панели — по ним считается зарплата
                    'paid_openings_count': 0,
                    # Удалённость в расчёт — только «включить в счёт»
                    'distance_km_invoice': Decimal(0),
                    'measurements': [],
                }
            order = m.request.order
            panels = m.panels_count or 0
            g['measurements_count'] += 1
            g['openings_count'] += m.openings_count
            g['panels_count'] += panels
            g['paid_openings_count'] += m.openings_count + panels
            if m.distance_payment == DistancePayment.INVOICE and m.distance_km:
                g['distance_km_invoice'] += m.distance_km
            g['measurements'].append({
                'id': m.id,
                'order_id': order.id,
                'done_at': m.done_at,
                'measurement_date': m.measurement_date,
                'client_name': order.client_name,
                'address': order.address,
                'kp_number': order.kp_number,
                'salon_name': order.salon.name,
                'manager_name': _user_name(order.manager),
                'openings_count': m.openings_count,
                'panels_count': panels,
                'paid_openings_count': m.openings_count + panels,
                'distance_payment': m.distance_payment,
                'distance_payment_display': m.get_distance_payment_display() if m.distance_payment else '',
                'distance_km': f'{m.distance_km:.1f}' if m.distance_km is not None else None,
            })

        rows = sorted(groups.values(), key=lambda g: g['service_manager']['full_name'])
        total_km = sum((g['distance_km_invoice'] for g in rows), Decimal(0))
        for g in rows:
            g['distance_km_invoice'] = f"{g['distance_km_invoice']:.1f}"
        return Response({
            'totals': {
                'service_managers_count': len(rows),
                'measurements_count': sum(g['measurements_count'] for g in rows),
                'openings_count': sum(g['openings_count'] for g in rows),
                'panels_count': sum(g['panels_count'] for g in rows),
                'paid_openings_count': sum(g['paid_openings_count'] for g in rows),
                'distance_km_invoice': f'{total_km:.1f}',
            },
            'service_managers': rows,
        })
