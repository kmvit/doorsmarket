from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api_views import (
    ComplaintViewSet,
    NotificationViewSet,
    ShippingRegistryViewSet,
    ProductionSiteViewSet,
    ComplaintReasonViewSet,
    DefectiveProductViewSet,
    ComplaintAttachmentViewSet,
    ComplaintCommentViewSet,
    DashboardStatsView,
)

router = DefaultRouter()
router.register(r'complaints', ComplaintViewSet, basename='complaint')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'shipping-registry', ShippingRegistryViewSet, basename='shipping-registry')
router.register(r'production-sites', ProductionSiteViewSet, basename='production-site')
router.register(r'complaint-reasons', ComplaintReasonViewSet, basename='complaint-reason')
router.register(r'defective-products', DefectiveProductViewSet, basename='defective-product')
router.register(r'attachments', ComplaintAttachmentViewSet, basename='attachment')
router.register(r'comments', ComplaintCommentViewSet, basename='comment')

app_name = 'projects_api'

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
]

