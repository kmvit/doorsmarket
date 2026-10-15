from django.urls import path

from .views import MaxWebhookView

urlpatterns = [
    path('max/webhook/', MaxWebhookView.as_view(), name='max-webhook'),
]
