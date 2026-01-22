# Libiss POS Marketing Website

Маркетинговая страница для Libiss POS - современная, минималистичная платформа для объяснения продукта и регистрации магазинов.

## Технологии

- **Vite** - сборщик и dev-сервер
- **Vanilla JavaScript** - без фреймворков
- **CSS** - кастомные стили
- **i18n** - поддержка RU/EN

## Разработка

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера
npm run dev

# Сборка для production
npm run build

# Просмотр production сборки
npm run preview
```

## Деплой на Vercel

1. Подключите репозиторий к Vercel
2. Vercel автоматически определит настройки из `vercel.json`
3. Build команда: `npm run build`
4. Output directory: `dist`

### Структура проекта

```
├── index.html          # Главная страница
├── create-store.html   # Регистрация магазина
├── login.html          # Вход в систему
├── office.html         # Личный кабинет
├── gallery.html        # Галерея скриншотов
├── docs.html           # Документация
├── src/                # Исходный код
│   ├── main.js        # Главный скрипт
│   ├── translations.js # Переводы
│   └── styles.css     # Стили
├── public/             # Статические файлы
│   ├── logo.png
│   └── assets/        # Изображения галереи
└── vercel.json        # Конфигурация Vercel
```

## API

Проект использует API: `https://api.libiss.com/api/v1`

## Переменные окружения

Не требуются для базовой работы. Все настройки в коде.

## Лицензия

Private

