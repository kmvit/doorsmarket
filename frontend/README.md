# Marketing Doors Frontend

Frontend приложение для системы управления рекламациями Marketing Doors.

## Технологии

- **React 18** с **TypeScript**
- **Vite** - сборщик и dev-сервер
- **Zustand** - state management
- **Tailwind CSS** - стилизация
- **Axios** - HTTP клиент
- **React Router v6** - роутинг
- **Vite PWA Plugin** - PWA функциональность

## Установка

### Требования

- Node.js 18+ 
- npm или yarn

### Шаги установки

1. Перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

4. Настройте переменные окружения в `.env`:
```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Запуск

### Режим разработки

```bash
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:3000`

### Сборка для продакшена

```bash
npm run build
```

Собранные файлы будут в папке `dist/`

### Просмотр собранной версии

```bash
npm run preview
```

## Структура проекта

```
frontend/
├── src/
│   ├── api/              # API клиент
│   │   ├── client.ts     # Axios instance
│   │   └── auth.ts       # Auth API
│   ├── components/       # React компоненты
│   │   ├── common/       # Общие компоненты
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── layout/       # Layout компоненты
│   │       ├── Header.tsx
│   │       ├── Navigation.tsx
│   │       └── Layout.tsx
│   ├── pages/           # Страницы
│   │   ├── Login.tsx
│   │   └── Dashboard.tsx
│   ├── store/           # State management
│   │   └── authStore.ts
│   ├── types/           # TypeScript типы
│   │   └── auth.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/              # Статические файлы
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## Основные возможности

- ✅ Аутентификация (логин/логаут)
- ✅ Защищенные роуты
- ✅ Автоматическое обновление JWT токенов
- ✅ Dashboard с статистикой
- ✅ Адаптивный дизайн
- ✅ PWA поддержка (Service Worker, Manifest)

## Разработка

### Добавление новых страниц

1. Создайте компонент в `src/pages/`
2. Добавьте роут в `src/App.tsx`
3. При необходимости добавьте навигацию в `src/components/layout/Navigation.tsx`

### Добавление API endpoints

1. Создайте файл в `src/api/` для нового ресурса
2. Используйте `apiClient` из `src/api/client.ts`
3. Добавьте типы в `src/types/`

### State Management

Используйте Zustand для управления состоянием. Пример:

```typescript
import { create } from 'zustand'

interface MyStore {
  data: string[]
  setData: (data: string[]) => void
}

export const useMyStore = create<MyStore>((set) => ({
  data: [],
  setData: (data) => set({ data }),
}))
```

## PWA

Приложение настроено как PWA:

- Service Worker автоматически регистрируется
- Кеширование API запросов (NetworkFirst стратегия)
- Кеширование изображений (CacheFirst стратегия)
- Manifest для установки на устройство

## Проблемы и решения

### Ошибка при установке зависимостей

Убедитесь, что используете Node.js 18+:
```bash
node --version
```

### Проблемы с CORS

Убедитесь, что backend настроен для работы с `http://localhost:3000`. Проверьте настройки CORS в Django settings.

### Токены не сохраняются

Проверьте, что localStorage доступен в браузере. В режиме инкогнито могут быть ограничения.

## Лицензия

Proprietary

