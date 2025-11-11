from projects.models import Notification


def unread_notifications(request):
    """Возвращает количество непрочитанных уведомлений для текущего пользователя."""
    if request.user.is_authenticated:
        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).count()
    else:
        count = 0
    
    return {
        'unread_notifications_count': count
    }

