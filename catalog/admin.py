from django.contrib import admin
from django.utils.html import format_html

from .models import DoorColor, DoorImage, DoorModel, DoorSeries


@admin.register(DoorSeries)
class DoorSeriesAdmin(admin.ModelAdmin):
    list_display = ('name', 'position', 'models_count')
    list_editable = ('position',)
    search_fields = ('name',)

    @admin.display(description='Моделей')
    def models_count(self, obj):
        return obj.models.count()


@admin.register(DoorModel)
class DoorModelAdmin(admin.ModelAdmin):
    list_display = ('name', 'series', 'images_count', 'aliases')
    list_filter = ('series',)
    search_fields = ('name', 'aliases', 'norm_name')
    autocomplete_fields = ('series',)

    @admin.display(description='Картинок')
    def images_count(self, obj):
        return obj.images.count()


@admin.register(DoorColor)
class DoorColorAdmin(admin.ModelAdmin):
    list_display = ('name', 'images_count', 'aliases')
    search_fields = ('name', 'aliases', 'norm_name')

    @admin.display(description='Картинок')
    def images_count(self, obj):
        return obj.images.count()


@admin.register(DoorImage)
class DoorImageAdmin(admin.ModelAdmin):
    list_display = ('door_model', 'color', 'variant', 'source', 'preview')
    list_filter = ('source', 'door_model__series', 'color')
    search_fields = ('door_model__name', 'color__name', 'variant')
    autocomplete_fields = ('door_model', 'color')

    @admin.display(description='Превью')
    def preview(self, obj):
        if not obj.image:
            return '—'
        return format_html('<img src="{}" style="height:80px" />', obj.image.url)
