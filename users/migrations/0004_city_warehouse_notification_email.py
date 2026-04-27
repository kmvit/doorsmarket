from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_pushsubscription'),
    ]

    operations = [
        migrations.AddField(
            model_name='city',
            name='warehouse_notification_email',
            field=models.EmailField(
                blank=True,
                null=True,
                verbose_name='Email уведомления "Товар на складе"',
                help_text='Если указан, при нажатии кнопки "Товар на складе" ОР этого города будет отправлено письмо на этот адрес',
            ),
        ),
    ]
