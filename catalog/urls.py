from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import api_views

router = DefaultRouter()
router.register('door-series', api_views.DoorSeriesViewSet, basename='door-series')
router.register('door-models', api_views.DoorModelViewSet, basename='door-model')
router.register('door-colors', api_views.DoorColorViewSet, basename='door-color')
router.register('door-images', api_views.DoorImageViewSet, basename='door-image')

urlpatterns = [path('', include(router.urls))]
