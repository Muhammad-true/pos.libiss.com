# Архитектура проекта Libiss POS

## Подход

- **Многостраничное приложение (MPA)** на Vite: каждая страница — отдельный HTML и свой entry‑скрипт.
- **Общие стили** разбиты на секции: base → header → body → footer.
- **Общая логика** (переводы, API, компоненты) лежит в `src/js/lib` и `src/js/components`, скрипты страниц — в `src/js/pages`.

## Структура по папкам

```
pos.libiss.com/
├── index.html
├── office.html
├── add-product.html
├── create-store.html
├── login.html
├── docs.html
├── gallery.html
├── orders.html
├── public/                 # Статика (logo, favicon)
├── docs/                   # Документация API (SHOP_API.md и т.д.)
├── src/
│   ├── styles.css          # Точка входа CSS (импорты base, header, body, footer)
│   ├── css/
│   │   ├── base.css        # Переменные, сброс, .page, .container
│   │   ├── header.css      # Топбар, drawer, меню
│   │   ├── footer.css      # Футер страниц
│   │   └── (body в styles.css)
│   ├── js/
│   │   ├── lib/            # Общая логика
│   │   │   ├── api.js      # Единый клиент API (base URL, get/post/patch, 401)
│   │   │   └── translations.js
│   │   ├── components/     # Переиспользуемые JS-компоненты
│   │   │   └── app-header.js
│   │   └── pages/          # Скрипты страниц (один файл — одна страница)
│   │       ├── main.js
│   │       ├── office.js
│   │       ├── add-product.js
│   │       ├── create-store.js
│   │       ├── login.js
│   │       ├── docs.js
│   │       ├── gallery.js
│   │       └── orders-main.js
│   ├── components/        # Vue-компоненты (OrderCard и т.д.)
│   │   └── OrderCard.vue
│   └── views/              # Vue-страницы/виджеты
│       └── OrdersList.vue
├── vite.config.js
└── package.json
```

## Правила

1. **Стили**
   - Вносить изменения в нужную секцию: header → `css/header.css`, футер → `css/footer.css`, контент → блок BODY в `styles.css`.

2. **Скрипты страниц** (`src/js/pages/`)
   - Импортируют общие стили: `import "../styles.css"` (через один уровень вверх из `pages/`).
   - Используют переводы: `import { translations } from "../lib/translations.js"`.
   - Используют общий апбар: `import { AppHeader } from "../components/app-header.js"`.

3. **Общая логика** (`src/js/lib/`)
   - `api.js` — единый клиент: `api.get()`, `api.post()`, `api.patch()`, `api.uploadImage()`, `api.resolveAssetUrl()`, обработка 401 (редирект на логин). Base URL из `VITE_API_URL` (.env).
   - `translations.js` — словари RU/EN, без зависимостей от страниц.

4. **Компоненты** (`src/js/components/`)
   - Только переиспользуемые модули (например, `app-header.js`), без Vue.

5. **Vue**
   - Подключён для страницы заказов: точка входа `src/js/pages/orders-main.js`, компоненты в `src/components/` (OrderCard.vue), страницы/виджеты в `src/views/` (OrdersList.vue).
   - Остальные страницы (кабинет, логин, создание магазина/товара, доки) — vanilla JS для простоты и скорости разработки. При желании новые разделы можно делать на Vue (например, перенести список товаров или заказов в отдельные Vue-страницы).

6. **HTML**
   - Подключение скрипта страницы: `src="/src/js/pages/имя.js"` (или через алиас, если настроен в Vite).

## Работа с API

- Все запросы к бэкенду идут через `src/js/lib/api.js`.
- **Base URL:** задаётся в `.env` как `VITE_API_URL` (по умолчанию `https://api.libiss.com/api/v1`). Пример для локального бэкенда: скопировать `.env.example` в `.env` и указать `VITE_API_URL=http://localhost:3000/api/v1`.
- **Методы:** `api.get(path, { token })`, `api.post(path, body, { token })`, `api.patch(path, body, { token })`, `api.uploadImage(folder, file, { token })`, `api.resolveAssetUrl(path)` для полных URL картинок.
- **401:** при истечении/невалидном токене (кроме запросов к `/auth/login`) клиент очищает токен и перенаправляет на `/login.html`.
- **Ошибки:** при `!response.ok` API-модуль возвращает `{ error: true, status, message }`; страницы обрабатывают это и показывают сообщение пользователю.

## Переменные окружения

- Файл `.env.example` содержит пример `VITE_API_URL`. Скопируйте в `.env` и при необходимости измените URL API для dev/stage.

## Сборка

- `npm run dev` — разработка.
- `npm run build` — сборка в `dist/`, все entry из `vite.config.js` (index, office, add-product, …).

## Импорты (примеры)

- Из `src/js/pages/office.js`:  
  `import { api } from "../lib/api.js";`  
  `import { AppHeader } from "../components/app-header.js";`  
  `import { translations } from "../lib/translations.js";`  
  `import "../../styles.css";`
- Из `src/js/components/app-header.js`:  
  `import { translations } from "../lib/translations.js";`
- Из `src/js/pages/orders-main.js`:  
  `import OrdersList from "../../views/OrdersList.vue";`  
  `import "../../styles.css";`
