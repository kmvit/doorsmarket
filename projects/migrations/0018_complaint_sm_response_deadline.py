from django.db import migrations, models


def add_business_days(start_date, days):
    from datetime import timedelta

    result = start_date
    added = 0
    while added < days:
        result += timedelta(days=1)
        if result.weekday() < 5:
            added += 1
    return result


def fill_sm_response_deadline(apps, schema_editor):
    Complaint = apps.get_model('projects', 'Complaint')

    complaints = Complaint.objects.filter(
        factory_response_date__isnull=False,
        sm_response_deadline__isnull=True,
    )
    for complaint in complaints.iterator():
        complaint.sm_response_deadline = add_business_days(complaint.factory_response_date, 2)
        complaint.save(update_fields=['sm_response_deadline'])


def clear_sm_response_deadline(apps, schema_editor):
    Complaint = apps.get_model('projects', 'Complaint')
    Complaint.objects.update(sm_response_deadline=None)


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0017_add_factory_approve_comment'),
    ]

    operations = [
        migrations.AddField(
            model_name='complaint',
            name='sm_response_deadline',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Дедлайн ответа СМ'),
        ),
        migrations.RunPython(fill_sm_response_deadline, clear_sm_response_deadline),
    ]

