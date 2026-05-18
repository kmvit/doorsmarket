from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api_views

router = DefaultRouter()
router.register('salons', api_views.SalonViewSet, basename='salon')
router.register('orders', api_views.OrderViewSet, basename='order')
router.register('action-reminders', api_views.OrderActionReminderViewSet, basename='action-reminder')
router.register('workshop', api_views.WorkshopViewSet, basename='workshop')
router.register('measurements', api_views.MeasurementViewSet, basename='measurement')
router.register('measurement-openings', api_views.MeasurementOpeningViewSet, basename='measurement-opening')
router.register('measurement-attachments', api_views.MeasurementAttachmentViewSet, basename='measurement-attachment')
router.register('order-attachments', api_views.OrderAttachmentViewSet, basename='order-attachment')

urlpatterns = [
    path('', include(router.urls)),
]
