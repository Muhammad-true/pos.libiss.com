# Libiss POS — Installation Guide

For store owners and IT admins. **Latest installers** are always on **https://pos.libiss.com/docs.html** (“Latest builds (cloud)”) and in the account (**Software updates**).

---

## 1. Architecture

- **Terminal 1 (server PC)** — runs the **local Node API** and **MySQL**. POS app is installed on the same machine or by the same installer step.
- **Terminals 2, 3, …** — **POS app only** (Windows or Android), connecting over the **LAN** (Wi‑Fi or Ethernet).
- **Cloud (api.libiss.com)** — licensing, catalogs, published installers, sync as configured.

The local server **will not start without MySQL**. Other terminals **cannot work** without the server on terminal 1.

---

## 2. What to download

| Case | Artifact |
|------|------------|
| New PC for terminal 1 | Full installer (server + MySQL + POS) **or** the pair your support team recommends |
| MySQL already installed | **Server** (.zip) + **Windows** POS (.exe) from cloud |
| Extra Windows tills | **Windows** POS (.exe) only |
| Android till | **Android** (.apk) |

Google Drive links on the docs page may lag behind — prefer **cloud** downloads.

---

## 3. Typical install sequence

1. Install **MySQL** if needed. Keep the DB user password for the server wizard.
2. Run the **terminal 1 installer** and follow prompts (server, DB paths, shortcuts).
3. Confirm the **local API service** is running.
4. Launch **Libiss POS** on terminal 1. Set API base URL, often `http://localhost:8080/api` (confirm port/path with your build or support).
5. Enter **store ID** and **subscription key** from your **pos.libiss.com** account.
6. On **other terminals**, install POS only and set server URL to `http://<terminal1-LAN-IP>:<port>/api`.

---

## 4. Network without a router

Use **Windows Mobile Hotspot** on the server PC. Other devices join that Wi‑Fi. Use the hotspot interface IP in POS (often `192.168.137.1`; verify with `ipconfig`). Allow the server port in **Windows Firewall**.

---

## 5. Updates

Admins upload builds per platform; they become the **latest** for `/updates/latest`. The POS app can **check for updates** when online; OS security may still require user approval to install.

Update the **local server** with a new `server_x.y.z.zip` using your release or support procedure.

---

## 6. Troubleshooting

| Issue | Check |
|-------|--------|
| Server won’t start | MySQL running, correct DB credentials in config |
| Remote till offline | Same LAN, ping server IP, firewall |
| Invalid store/key | Copy/paste store ID and key from account |

---

## 7. Support

Contacts on **pos.libiss.com** and onboarding emails.
