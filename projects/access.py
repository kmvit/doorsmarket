from django.db.models import Q


def salon_complaints_q(user):
    """У привязанного заказа салон берётся из заказа, у старых рекламаций — из менеджера."""
    if user.salon_id:
        return Q(source_order__salon_id=user.salon_id) | Q(
            source_order__isnull=True, manager__salon_id=user.salon_id,
        )
    return Q(source_order__manager=user) | Q(source_order__isnull=True, manager=user)


def in_manager_salon(user, manager, source_order=None):
    if source_order is not None:
        if user.salon_id:
            return source_order.salon_id == user.salon_id
        return source_order.manager_id == user.pk
    return manager is not None and (
        manager.pk == user.pk or (user.salon_id and manager.salon_id == user.salon_id)
    )
