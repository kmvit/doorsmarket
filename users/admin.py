from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import City, User
from orders.models import Salon


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'warehouse_notification_email')
    search_fields = ('name',)
    fields = ('name', 'warehouse_notification_email')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'phone_number', 'role', 'city', 'is_staff')
    list_filter = ('role', 'city', 'is_staff', 'is_superuser', 'is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone_number')
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Дополнительная информация', {'fields': ('role', 'city', 'phone_number', 'salon')}),
        ('Руководитель группы салонов', {
            'fields': ('managed_salons',),
            'description': 'Только для роли «Руководитель группы салонов»: какие салоны он видит.',
        }),
    )

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        # Салоны группы — простыми галочками: двухсписочный виджет на телефоне
        # неудобен (галочка в системном списке только выделяет, переносить надо стрелкой)
        if db_field.name == 'managed_salons':
            kwargs['widget'] = forms.CheckboxSelectMultiple
            kwargs['queryset'] = Salon.objects.select_related('city').order_by('city__name', 'name')
        return super().formfield_for_manytomany(db_field, request, **kwargs)
