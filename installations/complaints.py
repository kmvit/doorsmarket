"""
Рекламационные монтажи в списке монтажей и графиках монтажников.

Планирование остаётся в рекламациях (решение заказчика): здесь рекламации
только показываются — со своим статусом и ссылкой в карточку рекламации.
Отдельной копии данных нет, поэтому и рассинхронизироваться нечему.
"""
from django.db.models import Q
from django.utils import timezone

from projects.api_views import scope_complaints_for_user
from projects.models import INSTALLATION_STAGE_STATUSES, Complaint, ComplaintStatus

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
    ).filter(status__in=COMPLAINT_INSTALLATION_STATUSES)
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


def complaint_row(c):
    start, end = c.planned_installation_date, c.planned_installation_end
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
        'installer_id': c.installer_assigned_id,
        'products': ', '.join(p.product_name for p in c.defective_products.all() if p.product_name),
        'date': timezone.localtime(start).date().isoformat() if start else None,
        'window': c.installation_window_text if start else '',
        'needs_planning': start is None,
    }


def complaint_visits(installer_ids, date_from, date_to):
    """Рекламационные выезды в графиках: монтажник назначен, дата в периоде."""
    qs = Complaint.objects.select_related('installer_assigned').prefetch_related('defective_products').filter(
        status__in=COMPLAINT_INSTALLATION_STATUSES, installer_assigned_id__in=installer_ids,
        planned_installation_date__isnull=False,
    )
    rows = []
    for c in qs:
        day = timezone.localtime(c.planned_installation_date).date()
        if not (date_from <= day <= date_to):
            continue
        u = c.installer_assigned
        rows.append({
            'id': f'c{c.id}', 'kind': 'complaint', 'complaint_id': c.id, 'installation_id': None,
            'date_from': day.isoformat(), 'date_to': day.isoformat(),
            'installers': [{'id': u.id, 'full_name': _name(u), 'phone_number': u.phone_number}],
            'status': c.status, 'status_display': c.get_status_display(), 'order': None,
            'client_name': c.client_name, 'address': c.address,
            'work_description': ', '.join(p.product_name for p in c.defective_products.all() if p.product_name)
                                or 'Рекламация',
            'contact_name': c.contact_person, 'contact_phone': c.contact_phone,
            'window': c.installation_window_text,
        })
    return rows
