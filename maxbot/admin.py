from django.contrib import admin

from .models import MaxContact


@admin.register(MaxContact)
class MaxContactAdmin(admin.ModelAdmin):
    list_display = ('phone', 'name', 'is_active', 'linked_at', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('phone', 'name')
    readonly_fields = ('chat_id', 'max_user_id', 'linked_at', 'updated_at')
