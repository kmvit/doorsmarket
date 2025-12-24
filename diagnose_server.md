# Диагностика проблемы с белым экраном в production

## Шаги для диагностики на сервере:

### 1. Проверьте собранные файлы
```bash
cd /opt/doorsmarket/frontend
ls -la dist/
cat dist/index.html
```

### 2. Проверьте доступность ресурсов
```bash
# Проверьте, что файлы доступны через nginx
curl -I http://localhost/
curl -I http://localhost/assets/
```

### 3. Проверьте логи nginx
```bash
tail -f /var/log/nginx/doorsmarket_access.log &
tail -f /var/log/nginx/doorsmarket_error.log &
# Затем откройте сайт в браузере и посмотрите на логи
```

### 4. Временно отключите Service Worker
```bash
cd /opt/doorsmarket/frontend
# Переименуйте Service Worker файлы
mv dist/sw.js dist/sw.js.bak
mv dist/registerSW.js dist/registerSW.js.bak
# Перезагрузите страницу в браузере
```

### 5. Проверьте консоль браузера
Откройте DevTools (F12) и посмотрите:
- Есть ли ошибки в консоли?
- Загружаются ли JS/CSS файлы?
- Какой статус у запросов в Network tab?

### 6. Пересоберите фронтенд
```bash
cd /opt/doorsmarket/frontend
rm -rf dist/ node_modules/.vite/
npm run build
```

## Наиболее вероятные причины:

1. **Неправильные пути к ресурсам** - JS/CSS файлы не найдены
2. **Service Worker блокирует загрузку** - кэширует старые версии
3. **Ошибки JavaScript** - приложение падает при инициализации
4. **Проблемы с nginx** - неправильная конфигурация

## Быстрое решение для тестирования:

Создайте простой index.html без PWA:
```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marketing Doors - Test</title>
</head>
<body>
    <div id="root">
        <h1>Тест загрузки</h1>
        <p>Если вы видите это сообщение, HTML загружается корректно</p>
    </div>
    <script>
        console.log('HTML загружен');
        // Проверяем загрузку основных ресурсов
        fetch('/assets/')
            .then(r => console.log('Assets доступны:', r.status))
            .catch(e => console.error('Assets недоступны:', e));
    </script>
</body>
</html>
```

Сохраните как `test.html` в `/opt/doorsmarket/frontend/dist/` и откройте `http://ваш-домен/test.html`
