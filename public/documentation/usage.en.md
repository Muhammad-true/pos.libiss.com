# Libiss POS — User Guide

How cashiers and owners use POS with the local server and cloud. Screens may vary slightly by build.

---

## 1. First launch

1. Open **Libiss POS**.
2. Set the **local API base URL** (see Installation guide): terminal 1 often `http://localhost:8080/api`; others use `http://<server-ip>:<port>/api`.
3. Enter **store ID** and **subscription key** from your account.
4. Wait for initial sync if internet is available.

---

## 2. Sales

- **New sale** — pick products, **variations** (size/color, etc.), quantities, discounts.
- **Catalog / search** — stock comes from the local server.
- **Complete sale** — payment, receipt print or share if hardware is configured.

Stock updates on the server; cloud sync follows your deployment rules.

---

## 3. Products and variations

- **Product** — name, category, optional photo.
- **Variation** — sellable SKU with **price** and **stock**.
- Bulk catalog work is usually done in the **owner web office** or **admin**; the till focuses on checkout.

---

## 4. Offline and sync

- Short outages: keep selling against the **local server**.
- When internet returns, **sync** pushes/pulls data per your version’s logic.

Ask support about long offline limits if needed.

---

## 5. Owner account (pos.libiss.com)

Typical areas: stores, orders (if enabled), products, reports (warehouse, cashiers, debtors), **Software updates** (same cloud files as public docs).

Deep server policies may live on **admin.libiss.com** or local admin — follow your contract links.

---

## 6. App updates

Use the in-app **Updates** section or startup check when online, or download manually from **pos.libiss.com/docs.html**.

Schedule downtime when updating the **server** package.

---

## 7. Security

Use separate roles (**admin** vs **cashier**). Rotate passwords when staff leave.

---

## 8. Peripherals

Scanners, receipt printers, scales depend on OS drivers — follow hardware vendor docs or Libiss support for your kit.

---

## 9. Support tickets

Include: POS version, server version, screenshot, **time** of error, **store ID** (not the secret key).
