from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import api_views

router = DefaultRouter()
router.register('installations', api_views.InstallationViewSet, basename='installation')
router.register('installation-files', api_views.InstallationFileViewSet, basename='installation-file')
router.register('installation-ratings', api_views.RatingReportView, basename='installation-rating')
# Страница клиента по ссылке из СМС (без входа)
router.register('public/installation-acts', api_views.PublicInstallationActView, basename='public-installation-act')

urlpatterns = [
    path('', include(router.urls)),
]
