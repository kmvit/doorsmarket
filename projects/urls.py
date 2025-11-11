from django.urls import path
from .views import (
    complaint_list,
    complaint_detail,
    complaint_edit,
    complaint_create,
    shipping_registry,
    shipping_detail,
    complaint_process,
    installer_planning,
    installer_complete,
    manager_production,
    or_factory_complaints,
    update_client_contact,
    complaint_history,
    sm_agree_client,
    sm_dispute_decision,
)

app_name = 'projects'

urlpatterns = [
    # Список и детали рекламаций
    path('complaints/', complaint_list, name='complaint_list'),
    path('complaints/<int:pk>/', complaint_detail, name='complaint_detail'),
    
    # Создание и редактирование
    path('complaints/create/', complaint_create, name='complaint_create'),
    path('complaints/<int:pk>/edit/', complaint_edit, name='complaint_edit'),
    
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
    path('complaints/<int:pk>/start-production/', complaint_detail, name='manager_start_production'),
    path('complaints/<int:pk>/mark-warehouse/', complaint_detail, name='manager_mark_warehouse'),
    path('complaints/<int:pk>/plan-shipping/', complaint_detail, name='manager_plan_shipping'),
    
    # СМ
    path('complaints/<int:pk>/plan-installation/', complaint_detail, name='sm_plan_installation'),
    path('complaints/<int:pk>/agree-client/', sm_agree_client, name='sm_agree_client'),
    path('complaints/<int:pk>/dispute-decision/', sm_dispute_decision, name='sm_dispute_decision'),
    
    # ОР
    path('or/factory-complaints/', or_factory_complaints, name='or_factory_complaints'),
    
    # Редактирование контактных данных клиента
    path('complaints/<int:pk>/update-client-contact/', update_client_contact, name='update_client_contact'),
    
    # История рекламации
    path('complaints/<int:pk>/history/', complaint_history, name='complaint_history'),
]

