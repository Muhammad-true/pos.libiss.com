# API: всё, что связано с магазином

Документация по эндпоинтам и данным, связанным с магазином: владелец магазина (shop_owner), POS, клиенты, лицензии, регистрация.

**Базовый URL:** `https://api.libiss.com/api/v1` (или ваш домен API).

---

## Содержание

1. [Аутентификация](#аутентификация)
2. [Эндпоинты владельца магазина (`/shop/*`)](#эндпоинты-владельца-магазина-shop)
3. [POS-эндпоинты](#pos-эндпоинты)
4. [Загрузка и ИИ (владелец)](#загрузка-и-ии-владелец)
5. [Подписчики магазина](#подписчики-магазина)
6. [Публичные эндпоинты магазинов](#публичные-эндпоинты-магазинов)
7. [Регистрация магазина и лицензии](#регистрация-магазина-и-лицензии)
8. [Регистрация/обновление клиента (POS)](#регистрацияобновление-клиента-pos)
9. [Модели данных](#модели-данных)
10. [Обновления и скачивание (404)](#обновления-и-скачивание)

---

## Аутентификация

- **Вход:** `POST /auth/login` — тело `{ "phone": "+992...", "password": "..." }`. В ответе — `token`, `user` (в т.ч. `user.role.name`: `shop_owner`, `admin` и т.д.).
- Эндпоинты владельца и POS требуют заголовок: **`Authorization: Bearer <token>`**.
- Доступ к маршрутам `/shop/*` и `/pos/*` проверяется middleware **AdminOrShopOwnerRequired** (роли `admin` или `shop_owner`).
- Магазин владельца определяется по полю **`owner_id`** пользователя в БД (один пользователь — один магазин).

---

## Эндпоинты владельца магазина (`/shop/*`)

Префикс: **`/api/v1/shop`**. Все запросы с Bearer-токеном.

### Товары

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/products/` | Список товаров своего магазина |
| GET | `/products/:id` | Один товар по ID (только своего магазина) |
| POST | `/products/` | Создать товар |
| PUT | `/products/:id` | Обновить товар |
| DELETE | `/products/:id` | Удалить товар |

**GET `/products/`**  
Query: `category` (uuid), `gender` (male|female|unisex), `search`, `sort_by` (name|price|created_at), `sort_order` (asc|desc), `page`, `limit`.

**Ответ (список):**
```json
{
  "success": true,
  "data": {
    "products": [ "<ProductResponse>" ],
    "total": 0,
    "page": 1,
    "limit": 20
  },
  "message": "Shop products loaded successfully"
}
```

**Ответ (один товар):** `{ "success": true, "data" | "product": "<ProductResponse>" }`

**Тело POST/PUT (ProductRequest):**
```json
{
  "name": "string (обязательно)",
  "description": "string",
  "gender": "male | female | unisex (обязательно)",
  "categoryId": "uuid (обязательно)",
  "brand": "string",
  "variations": [
    {
      "sizes": ["string"],
      "colors": ["string"],
      "price": 0,
      "originalPrice": 0,
      "discount": 0,
      "imageUrls": [],
      "imageUrlsByColor": { "цвет": ["url1", "url2"] },
      "stockQuantity": 0,
      "sku": "string",
      "barcode": "string"
    }
  ]
}
```

---

### Категории (только изменение/удаление)

Создание категорий только у супер-админа. Владелец может только править и удалять.

| Метод | Путь | Описание |
|-------|------|----------|
| PUT | `/categories/:id` | Обновить категорию |
| DELETE | `/categories/:id` | Удалить категорию |

**Тело PUT (CategoryRequest):**
```json
{
  "name": "string (обязательно)",
  "description": "string",
  "iconUrl": "string",
  "parentId": "uuid | null",
  "sortOrder": 0,
  "isActive": true
}
```

---

### Заказы (только заказы своего магазина)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/orders/` | Список заказов с товарами магазина |
| GET | `/orders/:id` | Один заказ по ID |
| PUT | `/orders/:id/status` | Обновить статус заказа |

**GET `/orders/`**  
Query: `page`, `limit`.

**Ответ (список):**
```json
{
  "success": true,
  "data": {
    "orders": [ "<OrderResponse>" ],
    "pagination": { "page", "limit", "total", "totalPages" }
  },
  "message": "Заказы получены успешно"
}
```

**Тело PUT `/orders/:id/status`:**
```json
{
  "status": "pending | confirmed | preparing | inDelivery | delivered | completed | cancelled"
}
```

**Ответ:** `{ "success": true, "data": "<AdminOrderResponse>", "message": "..." }`

---

### Клиенты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/customers/` | Список клиентов (пользователи с ролью user) |
| GET | `/customers/:id/orders` | Заказы клиента |

**GET `/customers/`**  
Query: `page`, `limit`.

**Ответ:** `{ "success": true, "data": { "customers": [ "<UserResponse>" ], "pagination": { ... } }, "message": "..." }`

---

### Логотип магазина

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/:id/logo` | Загрузить логотип магазина |

- **`:id`** — ID магазина (должен принадлежать текущему пользователю).
- **Тело:** `multipart/form-data`, поле **`logo`** — файл изображения.

---

## POS-эндпоинты

Доступны по двум путям (одинаковая логика):

- **`/api/v1/shop/pos/*`**
- **`/api/v1/pos/*`**

Требуется **Bearer**-токен и роль **admin** или **shop_owner**. Магазин берётся по `owner_id` пользователя.

### Массовая загрузка товаров

**POST** `/shop/pos/products/bulk-upload` или **POST** `/pos/products/bulk-upload`

**Тело (BulkUploadRequest):**
```json
{
  "products": [
    {
      "name": "string (обязательно)",
      "description": "string",
      "brand": "string",
      "categoryId": "uuid (обязательно)",
      "gender": "male | female | unisex (обязательно)",
      "variations": [
        {
          "sizes": ["string"],
          "colors": ["string"],
          "price": 0,
          "originalPrice": 0,
          "discount": 0,
          "stockQuantity": 0,
          "sku": "string",
          "barcode": "string",
          "imageUrls": [],
          "imageUrlsByColor": {}
        }
      ]
    }
  ]
}
```

**Ответ:** `{ "success", "totalItems", "created", "updated", "failed", "errors?", "productIds?" }`

---

### Синхронизация продаж (списание со склада)

**POST** `/shop/pos/sales/sync` или **POST** `/pos/sales/sync`

**Тело (SaleSyncRequest):**
```json
{
  "sales": [
    {
      "variationId": "uuid (обязательно)",
      "quantity": 1,
      "size": "string",
      "color": "string",
      "price": 0,
      "saleDate": "RFC3339"
    }
  ]
}
```

**Ответ:** `{ "success", "totalSales", "processed", "failed", "errors?", "updatedStock?" }`  
`updatedStock`: `{ "variationId", "oldQuantity", "newQuantity" }[]`

---

### Остатки товаров

**GET** `/shop/pos/products/stock` или **GET** `/pos/products/stock`

Query: `in_stock` (опционально, например `true` — только с остатком > 0).

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "variationId": "uuid",
      "productId": "uuid",
      "productName": "string",
      "sku": "string",
      "barcode": "string",
      "sizes": [],
      "colors": [],
      "stockQuantity": 0,
      "isAvailable": true
    }
  ],
  "count": 0
}
```

---

### Обновление остатка одной вариации

**PUT** `/shop/pos/products/:variationId/stock` или **PUT** `/pos/products/:variationId/stock`

**Тело:** `{ "stockQuantity": 0 }` (число ≥ 0).

**Ответ:** `{ "success": true, "data": { "variationId", "oldQuantity", "newQuantity" } }`

---

## Загрузка и ИИ (владелец)

Группа **`/api/v1/upload`**. Нужны **AuthRequired** и **AdminOrShopOwnerRequired**.

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/photo-modes` | Список режимов фото |
| GET | `/ai-prompts` | Пресеты промптов для ИИ |
| POST | `/ai-generate` | Генерация изображений по ИИ (формат — в upload-контроллере) |

---

## Подписчики магазина

Группа **`/api/v1/shops`** (защищённые маршруты, любой авторизованный пользователь). Владелец вызывает для **своего** магазина.

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/:id/subscribers` | Список подписчиков магазина |

**GET** `/:id` — ID магазина. Ответ определяется контроллером (список подписчиков/клиентов).

Дополнительно для клиентов и владельца:  
GET `/shops/` — список магазинов; GET `/shops/my` — магазины клиента с бонусами; POST `/shops/:id/subscribe`, DELETE `/shops/:id/subscribe` — подписка/отписка; GET `/shops/:id/bonus`, GET `/shops/:id/bonus/history` — бонусы и история.

---

## Публичные эндпоинты магазинов

Без токена (или с токеном для проверки подписки):

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/shops/list` | Список магазинов с информацией о подписке |
| GET | `/shops/:id` | Информация о магазине |
| GET | `/shops/:id/products` | Товары магазина (фильтрация) |
| GET | `/shops/:id/subscription/check` | Проверка подписки (нужна авторизация) |

---

## Регистрация магазина и лицензии

### Регистрация магазина (публично)

**POST** `/shop-registration/register` — регистрация магазина (тело — в ShopRegistrationController).

**POST** `/shop-registration/subscribe` — подписка (создание лицензии после оплаты).

**POST** `/shop-registration/webhook/lemonsqueezy` — webhook Lemon Squeezy.

### Лицензии (публично)

- **POST** `/licenses/check` — проверка статуса лицензии.
- **POST** `/licenses/activate` — активация/переактивация (Flutter: shopId + licenseKey).
- **POST** `/licenses/deactivate` — деактивация для смены устройства.

### Админ: лицензии магазинов

Группа **`/api/v1/admin/licenses`** (только admin/super_admin):

- GET `/` — список лицензий.
- GET `/:id` — одна лицензия.
- POST `/` — создание лицензии.
- PUT `/:id` — обновление.
- DELETE `/:id` — удаление (остановка лицензии).
- POST `/:id/extend` — продление (тело: `{ "months": 12 }`).
- POST `/shops/:shopId/generate` — генерация лицензии для магазина (тело: subscriptionType, paymentAmount, paymentCurrency, paymentProvider, notes и т.д.).

---

## Регистрация/обновление клиента (POS)

Используется программой магазина (POS) для бонусов. Подробно описано в **API_SHOP_POS.md**.

**POST** `/shop/customers/register` (публичный, с проверкой shopId).

**Тело:**
```json
{
  "shopId": "uuid",
  "phone": "+992901234567",
  "qrCode": "string (при первой регистрации)",
  "bonusAmount": 0
}
```

---

## Модели данных

### ProductResponse (кратко)

- `id`, `name`, `description`, `gender`, `categoryId`, `category`, `brand`, `isAvailable`, `ownerId`, `owner`, `shop`, `variations`, `createdAt`, `updatedAt`.
- Вариация: `sizes`, `colors`, `price`, `originalPrice`, `discount`, `imageUrls`, `imageUrlsByColor`, `stockQuantity`, `sku`, `barcode`, `isAvailable`.

### OrderResponse

- `id`, `status`, `total_amount`, `items_subtotal`, `delivery_fee`, `currency`, `shipping_address`, `payment_method`, `shipping_method`, `payment_status`, `recipient_name`, `phone`, `notes`, `order_items`, `desired_at`, `confirmed_at`, `cancelled_at`, `created_at`, `updated_at`.
- **AdminOrderResponse** дополнительно: `order_number`, `user`, `shop_owner`.

### OrderItemResponse

- `id`, `quantity`, `price`, `size`, `color`, `variation_id`, `variation`, `subtotal`.

### UserResponse (клиент/владелец)

- `id`, `name`, `email`, `phone`, `avatar`, `role`, `isActive`, `addresses`, `createdAt`, `updatedAt` и др.

### CategoryResponse

- `id`, `name`, `description`, `iconUrl`, `parentId`, `productCount`, `isActive`, `sortOrder`, `subcategories`, `createdAt`, `updatedAt`.

### PaginationInfo

- `page`, `limit`, `total`, `totalPages`.

---

## Сводная таблица: владелец магазина

| Группа | Метод | Путь | Назначение |
|--------|--------|------|------------|
| Товары | GET | `/shop/products/` | Список своих товаров |
| Товары | GET | `/shop/products/:id` | Один товар |
| Товары | POST | `/shop/products/` | Создать товар |
| Товары | PUT | `/shop/products/:id` | Обновить товар |
| Товары | DELETE | `/shop/products/:id` | Удалить товар |
| Категории | PUT | `/shop/categories/:id` | Обновить категорию |
| Категории | DELETE | `/shop/categories/:id` | Удалить категорию |
| Заказы | GET | `/shop/orders/` | Заказы магазина |
| Заказы | GET | `/shop/orders/:id` | Один заказ |
| Заказы | PUT | `/shop/orders/:id/status` | Статус заказа |
| Клиенты | GET | `/shop/customers/` | Список клиентов |
| Клиенты | GET | `/shop/customers/:id/orders` | Заказы клиента |
| Магазин | POST | `/shop/:id/logo` | Загрузить логотип |
| POS | POST | `/shop/pos/products/bulk-upload` | Массовая загрузка товаров |
| POS | POST | `/shop/pos/sales/sync` | Синхронизация продаж |
| POS | GET | `/shop/pos/products/stock` | Остатки |
| POS | PUT | `/shop/pos/products/:variationId/stock` | Обновить остаток вариации |

Альтернативный префикс для POS: **`/pos/`** вместо **`/shop/pos/`** (те же методы и тела запросов).

---

## Обновления и скачивание

### Список обновлений

| Роль | Эндпоинт | Метод |
|------|----------|--------|
| Админ / супер-админ | `https://api.libiss.com/api/v1/admin/updates/` | GET |
| Владелец магазина | `https://api.libiss.com/api/v1/shop/updates/` | GET |

Оба возвращают один и тот же формат: `{ "success": true, "data": [ ... ] }` — массив записей с полями `id`, `platform`, `version`, `fileName`, `fileUrl`, `releaseNotes`, `createdAt` и т.д.

Опционально можно передать **`?platform=<platform>`** — тогда вернётся только список по этой платформе. Значения: `server`, `android`, `windows`, `shop`.

### Скачивание

Скачивание доступно и для владельца магазина. Отдельного эндпоинта для «скачать» нет.

- Файлы отдаются **статикой** на API: в `routes.go` задано `r.Static("/updates", "/app/updates")`.
- В каждой записи списка приходит **`fileUrl`**, например: `/updates/server/server_1.0.9_xxx.zip`.
- Если `fileUrl` не начинается с `http`, к нему дописывается базовый URL API — получается полный URL вида `https://api.libiss.com/updates/server/server_1.0.9_xxx.zip`.
- По этому URL идёт обычный **GET** — браузер скачивает файл.

**Итого:** список для владельца магазина — по `GET /api/v1/shop/updates/`; скачать можно по URL из поля `fileUrl` (например, `https://api.libiss.com/updates/...`).

### Возможные причины 404 при скачивании файлов обновлений

**Файл действительно отсутствует в контейнере**

Запись в БД есть (поэтому в админке/API есть ссылка на этот URL), а файл:
- не был загружен на этот сервер,
- или был удалён (скрипт очистки, ручное удаление),
- или загружался на другой инстанс (другой сервер/контейнер без общего хранилища).

**Том (volume) для `/app/updates`**

В Docker создаётся директория `/app/updates`, но если при деплое том не монтируется или монтируется пустая директория, при перезапуске контейнера всё, что было записано в `/app/updates`, пропадает. Тогда старые файлы (в т.ч. `server_1.0.9_...zip`) после рестарта дают 404.

**Разные окружения**

Файл загружали в одном окружении (например, локально или другой хост), а запрос идёт на `https://api.libiss.com` — там своего файла нет, отсюда 404.

**Права доступа**

Файл есть на диске, но с правами/владельцем, при которых процесс приложения не может его прочитать — веб‑сервер в таких случаях часто отдаёт 404.
