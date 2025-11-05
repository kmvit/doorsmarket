from django.contrib import admin
from .models import (
    ProductionSite,
    ComplaintReason,
    Complaint,
    DefectiveProduct,
    ComplaintAttachment,
    ComplaintComment,
    ShippingRegistry,
    Notification
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
        'complaint_type',
        'reason',
        'initiator',
        'recipient',
        'manager',
        'created_at'
    )
    list_filter = (
        'status',
        'complaint_type',
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
        'contact_phone'
    )
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Основная информация', {
            'fields': (
                'status',
                'complaint_type',
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
        ('Планирование', {
            'fields': (
                'planned_installation_date',
                'planned_shipping_date',
                'production_deadline',
                'installer_assigned',
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
        ('Документы', {
            'fields': (
                'document_package_link',
                'commercial_offer',
                'commercial_offer_text',
            )
        }),
        ('Дополнительные даты', {
            'fields': (
                'factory_response_date',
                'client_agreement_date',
                'completion_date',
                'added_to_shipping_registry_at',
            ),
            'classes': ('collapse',)
        }),
        ('Данные по фабричным рекламациям', {
            'fields': (
                'factory_reject_reason',
                'dispute_arguments',
            ),
            'classes': ('collapse',)
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


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        'complaint',
        'recipient',
        'notification_type',
        'title',
        'is_sent',
        'created_at'
    )
    list_filter = (
        'notification_type',
        'is_sent',
        'created_at',
        'recipient'
    )
    search_fields = (
        'title',
        'message',
        'complaint__order_number',
        'recipient__username'
    )
    readonly_fields = ('created_at', 'sent_at')
    ordering = ('-created_at',)
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('complaint', 'recipient')


@admin.register(ShippingRegistry)
class ShippingRegistryAdmin(admin.ModelAdmin):
    list_display = (
        'order_number', 
        'manager', 
        'client_name', 
        'order_type', 
        'delivery_status',
        'doors_count',
        'planned_shipping_date',
        'created_at'
    )
    list_filter = (
        'order_type', 
        'delivery_status', 
        'lift_type', 
        'lift_method', 
        'delivery_destination',
        'created_at'
    )
    search_fields = ('order_number', 'client_name', 'contact_person', 'address')
    readonly_fields = ('created_at',)
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('complaint', 'order_number', 'manager', 'order_type')
        }),
        ('Информация о клиенте', {
            'fields': ('client_name', 'address', 'contact_person', 'contact_phone')
        }),
        ('Детали заказа', {
            'fields': ('doors_count', 'lift_type', 'lift_method', 'payment_status', 'delivery_destination')
        }),
        ('Доставка', {
            'fields': ('planned_shipping_date', 'actual_shipping_date', 'delivery_status', 'client_rating')
        }),
        ('Дополнительно', {
            'fields': ('comments',)
        }),
    )


