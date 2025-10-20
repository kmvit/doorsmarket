from django.urls import path
from .views import (
    complaint_list,
    complaint_detail,
    complaint_create,
)

app_name = 'projects'

urlpatterns = [
    # Список и детали рекламаций
    path('complaints/', complaint_list, name='complaint_list'),
    path('complaints/<int:pk>/', complaint_detail, name='complaint_detail'),
    
    # Создание и редактирование
    path('complaints/create/', complaint_create, name='complaint_create'),
    path('complaints/<int:pk>/edit/', complaint_detail, name='complaint_edit'),  # TODO: создать view для редактирования
]

