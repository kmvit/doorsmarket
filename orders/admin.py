from django.contrib import admin
from .models import (
    Salon, Order, OrderItem, OrderAddon, OrderAttachment,
    MeasurementRequest, OrderActionReminder,
)


@admin.register(Salon)
class SalonAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'city', 'address', 'phone', 'is_active')
    list_filter = ('city', 'is_active')
    search_fields = ('name', 'address')
    list_editable = ('is_active',)


class OrderAddonInline(admin.TabularInline):
    model = OrderAddon
    extra = 0
    fields = ('position', 'kind', 'name', 'quantity', 'size', 'opening_type', 'price', 'amount', 'comment')


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ('opening_number', 'room_name', 'model_name', 'quantity', 'price', 'amount', 'door_type', 'opening_type', 'door_height', 'door_width', 'position')
    show_change_link = True


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'client_name', 'manager', 'salon', 'kp_number', 'status', 'created_at')
    list_filter = ('status', 'salon__city', 'salon')
    search_fields = ('client_name', 'kp_number', 'address', 'contact_phone')
    raw_id_fields = ('manager',)
    inlines = [OrderItemInline, OrderAddonInline]
    date_hierarchy = 'created_at'


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'opening_number', 'room_name', 'model_name', 'quantity')


@admin.register(OrderAddon)
class OrderAddonAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'kind', 'name', 'quantity', 'size', 'opening_type', 'price', 'amount')
    list_filter = ('kind',)
    search_fields = ('name', 'order__client_name')


@admin.register(MeasurementRequest)
class MeasurementRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'contact_name', 'contact_phone', 'desired_date', 'payer', 'created_at')
    list_filter = ('payer',)
    search_fields = ('contact_name', 'contact_phone', 'order__client_name')
    raw_id_fields = ('order', 'created_by')


@admin.register(OrderActionReminder)
class OrderActionReminderAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'action_text', 'due_at', 'done', 'done_at', 'created_by')
    list_filter = ('done', 'notified')
    search_fields = ('action_text', 'order__client_name')
    raw_id_fields = ('order', 'created_by')
    date_hierarchy = 'due_at'
