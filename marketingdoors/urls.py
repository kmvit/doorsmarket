"""
URL configuration for marketingdoors project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from orders.api_views import ShortMeasurementRedirectView
from marketingdoors.storage import media_view

urlpatterns = [
    path('', RedirectView.as_view(pattern_name='users:web_login', permanent=False)),
    # Короткая ссылка для SMS: /z/{код} → PDF-бланк замера
    path('z/<str:code>/', ShortMeasurementRedirectView.as_view(), name='short-measurement-pdf'),
    # Файлы: с диска (локально) или из S3 через nginx — адреса /media/ не меняются
    path('media/<path:path>', media_view, name='media'),
    path('admin/', admin.site.urls),
    path('api/v1/', include('users.urls')),
    path('api/v1/', include('projects.api_urls')),
    path('api/v1/', include('orders.urls')),
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('maxbot.urls')),
    path('', include('projects.urls')),
]
