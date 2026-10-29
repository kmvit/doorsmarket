from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import api_views

router = DefaultRouter()
router.register('installations', api_views.InstallationViewSet, basename='installation')
router.register('installation-files', api_views.InstallationFileViewSet, basename='installation-file')

urlpatterns = [
    path('', include(router.urls)),
]
