"""Кто видит, оформляет и правит монтажи."""
from django.db.models import Prefetch

from orders.models import Measurement
from orders.serializers import user_city_id

from .models import Installation, InstallationVisit

# Оформляет монтаж менеджер (и роли с его правами по заказам)
CREATE_ROLES = frozenset({'manager', 'leader', 'group_leader', 'admin'})
# Список общий на город: смотрят и правят все пользователи города, кроме монтажников.
# Отдел рекламаций с заказами не работает.
LIST_ROLES = CREATE_ROLES | {'service_manager'}
# Графики монтажников правит СМ (монтажник — свой, это этап 3)
SCHEDULE_ROLES = frozenset({'service_manager', 'admin'})
# Решение по неактуальности — за менеджером заказа
DECIDE_ROLES = CREATE_ROLES
# «Назначить монтаж» после «Не готов к монтажу» нажимает менеджер или СМ
READY_ROLES = LIST_ROLES


def can_see_installations(user):
    return (
        user.is_authenticated
        and user.role in LIST_ROLES
        and not getattr(user, 'measurements_only', False)
    )


def installations_for_user(user):
    qs = Installation.objects.select_related(
        'order', 'order__salon', 'order__salon__city', 'order__manager',
        'order__measurement_request', 'created_by', 'irrelevant_requested_by',
    ).prefetch_related(
        'files',
        Prefetch('visits', queryset=InstallationVisit.objects.prefetch_related('installers')),
        # Бланки выполненных замеров идут в пакет документов
        Prefetch(
            'order__measurement_request__measurements',
            queryset=Measurement.objects.filter(is_done=True).order_by('id'),
            to_attr='done_measurements',
        ),
    )
    if not can_see_installations(user):
        return qs.none()
    if user.role == 'admin':
        return qs
    if user.role == 'group_leader':
        return qs.filter(order__salon_id__in=user.managed_salon_ids())
    city_id = user_city_id(user)
    if not city_id:
        return qs.none()
    return qs.filter(order__salon__city_id=city_id)
