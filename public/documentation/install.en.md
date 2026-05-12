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
| POS shows “No connection to local server” right after install | See **6.1** below |

---

## 6.1. No local API right after `LibbisPOS_Setup.exe`

**Note:** **`magazin_api.exe` is not a Windows Service** in `services.msc`. It runs as a normal process (hidden after setup / from Run key **`LibbisLocalAPI`** if you kept “Start API on Windows logon”), or start it manually. The Start-menu folder includes **“Local API (console — debug)”** to see errors in a window.

In **Services**, check **MySQL** (e.g. **`MySQL80`**). The installer now runs **`sc start`** when MySQL was **already** installed too (previously that step could be skipped).

1. **Task Manager** — is **`magazin_api.exe`** running?
2. On the **same PC**, open **`http://127.0.0.1:8080/health`** — expect `"status":"ok"`.
3. **API URL on terminal 1:** prefer **`http://127.0.0.1:8080/api`** or **`http://localhost:8080/api`**. Use a LAN IP like `192.168.1.100` only if that IP is **this machine** (`ipconfig`).
4. Logs: **`Documents\LibbisPOS\logs`**, **`setup_db.log`** next to the server binaries.
5. Older installers could **skip** `setupDatabase.exe` when `config.json` / `secrets.enc` were already bundled — credentials then did not match your MySQL. Fixed in the repo via a **`.db_initialized`** marker. **Workaround:** run **`setup_db_hidden.vbs`** in the server folder as Administrator, or reinstall with a freshly built setup.

---

## 7. Support

Contacts on **pos.libiss.com** and onboarding emails.
