#!/bin/bash
# Скрипт для загрузки всех тестовых данных

echo "🔄 Загрузка тестовых данных в БД..."
echo ""

# Активируем виртуальное окружение
source venv/bin/activate

# Загружаем фикстуры в правильном порядке
echo "1️⃣  Загрузка городов..."
python manage.py loaddata users/fixtures/test_cities.json

echo "2️⃣  Загрузка пользователей..."
python manage.py loaddata users/fixtures/test_users.json

echo "3️⃣  Загрузка производственных площадок..."
python manage.py loaddata projects/fixtures/test_production_sites.json

echo "4️⃣  Загрузка причин рекламации..."
python manage.py loaddata projects/fixtures/initial_complaint_reasons.json

echo "5️⃣  Загрузка рекламаций..."
python manage.py loaddata projects/fixtures/test_complaints.json

echo "6️⃣  Загрузка бракованных изделий..."
python manage.py loaddata projects/fixtures/test_defective_products.json

echo "7️⃣  Загрузка реестра на отгрузку..."
python manage.py loaddata projects/fixtures/test_shipping_registry.json

echo ""
echo "🔑 Установка паролей для пользователей..."
python manage.py shell << 'EOF'
from users.models import User

users = ['admin', 'sm_petrov', 'manager_ivanov', 'manager_sidorova', 'installer_kozlov', 'leader_volkov', 'complaint_dept']

for username in users:
    try:
        user = User.objects.get(username=username)
        user.set_password('test123456')
        user.save()
    except User.DoesNotExist:
        pass
EOF

echo ""
echo "✅ Все тестовые данные успешно загружены!"
echo ""
echo "👥 Тестовые пользователи (пароль для всех: test123456):"
echo "   - admin (Администратор)"
echo "   - sm_petrov (Сервис-менеджер)"
echo "   - manager_ivanov (Менеджер)"
echo "   - manager_sidorova (Менеджер)"
echo "   - installer_kozlov (Монтажник)"
echo "   - leader_volkov (Руководитель)"
echo "   - complaint_dept (Отдел рекламаций)"
echo ""
echo "🎫 Загружено 5 тестовых рекламаций"
echo ""
echo "🚀 Запустите сервер: python manage.py runserver"
echo "🔗 Вход: http://localhost:8000/api/v1/login/"
echo ""

