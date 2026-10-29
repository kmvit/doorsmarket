from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from marketingdoors.search import NumberAwareSearchFilter
from orders.api_views import apply_people_filters, get_orders_queryset_for_user, requested_statuses

from . import services
from .access import CREATE_ROLES, can_see_installations, installations_for_user
from .models import (
    CLOSED_INSTALLATION_STATUSES, EventKind, InstallationFile,
)
from .serializers import (
    EDITABLE_FIELDS, InstallationDetailSerializer, InstallationEventSerializer,
    InstallationFileSerializer, InstallationListSerializer, InstallationWriteSerializer,
)


class CanSeeInstallations(permissions.BasePermission):
    message = 'Список монтажей вам недоступен.'

    def has_permission(self, request, view):
        return can_see_installations(request.user)


def _bool_param(value):
    if value in ('true', '1'):
        return True
    if value in ('false', '0'):
        return False
    return None


def _order_for(user, order_id):
    """Заказ, по которому пользователь может оформить монтаж, или None."""
    if not str(order_id or '').isdigit():
        return None
    return get_orders_queryset_for_user(user).filter(id=order_id).first()


class InstallationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          mixins.CreateModelMixin, mixins.UpdateModelMixin,
                          viewsets.GenericViewSet):
    """
    Список монтажей — общий на город. Оформляет монтаж менеджер (из заказа или
    из списка), правят все пользователи города, кроме монтажников, пока монтаж
    не завершён.
    """
    permission_classes = [permissions.IsAuthenticated, CanSeeInstallations]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [NumberAwareSearchFilter, OrderingFilter]
    # id — номер монтажа, order__id — номер заказа: ищут по обоим «#123»
    search_fields = [
        'id', 'order__id', 'order__client_name', 'order__address', 'order__kp_number',
        'contact_name', 'contact_phone',
    ]
    ordering_fields = ['created_at', 'planned_delivery_date', 'status']
    ordering = ['-created_at']

    def get_queryset(self):
        request = self.request
        qs = installations_for_user(request.user)
        if self.action != 'list':
            return qs
        params = request.query_params
        if (order_id := params.get('order')) and order_id.isdigit():
            qs = qs.filter(order_id=order_id)
        statuses = requested_statuses(request)
        if statuses:
            qs = qs.filter(status__in=statuses)
        # «Кроме выполненных» — по умолчанию в списке; явный выбор закрытого
        # статуса в фильтре важнее, иначе он всегда давал бы пустой список
        if params.get('exclude_closed') == 'true' and not statuses & set(CLOSED_INSTALLATION_STATUSES):
            qs = qs.exclude(status__in=CLOSED_INSTALLATION_STATUSES)
        is_paid = _bool_param(params.get('is_paid'))
        if is_paid is not None:
            qs = qs.filter(is_paid=is_paid)
        if params.get('mine') == 'true':
            qs = qs.filter(order__manager=request.user)
        return apply_people_filters(qs, request, order_path='order__')

    def get_serializer_class(self):
        if self.action == 'list':
            return InstallationListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return InstallationWriteSerializer
        return InstallationDetailSerializer

    def _detail(self, inst):
        # Перечитываем с prefetch — в ответе пакет документов уже с новыми файлами
        inst = installations_for_user(self.request.user).get(pk=inst.pk)
        return InstallationDetailSerializer(inst, context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        if request.user.role not in CREATE_ROLES:
            return Response({'detail': 'Монтаж оформляет менеджер.'}, status=status.HTTP_403_FORBIDDEN)
        order = _order_for(request.user, request.data.get('order'))
        if order is None:
            return Response({'order': ['Заказ не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = {k: v for k, v in serializer.validated_data.items() if k != 'order'}

        files_by_kind = {k: request.FILES.getlist(k) for k in services.UPLOAD_KINDS}
        missing = services.missing_required_files(order, files_by_kind)
        if missing:
            return Response(
                {'files': [f'Приложите: {", ".join(missing)}.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inst = services.create_installation(
            order=order, data=data, files_by_kind=files_by_kind, actor=request.user,
        )
        return Response(self._detail(inst), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        inst = self.get_object()
        if inst.is_closed:
            return Response(
                {'detail': f'Монтаж в статусе «{inst.get_status_display()}» — правки закрыты.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(inst, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        before = {f: getattr(inst, f) for f in EDITABLE_FIELDS}
        for field, value in serializer.validated_data.items():
            if field in EDITABLE_FIELDS:
                setattr(inst, field, value)
        changed = [f for f in EDITABLE_FIELDS if getattr(inst, f) != before[f]]
        if changed:
            inst.save(update_fields=[*changed, 'updated_at'])
            labels = [str(inst._meta.get_field(f).verbose_name) for f in changed]
            inst.log(
                EventKind.UPDATED, actor=request.user,
                description='Изменено: ' + ', '.join(labels),
                meta={'fields': changed},
            )
        return Response(self._detail(inst))

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        inst = self.get_object()
        return Response(InstallationEventSerializer(inst.events.select_related('actor'), many=True).data)

    @action(detail=False, methods=['get'])
    def prefill(self, request):
        """Данные заказа для формы оформления: ?order=ID."""
        order = _order_for(request.user, request.query_params.get('order'))
        if order is None:
            return Response({'detail': 'Заказ не найден.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(services.prefill(order))

    @action(detail=False, methods=['post'], url_path='set_not_needed')
    def set_not_needed(self, request):
        """
        «Монтаж не нужен» по заказу и отмена этого решения.
        Тело: {order, not_needed: true|false}.
        """
        if request.user.role not in CREATE_ROLES:
            return Response({'detail': 'Это решает менеджер.'}, status=status.HTTP_403_FORBIDDEN)
        order = _order_for(request.user, request.data.get('order'))
        if order is None:
            return Response({'order': ['Заказ не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        not_needed = _bool_param(str(request.data.get('not_needed')).lower())
        if not_needed is None:
            return Response({'not_needed': ['Укажите true или false.']}, status=status.HTTP_400_BAD_REQUEST)
        if not_needed and order.installations.exists():
            return Response(
                {'detail': 'По заказу уже оформлен монтаж.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        services.set_installation_not_needed(order, not_needed, request.user)
        return Response({'order': order.id, 'installation_not_needed_at': order.installation_not_needed_at})


class InstallationFileViewSet(mixins.CreateModelMixin, mixins.DestroyModelMixin,
                              viewsets.GenericViewSet):
    """Файлы пакета документов монтажа: добавить / удалить, пока монтаж не завершён."""
    permission_classes = [permissions.IsAuthenticated, CanSeeInstallations]
    serializer_class = InstallationFileSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return InstallationFile.objects.filter(
            installation__in=installations_for_user(self.request.user),
        ).select_related('installation', 'installation__order')

    def create(self, request, *args, **kwargs):
        inst_id = request.data.get('installation')
        inst = installations_for_user(request.user).filter(
            pk=inst_id if str(inst_id or '').isdigit() else None,
        ).first()
        if inst is None:
            return Response({'installation': ['Монтаж не найден.']}, status=status.HTTP_400_BAD_REQUEST)
        if inst.is_closed:
            return Response({'detail': 'Монтаж закрыт — файлы не меняются.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data['file']
        f = serializer.save(installation=inst, uploaded_by=request.user,
                            name=serializer.validated_data.get('name') or upload.name[:255])
        inst.log(EventKind.FILE_ADDED, actor=request.user,
                 description=f'{f.get_kind_display()}: {f.name}', meta={'file_id': f.id})
        return Response(self.get_serializer(f).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        f = self.get_object()
        inst = f.installation
        if inst.is_closed:
            return Response({'detail': 'Монтаж закрыт — файлы не меняются.'}, status=status.HTTP_400_BAD_REQUEST)
        # Последний файл обязательного вида не удаляем — пакет должен остаться полным
        if (
            f.kind in services.required_file_kinds(inst.order)
            and not inst.files.filter(kind=f.kind).exclude(pk=f.pk).exists()
        ):
            return Response(
                {'detail': f'«{f.get_kind_display()}» обязателен: сначала загрузите замену.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        description = f'{f.get_kind_display()}: {f.name}'
        f.delete()
        inst.log(EventKind.FILE_DELETED, actor=request.user, description=description)
        return Response(status=status.HTTP_204_NO_CONTENT)
