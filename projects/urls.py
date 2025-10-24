from django.urls import path
from .views import (
    complaint_list,
    complaint_detail,
    complaint_create,
    shipping_registry,
    shipping_detail,
    complaint_process,
    installer_planning,
    installer_complete,
    manager_production,
    or_factory_complaints,
)

app_name = 'projects'

urlpatterns = [
    # Список и детали рекламаций
    path('complaints/', complaint_list, name='complaint_list'),
    path('complaints/<int:pk>/', complaint_detail, name='complaint_detail'),
    
    # Создание и редактирование
    path('complaints/create/', complaint_create, name='complaint_create'),
    path('complaints/<int:pk>/edit/', complaint_detail, name='complaint_edit'),  # TODO: создать view для редактирования
    
    # Реестры
    path('shipping-registry/', shipping_registry, name='shipping_registry'),
    path('shipping-registry/<int:pk>/', shipping_detail, name='shipping_detail'),
    
    # Обработка рекламаций
    path('complaints/<int:pk>/process/', complaint_process, name='complaint_process'),
    
    # Монтажник
    path('installer/planning/', installer_planning, name='installer_planning'),
    path('complaints/<int:pk>/complete/', installer_complete, name='installer_complete'),
    
    # Менеджер
    path('manager/production/', manager_production, name='manager_production'),
    
    # ОР
    path('or/factory-complaints/', or_factory_complaints, name='or_factory_complaints'),
]

