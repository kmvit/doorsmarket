"""
Рекламационные монтажи в списке монтажей и графиках монтажников.

Планирование остаётся в рекламациях (решение заказчика): здесь рекламации
только показываются — со своим статусом и ссылкой в карточку рекламации.
Отдельной копии данных нет, поэтому и рассинхронизироваться нечему.
"""
from django.db.models import Q
from django.utils import timezone

from projects.api_views import scope_complaints_for_user
from projects.models import INSTALLATION_STAGE_STATUSES, Complaint, ComplaintStatus, format_visit_period

# То, что у СМ в папке «Запланировать монтаж», и весь этап монтажа
COMPLAINT_INSTALLATION_STATUSES = {ComplaintStatus.SHIPPING_PLANNED, *INSTALLATION_STAGE_STATUSES}


def _name(user):
    if not user:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


def complaint_installations(user, params):
    qs = scope_complaints_for_user(
        Complaint.objects.select_related('manager', 'installer_assigned').prefetch_related('defective_products'),
        user,
    ).prefetch_related('additional_visits__installer').filter(status__in=COMPLAINT_INSTALLATION_STATUSES)
    if params.get('folder') == 'to_assign':
        if not user.can_manage_service:
            return qs.none()
        qs = qs.filter(status=ComplaintStatus.SHIPPING_PLANNED)
    if (search := (params.get('search') or '').strip().lstrip('#№')):
        lookup = (Q(client_name__icontains=search) | Q(address__icontains=search)
                  | Q(order_number__icontains=search) | Q(contact_phone__icontains=search))
        if search.isdigit():
            lookup |= Q(id=int(search))
        qs = qs.filter(lookup)
    if params.get('mine') == 'true':
        qs = qs.filter(manager=user)
    cities = [int(v) for v in (params.get('city__in') or '').split(',') if v.isdigit()]
    if cities:
        qs = qs.filter(initiator__city_id__in=cities)
    managers = [int(v) for v in (params.get('manager__in') or '').split(',') if v.isdigit()]
    if managers:
        qs = qs.filter(manager_id__in=managers)
    return qs.order_by('-id')


def complaint_row(c, installer_id=None):
    start, end = c.planned_installation_date, c.planned_installation_end
    periods = c.installer_periods()
    own_start = next((first for user, first, _ in periods if user.pk == installer_id), None)
    if own_start and (c.installation_dates_only or installer_id != c.installer_assigned_id):
        scheduled_at = own_start.isoformat()
    else:
        scheduled_at = start.isoformat() if start else None
    team_schedule = []
    if len(periods) > 1:
        for installer, first, last in periods:
            window = (c.installation_window_text if installer.pk == c.installer_assigned_id and not c.installation_dates_only
                      else format_visit_period(first, last))
            team_schedule.append(f'{_name(installer)} · {window}')
    return {
        'id': c.id,
        'status': c.status,
        'status_display': c.get_status_display(),
        'client_name': c.client_name,
        'address': c.address,
        'order_number': c.order_number,
        'contact_name': c.contact_person,
        'contact_phone': c.contact_phone,
        'manager_name': _name(c.manager),
        'installer_name': _name(c.installer_assigned),
        'team_schedule': team_schedule,
        'installer_id': c.installer_assigned_id,
        'products': ', '.join(p.product_name for p in c.defective_products.all() if p.product_name),
        'date': timezone.localtime(start).date().isoformat() if start else None,
        'scheduled_at': scheduled_at,
        'window': c.installation_window_text if start else '',
        'needs_planning': start is None,
    }


def scheduled_complaints(installer_ids, date_from, date_to):
    primary = Q(installer_assigned_id__in=installer_ids, planned_installation_date__date__lte=date_to) & (
        Q(planned_installation_date__date__gte=date_from) | Q(planned_installation_end__date__gte=date_from)
    )
    extra = Q(additional_visits__installer_id__in=installer_ids, additional_visits__date_from__lte=date_to,
              additional_visits__date_to__gte=date_from)
    return Complaint.objects.filter(primary | extra, status__in=COMPLAINT_INSTALLATION_STATUSES).distinct()


def complaint_visits(installer_ids, date_from, date_to):
    qs = scheduled_complaints(installer_ids, date_from, date_to).select_related('installer_assigned').prefetch_related(
        'defective_products', 'additional_visits__installer',
    )
    rows = []
    for c in qs:
        for u, start, end in c.installer_periods():
            if u.pk not in installer_ids or start > date_to or end < date_from:
                continue
            primary = u.pk == c.installer_assigned_id
            rows.append({
                'id': f'c{c.id}' if primary else f'c{c.id}-{u.pk}', 'kind': 'complaint',
                'complaint_id': c.id, 'installation_id': None,
                'date_from': start.isoformat(), 'date_to': end.isoformat(),
                'installers': [{'id': u.id, 'full_name': _name(u), 'phone_number': u.phone_number}],
                'status': c.status, 'status_display': c.get_status_display(), 'order': None,
                'client_name': c.client_name, 'address': c.address,
                'work_description': ', '.join(p.product_name for p in c.defective_products.all() if p.product_name)
                                    or 'Рекламация',
                'contact_name': c.contact_person, 'contact_phone': c.contact_phone,
                'window': c.installation_window_text if primary and not c.installation_dates_only
                          else format_visit_period(start, end),
            })
    return rows
