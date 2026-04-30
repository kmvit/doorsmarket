from rest_framework import viewsets, permissions
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import Salon, Order, OrderItem
from .serializers import (
    SalonSerializer,
    OrderListSerializer,
    OrderDetailSerializer,
    OrderCreateSerializer,
    OrderItemWriteSerializer,
)


class IsAuthenticated(permissions.IsAuthenticated):
    pass


class SalonViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SalonSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['city']
    search_fields = ['name', 'address']

    def get_queryset(self):
        user = self.request.user
        qs = Salon.objects.filter(is_active=True).select_related('city')
        if user.role == 'admin':
            return qs
        if hasattr(user, 'city') and user.city:
            return qs.filter(city=user.city)
        return qs


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['kp_number', 'client_name', 'address', 'contact_phone']
    ordering_fields = ['created_at', 'updated_at', 'status', 'kp_date', 'client_name']
    ordering = ['-created_at']
    filterset_fields = ['status', 'salon']

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.select_related(
            'manager', 'salon', 'salon__city'
        ).prefetch_related('items__addons')

        if user.role == 'admin':
            pass
        elif user.role == 'leader':
            if hasattr(user, 'city') and user.city:
                qs = qs.filter(salon__city=user.city)
            else:
                qs = qs.none()
        elif user.role == 'service_manager':
            if hasattr(user, 'city') and user.city:
                qs = qs.filter(salon__city=user.city)
            else:
                qs = qs.none()
        elif user.role == 'manager':
            if hasattr(user, 'salon') and user.salon_id:
                qs = qs.filter(salon=user.salon)
            else:
                qs = qs.filter(manager=user)
        else:
            qs = qs.none()

        manager_id = self.request.query_params.get('manager_id')
        if manager_id:
            qs = qs.filter(manager_id=manager_id)

        salon_id = self.request.query_params.get('salon_id')
        if salon_id:
            qs = qs.filter(salon_id=salon_id)

        if self.request.query_params.get('my_orders') == 'true':
            qs = qs.filter(manager=user)

        if self.request.query_params.get('exclude_cancelled') == 'true':
            qs = qs.exclude(status='cancelled')

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return OrderCreateSerializer
        return OrderDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx


class OrderItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderItemWriteSerializer

    def get_queryset(self):
        order_pk = self.kwargs.get('order_pk')
        return OrderItem.objects.filter(order_id=order_pk).prefetch_related('addons')

    def perform_create(self, serializer):
        order_pk = self.kwargs.get('order_pk')
        serializer.save(order_id=order_pk)
