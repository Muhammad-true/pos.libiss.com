# API Contract v2: Остатки по магазинам и перемещения

Документ задаёт единый контракт для:

- `libiss_local_serverApi` (локальный API) — **источник правды по остаткам и перемещениям**;
- `libiss_pos_app` (POS) — касса/склад/перемещения;
- `pos.libiss.com_site` — кабинет владельца (просмотр точек, базовые операции).

Цель: реализовать сценарий **“нет размера в магазине A → увидеть наличие в B/C → запросить перенос → принять → продать”**.

> Совместимость: `v1` эндпоинты не трогаем. Новая функциональность идёт через `v2` и включается feature-flags.

## Связка с текущим стилем API

Чтобы не ломать текущие клиенты и документацию:

- существующие пути в стиле `/api/v1/shop/pos/*` и `/api/products/*` остаются без изменений;
- новые multi-store возможности вводятся через `/api/v2/*`;
- при необходимости можно добавить proxy-алиасы:
  - `/api/v1/shop/pos/transfers/*` -> `/api/v2/transfers/*`
  - `/api/v1/shop/pos/inventory/*` -> `/api/v2/inventory/*`

Рекомендуемый rollout: сначала использовать только `/api/v2/*` в новых экранах POS, без изменения старых экранов.

---

## 0) Общие правила

### Базовый префикс

- `GET/POST/PATCH ... /api/v2/...`

### Аутентификация

- `Authorization: Bearer <jwt>`
- License-check middleware остаётся как есть.

### Идентификаторы

- `ownerId`: UUID (на глобальном сервере) или строковый идентификатор, который вы уже используете как `global_clothing_id`.
- `storeId` / `locationId`: идентификатор точки/локации в локальной базе (INT) **или** UUID — выберите один формат и придерживайтесь его в реализации.

**Рекомендация:** в локальном API хранить `locationId` как `INT`, а дополнительно хранить `global_store_uuid` для связки с глобальным сервером.

### Заголовки/контекст магазина

Для multi-store запросов клиент должен передавать текущую точку:

- `x-store-id: <storeId>` (обязательно для списаний и приемки)

Fallback (для legacy):

- если `x-store-id` отсутствует → работает legacy режим (single-store) и используются текущие таблицы/остатки как раньше.

### Формат ответов

Успех:

```json
{ "success": true, "data": { } }
```

Ошибка:

```json
{
  "success": false,
  "error": { "code": "string", "message": "string", "details": {} }
}
```

### Коды ошибок (рекомендуемые)

- `AUTH_REQUIRED`
- `FORBIDDEN`
- `STORE_CONTEXT_REQUIRED`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `INSUFFICIENT_STOCK`
- `TRANSFER_INVALID_STATUS`
- `LIMIT_EXCEEDED`
- `CROSS_OWNER_FORBIDDEN`
- `FEATURE_DISABLED`

---

## 1) Справочник локаций (магазинов)

### GET `/api/v2/stores`

Список магазинов, доступных текущему пользователю (владелец/админ).

Ответ:

```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "storeId": 1,
        "name": "Магазин 1",
        "address": "…",
        "isActive": true
      }
    ]
  }
}
```

---

## 2) Остатки по точкам

### 2.1 GET `/api/v2/inventory/availability`

Показывает наличие конкретной вариации (размер/цвет) по магазинам владельца.

Query:

- `variationId` (обязательное) — локальный `product_variations.id`

Ответ:

```json
{
  "success": true,
  "data": {
    "variationId": 123,
    "byStore": [
      { "storeId": 1, "qty": 0 },
      { "storeId": 2, "qty": 3 },
      { "storeId": 3, "qty": 1 }
    ]
  }
}
```

Ошибки:

- `NOT_FOUND` если вариация не существует.

### 2.2 GET `/api/v2/inventory/balance`

Возвращает остаток по текущей точке (по `x-store-id`).

Query (опционально):

- `q` (поиск)
- `categoryId`
- `inStock=true|false`
- `page`, `limit`

Ответ:

```json
{
  "success": true,
  "data": {
    "storeId": 1,
    "items": [
      {
        "variationId": 123,
        "productId": 45,
        "productName": "Футболка",
        "size": "M",
        "color": "Black",
        "qty": 7
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 321 }
  }
}
```

Ошибки:

- `STORE_CONTEXT_REQUIRED` если отсутствует `x-store-id` и включён `ff_multi_store_enabled`.

### 2.3 POST `/api/v2/inventory/bootstrap-legacy`

Одноразовая техническая миграция: переносит `product_variations.stock` в `inventory_balances` выбранного магазина.

Body:

```json
{
  "storeId": 1,
  "overwrite": false
}
```

Поля:

- `storeId` (обязательно) — магазин, для которого создаются/заполняются `inventory_balances`.
- `overwrite` (опционально, default `false`) — если `true`, перезаписывает `qty` из legacy stock; если `false`, заполняет только нулевые строки.

Ответ:

```json
{
  "success": true,
  "data": {
    "storeId": 1,
    "locationId": 10,
    "overwrite": false,
    "summary": {
      "totalRows": 1200,
      "rowsInStock": 743,
      "totalQty": 9512
    }
  }
}
```

---

## 3) Перемещения (Transfer)

Перемещение — это документ, который переводит остаток **между двумя точками**.

### 3.1 Статусы

- `requested` — создан запрос на перемещение.
- `approved` — магазин-источник подтвердил.
- `in_transit` — товар в пути (опционально, можно пропустить).
- `received` — магазин-получатель принял (остаток зачислен).
- `rejected` — магазин-источник отклонил.
- `cancelled` — инициатор отменил до приемки.

**Минимальный рабочий поток:** `requested -> approved -> received` (+ `rejected`, `cancelled`).

### 3.2 POST `/api/v2/transfers`

Создать запрос на перемещение.

Headers:

- `x-store-id` = магазин-получатель (откуда делаем запрос, куда нужен товар)

Body:

```json
{
  "fromStoreId": 2,
  "toStoreId": 1,
  "items": [
    { "variationId": 123, "qty": 1 }
  ],
  "comment": "Нужен размер M"
}
```

Ответ:

```json
{
  "success": true,
  "data": {
    "transferId": 9001,
    "status": "requested",
    "fromStoreId": 2,
    "toStoreId": 1,
    "items": [
      { "variationId": 123, "qty": 1 }
    ],
    "createdAt": "2026-05-08T06:00:00Z"
  }
}
```

Ошибки:

- `VALIDATION_ERROR` (qty <= 0, пустой items, from=to).
- `CROSS_OWNER_FORBIDDEN` (если разные владельцы).
- `FEATURE_DISABLED` (если `ff_store_transfer_enabled = false`).

### 3.3 GET `/api/v2/transfers`

Список перемещений.

Query:

- `direction=incoming|outgoing|all` (по отношению к `x-store-id`)
- `status=requested|approved|received|rejected|cancelled` (опционально)
- `page`, `limit`

Ответ:

```json
{
  "success": true,
  "data": {
    "storeId": 1,
    "transfers": [
      {
        "transferId": 9001,
        "status": "requested",
        "fromStoreId": 2,
        "toStoreId": 1,
        "itemsCount": 1,
        "createdAt": "2026-05-08T06:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 10 }
  }
}
```

### 3.4 GET `/api/v2/transfers/:transferId`

Детали перемещения.

Ответ:

```json
{
  "success": true,
  "data": {
    "transferId": 9001,
    "status": "requested",
    "fromStoreId": 2,
    "toStoreId": 1,
    "items": [
      {
        "variationId": 123,
        "qty": 1,
        "productName": "Футболка",
        "size": "M",
        "color": "Black"
      }
    ],
    "comment": "Нужен размер M",
    "createdBy": { "userId": 11, "name": "Кассир А" },
    "createdAt": "2026-05-08T06:00:00Z",
    "approvedBy": null,
    "receivedBy": null
  }
}
```

### 3.5 PATCH `/api/v2/transfers/:transferId/approve`

Подтвердить перемещение (делает магазин-источник).

Headers:

- `x-store-id` = `fromStoreId`

Body (опционально):

```json
{ "comment": "Ок, отложили" }
```

Условия:

- текущий статус должен быть `requested`;
- в источнике должен быть достаточный остаток (на момент approve).

Ошибки:

- `TRANSFER_INVALID_STATUS`
- `INSUFFICIENT_STOCK`

Ответ:

```json
{ "success": true, "data": { "transferId": 9001, "status": "approved" } }
```

### 3.6 PATCH `/api/v2/transfers/:transferId/reject`

Отклонить перемещение (источник).

Headers:

- `x-store-id` = `fromStoreId`

Body:

```json
{ "reason": "Нет в наличии, ошибка" }
```

Ответ:

```json
{ "success": true, "data": { "transferId": 9001, "status": "rejected" } }
```

### 3.7 PATCH `/api/v2/transfers/:transferId/receive`

Принять перемещение (получатель).

Headers:

- `x-store-id` = `toStoreId`

Body (опционально):

```json
{ "comment": "Получили" }
```

Условия:

- статус должен быть `approved` (или `in_transit`, если используется);
- при приемке происходит фактическое списание у источника и зачисление получателю **атомарно**.

Ответ:

```json
{ "success": true, "data": { "transferId": 9001, "status": "received" } }
```

Ошибки:

- `TRANSFER_INVALID_STATUS`
- `INSUFFICIENT_STOCK` (если за время пути остаток источника изменился и dual-write не обеспечил блокировки).

---

## 4) Рекомендации по консистентности (чтобы не было рассинхрона)

Минимальные требования:

- операции `approve` и `receive` должны использовать блокировки/транзакцию (MySQL `SELECT ... FOR UPDATE`);
- для `receive` лучше списывать остаток **в момент receive**, чтобы не “замораживать” товар надолго;
- но если важно “резервировать” при approve — тогда вводим `reserved_qty` или отдельную таблицу резервов.

---

## 5) Совместимость с legacy

Правила:

- если `ff_multi_store_enabled = false` → `v2` может отвечать `FEATURE_DISABLED`, а `v1` работает как раньше;
- если `ff_multi_store_enabled = true`, но клиент не передаёт `x-store-id`:
  - либо `STORE_CONTEXT_REQUIRED`,
  - либо fallback в legacy location (только для старых клиентов).

**Рекомендация:** сделать fallback только для `v1`, а `v2` строго требовать `x-store-id`.

---

## 6) Минимальные требования к UI (POS)

- карточка товара/вариации: показать `qty here` + “в других магазинах” (список);
- кнопка `Запросить перемещение`;
- экран “Входящие” и “Исходящие” заявки;
- кнопки `Подтвердить` (источник) и `Принять` (получатель).

---

## 7) Что нужно уточнить перед реализацией (1 раз)

1) Хранение идентификаторов: `storeId` в локальной БД — `INT` или `UUID`?  
2) Перемещения: разрешаем “через центральный склад” или делаем прямые `store->store`?  
3) Резервирование: нужно ли резервировать остаток на approve или достаточно списания на receive?

После выбора этих 3 пунктов контракт можно считать окончательным.
