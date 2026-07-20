"""
Management команда для автоудаления файлов рекламаций старше трёх лет
Должна запускаться по расписанию (например, через cron раз в сутки)

Удаляются файлы вложений (фото/видео/документы/КП) и файл коммерческого
предложения. Сами рекламации и вся остальная информация по ним сохраняются.
"""
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone
from projects.models import Complaint, ComplaintAttachment

RETENTION_YEARS = 3


class Command(BaseCommand):
    help = 'Удаляет файлы рекламаций через три года после создания рекламации'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать, что будет удалено, без фактического удаления',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        cutoff = self.subtract_years(timezone.now(), RETENTION_YEARS)

        # Рекламации старше трёх лет, у которых ещё остались файлы
        complaints = Complaint.objects.filter(
            created_at__lt=cutoff
        ).filter(
            Q(attachments__isnull=False) | (~Q(commercial_offer='') & Q(commercial_offer__isnull=False))
        ).distinct()

        deleted_files = 0
        processed = 0

        for complaint in complaints:
            processed += 1

            # Вложения (фото/видео/документы/КП)
            for attachment in ComplaintAttachment.objects.filter(complaint=complaint):
                file_name = attachment.file.name if attachment.file else '—'
                if dry_run:
                    self.stdout.write(f'[dry-run] Рекламация #{complaint.id}: вложение {file_name}')
                else:
                    if attachment.file:
                        attachment.file.delete(save=False)
                    attachment.delete()
                deleted_files += 1

            # Файл коммерческого предложения (старое поле)
            if complaint.commercial_offer:
                file_name = complaint.commercial_offer.name
                if dry_run:
                    self.stdout.write(f'[dry-run] Рекламация #{complaint.id}: КП {file_name}')
                else:
                    complaint.commercial_offer.delete(save=False)
                    complaint.commercial_offer = None
                    complaint.save(update_fields=['commercial_offer'])
                deleted_files += 1

            if not dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f'Рекламация #{complaint.id} (создана {complaint.created_at.strftime("%d.%m.%Y")}): файлы удалены'
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'{"[dry-run] " if dry_run else ""}Проверка завершена. '
                f'Рекламаций старше {RETENTION_YEARS} лет с файлами: {processed}, файлов удалено: {deleted_files}'
            )
        )

    @staticmethod
    def subtract_years(dt, years):
        """Вычитает годы с учётом 29 февраля"""
        try:
            return dt.replace(year=dt.year - years)
        except ValueError:
            return dt.replace(year=dt.year - years, day=28)
