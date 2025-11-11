from django import forms

from users.models import User
from .models import Complaint, ComplaintReason, ProductionSite, ComplaintType


class ComplaintEditForm(forms.ModelForm):
    """Форма редактирования рекламации для сервис-менеджера."""

    class Meta:
        model = Complaint
        fields = [
            'complaint_type',
            'recipient',
            'manager',
            'production_site',
            'reason',
            'order_number',
            'client_name',
            'address',
            'contact_person',
            'contact_phone',
            'additional_info',
            'assignee_comment',
            'document_package_link',
            'commercial_offer',
            'commercial_offer_text',
        ]
        widgets = {
            'complaint_type': forms.Select(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'}
            ),
            'recipient': forms.Select(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'}
            ),
            'manager': forms.Select(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'}
            ),
            'production_site': forms.Select(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'}
            ),
            'reason': forms.Select(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white'}
            ),
            'order_number': forms.TextInput(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'client_name': forms.TextInput(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'address': forms.Textarea(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500', 'rows': 3}
            ),
            'contact_person': forms.TextInput(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'contact_phone': forms.TextInput(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'additional_info': forms.Textarea(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500', 'rows': 4}
            ),
            'assignee_comment': forms.Textarea(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500', 'rows': 4}
            ),
            'document_package_link': forms.URLInput(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'commercial_offer': forms.ClearableFileInput(
                attrs={'class': 'w-full px-4 py-3 border border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500'}
            ),
            'commercial_offer_text': forms.Textarea(
                attrs={'class': 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500', 'rows': 4}
            ),
        }

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)

        # Настраиваем queryset полей
        self.fields['manager'].queryset = User.objects.filter(role='manager', is_active=True).order_by('first_name', 'last_name')
        self.fields['recipient'].queryset = User.objects.filter(role='service_manager', is_active=True).order_by('first_name', 'last_name')
        self.fields['reason'].queryset = ComplaintReason.objects.filter(is_active=True).order_by('name')
        self.fields['production_site'].queryset = ProductionSite.objects.filter(is_active=True).order_by('name')

        # Поле complaint_type не обязательно
        self.fields['complaint_type'].required = False
        self.fields['complaint_type'].choices = [('', '---------')] + list(ComplaintType.choices)

        # Файл не обязателен
        self.fields['commercial_offer'].required = False
        self.fields['assignee_comment'].required = False

        # Подсказки
        self.fields['complaint_type'].help_text = 'Определяет текущий тип обработки рекламации'
        self.fields['recipient'].help_text = 'Сервис-менеджер, ответственный за рекламацию'
        self.fields['manager'].help_text = 'Менеджер, ведущий заказ'
        self.fields['assignee_comment'].help_text = 'Комментарий увидит менеджер или монтажник, выполняющий задачу'

