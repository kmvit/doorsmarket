"""
История событий рекламации — одна для приложения (API) и веб-страницы.

Смены статуса берутся из журнала ComplaintEvent. Журнал ведётся с момента
его появления, поэтому для более ранних шагов показываем уведомления,
которые система рассылала по рекламации: по ним видно ответ фабрики,
«Товар на складе» и т. п.
"""
from collections import OrderedDict
from datetime import datetime, timezone as dt_timezone

_NO_DATE = datetime.min.replace(tzinfo=dt_timezone.utc)


def _name(user):
    return (user.get_full_name() or user.username) if user else ''


def _event(type_, date, user, title, description, icon, color):
    return {
        'type': type_, 'date': date, 'user': user, 'title': title,
        'description': description, 'icon': icon, 'color': color,
    }


def _status_events(status_events):
    for event in status_events:
        old, new = event.get_old_status_display(), event.get_new_status_display()
        who = _name(event.actor) or 'Система'
        yield _event(
            'status_changed', event.created_at, event.actor,
            f'Статус: {new}', f'{old} → {new}\nИзменил: {who}', 'update', 'purple',
        )


def _notification_events(notifications):
    """Одно и то же уведомление нескольким получателям — одним событием."""
    groups = OrderedDict()
    for notification in notifications:
        date = notification.created_at
        key = (notification.title, notification.message, date.replace(second=0, microsecond=0))
        group = groups.setdefault(key, {'date': date, 'recipients': []})
        name = _name(notification.recipient)
        if name not in group['recipients']:
            group['recipients'].append(name)
    for (title, message, _), group in groups.items():
        yield _event(
            'notification', group['date'], None, title,
            f'{message}\nКому: {", ".join(group["recipients"])}', 'notification', 'yellow',
        )


def complaint_history_events(complaint):
    """События от новых к старым; date — datetime, user — пользователь или None."""
    events = [_event(
        'created', complaint.created_at, complaint.initiator, 'Рекламация создана',
        f'Инициатор: {_name(complaint.initiator)}', 'create', 'blue',
    )]

    comments = complaint.comments.all().select_related('author')
    for comment in comments:
        events.append(_event(
            'comment', comment.created_at, comment.author, 'Комментарий добавлен',
            comment.text, 'comment', 'gray',
        ))

    status_events = list(complaint.events.select_related('actor'))
    events.extend(_status_events(status_events))

    # Уведомления — только за время до журнала, дальше их заменяют смены статуса
    notifications = complaint.notifications.select_related('recipient').order_by('created_at', 'id')
    if status_events:
        notifications = notifications.filter(created_at__lt=status_events[0].created_at)
    events.extend(_notification_events(notifications))

    if not status_events and complaint.updated_at and complaint.updated_at != complaint.created_at:
        events.append(_event(
            'updated', complaint.updated_at, None, 'Рекламация обновлена',
            f'Текущий статус: {complaint.get_status_display()}', 'update', 'purple',
        ))

    if complaint.installer_assigned:
        installer_comment = comments.filter(text__icontains='монтажник').first()
        date = installer_comment.created_at if installer_comment else (
            complaint.installer_assigned_at or complaint.updated_at
        )
        if date:
            events.append(_event(
                'installer_assigned', date,
                installer_comment.author if installer_comment else complaint.installer_assigned,
                'Назначен монтажник', f'Монтажник: {_name(complaint.installer_assigned)}', 'user', 'green',
            ))

    if complaint.planned_installation_date:
        events.append(_event(
            'installation_planned', complaint.planned_installation_date, complaint.installer_assigned,
            'Монтаж запланирован', f'Дата: {complaint.installation_window_text}',
            'calendar', 'indigo',
        ))

    if complaint.planned_shipping_date:
        events.append(_event(
            'shipping_planned', complaint.planned_shipping_date, complaint.manager,
            'Отгрузка запланирована', f"Дата: {complaint.planned_shipping_date.strftime('%d.%m.%Y')}",
            'truck', 'orange',
        ))

    if complaint.completion_date:
        events.append(_event(
            'completed', complaint.completion_date, None, 'Рекламация завершена',
            f"Дата завершения: {complaint.completion_date.strftime('%d.%m.%Y %H:%M')}", 'check', 'green',
        ))

    events.sort(key=lambda e: e['date'] or _NO_DATE, reverse=True)
    return events
