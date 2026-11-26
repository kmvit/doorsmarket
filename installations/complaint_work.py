from datetime import date

from rest_framework.exceptions import ValidationError

from projects.models import ComplaintStatus, INSTALLATION_STAGE_STATUSES
from .models import Installation, InstallationStatus, InstallationVisit


REVIEW_STATUSES = {ComplaintStatus.UNDER_SM_REVIEW, ComplaintStatus.COMPLETED, ComplaintStatus.CLOSED}


def work_periods(complaint):
    return {user.pk: (start.isoformat(), end.isoformat()) for user, start, end in complaint.installer_periods()}


def current_assignment(inst, complaint):
    visit = inst.current_visit
    return bool(complaint.installer_work_paid and complaint.status in INSTALLATION_STAGE_STATUSES
                and visit and visit.installer_dates == {
        str(pk): {'date_from': start, 'date_to': end}
        for pk, (start, end) in work_periods(complaint).items()
    })


def prepare_work(complaint, actor):
    """Открывает форму работ. Вызывается под блокировкой рекламации."""
    if not complaint.installer_work_paid or not complaint.source_order_id:
        raise ValidationError({'detail': 'Для оформления оплачиваемых работ нужен связанный заказ.'})
    inst = Installation.objects.select_for_update().filter(complaint=complaint).first()
    if inst and complaint.status in REVIEW_STATUSES:
        return inst
    periods = work_periods(complaint)
    if complaint.status not in INSTALLATION_STAGE_STATUSES or not periods:
        raise ValidationError({'detail': 'Сначала назначьте дату выезда по рекламации.'})
    if inst is None:
        inst = Installation.objects.create(
            complaint=complaint, order=complaint.source_order, created_by=actor,
            status=InstallationStatus.PLANNED, contact_name=complaint.contact_person,
            contact_phone=complaint.contact_phone, work_description=complaint.additional_info,
        )
    if current_assignment(inst, complaint):
        return inst
    if inst.status in (InstallationStatus.AWAITING_SIGNATURE, InstallationStatus.DONE):
        raise ValidationError({'detail': 'По предыдущему выезду уже оформлен акт.'})
    # При смене бригады или после частичного завершения нужен новый акт.
    visit = inst.current_visit
    new_visit = not visit or inst.status == InstallationStatus.PARTIALLY_DONE or set(periods) != set(
        visit.installers.values_list('pk', flat=True)
    )
    if new_visit:
        visit = InstallationVisit(installation=inst, assigned_by=actor)
    visit.set_installer_dates({
        pk: (date.fromisoformat(start), date.fromisoformat(end))
        for pk, (start, end) in periods.items()
    })
    visit.save()
    if new_visit:
        visit.installers.set(periods)
        inst.client_code = None
        inst.act_sent_at = None
        inst.client_confirmed_at = None
    inst.status = InstallationStatus.PLANNED
    inst.save(update_fields=['status', 'client_code', 'act_sent_at', 'client_confirmed_at', 'updated_at'])
    return inst
