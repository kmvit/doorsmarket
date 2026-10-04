"""
Отчёт для расчёта зарплаты сервис-менеджеров: сколько замеров каждый СМ
выполнил за период и какие именно. Ставку за замер руководитель вводит на
странице отчёта — сервер отдаёт только количество и список.
"""
from django.db.models import Count
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .api_views import get_measurements_queryset_for_user
from .designer_report import REPORT_ROLES, _date, _ids, _user_name


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

        measurements = qs.annotate(openings_count=Count('openings')).order_by('done_at')

        groups = {}
        for m in measurements:
            sm = m.service_manager
            g = groups.get(sm.id)
            if g is None:
                g = groups[sm.id] = {
                    'service_manager': {'id': sm.id, 'full_name': _user_name(sm)},
                    'measurements_count': 0,
                    'measurements': [],
                }
            order = m.request.order
            g['measurements_count'] += 1
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
            })

        rows = sorted(groups.values(), key=lambda g: g['service_manager']['full_name'])
        return Response({
            'totals': {
                'service_managers_count': len(rows),
                'measurements_count': sum(g['measurements_count'] for g in rows),
            },
            'service_managers': rows,
        })
