from django.contrib import admin

from .models import Installation, InstallationEvent, InstallationFile


class InstallationFileInline(admin.TabularInline):
    model = InstallationFile
    extra = 0
    readonly_fields = ['uploaded_by', 'created_at']


@admin.register(Installation)
class InstallationAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'status', 'is_paid', 'planned_delivery_date', 'created_at']
    list_filter = ['status', 'is_paid', 'order__salon__city']
    search_fields = ['id', 'order__id', 'order__client_name', 'contact_name', 'contact_phone']
    raw_id_fields = ['order', 'created_by']
    inlines = [InstallationFileInline]


@admin.register(InstallationEvent)
class InstallationEventAdmin(admin.ModelAdmin):
    list_display = ['installation', 'kind', 'actor', 'description', 'created_at']
    list_filter = ['kind']
    raw_id_fields = ['installation', 'actor']
