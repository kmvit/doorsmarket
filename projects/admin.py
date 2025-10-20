from django.contrib import admin
from .models import (
    ProductionSite,
    ComplaintReason,
    Complaint,
    DefectiveProduct,
    ComplaintAttachment,
    ComplaintComment
)


@admin.register(ProductionSite)
class ProductionSiteAdmin(admin.ModelAdmin):
    list_display = ('name', 'address', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'address')
    ordering = ('name',)


@admin.register(ComplaintReason)
class ComplaintReasonAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'order', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'description')
    ordering = ('order', 'name')
    list_editable = ('order', 'is_active')


class DefectiveProductInline(admin.TabularInline):
    model = DefectiveProduct
    extra = 1
    fields = ('product_name', 'size', 'opening_type', 'problem_description', 'order')


class ComplaintAttachmentInline(admin.TabularInline):
    model = ComplaintAttachment
    extra = 1
    fields = ('file', 'attachment_type', 'description')
    readonly_fields = ('uploaded_at',)


class ComplaintCommentInline(admin.StackedInline):
    model = ComplaintComment
    extra = 0
    fields = ('author', 'text', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'order_number',
        'client_name',
        'status',
        'reason',
        'initiator',
        'recipient',
        'manager',
        'created_at'
    )
    list_filter = (
        'status',
        'reason',
        'production_site',
        'created_at',
        'initiator',
        'manager'
    )
    search_fields = (
        'order_number',
        'client_name',
        'address',
        'contact_person',
        'contact_phone',
        'problem_description'
    )
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Основная информация', {
            'fields': (
                'status',
                'created_at',
                'updated_at',
                'initiator',
                'recipient',
            )
        }),
        ('Заказ и производство', {
            'fields': (
                'manager',
                'production_site',
                'order_number',
                'reason',
            )
        }),
        ('Информация о клиенте', {
            'fields': (
                'client_name',
                'address',
                'contact_person',
                'contact_phone',
            )
        }),
        ('Описание проблемы', {
            'fields': (
                'problem_description',
            )
        }),
        ('Документы', {
            'fields': (
                'document_package_link',
                'commercial_offer',
            )
        }),
    )
    
    inlines = [
        DefectiveProductInline,
        ComplaintAttachmentInline,
        ComplaintCommentInline,
    ]
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related(
            'initiator',
            'recipient',
            'manager',
            'production_site'
        )


@admin.register(DefectiveProduct)
class DefectiveProductAdmin(admin.ModelAdmin):
    list_display = (
        'product_name',
        'size',
        'opening_type',
        'complaint',
        'order'
    )
    list_filter = ('complaint__status', 'complaint__production_site')
    search_fields = ('product_name', 'size', 'problem_description')
    ordering = ('complaint', 'order')


@admin.register(ComplaintAttachment)
class ComplaintAttachmentAdmin(admin.ModelAdmin):
    list_display = (
        'complaint',
        'attachment_type',
        'description',
        'file_size',
        'uploaded_at'
    )
    list_filter = ('attachment_type', 'uploaded_at')
    search_fields = ('description', 'complaint__order_number')
    readonly_fields = ('uploaded_at', 'file_size')
    ordering = ('-uploaded_at',)


@admin.register(ComplaintComment)
class ComplaintCommentAdmin(admin.ModelAdmin):
    list_display = ('complaint', 'author', 'created_at', 'text_preview')
    list_filter = ('created_at', 'author')
    search_fields = ('text', 'complaint__order_number')
    readonly_fields = ('created_at',)
    ordering = ('-created_at',)
    
    def text_preview(self, obj):
        """Превью текста комментария"""
        return obj.text[:50] + '...' if len(obj.text) > 50 else obj.text
    text_preview.short_description = 'Текст'
