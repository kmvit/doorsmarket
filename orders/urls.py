from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api_views

router = DefaultRouter()
router.register('salons', api_views.SalonViewSet, basename='salon')
router.register('orders', api_views.OrderViewSet, basename='order')
router.register('action-reminders', api_views.OrderActionReminderViewSet, basename='action-reminder')
router.register('workshop', api_views.WorkshopViewSet, basename='workshop')

urlpatterns = [
    path('', include(router.urls)),
]
