from django.db import transaction
from django.utils import timezone

from orders.models import ActivityKind, Measurement

from .models import EventKind, Installation, InstallationFile, InstallationFileKind

# Виды файлов, которые можно приложить при оформлении (ключи multipart-формы)
UPLOAD_KINDS = [k for k, _ in InstallationFileKind.choices]


def measurement_blank_required(order):
    """Бланк замера прикладывают, только если по заказу не было выполненного замера."""
    return not Measurement.objects.filter(request__order=order, is_done=True).exists()


def required_file_kinds(order):
    kinds = [InstallationFileKind.FINAL_KP, InstallationFileKind.INSTALLATION_KP]
    if measurement_blank_required(order):
        kinds.insert(0, InstallationFileKind.MEASUREMENT_BLANK)
    return kinds


def prefill(order):
    """Подсказки формы оформления: контактное лицо и какие файлы обязательны."""
    request = getattr(order, 'measurement_request', None)
    if request is not None:
        contact_name, contact_phone = request.contact_name, request.contact_phone
    else:
        contact_name, contact_phone = order.client_name, order.contact_phone
    return {
        'order': order.id,
        'client_name': order.client_name,
        'address': order.address,
        'kp_number': order.kp_number,
        'contact_name': contact_name or '',
        'contact_phone': contact_phone or '',
        'measurement_blank_required': measurement_blank_required(order),
        'installations_count': order.installations.count(),
    }


def missing_required_files(order, files_by_kind):
    """Обязательные виды файлов, которых нет среди загружаемых."""
    labels = dict(InstallationFileKind.choices)
    return [labels[k] for k in required_file_kinds(order) if not files_by_kind.get(k)]


@transaction.atomic
def create_installation(*, order, data, files_by_kind, actor):
    inst = Installation.objects.create(order=order, created_by=actor, **data)
    for kind, files in files_by_kind.items():
        for f in files:
            InstallationFile.objects.create(
                installation=inst, kind=kind, file=f, name=f.name[:255], uploaded_by=actor,
            )
    inst.log(EventKind.CREATED, actor=actor, description='Монтаж оформлен', new_status=inst.status)
    order.log_activity(
        ActivityKind.INSTALLATION_CREATED, actor=actor,
        description=f'Оформлен монтаж #{inst.id}', meta={'installation_id': inst.id},
    )
    # Решение «монтаж не нужен» снимается: монтаж всё-таки оформили
    if order.installation_not_needed_at:
        order.installation_not_needed_at = None
        order.installation_not_needed_by = None
        order.save(update_fields=['installation_not_needed_at', 'installation_not_needed_by', 'updated_at'])
    return inst


def set_installation_not_needed(order, not_needed, actor):
    if not_needed:
        order.installation_not_needed_at = timezone.now()
        order.installation_not_needed_by = actor
        description = 'Монтаж не нужен'
    else:
        order.installation_not_needed_at = None
        order.installation_not_needed_by = None
        description = 'Монтаж снова нужен'
    order.save(update_fields=['installation_not_needed_at', 'installation_not_needed_by', 'updated_at'])
    order.log_activity(ActivityKind.INSTALLATION_NOT_NEEDED, actor=actor, description=description,
                       meta={'not_needed': bool(not_needed)})
