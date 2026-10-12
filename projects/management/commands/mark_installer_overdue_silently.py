"""
Разовая разметка накопившихся просрочек монтажа — без push и SMS монтажникам.

С 10.06.2026 по 10.2026 просрочку монтажа считали только у рекламаций типа
«Монтажник», и у «Менеджера»/«Фабрики» (где дату монтажа ставит СМ) она не
загоралась. После исправления все такие рекламации разом стали бы
просроченными при первом открытии списка — и каждому монтажнику ушла бы пачка
SMS, в том числе по давно сделанным, но не закрытым монтажам. Эта команда
ставит им статус заранее и молча; дальше просрочки уведомляют как обычно.

    venv/bin/python manage.py mark_installer_overdue_silently [--dry-run]
"""
from django.core.management.base import BaseCommand

from projects.models import INSTALLATION_STAGE_STATUSES, Complaint, ComplaintStatus


class Command(BaseCommand):
    help = 'Тихо (без уведомлений) помечает накопившиеся просрочки монтажа'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Только посчитать, ничего не менять')

    def handle(self, *args, dry_run=False, **options):
        candidates = Complaint.objects.filter(
            installer_assigned__isnull=False,
            status__in=INSTALLATION_STAGE_STATUSES - {ComplaintStatus.INSTALLER_OVERDUE},
        ).select_related('installer_assigned')
        marked = []
        for complaint in candidates:
            if dry_run:
                # Та же проверка, но в транзакции с откатом не нужна: считаем по датам
                from django.db import transaction
                with transaction.atomic():
                    sid = transaction.savepoint()
                    if complaint.check_installer_overdue(notify=False):
                        marked.append(complaint.id)
                    transaction.savepoint_rollback(sid)
            elif complaint.check_installer_overdue(notify=False):
                marked.append(complaint.id)
        verb = 'Будут помечены' if dry_run else 'Помечены'
        self.stdout.write(f'{verb} как просроченные монтажником: {len(marked)} — {marked}')
