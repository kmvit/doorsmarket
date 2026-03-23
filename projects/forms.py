from django import forms

from users.models import User
from .models import Complaint, ComplaintReason, ProductionSite


class ComplaintEditForm(forms.ModelForm):
    """Форма редактирования рекламации для сервис-менеджера."""

    class Meta:
        model = Complaint
        fields = [
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

        instance = self.instance

        # Настраиваем queryset полей, гарантируя что текущие значения всегда в списке
        manager_qs = User.objects.filter(role='manager', is_active=True).order_by('first_name', 'last_name')
        if instance and instance.pk and instance.manager_id:
            manager_qs = manager_qs | User.objects.filter(pk=instance.manager_id)
        self.fields['manager'].queryset = manager_qs.distinct()

        recipient_qs = User.objects.filter(role='service_manager', is_active=True).order_by('first_name', 'last_name')
        if instance and instance.pk and instance.recipient_id:
            recipient_qs = recipient_qs | User.objects.filter(pk=instance.recipient_id)
        self.fields['recipient'].queryset = recipient_qs.distinct()

        reason_qs = ComplaintReason.objects.filter(is_active=True).order_by('name')
        if instance and instance.pk and instance.reason_id:
            reason_qs = reason_qs | ComplaintReason.objects.filter(pk=instance.reason_id)
        self.fields['reason'].queryset = reason_qs.distinct()

        production_site_qs = ProductionSite.objects.filter(is_active=True).order_by('name')
        if instance and instance.pk and instance.production_site_id:
            production_site_qs = production_site_qs | ProductionSite.objects.filter(pk=instance.production_site_id)
        self.fields['production_site'].queryset = production_site_qs.distinct()

        # Файл не обязателен
        self.fields['commercial_offer'].required = False
        self.fields['assignee_comment'].required = False

        # Подсказки
        self.fields['recipient'].help_text = 'Сервис-менеджер, ответственный за рекламацию'
        self.fields['manager'].help_text = 'Менеджер, ведущий заказ'
        self.fields['assignee_comment'].help_text = 'Комментарий увидит менеджер или монтажник, выполняющий задачу'

