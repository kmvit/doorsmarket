from django.contrib import admin
from .models import Salon, Order, OrderItem, OrderItemAddon, OrderAttachment


@admin.register(Salon)
class SalonAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'city', 'address', 'phone', 'is_active')
    list_filter = ('city', 'is_active')
    search_fields = ('name', 'address')
    list_editable = ('is_active',)


class OrderItemAddonInline(admin.TabularInline):
    model = OrderItemAddon
    extra = 0
    fields = ('kind', 'name', 'quantity', 'price', 'comment_face', 'comment_back')


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
    inlines = [OrderItemInline]
    date_hierarchy = 'created_at'


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'order', 'opening_number', 'room_name', 'model_name', 'quantity')
    inlines = [OrderItemAddonInline]
