from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import api_views

router = DefaultRouter()
router.register('salons', api_views.SalonViewSet, basename='salon')
router.register('orders', api_views.OrderViewSet, basename='order')

urlpatterns = [
    path('', include(router.urls)),
]
