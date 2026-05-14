import { translations } from "../lib/translations.js";
import { AppHeader } from "../components/app-header.js";
import { api } from "../lib/api.js";
import { initOfficePosPanels } from "./office-pos-panels.js";
import "../../styles.css";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
const STORAGE_KEY = "libiss-pos-lang";
const SEEN_ORDERS_KEY = "officeSeenOrderIds";
const SELECTED_SHOP_KEY = "officeSelectedShopId";
const ORDERS_POLL_MS = 90 * 1000;
const DEFAULT_LANG = "ru";
let lastFetchedOrderIds = [];
let ordersPollTimer = null;
let currentShopsList = [];

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const welcome = document.querySelector("[data-office-welcome]");
const storesBody = document.querySelector("[data-office-stores-body]");
const storeName = document.querySelector("[data-office-store-name]");
const storeId = document.querySelector("[data-office-store-id]");
const storePlan = document.querySelector("[data-office-store-plan]");
const storeSubscribed = document.querySelector("[data-office-store-subscribed]");
const licensesBody = document.querySelector("[data-office-licenses-body]");
const trialButton = document.querySelector("[data-trial-btn]");
const trialStatus = document.querySelector("[data-trial-status]");
const logoutButton = document.querySelector("[data-logout]");
const addProductButton = document.querySelector("[data-office-add-product]");
const logoSection = document.querySelector("[data-office-logo-section]");
const logoInput = document.querySelector("[data-office-logo-input]");
const logoImg = document.querySelector("[data-office-logo-img]");
const logoPlaceholder = document.querySelector("[data-office-logo-placeholder]");
const logoRemove = document.querySelector("[data-office-logo-remove]");
const logoStatus = document.querySelector("[data-office-logo-status]");
const verificationBanner = document.querySelector("[data-office-verification-banner]");
const localSyncLine = document.querySelector("[data-office-local-sync]");

const detectLang = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  const browser = navigator.language.toLowerCase();
  return browser.startsWith("ru") ? "ru" : "en";
};

const applyLang = (lang) => {
  const copy = translations[lang] || translations[DEFAULT_LANG];
  elements.forEach((el) => {
    const key = el.dataset.i18n;
    if (copy[key]) {
      el.textContent = copy[key];
    }
  });
  attrElements.forEach((el) => {
    const attr = el.dataset.i18nAttr;
    const key = el.dataset.i18nKey;
    if (attr && key && copy[key]) {
      el.setAttribute(attr, copy[key]);
      if (attr === "aria-label" && el.hasAttribute("title")) {
        el.setAttribute("title", copy[key]);
      }
    }
  });
  document.documentElement.lang = lang;
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === lang);
  });
  localStorage.setItem(STORAGE_KEY, lang);
  updateOfficeTitle();
};

const renderWelcome = (name) => {
  if (!welcome) return;
  const message =
    translations[detectLang()]["office.welcome"] ||
    "Регистрация завершена. Ваш кабинет готов.";
  welcome.textContent = name ? `${message} ${name}` : message;
};

/** GET /shop/me — магазин текущего пользователя (verificationStatus, isActive). */
const fetchShopMe = async (token) => {
  if (!token) return null;
  try {
    const res = await api.get("/shop/me", { token });
    if (res && res.error) return null;
    return res?.data?.shop ?? res?.shop ?? res?.data ?? res;
  } catch (_) {
    return null;
  }
};

const renderLocalSyncLine = (shop) => {
  if (!localSyncLine) return;
  const t = translations[detectLang()] || {};
  const raw = shop?.localApiDataReceivedAt ?? shop?.local_api_data_received_at;
  if (!raw) {
    localSyncLine.textContent = t["office.localSyncNever"] || "Данные с локального POS ещё не поступали в облако (запустите локальный сервер с интернетом).";
    localSyncLine.hidden = false;
    localSyncLine.classList.add("office-local-sync--muted");
    return;
  }
  const d = new Date(raw);
  const formatted = Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString(detectLang() === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  localSyncLine.textContent = (t["office.localSyncLast"] || "Последний контакт с локальным API: %s").replace("%s", formatted);
  localSyncLine.hidden = false;
  localSyncLine.classList.remove("office-local-sync--muted");
};

const renderVerificationBanner = (shop) => {
  if (!verificationBanner) return;
  const status = (shop?.verificationStatus ?? shop?.verification_status ?? "").toLowerCase();
  const t = translations[detectLang()];
  if (status === "pending") {
    verificationBanner.textContent = t["office.verificationPending"] || "Ожидание проверки";
    verificationBanner.className = "office-verification-banner office-verification-banner--pending";
    verificationBanner.hidden = false;
  } else if (status === "rejected") {
    verificationBanner.textContent = t["office.verificationRejected"] || "Заявка отклонена";
    verificationBanner.className = "office-verification-banner office-verification-banner--rejected";
    verificationBanner.hidden = false;
  } else {
    verificationBanner.hidden = true;
  }
};

const storeStatusBadgeClass = (isSubscribed) => {
  if (isSubscribed === true) return "office-store-status--yes";
  if (isSubscribed === false) return "office-store-status--no";
  return "office-store-status--unknown";
};

/** Сырой URL логотипа из объекта магазина (разные форматы API). Пустая строка → null. */
const getShopLogoRaw = (shop) => {
  if (!shop || typeof shop !== "object") return null;
  const v = shop.logo ?? shop.logoUrl ?? shop.logo_url ?? shop.Logo;
  if (v == null || v === false) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const patchShopLogoInList = (shopId, logoRaw) => {
  const id = String(shopId);
  currentShopsList = currentShopsList.map((s) => (String(s.id) === id ? { ...s, logo: logoRaw ?? "" } : s));
};

/** Подтянуть поле logo из GET /shop/stores (после загрузки файла, если API не вернуло URL в ответе). */
const syncStoreLogosFromApi = async (token) => {
  if (!token) return;
  try {
    const r = await api.get("/shop/stores", { token });
    if (!r || r.error || !Array.isArray(r?.data?.stores)) return;
    const logos = new Map(r.data.stores.map((s) => [String(s.id), s.logo ?? ""]));
    currentShopsList = (Array.isArray(currentShopsList) ? currentShopsList : []).map((s) => {
      const id = String(s.id);
      if (!logos.has(id)) return s;
      return { ...s, logo: logos.get(id) };
    });
  } catch (_) {
    /* ignore */
  }
};

const renderLogoForSelectedShop = () => {
  const list = Array.isArray(currentShopsList) ? currentShopsList : [];
  const sel = localStorage.getItem(SELECTED_SHOP_KEY);
  const shop = list.find((s) => String(s.id) === String(sel)) || list[0];
  renderLogo(getShopLogoRaw(shop));
};

const renderStores = (shops) => {
  if (!storesBody) return;
  const list = Array.isArray(shops) ? shops : [];
  const t = translations[detectLang()];
  storesBody.innerHTML = "";
  if (list.length === 0) {
    storesBody.innerHTML = `<div class="office-stores-empty" data-i18n="office.storesEmpty">${t["office.storesEmpty"] || "Магазинов пока нет"}</div>`;
    renderLogo(null);
    return;
  }
  list.forEach((shop) => {
    const plan =
      shop?.license?.subscriptionType ||
      shop?.license?.subscriptionStatus ||
      t["office.planEmpty"];
    let statusText = t["office.subscribedUnknown"];
    if (shop?.isSubscribed === true) statusText = t["office.subscribedYes"];
    else if (shop?.isSubscribed === false) statusText = t["office.subscribedNo"];
    const statusClass = storeStatusBadgeClass(shop?.isSubscribed);
    const card = document.createElement("div");
    card.className = "office-store-card";
    const posAt = formatDateTime(shop?.localApiDataReceivedAt ?? shop?.local_api_data_received_at);
    const netAt = formatDateTime(shop?.lastNetworkStockAt ?? shop?.last_network_stock_at);
    const syncLines = [];
    if (posAt) {
      syncLines.push(
        `<div class="office-store-card__sync"><strong>${escHtml(t["office.storeLastPosCloud"] || "")}:</strong> ${escHtml(posAt)}</div>`
      );
    }
    if (netAt) {
      syncLines.push(
        `<div class="office-store-card__sync"><strong>${escHtml(t["office.storeLastNetworkStock"] || "")}:</strong> ${escHtml(netAt)}</div>`
      );
    }
    const syncHtml = syncLines.join("");
    card.innerHTML = `
      <div class="office-store-card__header">
        <span class="office-store-card__name">${(shop?.name || "—").replace(/</g, "&lt;")}</span>
        <span class="office-store-card__status ${statusClass}">${statusText}</span>
      </div>
      <div class="office-store-card__info">
        <div><strong>${t["office.storeId"] || "ID"}:</strong> <span class="office-store-card__id">${(shop?.id || "—").replace(/</g, "&lt;")}</span></div>
        <div><strong>${t["office.storePlan"] || "Подписка"}:</strong> ${(plan || "—").replace(/</g, "&lt;")}</div>
        ${syncHtml}
      </div>
    `;
    storesBody.appendChild(card);
  });
  renderLogoForSelectedShop();
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(detectLang() === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
};

const formatCurrency = (amount, currency = "USD") => {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat(detectLang() === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(amount));
};

const officePosPanels = initOfficePosPanels({ formatCurrency, detectLang, translations });

const escHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const csvEscape = (v) => {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

let networkStockAllRows = [];
let networkStockMeta = { count: 0, limit: 0 };
let networkStockFilterTimer = null;
let officeLicensesListCache = [];
let networkTransfersListCache = [];
let networkTransfersShopLabels = {};

const getNetworkStockField = (row, a, b) => row[a] ?? row[b];

const buildNetworkStockTableHtml = (rows) => {
  const tr = translations[detectLang()] || {};
  const th = (k, fb) => escHtml(tr[k] || fb);
  if (!rows.length) {
    return `<p class="office-network-stock-status">${escHtml(tr["office.networkStockEmpty"] || "—")}</p>`;
  }
  const head = `<thead><tr>
    <th>${th("office.networkStockColShop", "Store")}</th>
    <th>${th("office.networkStockColShopId", "Store ID")}</th>
    <th>${th("office.networkStockColVar", "globalVariationId")}</th>
    <th>${th("office.networkStockColProd", "globalProductId")}</th>
    <th>${th("office.networkStockColQty", "Qty")}</th>
    <th>${th("office.networkStockColReceived", "Received")}</th>
  </tr></thead>`;
  const body = rows
    .map((r) => {
      const shopName = escHtml(getNetworkStockField(r, "shopName", "shopname") ?? "");
      const shopId = escHtml(String(getNetworkStockField(r, "shopId", "shopid") ?? ""));
      const gv = escHtml(String(getNetworkStockField(r, "globalVariationId", "globalvariationid") ?? ""));
      const gpRaw = getNetworkStockField(r, "globalProductId", "globalproductid");
      const gp = gpRaw == null || gpRaw === "" ? "—" : escHtml(String(gpRaw));
      const qty = escHtml(String(getNetworkStockField(r, "qty", "qty") ?? ""));
      const recRaw = getNetworkStockField(r, "receivedAt", "received_at");
      const recLabel = formatDateTime(recRaw) || "—";
      return `<tr>
      <td>${shopName}</td>
      <td class="office-network-stock-table__mono">${shopId}</td>
      <td class="office-network-stock-table__mono">${gv}</td>
      <td class="office-network-stock-table__mono">${gp}</td>
      <td>${qty}</td>
      <td>${escHtml(recLabel)}</td>
    </tr>`;
    })
    .join("");
  return `<table class="office-network-stock-table">${head}<tbody>${body}</tbody></table>`;
};

const filterNetworkStockRows = (q) => {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return networkStockAllRows;
  return networkStockAllRows.filter((r) => {
    const hay = [
      String(getNetworkStockField(r, "shopName", "shopname") ?? ""),
      String(getNetworkStockField(r, "shopId", "shopid") ?? ""),
      String(getNetworkStockField(r, "globalVariationId", "globalvariationid") ?? ""),
      String(getNetworkStockField(r, "globalProductId", "globalproductid") ?? "")
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
};

const renderNetworkStockBody = (filtered) => {
  const el = document.querySelector("[data-office-network-stock-body]");
  if (!el) return;
  el.innerHTML = buildNetworkStockTableHtml(filtered);
};

const setNetworkStockStatusLine = (text) => {
  const el = document.querySelector("[data-office-network-stock-status]");
  if (!el) return;
  el.textContent = text || "";
};

/** Главный склад сети: владелец в кабинете pos.libiss.com указывает точку; подтверждение — лицензионным ключом выбранного магазина. */
async function refreshNetworkCentralWarehouse(token) {
  const statusEl = document.querySelector("[data-office-network-central-status]");
  const formEl = document.querySelector("[data-office-network-central-form]");
  if (!formEl) return;
  const tr = translations[detectLang()] || {};
  if (!token) {
    formEl.innerHTML = "";
    if (statusEl) statusEl.textContent = tr["office.posNeedLogin"] || "";
    return;
  }
  if (statusEl) statusEl.textContent = tr["office.networkCentralLoading"] || "…";
  const res = await api.get("/shop/network-central-warehouse", { token, shopContext: false });
  if (!res || res.error) {
    formEl.innerHTML = "";
    if (statusEl) statusEl.textContent = res?.message || tr["office.networkCentralError"] || "?";
    return;
  }
  const data = res.data != null ? res.data : res;
  const stores = Array.isArray(data?.stores) ? data.stores : [];
  const can = !!data?.canConfigureCentralWarehouse;
  const currentRaw = data?.centralWarehouseShopId;
  const currentId =
    currentRaw != null && String(currentRaw).trim() !== "" ? String(currentRaw).trim().toLowerCase() : "";

  const lines = [];
  const noLic = stores.filter((s) => s.hasActiveLicense !== true);
  if (noLic.length) {
    lines.push((tr["office.networkCentralSomeNoLicense"] || "").replace("{n}", String(noLic.length)));
  }
  if (currentId) {
    const hub = stores.find((s) => String(s.id ?? s.ID ?? "").toLowerCase() === currentId);
    const nm = hub?.name ? String(hub.name) : currentId;
    lines.push(
      (tr["office.networkCentralCurrent"] || "")
        .replace("{name}", nm)
        .replace("{id}", currentId)
    );
  } else if (can && stores.length) {
    lines.push(tr["office.networkCentralNone"] || "");
  }
  if (statusEl) statusEl.textContent = lines.filter(Boolean).join("\n\n");

  if (!can) {
    formEl.innerHTML = "";
    return;
  }

  const opts = stores
    .map((s) => {
      const id = String(s.id ?? s.ID ?? "");
      const name = String(s.name ?? "");
      const ok = s.hasActiveLicense === true;
      const tag = ok
        ? ""
        : ` [${tr["office.networkCentralNoLicenseTag"] || "нет активной лицензии"}]`;
      return `<option value="${escHtml(id)}">${escHtml(name)} — ${escHtml(id)}${escHtml(tag)}</option>`;
    })
    .join("");
  formEl.innerHTML = `
    <div class="field" style="margin-top:0.75rem;">
      <label for="nw-central-select">${escHtml(tr["office.networkCentralSelectLabel"] || "")}</label>
      <select id="nw-central-select" class="input-like" data-nw-central-select>${opts}</select>
    </div>
    <div class="field">
      <label for="nw-central-license">${escHtml(tr["office.networkCentralLicenseLabel"] || "")}</label>
      <input id="nw-central-license" type="text" class="input-like" autocomplete="off" data-nw-central-license placeholder="XXXX-XXXX-XXXX-XXXX" />
    </div>
    <div class="office-network-central-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
      <button type="button" class="btn btn-primary" data-nw-central-save>${escHtml(tr["office.networkCentralSave"] || "Save")}</button>
      <button type="button" class="btn btn-secondary" data-nw-central-clear>${escHtml(tr["office.networkCentralClear"] || "Clear")}</button>
    </div>
  `;
  const sel = formEl.querySelector("[data-nw-central-select]");
  if (sel && currentId) {
    const match = Array.from(sel.options).find((o) => o.value.toLowerCase() === currentId);
    if (match) sel.value = match.value;
  }
}

async function refreshNetworkStockSummary(token) {
  const tr = translations[detectLang()] || {};
  if (!token) {
    networkStockAllRows = [];
    networkStockMeta = { count: 0, limit: 0 };
    renderNetworkStockBody([]);
    setNetworkStockStatusLine(tr["office.posNeedLogin"] || "");
    return;
  }
  setNetworkStockStatusLine(tr["office.networkStockLoading"] || "…");
  const res = await api.get("/shop/network-stock-summary", { token, shopContext: false });
  if (!res || res.error) {
    networkStockAllRows = [];
    networkStockMeta = { count: 0, limit: 0 };
    renderNetworkStockBody([]);
    setNetworkStockStatusLine(res?.message || tr["office.networkStockError"] || "?");
    return;
  }
  const data = res?.data ?? res;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  networkStockAllRows = rows;
  networkStockMeta = { count: data?.count ?? rows.length, limit: data?.limit ?? rows.length };
  const filterInput = document.querySelector("[data-office-network-stock-filter]");
  const filtered = filterNetworkStockRows(filterInput?.value || "");
  renderNetworkStockBody(filtered);
  const tpl = tr["office.networkStockCount"] || "";
  setNetworkStockStatusLine(
    tpl.replace("{count}", String(networkStockMeta.count)).replace("{limit}", String(networkStockMeta.limit))
  );
}

function downloadNetworkStockCsv() {
  const tr = translations[detectLang()] || {};
  const filterInput = document.querySelector("[data-office-network-stock-filter]");
  const filtered = filterNetworkStockRows(filterInput?.value || "");
  const headers = [
    tr["office.networkStockColShop"] || "shopName",
    tr["office.networkStockColShopId"] || "shopId",
    tr["office.networkStockColVar"] || "globalVariationId",
    tr["office.networkStockColProd"] || "globalProductId",
    tr["office.networkStockColQty"] || "qty",
    tr["office.networkStockColReceived"] || "receivedAt"
  ];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of filtered) {
    const rec = getNetworkStockField(r, "receivedAt", "received_at");
    const recIso = rec ? new Date(rec).toISOString() : "";
    lines.push(
      [
        getNetworkStockField(r, "shopName", "shopname"),
        getNetworkStockField(r, "shopId", "shopid"),
        getNetworkStockField(r, "globalVariationId", "globalvariationid"),
        getNetworkStockField(r, "globalProductId", "globalproductid"),
        getNetworkStockField(r, "qty", "qty"),
        recIso
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `network-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Облачные межмагазинские заявки (лицензия → /licenses/network-transfers*) ---
const ntTr = () => translations[detectLang()] || {};

const ntShortId = (id) => {
  const s = String(id ?? "").trim();
  if (!s) return "—";
  if (s.length <= 8) return s.toUpperCase();
  return `${s.slice(0, 8).toUpperCase()}…`;
};

const ntSameUuid = (a, b) =>
  String(a ?? "")
    .toLowerCase()
    .trim() ===
  String(b ?? "")
    .toLowerCase()
    .trim();

const ntStatusLabel = (status) => {
  const tr = ntTr();
  const s = String(status || "").toLowerCase();
  const key =
    s === "requested"
      ? "office.ntStatusRequested"
      : s === "approved"
        ? "office.ntStatusApproved"
        : s === "in_transit"
          ? "office.ntStatusInTransit"
          : s === "received"
            ? "office.ntStatusReceived"
            : s === "rejected"
              ? "office.ntStatusRejected"
              : s === "cancelled"
                ? "office.ntStatusCancelled"
                : null;
  return key ? tr[key] || status : status || "—";
};

const getNetworkTransferCredentials = () => {
  const tr = ntTr();
  const sid = String(localStorage.getItem(SELECTED_SHOP_KEY) || localStorage.getItem("shopId") || "").trim();
  if (!sid) return { error: tr["office.ntNoShop"] || "—" };
  const list = officeLicensesListCache;
  if (!Array.isArray(list) || !list.length) {
    return { error: tr["office.ntNoLicenses"] || "—" };
  }
  const lic = list.find((l) => String(l.shopId ?? l.shop?.id ?? "") === sid);
  if (!lic) return { error: tr["office.ntNoLicenseForShop"] || "—" };
  const licenseKey = String(lic.licenseKey ?? lic.license_key ?? lic.key ?? "").trim();
  if (!licenseKey) return { error: tr["office.ntNoLicenseKey"] || "—" };
  const st = String(lic.subscriptionStatus ?? lic.subscription_status ?? "").toLowerCase();
  const ok = st === "active" && lic.isValid !== false;
  if (!ok) return { error: tr["office.ntLicenseInactive"] || "—" };
  return { licenseKey, shopId: sid };
};

const ntLicenseQuery = (cred) =>
  `licenseKey=${encodeURIComponent(cred.licenseKey)}&shopId=${encodeURIComponent(cred.shopId)}`;

const parseNtLineSnapshot = (raw) => {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      return typeof o === "object" && o !== null && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
};

const ntShopLabel = (shopId) => {
  const k = String(shopId ?? "").toLowerCase().trim();
  if (!k) return "—";
  if (networkTransfersShopLabels[k]) return networkTransfersShopLabels[k];
  return ntShortId(shopId);
};

const setNetworkTransfersStatusLine = (text) => {
  const el = document.querySelector("[data-office-network-transfers-status]");
  if (!el) return;
  el.textContent = text || "";
};

const closeNetworkTransferModal = () => {
  const modal = document.querySelector("[data-network-transfer-modal]");
  if (modal) modal.hidden = true;
};

const renderNetworkTransfersList = () => {
  const body = document.querySelector("[data-office-network-transfers-body]");
  if (!body) return;
  const tr = ntTr();
  const cred = getNetworkTransferCredentials();
  if (cred.error) {
    body.innerHTML = `<div class="office-pos-empty">${escHtml(cred.error)}</div>`;
    return;
  }
  if (!networkTransfersListCache.length) {
    body.innerHTML = `<div class="office-pos-empty">${escHtml(tr["office.ntEmpty"] || "—")}</div>`;
    return;
  }
  body.innerHTML = networkTransfersListCache
    .map((row) => {
      const id = row.id ?? row.ID;
      const from = row.fromShopId ?? row.fromshopid;
      const to = row.toShopId ?? row.toshopid;
      const st = row.status;
      const items = Array.isArray(row.items) ? row.items : [];
      const cnt = items.length;
      const reqRaw = row.requestedAt ?? row.requested_at;
      const reqAt = formatDateTime(reqRaw) || "—";
      const idStr = escHtml(String(id ?? ""));
      return `<button type="button" class="office-network-transfer-card" data-office-network-transfer-id="${idStr}">
        <p class="office-network-transfer-card__title">${escHtml(ntShortId(id))} · ${escHtml(ntStatusLabel(st))}</p>
        <p class="office-network-transfer-card__meta">${escHtml(ntShopLabel(from))} → ${escHtml(ntShopLabel(to))}<br />
        ${escHtml(tr["office.ntItems"] || "Items")}: ${cnt} · ${escHtml(reqAt)}</p>
      </button>`;
    })
    .join("");
};

async function refreshNetworkTransfersPanel(token) {
  const tr = ntTr();
  const body = document.querySelector("[data-office-network-transfers-body]");
  if (!body) return;
  if (!token) {
    networkTransfersListCache = [];
    body.innerHTML = `<div class="office-pos-empty">${escHtml(tr["office.ntNeedLogin"] || "—")}</div>`;
    setNetworkTransfersStatusLine("");
    return;
  }
  const cred = getNetworkTransferCredentials();
  if (cred.error) {
    networkTransfersListCache = [];
    body.innerHTML = `<div class="office-pos-empty">${escHtml(cred.error)}</div>`;
    setNetworkTransfersStatusLine("");
    return;
  }
  const dirEl = document.querySelector("[data-office-network-transfers-direction]");
  const direction = (dirEl?.value || "all").trim() || "all";
  setNetworkTransfersStatusLine(tr["office.ntLoading"] || "…");
  networkTransfersShopLabels = {};
  const sibRes = await api.get(`/licenses/network-shops?${ntLicenseQuery(cred)}`, { token, shopContext: false });
  if (sibRes && !sibRes.error) {
    const shopsPayload = sibRes?.data?.shops ?? sibRes?.shops;
    if (Array.isArray(shopsPayload)) {
      for (const s of shopsPayload) {
        const sid = String(s.id ?? s.ID ?? "").toLowerCase().trim();
        if (sid) networkTransfersShopLabels[sid] = String(s.name || sid);
      }
    }
  }
  const curSid = String(cred.shopId).toLowerCase().trim();
  const pickedStore = (currentShopsList || []).find((s) => String(s.id) === String(cred.shopId));
  if (pickedStore?.name) {
    networkTransfersShopLabels[curSid] = pickedStore.name;
  } else if (localStorage.getItem("shopName")) {
    networkTransfersShopLabels[curSid] = localStorage.getItem("shopName");
  }
  const res = await api.get(
    `/licenses/network-transfers?${ntLicenseQuery(cred)}&direction=${encodeURIComponent(direction)}`,
    { token, shopContext: false }
  );
  if (!res || res.error) {
    networkTransfersListCache = [];
    renderNetworkTransfersList();
    setNetworkTransfersStatusLine(res?.message || tr["office.ntError"] || "?");
    return;
  }
  const data = res?.data ?? res;
  const list = data?.transfers;
  networkTransfersListCache = Array.isArray(list) ? list : [];
  renderNetworkTransfersList();
  setNetworkTransfersStatusLine(`${tr["office.ntItems"] || "Items"}: ${networkTransfersListCache.length}`);
}

function buildNetworkTransferDetailHtml(transferRow) {
  const trl = ntTr();
  const cred = getNetworkTransferCredentials();
  if (cred.error) return `<p>${escHtml(cred.error)}</p>`;
  const currentShop = cred.shopId;
  const from = transferRow.fromShopId ?? transferRow.fromshopid;
  const to = transferRow.toShopId ?? transferRow.toshopid;
  const tid = String(transferRow.id ?? transferRow.ID ?? "");
  const st = transferRow.status;
  const comment = transferRow.comment;
  const reqRaw = transferRow.requestedAt ?? transferRow.requested_at;
  const reqAt = formatDateTime(reqRaw) || "—";

  let canApprove = false;
  let canReject = false;
  let canShip = false;
  let canReceive = false;
  if (ntSameUuid(to, currentShop) && st === "requested") canApprove = true;
  if ((ntSameUuid(from, currentShop) || ntSameUuid(to, currentShop)) && st === "requested") canReject = true;
  if (ntSameUuid(from, currentShop) && st === "approved") canShip = true;
  if (ntSameUuid(to, currentShop) && (st === "in_transit" || st === "approved")) canReceive = true;

  const items = Array.isArray(transferRow.items) ? transferRow.items : [];
  const linesHtml = items
    .map((it) => {
      const snap = parseNtLineSnapshot(it.lineSnapshot ?? it.line_snapshot);
      const qty = it.qty;
      const gvid = it.globalVariationId ?? it.globalvariationid;
      const name =
        (snap && snap.productName) ||
        `${trl["office.networkStockColVar"] || "Var."} ${ntShortId(gvid)}`;
      const metaBits = [
        snap?.categoryName,
        snap?.sizeName,
        snap?.colorName,
        snap?.seasonName,
        snap?.productGender
      ].filter((x) => x != null && String(x).trim() !== "");
      const meta = metaBits.map((x) => escHtml(String(x))).join(" · ");
      const pathRaw = snap?.primaryImagePath ?? snap?.primary_image_path;
      let imgBlock;
      if (pathRaw && typeof pathRaw === "string") {
        const url = api.resolveAssetUrl(pathRaw);
        imgBlock = `<img class="office-network-transfer-line__img" src="${escHtml(url)}" alt="" loading="lazy" />`;
      } else {
        imgBlock = `<div class="office-network-transfer-line__img office-network-transfer-line__img--placeholder" aria-hidden="true"></div>`;
      }
      const sub = meta ? `<p class="office-network-transfer-line__meta">${meta}</p>` : "";
      const gvLine = gvid
        ? `<p class="office-network-transfer-line__meta">globalVariationId: ${escHtml(String(gvid))}</p>`
        : "";
      return `<div class="office-network-transfer-line">
        ${imgBlock}
        <div class="office-network-transfer-line__body">
          <p class="office-network-transfer-line__title">${escHtml(String(name))}</p>
          ${sub}
          ${gvLine}
        </div>
        <span class="office-network-transfer-line__qty">× ${escHtml(String(qty ?? "—"))}</span>
      </div>`;
    })
    .join("");

  const actions = [];
  if (canApprove) {
    actions.push(
      `<button type="button" class="btn btn-primary" data-nt-action="approve" data-nt-id="${escHtml(tid)}">${escHtml(trl["office.ntApprove"])}</button>`
    );
  }
  if (canReject) {
    actions.push(
      `<button type="button" class="btn btn-secondary" data-nt-action="reject" data-nt-id="${escHtml(tid)}">${escHtml(trl["office.ntReject"])}</button>`
    );
  }
  if (canShip) {
    actions.push(
      `<button type="button" class="btn btn-secondary" data-nt-action="ship" data-nt-id="${escHtml(tid)}">${escHtml(trl["office.ntShip"])}</button>`
    );
  }
  if (canReceive) {
    actions.push(
      `<button type="button" class="btn btn-primary" data-nt-action="receive" data-nt-id="${escHtml(tid)}">${escHtml(trl["office.ntReceive"])}</button>`
    );
  }
  const actionsHtml = actions.length
    ? `<div class="office-network-transfer-actions">${actions.join("")}</div>`
    : "";

  const commentBlock =
    comment && String(comment).trim()
      ? `<p><strong>${escHtml(trl["office.ntComment"])}:</strong> ${escHtml(String(comment))}</p>`
      : "";

  return `<h2 id="network-transfer-modal-title" style="margin-top:0;font-size:1.15rem">${escHtml(trl["office.ntModalTitle"] || "")} · ${escHtml(ntShortId(tid))}</h2>
    <div class="office-network-transfer-detail__card">
      <p class="office-network-transfer-detail__route">${escHtml(ntShopLabel(from))} → ${escHtml(ntShopLabel(to))}</p>
      <p style="margin:0.25rem 0"><strong>${escHtml(trl["office.ntStatus"])}:</strong> ${escHtml(ntStatusLabel(st))}</p>
      <p style="margin:0.25rem 0"><strong>${escHtml(trl["office.ntCreated"])}:</strong> ${escHtml(reqAt)}</p>
      ${commentBlock}
    </div>
    <h3 style="font-size:1rem;margin-bottom:0.5rem">${escHtml(trl["office.ntPositions"])}</h3>
    <div>${linesHtml || `<p class="office-pos-muted">${escHtml(trl["office.ntEmpty"])}</p>`}</div>
    ${actionsHtml}`;
}

function openNetworkTransferModal(transferId) {
  const modal = document.querySelector("[data-network-transfer-modal]");
  const inner = document.querySelector("[data-network-transfer-modal-body]");
  if (!modal || !inner) return;
  const row = networkTransfersListCache.find((x) => ntSameUuid(x.id ?? x.ID, transferId));
  if (!row) return;
  inner.innerHTML = buildNetworkTransferDetailHtml(row);
  modal.hidden = false;
}

async function networkTransferPatchAction(tid, action) {
  const token = localStorage.getItem("userToken");
  const cred = getNetworkTransferCredentials();
  const tr = ntTr();
  if (!token || cred.error) return;
  const body = {
    licenseKey: cred.licenseKey,
    shopId: cred.shopId,
    action
  };
  if (action === "reject") {
    body.reason = window.prompt(tr["office.ntRejectPrompt"] || "", "") ?? "";
  }
  const res = await api.patch(`/licenses/network-transfers/${encodeURIComponent(tid)}/status`, body, {
    token,
    shopContext: false
  });
  if (!res || res.error || res.success === false) {
    window.alert((res && (res.message || res.error)) || tr["office.ntActionError"]);
    return;
  }
  closeNetworkTransferModal();
  await refreshNetworkTransfersPanel(token);
}

const OFFICE_UPDATES_PLATFORMS = [
  { platform: "server", titleKey: "office.updatesServer" },
  { platform: "windows", titleKey: "office.updatesWindows" },
  { platform: "android", titleKey: "office.updatesAndroid" },
  { platform: "shop", titleKey: "office.updatesShop" }
];

function fmtBytes(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "—";
  if (x < 1024) return `${Math.round(x)} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchLatestCloudUpdate(platform) {
  const res = await api.get(
    `/updates/latest?platform=${encodeURIComponent(platform)}&_cb=${Date.now()}`,
    { token: null }
  );
  if (!res || res.error) {
    if (res && res.status === 404) return { missing: true };
    return { error: true };
  }
  if (res.success === false) return { missing: true };
  const row = res.data;
  if (!row || typeof row !== "object") return { missing: true };
  return { row };
}

async function renderOfficeUpdatesPanel() {
  const container = document.querySelector("[data-office-updates-body]");
  if (!container) return;
  const tr = translations[detectLang()] || {};
  container.innerHTML = `<div class="office-updates-loading">${escHtml(tr["office.updatesLoading"] || "…")}</div>`;
  const parts = await Promise.all(
    OFFICE_UPDATES_PLATFORMS.map(async ({ platform, titleKey }) => {
      const title = tr[titleKey] || platform;
      const got = await fetchLatestCloudUpdate(platform);
      if (got.error) {
        return `<div class="office-update-card office-update-card--error"><h3>${escHtml(title)}</h3><p>${escHtml(tr["office.updatesError"] || "?")}</p></div>`;
      }
      if (got.missing || !got.row || !got.row.fileUrl) {
        return `<div class="office-update-card"><h3>${escHtml(title)}</h3><p class="office-updates-muted">${escHtml(tr["office.updatesEmpty"] || "—")}</p></div>`;
      }
      const r = got.row;
      const url = api.resolveAssetUrl(r.fileUrl);
      const notes = (r.releaseNotes || "").slice(0, 500);
      const shaFull = r.checksumSha256 || "";
      const shaShort = shaFull ? `${shaFull.slice(0, 16)}…` : "";
      const notesHtml = notes
        ? `<p><strong>${escHtml(tr["office.updatesNotes"] || "")}:</strong> ${escHtml(notes)}${r.releaseNotes && r.releaseNotes.length > 500 ? "…" : ""}</p>`
        : "";
      const shaHtml = shaShort
        ? `<p class="office-updates-muted"><strong>${escHtml(tr["office.updatesSha"] || "")}:</strong> ${escHtml(shaShort)}</p>`
        : "";
      return `
        <div class="office-update-card">
          <h3>${escHtml(title)}</h3>
          <p><strong>${escHtml(tr["office.updatesVersion"] || "Ver")}:</strong> ${escHtml(r.version)}</p>
          <p><strong>${escHtml(tr["office.updatesSize"] || "Size")}:</strong> ${escHtml(fmtBytes(r.fileSize))}</p>
          ${notesHtml}
          ${shaHtml}
          <a class="btn btn-primary office-updates-dl" href="${url}" download rel="noopener noreferrer">${escHtml(tr["office.updatesDownload"] || "Download")}</a>
        </div>`;
    })
  );
  const hint = tr["office.updatesAutoHint"] || "";
  container.innerHTML = `<div class="office-updates-grid">${parts.join("")}</div>${hint ? `<p class="office-updates-foot">${escHtml(hint)}</p>` : ""}`;
}

const ensureSelectedShopInStorage = (shopsList) => {
  const list = (Array.isArray(shopsList) ? shopsList : []).filter((s) => s && s.id);
  const ids = list.map((s) => String(s.id));
  let sel = localStorage.getItem(SELECTED_SHOP_KEY);
  if (!sel || !ids.includes(sel)) {
    sel = ids[0] || localStorage.getItem("shopId") || "";
    if (sel) localStorage.setItem(SELECTED_SHOP_KEY, String(sel));
    else localStorage.removeItem(SELECTED_SHOP_KEY);
  }
  const shop = list.find((s) => String(s.id) === String(sel)) || list[0];
  if (shop?.id) {
    localStorage.setItem("shopId", String(shop.id));
    if (shop.name) localStorage.setItem("shopName", shop.name);
  }
};

const renderShopPicker = (shopsList, token) => {
  const el = document.querySelector("[data-office-shop-select]");
  if (!el) return;
  const t = translations[detectLang()];
  el.innerHTML = "";
  const list = (Array.isArray(shopsList) ? shopsList : []).filter((s) => s && s.id);
  if (!list.length) {
    el.innerHTML = `<option value="">${t["office.noStoresSelect"] || "Нет магазинов"}</option>`;
    el.disabled = true;
    return;
  }
  el.disabled = false;
  list.forEach((shop) => {
    const o = document.createElement("option");
    o.value = String(shop.id);
    o.textContent = shop.name || String(shop.id);
    el.appendChild(o);
  });
  const sel = localStorage.getItem(SELECTED_SHOP_KEY);
  if (sel && [...el.options].some((o) => o.value === sel)) el.value = sel;
  el.onchange = async () => {
    const v = el.value;
    if (!v) return;
    localStorage.setItem(SELECTED_SHOP_KEY, v);
    localStorage.setItem("shopId", v);
    const picked = list.find((s) => String(s.id) === v);
    if (picked?.name) localStorage.setItem("shopName", picked.name);
    renderLogoForSelectedShop();
    officePosPanels.invalidate();
    networkTransfersListCache = [];
    networkTransfersShopLabels = {};
    await refreshScopedShopData(token);
  };
};

const refreshScopedShopData = async (token) => {
  if (!token) return;
  const shopMe = await fetchShopMe(token);
  if (shopMe) {
    renderVerificationBanner(shopMe);
    renderLocalSyncLine(shopMe);
  } else {
    renderLocalSyncLine(null);
  }
  await fetchOrders(token);
  await fetchProducts(token);
  updateOrdersBadge();
  const panel = document.querySelector(".office-panel.is-active");
  const pid = panel?.getAttribute("data-office-panel");
  if (pid && typeof officePosPanels.onPanelShown === "function") {
    await officePosPanels.onPanelShown(pid, token);
  }
};

const orderStatusLabel = (status) => {
  const key = `office.orderStatus_${status}`;
  const t = translations[detectLang()];
  return t[key] || status || "—";
};

const orderStatusBadgeClass = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "pending" || s === "ожидает" || s === "waiting") return "office-order-status--pending";
  if (s === "confirmed" || s === "accepted" || s === "принят" || s === "completed" || s === "done" || s === "return_accepted") return "office-order-status--accepted";
  if (s === "rejected" || s === "отклонён" || s === "cancelled" || s === "canceled") return "office-order-status--rejected";
  if (s === "returned") return "office-order-status--returned";
  if (s === "indelivery" || s === "in_delivery" || s === "inDelivery" || s === "atdoor" || s === "preparing" || s === "fitting") return "office-order-status--pending";
  return "";
};

const fetchOrders = async (token) => {
  const body = document.querySelector("[data-office-orders-body]");
  if (!body) return;
  const res = await api.get("/shop/orders/?limit=100", { token, shopContext: false });
  if (res == null || (res && res.error)) return;
  const orders = res?.data?.orders ?? res?.orders ?? (Array.isArray(res?.data) ? res.data : []);
  const list = Array.isArray(orders) ? orders : [];
  lastFetchedOrderIds = list.map((o) => String(o.id));
  let seenIds = [];
  try {
    const saved = localStorage.getItem(SEEN_ORDERS_KEY);
    if (saved) seenIds = JSON.parse(saved);
  } catch (_) {}
  const t = translations[detectLang()];
  const btnDetails = t["office.orderDetails"] || "Подробнее";
  const lblNew = t["office.orderNew"] || "Новый";
  body.innerHTML = "";
  if (list.length === 0) {
    body.innerHTML = `<div class="office-orders-empty" data-i18n="office.ordersEmpty">${t["office.ordersEmpty"] || "Заказов пока нет"}</div>`;
    return;
  }
  list.forEach((order, index) => {
    const orderId = order.id;
    const isNew = !seenIds.includes(String(orderId));
    const orderNumber = order.order_number ?? order.id ?? index + 1;
    const total = order.total_amount ?? order.totalAmount ?? order.total ?? 0;
    const currency = order.currency || "USD";
    const date = order.created_at ?? order.createdAt ?? order.date;
    const statusText = orderStatusLabel(order.status);
    const statusClass = orderStatusBadgeClass(order.status);
    const card = document.createElement("div");
    card.className = "office-order-card" + (isNew ? " office-order-card--new" : "");
    card.dataset.orderId = orderId;
    card.innerHTML = `
      <div class="office-order-card__header">
        <span class="office-order-card__id">№ ${orderNumber}</span>
        ${isNew ? `<span class="office-order-card__new-badge">${lblNew}</span>` : ""}
        <span class="office-order-card__status ${statusClass}">${statusText}</span>
      </div>
      <div class="office-order-card__info">
        <div><strong>${t["office.orderTotal"] || "Сумма"}:</strong> ${formatCurrency(total, currency)}</div>
        <div><strong>${t["office.orderDate"] || "Дата"}:</strong> ${formatDate(date)}</div>
      </div>
      <div class="office-order-card__action">
        <button type="button" class="btn btn-secondary office-order-card__btn" data-order-open="${orderId}">${btnDetails}</button>
      </div>
    `;
    body.appendChild(card);
  });
};

function updateOrdersBadge() {
  let seenIds = [];
  try {
    const saved = localStorage.getItem(SEEN_ORDERS_KEY);
    if (saved) seenIds = JSON.parse(saved);
  } catch (_) {}
  const unseenCount = lastFetchedOrderIds.filter((id) => !seenIds.includes(id)).length;
  const el = document.querySelector('[data-nav-id="orders"]');
  if (!el) return;
  let badge = el.querySelector(".office-orders-badge");
  if (unseenCount > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "office-orders-badge";
      badge.setAttribute("aria-label", (translations[detectLang()] || {})["office.orderNew"] || "Новый");
      el.appendChild(badge);
    }
    badge.textContent = unseenCount > 99 ? "99+" : String(unseenCount);
    badge.hidden = false;
  } else if (badge) {
    badge.hidden = true;
  }
}

async function pollOrdersForNew(token) {
  if (!token) return;
  try {
    const res = await api.get("/shop/orders/?limit=100", { token, shopContext: false });
    if (res == null || res.error) return;
    const orders = res?.data?.orders ?? res?.orders ?? (Array.isArray(res?.data) ? res.data : []);
    const currentIds = (Array.isArray(orders) ? orders : []).map((o) => String(o.id));
    const newIds = currentIds.filter((id) => !lastFetchedOrderIds.includes(id));
    if (newIds.length > 0) {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        const t = translations[detectLang()] || {};
        const title = t["office.newOrdersTitle"] || "Новые заказы";
        const bodyTemplate = t["office.newOrdersBody"] || "У вас %d новых заказ(ов).";
        const body = bodyTemplate.replace("%d", String(newIds.length));
        new Notification(title, { body, icon: "/logo.png" });
      }
      lastFetchedOrderIds = currentIds;
    }
    await fetchOrders(token);
    updateOrdersBadge();
  } catch (_) {}
}

function startOrdersPolling(token) {
  stopOrdersPolling();
  if (!token) return;
  ordersPollTimer = setInterval(() => pollOrdersForNew(token), ORDERS_POLL_MS);
}

function stopOrdersPolling() {
  if (ordersPollTimer) {
    clearInterval(ordersPollTimer);
    ordersPollTimer = null;
  }
}

const getOrderModal = () => document.querySelector("[data-order-modal]");
const getOrderModalBody = () => document.querySelector("[data-order-details]");

const openOrderDetails = async (id) => {
  const modal = getOrderModal();
  const body = getOrderModalBody();
  if (!modal || !body) return;
  body.innerHTML = '<div class="review-loading"><div class="spinner"></div><p>Загрузка...</p></div>';
  modal.hidden = false;
  modal.style.opacity = "1";
  modal.style.visibility = "visible";
  try {
    const token = localStorage.getItem("userToken");
    if (!token) {
      body.innerHTML = '<p class="status is-error">Войдите в аккаунт</p>';
      return;
    }
    const res = await api.get(`/shop/orders/${id}`, { token, shopContext: false });
    if (!res) {
      body.innerHTML = '<p class="status is-error">Нет ответа от сервера. Проверьте интернет или войдите снова.</p>';
      return;
    }
    if (res.error) {
      const msg = res.message || res.status === 404 ? "Заказ не найден" : "Не удалось загрузить заказ";
      body.innerHTML = '<p class="status is-error">' + msg + "</p>";
      return;
    }
    const order = res.data?.order ?? res.order ?? res.data ?? res;
    if (!order || (order.id == null && order.order_number == null)) {
      body.innerHTML = '<p class="status is-error">Неверный ответ сервера</p>';
      return;
    }
    renderOrderDetails(order);
  } catch (e) {
    console.error(e);
    const msg = e?.message || (e && String(e)) || "Ошибка сети";
    body.innerHTML = '<p class="status is-error">' + msg + "</p>";
  }
};

const updateOrderStatus = async (orderId, status) => {
  const token = localStorage.getItem("userToken");
  if (!token) return;
  try {
    const res = await api.put(`/shop/orders/${orderId}/status`, { status }, { token, shopContext: false });
    if (res && res.error) {
      alert(res.message || "Ошибка обновления статуса");
      return;
    }
    const modal = getOrderModal();
    if (modal) {
      modal.style.opacity = "0";
      modal.style.visibility = "hidden";
      setTimeout(() => { modal.hidden = true; }, 200);
    }
    await fetchOrders(token);
  } catch (e) {
    console.error(e);
    alert("Ошибка сети");
  }
};

const getReceiptModal = () => document.querySelector("[data-receipt-modal]");
const getReceiptModalBody = () => document.querySelector("[data-receipt-body]");

const openReceipt = async (orderId, orderNumber) => {
  const token = localStorage.getItem("userToken");
  if (!token) return;
  const modal = getReceiptModal();
  const body = getReceiptModalBody();
  if (!modal || !body) return;
  body.innerHTML = '<div class="review-loading"><div class="spinner"></div><p>Загрузка чека...</p></div>';
  modal.hidden = false;
  modal.style.opacity = "1";
  modal.style.visibility = "visible";
  try {
    const res = await api.get(`/shop/orders/${orderId}/receipt`, { token, shopContext: false });
    if (res && res.error) {
      body.innerHTML = '<p class="status is-error">' + (res.message || "Не удалось загрузить чек") + "</p>";
      return;
    }
    const data = res?.data?.data ?? res?.data ?? res;
    const items = data?.items ?? [];
    const shops = data?.shops ?? [];
    const total = data?.total_amount ?? 0;
    const currency = data?.currency ?? "TJS";
    const tryOnFee = data?.try_on_fee;
    const tryOnFeeLabel = data?.try_on_fee_label || "Платное ожидание (примерка)";
    const pdfUrl = data?.pdf_url;
    const num = orderNumber ?? data?.order_number ?? orderId;
    let shopsHtml = "";
    if (shops.length > 0) {
      shopsHtml = "<div class=\"review-section\"><h3 style=\"margin-bottom: 8px;\">Магазин</h3>";
      shops.forEach((s) => {
        shopsHtml += "<p><strong>Название:</strong> " + (s.shop_name || "—") + "</p>";
        shopsHtml += "<p><strong>ИНН:</strong> " + (s.inn || "—") + "</p>";
        shopsHtml += "<p><strong>Сертификат:</strong> " + (s.certificate ? "№ " + s.certificate : "—") + "</p>";
      });
      shopsHtml += "</div>";
    }
    let itemsHtml = "";
    if (items.length > 0) {
      itemsHtml = '<table class="review-variations-table"><thead><tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>';
      items.forEach((item) => {
        const name = (item.name || "—").replace(/</g, "&lt;");
        const qty = item.quantity ?? 0;
        const price = item.price ?? 0;
        const sum = item.subtotal ?? price * qty;
        itemsHtml += "<tr><td>" + name + "</td><td>" + qty + "</td><td>" + formatCurrency(price, currency) + "</td><td>" + formatCurrency(sum, currency) + "</td></tr>";
      });
      itemsHtml += "</tbody></table>";
    }
    const tryOnFeeHtml = (tryOnFee != null && tryOnFee > 0)
      ? "<div class=\"review-section\"><p><strong>" + (tryOnFeeLabel.replace(/</g, "&lt;")) + ":</strong> " + formatCurrency(tryOnFee, currency) + "</p></div>"
      : "";
    body.innerHTML =
      "<div class=\"review-section\"><h2 style=\"margin-bottom: 12px;\">Чек заказа № " + String(num).replace(/</g, "&lt;") + "</h2>" +
      (pdfUrl ? "<p><a href=\"" + pdfUrl.replace(/"/g, "&quot;") + "\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"admin-link-download\">Скачать чек (PDF)</a></p>" : "") +
      "</div>" + shopsHtml +
      "<div class=\"review-section\"><h3 style=\"margin-bottom: 8px;\">Товары</h3>" + (itemsHtml || "<p>Нет данных</p>") + "</div>" +
      tryOnFeeHtml +
      "<div class=\"review-section\"><p><strong>Итого:</strong> " + formatCurrency(total, currency) + "</p></div>" +
      "<button type=\"button\" class=\"btn btn-secondary\" data-receipt-close>Закрыть</button>";
    body.querySelector("[data-receipt-close]")?.addEventListener("click", () => {
      modal.style.opacity = "0";
      modal.style.visibility = "hidden";
      setTimeout(() => { modal.hidden = true; }, 200);
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = "<p class=\"status is-error\">Ошибка загрузки чека</p>";
  }
};

/** Есть ли в заказе возврат (хотя бы частично): по статусу заказа или по позициям. */
function orderHasReturn(order) {
  const s = (order.status || "").toLowerCase();
  if (s === "returned" || s === "partially_rejected") return true;
  const items = order.items ?? order.order_items ?? [];
  const fromShopGroups = (order.items_by_shop || []).flatMap((g) => g.items || []);
  const allItems = items.length ? items : fromShopGroups;
  return allItems.some(
    (item) => ((item.item_status || item.status || "").toLowerCase() === "returned")
  );
}

const renderOrderDetails = (order) => {
  const body = getOrderModalBody();
  if (!body) return;
  const t = translations[detectLang()];
  const orderId = order.id;
  const orderNumber = order.order_number ?? order.id ?? "—";
  const total = order.total_amount ?? order.totalAmount ?? order.total ?? 0;
  const currency = order.currency || "USD";
  const date = order.created_at ?? order.createdAt ?? order.date;
  const statusText = orderStatusLabel(order.status);
  const statusClass = orderStatusBadgeClass(order.status);
  const items = order.items ?? order.order_items ?? [];
  const hasReturn = orderHasReturn(order);
  let itemsHtml = "";
  if (items.length > 0) {
    itemsHtml = '<table class="review-variations-table"><thead><tr><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>';
    items.forEach((item) => {
      const name = (item.product_name ?? item.name ?? "—").replace(/</g, "&lt;");
      const qty = item.quantity ?? item.qty ?? 0;
      const price = item.price ?? 0;
      const sum = item.total ?? item.subtotal ?? price * qty;
      itemsHtml += `<tr><td>${name}</td><td>${qty}</td><td>${formatCurrency(price, currency)}</td><td>${formatCurrency(sum, currency)}</td></tr>`;
    });
    itemsHtml += "</tbody></table>";
  } else {
    itemsHtml = "<p>Позиций нет</p>";
  }
  body.innerHTML = `
    <div class="review-section">
      <h2 style="margin-bottom: 16px;">Заказ № ${(orderNumber + "").replace(/</g, "&lt;")}</h2>
      <div class="review-item"><strong>${t["office.orderDate"] || "Дата"}:</strong> ${formatDate(date)}</div>
      <div class="review-item"><strong>${t["office.orderTotal"] || "Сумма"}:</strong> ${formatCurrency(total, currency)}</div>
      <div class="review-item"><strong>Статус:</strong> <span class="office-order-status ${statusClass}">${statusText}</span></div>
    </div>
    <div class="review-section" style="margin-top: 16px;">
      <h3 style="margin-bottom: 8px;">Позиции</h3>
      ${itemsHtml}
    </div>
    <div class="order-modal-actions">
      <p class="hint" style="margin-bottom: 12px;">${t["office.orderStatusHint"] || "Изменить статус своих позиций в заказе:"}</p>
      <div class="order-status-buttons">
        <button type="button" class="btn btn-primary" data-order-status="confirmed">${t["office.orderActionConfirm"] || "Подтвердить"}</button>
        <button type="button" class="btn btn-secondary" data-order-status="rejected">${t["office.orderActionReject"] || "Отклонить"}</button>
        <button type="button" class="btn btn-secondary" data-order-status="returned">${t["office.orderActionReturn"] || "Возврат"}</button>
        <button type="button" class="btn btn-secondary" data-order-status="inDelivery">${t["office.orderActionHandedToDelivery"] || "Отдал доставку"}</button>
        ${hasReturn ? `<button type="button" class="btn btn-secondary" data-order-status="return_accepted">${t["office.orderActionAcceptReturn"] || "Принял возврат"}</button>` : ""}
        <button type="button" class="btn btn-secondary" data-order-receipt="${orderId}" data-order-number="${(orderNumber + "").replace(/"/g, "&quot;")}">${t["office.orderReceipt"] || "Показать чек"}</button>
      </div>
    </div>
  `;
  body.querySelectorAll("[data-order-receipt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.orderReceipt;
      const num = btn.dataset.orderNumber;
      if (id) openReceipt(id, num);
    });
  });
  body.querySelectorAll("[data-order-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const status = btn.dataset.orderStatus;
      if (order.id && status) updateOrderStatus(order.id, status);
    });
  });
};

const fetchProducts = async (token) => {
  const body = document.querySelector("[data-office-products-body]");
  if (!body) return;
  const res = await api.get("/shop/products/?limit=100", { token, shopContext: false });
  if (res == null || (res && res.error)) return;
  const products = res?.data?.products ?? res?.products ?? (Array.isArray(res?.data) ? res.data : []);
  const list = Array.isArray(products) ? products : [];
  const t = translations[detectLang()];
  const btnDetails = t["office.orderDetails"] || "Подробнее";
  body.innerHTML = "";
  if (list.length === 0) {
    body.innerHTML = `<div class="office-products-empty" data-i18n="office.productsEmpty">${t["office.productsEmpty"] || "Товаров пока нет"}</div>`;
    return;
  }
  const lblCat = t["office.productCategory"] || "Категория";
  const lblStock = t["office.productStock"] || "Остаток";
  const lblPrice = t["office.productPrice"] || "Цена";
  const statusPending = t["office.productVerificationPending"] || "На проверке";
  const statusApproved = t["office.productVerificationApproved"] || "Одобрен";
  const statusRejected = t["office.productVerificationRejected"] || "Отклонён";
  const getProductStatus = (p) => (p?.verificationStatus ?? p?.verification_status ?? "approved").toLowerCase();
  list.forEach((product) => {
    const name = (product.name || "—").replace(/</g, "&lt;");
    const categoryName = (product.category?.name ?? product.categoryName ?? "—").replace(/</g, "&lt;");
    const variations = product.variations ?? [];
    const totalStock = variations.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0);
    const firstPrice = variations[0];
    const price = firstPrice?.price ?? product.price ?? 0;
    const status = getProductStatus(product);
    const statusText = status === "pending" ? statusPending : status === "rejected" ? statusRejected : statusApproved;
    const statusClass = `office-product-card__verification office-product-card__verification--${status}`;
    const card = document.createElement("div");
    card.className = "office-product-card";
    card.setAttribute("data-product-id", product.id); // Add ID for click handler
    card.innerHTML = `
      <div class="office-product-card__header">
        <div class="office-product-card__title-row">
          <span class="office-product-card__name">${name}</span>
          <span class="${statusClass}" title="${statusText}">${statusText}</span>
        </div>
        <button type="button" class="icon-btn-sm" data-edit-product="${product.id}" title="Изменить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      </div>
      <div class="office-product-card__info">
        <div><strong>${lblCat}:</strong> ${categoryName}</div>
        <div><strong>${lblStock}:</strong> ${totalStock}</div>
        <div><strong>${lblPrice}:</strong> ${formatCurrency(price)}</div>
      </div>
      <div class="office-product-card__action" style="display: flex; justify-content: space-between; align-items: center;">
        <button type="button" class="icon-btn-sm" data-view-product="${product.id}" title="Просмотр">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button type="button" class="icon-btn-sm danger" data-delete-product="${product.id}" title="Удалить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;
    body.appendChild(card);
  });
};

// --- Product Actions & Details ---

const handleProductAction = async (target) => {
  const editBtn = target.closest("[data-edit-product]");
  const deleteBtn = target.closest("[data-delete-product]");
  const viewBtn = target.closest("[data-view-product]");
  const productCard = target.closest("[data-product-id]");

  // Prevent card click if clicking buttons
  if (editBtn || deleteBtn || viewBtn) {
    if (editBtn) {
      const id = editBtn.dataset.editProduct;
      window.location.href = `/add-product.html?id=${id}`;
    }
    if (viewBtn) {
      const id = viewBtn.dataset.viewProduct;
      openProductDetails(id);
    }
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteProduct;
      if (confirm("Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.")) {
        try {
          const token = localStorage.getItem("userToken");
          const res = await api.delete(`/shop/products/${id}`, { token, shopContext: false });
          if (res && res.error) {
            alert(res.message || "Ошибка удаления товара");
          } else {
            await fetchProducts(token);
          }
        } catch (e) {
          console.error(e);
          alert("Ошибка сети");
        }
      }
    }
    return;
  }

  // Open details modal on card click (fallback)
  if (productCard) {
    const id = productCard.dataset.productId;
    openProductDetails(id);
  }
};

// --- Product Modal Logic ---

// Re-query elements dynamically because they might not be in DOM when module loads
const getProductModal = () => document.querySelector("[data-product-modal]");
const getProductModalBody = () => document.querySelector("[data-product-details]");

const openProductDetails = async (id) => {
  const modal = getProductModal();
  const body = getProductModalBody();
  
  if (!modal || !body) {
    console.error("Product modal elements not found");
    return;
  }
  
  body.innerHTML = '<div class="review-loading"><div class="spinner"></div><p>Загрузка...</p></div>';
  modal.hidden = false;
  // Ensure opacity is 1 for visibility transition
  requestAnimationFrame(() => {
    modal.style.opacity = "1";
    modal.style.visibility = "visible";
  });
  
  try {
    const token = localStorage.getItem("userToken");
    // GET /api/v1/products/{id}
    const res = await api.get(`/products/${id}`, { token });
    
    if (!res || res.error) {
      body.innerHTML = '<p class="status is-error">' + (res?.message || 'Не удалось загрузить данные товара') + '</p>';
      return;
    }
    const product = res.product ?? res.data?.product ?? res.data;
    if (!product) {
      body.innerHTML = '<p class="status is-error">Нет данных товара в ответе</p>';
      return;
    }
    renderProductDetails(product);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<p class="status is-error">Ошибка сети</p>';
  }
};

// Делегирование кликов по карточкам товаров, заказов и модалкам
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element)) return;
  const target = e.target;
  const orderOpenBtn = target.closest("[data-order-open]");
  if (orderOpenBtn) {
    const id = orderOpenBtn.dataset.orderOpen;
    if (id) openOrderDetails(id);
    return;
  }
  if (target.matches("[data-close-order-modal]") || target.closest("[data-close-order-modal]")) {
    const modal = getOrderModal();
    if (modal) {
      modal.style.opacity = "0";
      modal.style.visibility = "hidden";
      setTimeout(() => { modal.hidden = true; }, 200);
    }
    return;
  }
  if (target.matches("[data-close-receipt-modal]") || target.closest("[data-close-receipt-modal]")) {
    const modal = getReceiptModal();
    if (modal) {
      modal.style.opacity = "0";
      modal.style.visibility = "hidden";
      setTimeout(() => { modal.hidden = true; }, 200);
    }
    return;
  }
  if (target.closest("[data-product-id]") || target.closest("[data-edit-product]") || target.closest("[data-view-product]") || target.closest("[data-delete-product]")) {
    handleProductAction(target);
    return;
  }
  if (target.matches("[data-close-modal]") || target.closest("[data-close-modal]")) {
    const modal = getProductModal();
    if (modal) {
      modal.style.opacity = "0";
      modal.style.visibility = "hidden";
      setTimeout(() => {
        modal.hidden = true;
      }, 200);
    }
  }
});

const renderProductDetails = (product) => {
  const body = getProductModalBody();
  if (!body) return;
  const t = translations[detectLang()];
  const categoryName = product.category?.name ?? product.categoryName ?? "—";
  const seasonName = product.seasonId ? (product.season?.name ?? `ID: ${product.seasonId}`) : "—";

  const genderLabels = { male: "Мужской", female: "Женский", unisex: "Унисекс" };
  const genderText = product.gender ? (genderLabels[product.gender.toLowerCase()] || product.gender) : "—";
  const verificationStatus = (product.verificationStatus ?? product.verification_status ?? "approved").toLowerCase();
  const rejectionComment = (product.rejectionComment ?? product.rejection_comment ?? "").trim();
  const statusPending = t["office.productVerificationPending"] || "На проверке";
  const statusApproved = t["office.productVerificationApproved"] || "Одобрен";
  const statusRejected = t["office.productVerificationRejected"] || "Отклонён";
  const statusLabel = t["office.productVerificationStatus"] || "Верификация";
  const rejectionLabel = t["office.productRejectionComment"] || "Причина отказа";
  const statusText = verificationStatus === "pending" ? statusPending : verificationStatus === "rejected" ? statusRejected : statusApproved;
  const verificationBlock = `
    <div class="review-section product-details-verification">
      <div class="review-item"><strong>${(statusLabel + "").replace(/</g, "&lt;")}:</strong> <span class="product-details-status product-details-status--${verificationStatus}">${(statusText + "").replace(/</g, "&lt;")}</span></div>
      ${rejectionComment ? `<div class="review-item product-details-rejection"><strong>${(rejectionLabel + "").replace(/</g, "&lt;")}:</strong> ${(rejectionComment + "").replace(/</g, "&lt;")}</div>` : ""}
    </div>
  `;
  const basicInfoHtml = `
    <div class="review-section">
      <h2 style="margin-bottom: 16px; font-size: 20px;">${(product.name || "—").replace(/</g, "&lt;")}</h2>
      ${verificationBlock}
      <div class="review-item"><strong>Категория:</strong> ${(categoryName + "").replace(/</g, "&lt;")}</div>
      <div class="review-item"><strong>Сезон:</strong> ${(seasonName + "").replace(/</g, "&lt;")}</div>
      <div class="review-item"><strong>Пол:</strong> ${(genderText + "").replace(/</g, "&lt;")}</div>
      <div class="review-item"><strong>Описание:</strong> ${(product.description || "—").replace(/</g, "&lt;")}</div>
    </div>
  `;

  const variations = product.variations ?? [];
  const formatPrice = (val) => (val != null && val !== "" ? Number(val) : null);
  const formatNum = (val) => (val != null && val !== "" ? String(val) : "—");

  const getColorKey = (c) => {
    if (c == null) return "_";
    if (typeof c === "object") return c?.id ?? c?.name ?? c?.hex ?? "_";
    return String(c);
  };
  const getColorName = (c) => {
    if (c == null) return "—";
    if (typeof c === "object") return c?.name ?? c?.hex ?? "—";
    return String(c);
  };
  const getColorHex = (c) => {
    if (c == null) return "#ccc";
    if (typeof c === "object" && c?.hex) return c.hex;
    return "#ccc";
  };

  let variationsHtml = '<div class="review-variations">';
  if (variations.length === 0) {
    variationsHtml += '<div class="review-no-photos">Вариаций нет</div>';
  } else {
    const byColor = {};
    variations.forEach((v) => {
      const colors = v.colors ?? [];
      const first = colors[0];
      const key = first != null ? getColorKey(first) : "_";
      if (!byColor[key]) {
        byColor[key] = {
          colorName: first != null ? getColorName(first) : "Без цвета",
          colorHex: first != null ? getColorHex(first) : "#ccc",
          items: [],
          images: [],
        };
      }
      byColor[key].items.push(v);
      const urls = v.imageUrls ?? (v.imageUrlsByColor && (v.imageUrlsByColor[key] ?? Object.values(v.imageUrlsByColor).flat()));
      if (Array.isArray(urls)) urls.forEach((u) => byColor[key].images.push(u));
      else if (v.imageUrlsByColor && typeof v.imageUrlsByColor === "object") {
        Object.values(v.imageUrlsByColor).flat().forEach((u) => byColor[key].images.push(u));
      }
    });

    Object.keys(byColor).forEach((colorKey) => {
      const group = byColor[colorKey];
      const uniqImages = [...new Set(group.images)];
      variationsHtml += '<div class="review-group review-group-by-color">';
      variationsHtml += `<div class="review-color-header">
        <span class="variation-color-swatch" style="background-color: ${(group.colorHex + "").replace(/"/g, "&quot;")}"></span>
        <strong>${(group.colorName + "").replace(/</g, "&lt;")}</strong>
      </div>`;
      if (uniqImages.length > 0) {
        variationsHtml += '<div class="review-photos">';
        uniqImages.forEach((url) => {
          const fullUrl = api.resolveAssetUrl(url);
          const safe = fullUrl.replace(/'/g, "\\'").replace(/"/g, "&quot;");
          variationsHtml += `<img src="${fullUrl}" class="review-thumb" onclick="openLightbox('${safe}')" alt="">`;
        });
        variationsHtml += "</div>";
      }
      variationsHtml += '<div class="review-variations-table-wrap"><table class="review-variations-table"><thead><tr><th>Размеры</th><th>Цена</th><th>Цена до скидки</th><th>Скидка</th><th>Остаток</th><th>QR код</th></tr></thead><tbody>';
      group.items.forEach((v) => {
        const sizes = v.sizes ?? [];
        const sizeNames = sizes.map((s) => (typeof s === "object" ? (s?.name ?? s?.label ?? "—") : String(s))).join(", ") || "—";
        const price = formatPrice(v.price);
        const originalPrice = formatPrice(v.original_price ?? v.originalPrice);
        const discountVal = v.discount != null && v.discount !== "" ? v.discount : null;
        const discount = discountVal != null ? (typeof discountVal === "number" ? discountVal + "%" : String(discountVal)) : "—";
        const stock = formatNum(v.stock_quantity ?? v.stockQuantity);
        const qrCode = formatNum(v.qrCodeUrl ?? v.barcode);
        const priceStr = price != null ? `${price} TJS` : "—";
        const origStr = originalPrice != null ? `${originalPrice} TJS` : "—";
        variationsHtml += `<tr>
          <td>${(sizeNames + "").replace(/</g, "&lt;")}</td>
          <td>${priceStr}</td>
          <td>${origStr}</td>
          <td>${(discount + "").replace(/</g, "&lt;")}</td>
          <td>${(stock + "").replace(/</g, "&lt;")}</td>
          <td>${(qrCode + "").replace(/</g, "&lt;")}</td>
        </tr>`;
      });
      variationsHtml += "</tbody></table></div>";
      variationsHtml += "</div>";
    });
  }
  variationsHtml += "</div>";

  body.innerHTML = basicInfoHtml + variationsHtml;
};

// --- Lightbox Logic ---
const officeLightbox = document.querySelector("[data-office-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelectorAll("[data-lightbox-close]");

window.openLightbox = (src) => {
  if (officeLightbox && lightboxImage) {
    lightboxImage.src = src;
    officeLightbox.classList.add("is-open");
  }
};

lightboxClose.forEach(el => {
  el.addEventListener("click", () => {
    if (officeLightbox) officeLightbox.classList.remove("is-open");
  });
});

const COPY_BTN_SVG = `<svg class="icon-copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="4" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// --- Licenses ---

const renderLicenses = (licenses) => {
  if (!licensesBody) return;
  const list = Array.isArray(licenses) ? licenses : [];
  const t = translations[detectLang()];
  const lblShop = t["office.licenseShop"] || "Магазин";
  const lblId = t["office.licenseShopId"] || "ID магазина";
  const lblKey = t["office.licenseKey"] || "Ключ";
  const lblDays = t["office.licenseDays"] || "Осталось";
  const lblExpires = t["office.licenseExpires"] || "Действует до";
  const copyAria = t["office.copy"] || "Копировать";
  licensesBody.innerHTML = "";
  if (list.length === 0) {
    licensesBody.innerHTML = `<div class="office-licenses-empty" data-i18n="office.licensesEmpty">${t["office.licensesEmpty"] || "Подписок пока нет"}</div>`;
    return;
  }
  list.forEach((license) => {
    const shopName = (license?.shop?.name || "—").replace(/</g, "&lt;");
    const shopId = (license?.shop?.id || license?.shopId || "—").replace(/</g, "&lt;");
    const keyVal = (license?.licenseKey || license?.key || "—").replace(/</g, "&lt;");
    const days = Number.isFinite(license?.daysRemaining) ? String(license.daysRemaining) : "—";
    const expires = formatDate(license?.expiresAt || license?.expires_at);
    const card = document.createElement("div");
    card.className = "office-license-card";
    card.setAttribute("data-office-license", "");
    card.innerHTML = `
      <div class="office-license-card__header">
        <span class="office-license-card__shop">${shopName}</span>
      </div>
      <div class="office-license-card__info">
        <div class="office-license-card__row">
          <strong>${lblId}:</strong>
          <span class="office-license-card__copy-wrap">
            <span data-office-license-shop-id>${shopId}</span>
            <button type="button" class="copy-btn" data-copy="shopId" aria-label="${copyAria}">${COPY_BTN_SVG}</button>
          </span>
        </div>
        <div class="office-license-card__row">
          <strong>${lblKey}:</strong>
          <span class="office-license-card__copy-wrap">
            <span data-office-license-key>${keyVal}</span>
            <button type="button" class="copy-btn" data-copy="licenseKey" aria-label="${copyAria}">${COPY_BTN_SVG}</button>
          </span>
        </div>
        <div><strong>${lblDays}:</strong> ${days}</div>
        <div><strong>${lblExpires}:</strong> ${expires}</div>
      </div>
    `;
    licensesBody.appendChild(card);
  });
};

const handleCopy = async (button) => {
  if (!button) return;
  const field = button.dataset.copy;
  if (!field) return;
  
  const row = button.closest("[data-office-license]");
  if (!row) {
    console.error("Could not find license row for copy button");
    return;
  }
  
  const valueNode =
    field === "shopId"
      ? row.querySelector("[data-office-license-shop-id]")
      : row.querySelector("[data-office-license-key]");
  
  if (!valueNode) {
    console.error("Could not find value node for field:", field);
    return;
  }
  
  const value = valueNode.textContent?.trim() || "";
  if (!value || value === "—" || value === "") {
    console.warn("No value to copy for field:", field);
    return;
  }
  
  try {
    await navigator.clipboard.writeText(value);
    button.classList.add("is-copied");
    const lang = detectLang();
    button.setAttribute("aria-label", translations[lang]["office.copied"]);
    
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.setAttribute("aria-label", translations[lang]["office.copy"]);
    }, 2000);
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    // Fallback для старых браузеров
    try {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      
      button.classList.add("is-copied");
      const lang = detectLang();
      button.setAttribute("aria-label", translations[lang]["office.copied"]);
      
      setTimeout(() => {
        button.classList.remove("is-copied");
        button.setAttribute("aria-label", translations[lang]["office.copy"]);
      }, 2000);
    } catch (fallbackError) {
      console.error("Fallback copy also failed:", fallbackError);
      const lang = detectLang();
      button.setAttribute("aria-label", translations[lang]["office.copyFailed"]);
      setTimeout(() => {
        button.setAttribute("aria-label", translations[lang]["office.copy"]);
      }, 2000);
    }
  }
};

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const copyButton = target.closest("[data-copy]");
  if (copyButton) {
    event.preventDefault();
    handleCopy(copyButton);
  }
});

const setTrialState = (hasLicenses) => {
  if (!trialButton) return;
  trialButton.style.display = hasLicenses ? "none" : "inline-flex";
};

const setTrialStatus = (message, type) => {
  if (!trialStatus) return;
  trialStatus.textContent = message;
  trialStatus.classList.toggle("is-error", type === "error");
  trialStatus.classList.toggle("is-success", type === "success");
};

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.licenses)) return payload.licenses;
  if (Array.isArray(payload?.data?.licenses)) return payload.data.licenses;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
};

const fetchLicenses = async (token, shops) => {
  const licenses = await api.get("/licenses/my", { token });
  if (licenses == null || (licenses && licenses.error)) return;
  
  const list = normalizeList(licenses);
  const mapped = list.map((license) => {
    if (license?.shop) return license;
    const shop = shops?.find?.((item) => item?.id === license?.shopId);
    return shop ? { ...license, shop } : license;
  });
  officeLicensesListCache = mapped;
  renderLicenses(mapped);
  const selectedShopId = String(localStorage.getItem(SELECTED_SHOP_KEY) || localStorage.getItem("shopId") || "");
  const hasActiveForSelected = selectedShopId
    ? mapped.some((l) => {
        const sid = String(l.shopId ?? l.shop?.id ?? "");
        if (sid !== selectedShopId) return false;
        const st = (l.subscriptionStatus || l.subscription_status || "").toLowerCase();
        return st === "active" && (l.isValid !== false);
      })
    : false;
  setTrialState(hasActiveForSelected);
};

const createTrialLicense = async () => {
  if (!trialButton) return;
  
  // Защита от двойного клика
  if (trialButton.disabled) return;
  
  const token = localStorage.getItem("userToken");
  const shopId = localStorage.getItem("shopId");
  if (!token || !shopId) {
    setTrialStatus(translations[detectLang()]["office.trialErrorAuth"], "error");
    return;
  }
  setTrialStatus("", "");
  trialButton.disabled = true;
  try {
    const result = await api.post("/licenses/trial", { shopId }, { token });
    if (result == null) return;
    if (result && result.error) {
      if (result.status === 409) {
        setTrialStatus(translations[detectLang()]["office.trialExists"], "error");
      } else {
        setTrialStatus(translations[detectLang()]["office.trialError"], "error");
      }
      trialButton.disabled = false;
      return;
    }
    if (result?.data) {
      localStorage.setItem("licenseData", JSON.stringify(result.data));
      setTrialStatus(translations[detectLang()]["office.trialSuccess"], "success");
      await fetchLicenses(token);
      // Обновляем страницу после успешного получения пробной версии
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  } catch (error) {
    setTrialStatus(translations[detectLang()]["office.trialError"], "error");
  } finally {
    trialButton.disabled = false;
  }
};

/**
 * Загрузка логотипа магазина по API: POST /api/v1/shop/:id/logo
 */
const uploadShopLogo = async (file, token, shopId) => {
  const formData = new FormData();
  formData.append("logo", file);
  const data = await api.post(`/shop/${shopId}/logo`, formData, { token });
  if (data == null) return null;
  if (data && data.error) throw new Error(data.message || "Ошибка загрузки логотипа");
  const logoUrl =
    data?.data?.logo ??
    data?.data?.shop?.logo ??
    data?.logo ??
    (typeof data?.data === "string" ? data.data : null);
  return logoUrl || true;
};

/**
 * Удаление логотипа (PATCH shops с пустым logo).
 */
const clearShopLogo = async (token, shopId) => {
  const data = await api.patch(`/shops/${shopId}`, { logo: "" }, { token });
  if (data == null) return null;
  if (data && data.error) throw new Error(data.message || "Ошибка удаления логотипа");
  return data;
};

const showLogoPlaceholder = () => {
  if (!logoImg || !logoPlaceholder || !logoRemove) return;
  logoImg.onerror = null;
  logoImg.onload = null;
  logoImg.removeAttribute("src");
  logoImg.alt = "";
  logoImg.hidden = true;
  logoPlaceholder.hidden = false;
  logoRemove.hidden = true;
};

const renderLogo = (logoUrl) => {
  if (!logoImg || !logoPlaceholder || !logoRemove) return;

  logoImg.onload = null;
  logoImg.onerror = null;

  const raw = logoUrl != null && String(logoUrl).trim() !== "" ? String(logoUrl).trim() : null;
  if (!raw) {
    showLogoPlaceholder();
    return;
  }

  const full = api.resolveAssetUrl(raw);
  if (!full) {
    showLogoPlaceholder();
    return;
  }

  logoImg.onerror = () => {
    logoImg.onerror = null;
    showLogoPlaceholder();
  };
  logoImg.onload = () => {
    logoImg.onload = null;
    if (!logoImg.hidden) logoPlaceholder.hidden = true;
  };

  logoImg.alt = "Logo";
  logoImg.hidden = false;
  logoPlaceholder.hidden = true;
  logoRemove.hidden = false;
  logoImg.src = full;
};

const setLogoStatus = (message, type) => {
  if (!logoStatus) return;
  logoStatus.textContent = message;
  logoStatus.classList.toggle("is-error", type === "error");
  logoStatus.classList.toggle("is-success", type === "success");
};

const logout = () => {
  stopOrdersPolling();
  localStorage.removeItem("userToken");
  localStorage.removeItem("userData");
  localStorage.removeItem("shopId");
  localStorage.removeItem("shopName");
  localStorage.removeItem("licenseData");
  localStorage.removeItem("officeSelectedShopId");
  // Перенаправляем на страницу входа
  window.location.href = "/login.html";
};

const loadAccount = async () => {
  const token = localStorage.getItem("userToken");
  
  // Если токена нет, перенаправляем на страницу входа
  if (!token) {
    logout();
    return;
  }
  
  const cachedUser = localStorage.getItem("userData");
  const cachedShopId = localStorage.getItem("shopId");
  const cachedShopName = localStorage.getItem("shopName");
  let user = cachedUser ? JSON.parse(cachedUser) : null;

  if (token) {
    const profile = await api.get("/users/profile", { token });
    if (profile == null || (profile && profile.error)) return;
    
    // API возвращает { success: true, data: { id, name, ... } }
    user = profile?.data || profile?.user || profile?.data?.user || profile;
    localStorage.setItem("userData", JSON.stringify(user));
    console.log("User profile loaded:", user);
  }

  renderWelcome(user?.name);

  let shopsList = [];
  if (token) {
    try {
      shopsList = [];
      const myStoresRes = await api.get("/shop/stores", { token });
      if (myStoresRes && !myStoresRes.error && Array.isArray(myStoresRes?.data?.stores)) {
        const uid =
          user?.id != null
            ? String(user.id)
            : user?.userId != null
              ? String(user.userId)
              : null;
        shopsList = myStoresRes.data.stores.map((s) => ({
          ...s,
          ownerId: uid || s.ownerId
        }));
        console.log("My stores (/shop/stores):", shopsList.length);
      }

      if (shopsList.length === 0) {
        const shops = await api.get("/shops/", { token });
        if (shops == null || (shops && shops.error)) {
          console.warn("Shops API unavailable for fallback");
        } else {
          console.log("Shops API response (fallback):", shops);
          let list = [];
          if (Array.isArray(shops)) {
            list = shops;
          } else if (Array.isArray(shops?.data?.shops)) {
            list = shops.data.shops;
          } else if (Array.isArray(shops?.data)) {
            list = shops.data;
          } else if (Array.isArray(shops?.shops)) {
            list = shops.shops;
          } else if (shops?.data && typeof shops.data === "object") {
            list = Object.values(shops.data).filter(Array.isArray).flat() || [];
          }

          const allShops = Array.isArray(list) ? list : [];
          let userId = null;
          if (user?.id !== undefined && user?.id !== null) {
            userId = String(user.id);
          } else if (user?.userId !== undefined && user?.userId !== null) {
            userId = String(user.userId);
          }

          if (userId) {
            shopsList = allShops.filter((shop) => {
              if (!shop?.ownerId) return false;
              return String(shop.ownerId) === userId;
            });
            console.log("Filtered shops for user ID:", userId, "Found:", shopsList.length);
          } else {
            shopsList = allShops;
            console.log("No user ID found; showing all shops from fallback:", shopsList.length);
          }
        }
      }
    } catch (error) {
      console.error("Error loading shops:", error);
      // Если ошибка связана с авторизацией, перенаправляем на вход
      if (error.message?.includes('401') || error.status === 401) {
        logout();
        return;
      }
      // Используем кэшированные данные при ошибке
      if (cachedShopId) {
        shopsList = [{ id: cachedShopId, name: cachedShopName }];
      }
    }
  }

  currentShopsList =
    shopsList.length > 0
      ? shopsList
      : cachedShopId
        ? [{ id: cachedShopId, name: cachedShopName }]
        : [];
  ensureSelectedShopInStorage(currentShopsList);
  renderShopPicker(currentShopsList, token);
  renderStores(currentShopsList);

  if (token) {
    const shopMe = await fetchShopMe(token);
    if (shopMe) {
      renderVerificationBanner(shopMe);
      renderLocalSyncLine(shopMe);
    } else {
      renderLocalSyncLine(null);
    }
    await fetchLicenses(token, shopsList);
    await fetchOrders(token);
    await fetchProducts(token);
    updateOrdersBadge();
    startOrdersPolling(token);
  } else {
    renderVerificationBanner(null);
    if (localSyncLine) localSyncLine.hidden = true;
    stopOrdersPolling();
  }
};

// Обработчик загрузки логотипа
if (logoInput) {
  logoInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const token = localStorage.getItem("userToken");
    const shopId = localStorage.getItem("shopId");
    
    if (!token || !shopId) {
      setLogoStatus(translations[detectLang()]["office.logoErrorAuth"] || "Войдите в аккаунт", "error");
      return;
    }

    // Валидация файла
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setLogoStatus(translations[detectLang()]["form.errorLogoFormat"] || "Неподдерживаемый формат изображения.", "error");
      return;
    }

    if (file.size > maxSize) {
      setLogoStatus(translations[detectLang()]["form.errorLogoSize"] || "Размер файла превышает 50MB.", "error");
      return;
    }

    setLogoStatus(translations[detectLang()]["office.logoUploading"] || "Загрузка логотипа...", "");
    
    try {
      const result = await uploadShopLogo(file, token, shopId);
      if (result === null) return;

      const rawPath = typeof result === "string" && result.trim() ? result.trim() : null;
      if (rawPath) patchShopLogoInList(shopId, rawPath);
      else await syncStoreLogosFromApi(token);

      renderLogoForSelectedShop();
      setLogoStatus(translations[detectLang()]["office.logoSuccess"] || "Логотип успешно обновлен", "success");
      
      // Очищаем статус через 3 секунды
      setTimeout(() => {
        setLogoStatus("", "");
      }, 3000);
      
      // Очищаем input
      logoInput.value = "";
    } catch (error) {
      console.error("Ошибка загрузки логотипа:", error);
      setLogoStatus(translations[detectLang()]["office.logoError"] || "Ошибка загрузки логотипа", "error");
    }
  });
}

// Обработчик удаления логотипа
if (logoRemove) {
  logoRemove.addEventListener("click", async () => {
    const token = localStorage.getItem("userToken");
    const shopId = localStorage.getItem("shopId");
    
    if (!token || !shopId) {
      setLogoStatus(translations[detectLang()]["office.logoErrorAuth"] || "Войдите в аккаунт", "error");
      return;
    }

    setLogoStatus(translations[detectLang()]["office.logoRemoving"] || "Удаление логотипа...", "");
    
    try {
      const cleared = await clearShopLogo(token, shopId);
      if (cleared === null) return;
      
      patchShopLogoInList(shopId, "");
      renderLogoForSelectedShop();
      setLogoStatus(translations[detectLang()]["office.logoRemoved"] || "Логотип удален", "success");
      
      // Очищаем статус через 3 секунды
      setTimeout(() => {
        setLogoStatus("", "");
      }, 3000);
    } catch (error) {
      console.error("Ошибка удаления логотипа:", error);
      setLogoStatus(translations[detectLang()]["office.logoError"] || "Ошибка удаления логотипа", "error");
    }
  });
}

// --- Редактирование магазина (PUT /shop/me) ---
const getStoreEditModal = () => document.querySelector("[data-store-edit-modal]");
const getStoreEditForm = () => document.querySelector("[data-store-edit-form]");
const getStoreEditStatus = () => document.querySelector("[data-store-edit-status]");
const getStoreEditCitySelect = () => document.querySelector("#store-edit-cityId");

const setStoreEditStatus = (message, type) => {
  const el = getStoreEditStatus();
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("is-error", type === "error");
  el.classList.toggle("is-success", type === "success");
};

const loadCitiesForStoreEdit = async () => {
  const select = getStoreEditCitySelect();
  if (!select) return;
  const firstOption = select.querySelector("option[value='']") || select.options[0];
  select.innerHTML = firstOption ? firstOption.outerHTML : "<option value=\"\">—</option>";
  try {
    const res = await api.get("/cities/", { token: null });
    const cities = res?.data?.cities ?? res?.data ?? [];
    (Array.isArray(cities) ? cities : []).forEach((city) => {
      if (!city?.id || !city?.name) return;
      const opt = document.createElement("option");
      opt.value = city.id;
      opt.textContent = city.name;
      select.appendChild(opt);
    });
  } catch (_) {}
};

const fillStoreEditForm = (shop) => {
  const form = getStoreEditForm();
  if (!form || !shop) return;
  const set = (name, value) => {
    const el = form.querySelector(`[data-store-edit-field="${name}"]`);
    if (el) el.value = value != null && value !== undefined ? String(value) : "";
  };
  set("name", shop.name);
  set("description", shop.description);
  set("address", shop.address);
  set("phone", shop.phone);
  set("email", shop.email);
  set("telegram", shop.telegram);
  set("instagram", shop.instagram);
  set("primaryColor", shop.primaryColor ?? shop.primary_color);
  set("background", shop.background);
  set("cityId", shop.cityId ?? shop.city_id ?? "");
};

const openStoreEditModal = async () => {
  const modal = getStoreEditModal();
  if (!modal) return;
  const token = localStorage.getItem("userToken");
  if (!token) return;
  setStoreEditStatus("", "");
  try {
    const shop = await fetchShopMe(token);
    if (!shop) {
      setStoreEditStatus(translations[detectLang()]["office.editStoreErrorLoad"] || "Не удалось загрузить данные магазина", "error");
      return;
    }
    await loadCitiesForStoreEdit();
    fillStoreEditForm(shop);
    modal.hidden = false;
  } catch (e) {
    setStoreEditStatus(translations[detectLang()]["office.editStoreErrorLoad"] || "Ошибка загрузки", "error");
  }
};

const closeStoreEditModal = () => {
  const modal = getStoreEditModal();
  if (modal) modal.hidden = true;
  setStoreEditStatus("", "");
};

const handleStoreEditSubmit = async (e) => {
  e.preventDefault();
  const form = getStoreEditForm();
  if (!form) return;
  const token = localStorage.getItem("userToken");
  if (!token) return;
  const payload = {};
  ["name", "description", "address", "phone", "email", "telegram", "instagram", "primaryColor", "background", "cityId"].forEach((name) => {
    const el = form.querySelector(`[data-store-edit-field="${name}"]`);
    if (!el) return;
    const val = el.value != null ? String(el.value).trim() : "";
    if (name === "cityId") {
      payload.cityId = val || undefined;
    } else {
      if (val !== "") payload[name] = val;
    }
  });
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  setStoreEditStatus(translations[detectLang()]["office.editStoreSaving"] || "Сохранение...", "");
  try {
    const res = await api.put("/shop/me", payload, { token });
    if (res && res.error) {
      setStoreEditStatus(res.message || translations[detectLang()]["office.editStoreErrorSave"] || "Ошибка сохранения", "error");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const updated = res?.data?.shop ?? res?.shop ?? res?.data ?? res;
    if (updated && currentShopsList.length > 0) {
      const idx = currentShopsList.findIndex((s) => String(s?.id) === String(updated.id));
      if (idx >= 0) currentShopsList[idx] = { ...currentShopsList[idx], ...updated };
      else currentShopsList[0] = { ...currentShopsList[0], ...updated };
      renderStores(currentShopsList);
    }
    if (updated?.name) localStorage.setItem("shopName", updated.name);
    setStoreEditStatus(translations[detectLang()]["office.editStoreSuccess"] || "Сохранено", "success");
    setTimeout(() => {
      closeStoreEditModal();
      setStoreEditStatus("", "");
    }, 800);
  } catch (err) {
    setStoreEditStatus(translations[detectLang()]["office.editStoreErrorSave"] || "Ошибка сохранения", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

const storeEditForm = getStoreEditForm();
if (storeEditForm) storeEditForm.addEventListener("submit", handleStoreEditSubmit);

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-office-edit-store]")) {
    openStoreEditModal();
  }
  if (e.target.closest("[data-close-store-edit-modal]")) {
    closeStoreEditModal();
  }
});

// Заголовок в апбаре по выбранному разделу
const PANEL_TITLE_KEYS = {
  dashboard: "office.menuDashboard",
  stores: "office.menuStores",
  orders: "office.menuOrders",
  products: "office.menuProducts",
  reports: "office.menuReports",
  cashier: "office.menuCashier",
  debtors: "office.menuDebtors",
  movements: "office.menuMovements",
  "network-stock": "office.menuNetworkStock",
  "network-transfers": "office.menuNetworkTransfers",
  updates: "office.menuUpdates",
  licenses: "office.menuLicenses"
};

const updateOfficeTitle = (panelId) => {
  const id = panelId || window.location.hash.slice(1) || "dashboard";
  const key = PANEL_TITLE_KEYS[id];
  const lang = detectLang();
  const copy = translations[lang] || translations[DEFAULT_LANG];
  const text = (key && copy[key]) ? copy[key] : copy[PANEL_TITLE_KEYS.dashboard] || "Главная";
  AppHeader.setTitle(text);
};

// Вкладки кабинета: переключение панелей (пункты в боковом меню)
const officePanels = document.querySelectorAll("[data-office-panel]");

const setActivePanel = (panelId) => {
  AppHeader.setActiveNav(panelId);
  officePanels.forEach((panel) => {
    const id = panel.getAttribute("data-office-panel");
    const isActive = id === panelId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
  if (panelId === "orders") {
    if (lastFetchedOrderIds.length > 0) {
      try {
        localStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify(lastFetchedOrderIds));
      } catch (_) {}
    }
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    updateOrdersBadge();
  }
  if (typeof window.history !== "undefined" && window.history.replaceState) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${panelId}`);
  }
  updateOfficeTitle(panelId);
  if (["reports", "cashier", "debtors", "movements"].includes(panelId)) {
    officePosPanels.onPanelShown(panelId, localStorage.getItem("userToken"));
  }
  if (panelId === "updates") {
    renderOfficeUpdatesPanel();
  }
  if (panelId === "network-stock") {
    void refreshNetworkStockSummary(localStorage.getItem("userToken"));
    void refreshNetworkCentralWarehouse(localStorage.getItem("userToken"));
  }
  if (panelId === "network-transfers") {
    void refreshNetworkTransfersPanel(localStorage.getItem("userToken"));
  }
};

AppHeader.init({
  onNavClick: (id) => setActivePanel(id),
  onLangChange: (lang) => applyLang(lang)
});

// Открыть панель по хешу при загрузке
const hash = window.location.hash.slice(1);
if (
  hash &&
  [
    "dashboard",
    "stores",
    "orders",
    "products",
    "reports",
    "cashier",
    "debtors",
    "movements",
    "network-stock",
    "network-transfers",
    "updates",
    "licenses"
  ].includes(hash)
) {
  setActivePanel(hash);
} else {
  AppHeader.setActiveNav("dashboard");
  updateOfficeTitle("dashboard");
}

applyLang(detectLang());

if (addProductButton) {
  addProductButton.addEventListener("click", () => {
    if (addProductButton.disabled) return;
    window.location.href = "/add-product.html";
  });
}

document.body.style.opacity = "1";

document.querySelector("[data-office-updates-refresh]")?.addEventListener("click", () => {
  renderOfficeUpdatesPanel();
});

document.querySelector("[data-office-network-stock-refresh]")?.addEventListener("click", () => {
  const tok = localStorage.getItem("userToken");
  void refreshNetworkStockSummary(tok);
  void refreshNetworkCentralWarehouse(tok);
});
document.querySelector("[data-office-network-stock-csv]")?.addEventListener("click", () => {
  downloadNetworkStockCsv();
});
document.querySelector("[data-office-network-stock-filter]")?.addEventListener("input", () => {
  window.clearTimeout(networkStockFilterTimer);
  networkStockFilterTimer = window.setTimeout(() => {
    const q = document.querySelector("[data-office-network-stock-filter]")?.value || "";
    renderNetworkStockBody(filterNetworkStockRows(q));
  }, 200);
});

document.querySelector("[data-office-network-transfers-refresh]")?.addEventListener("click", () => {
  void refreshNetworkTransfersPanel(localStorage.getItem("userToken"));
});
document.querySelector("[data-office-network-transfers-direction]")?.addEventListener("change", () => {
  void refreshNetworkTransfersPanel(localStorage.getItem("userToken"));
});

document.querySelector("[data-office-network-central-wrap]")?.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  const btn = t.closest("[data-nw-central-save], [data-nw-central-clear]");
  if (!btn) return;
  const token = localStorage.getItem("userToken");
  const tr = translations[detectLang()] || {};
  const statusEl = document.querySelector("[data-office-network-central-status]");

  if (btn.hasAttribute("data-nw-central-clear")) {
    const putRes = await api.put("/shop/network-central-warehouse", { centralWarehouseShopId: null }, { token, shopContext: false });
    if (putRes?.error) {
      if (statusEl) statusEl.textContent = putRes.message || "?";
      return;
    }
    await refreshNetworkCentralWarehouse(token);
    if (statusEl) statusEl.textContent += `\n${tr["office.networkCentralCleared"] || ""}`.trim();
    return;
  }

  if (btn.hasAttribute("data-nw-central-save")) {
    const formEl = document.querySelector("[data-office-network-central-form]");
    const hubId = formEl?.querySelector("[data-nw-central-select]")?.value?.trim();
    const key = formEl?.querySelector("[data-nw-central-license]")?.value?.trim();
    if (!hubId) {
      if (statusEl) statusEl.textContent = tr["office.networkCentralSelectLabel"] || "?";
      return;
    }
    if (!key) {
      if (statusEl) statusEl.textContent = tr["office.networkCentralLicenseLabel"] || "?";
      return;
    }
    const putRes = await api.put(
      "/shop/network-central-warehouse",
      { centralWarehouseShopId: hubId, confirmLicenseKey: key },
      { token, shopContext: false }
    );
    if (putRes?.error) {
      if (statusEl) statusEl.textContent = putRes.message || "?";
      return;
    }
    if (putRes?.success === false) {
      if (statusEl) statusEl.textContent = String(putRes.error || "?");
      return;
    }
    await refreshNetworkCentralWarehouse(token);
    if (statusEl) statusEl.textContent += `\n${tr["office.networkCentralSaved"] || ""}`.trim();
  }
});

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest("[data-close-network-transfer-modal]")) {
    closeNetworkTransferModal();
    return;
  }
  const card = t.closest("[data-office-network-transfer-id]");
  if (card && t.closest("[data-office-network-transfers-body]")) {
    const id = card.getAttribute("data-office-network-transfer-id");
    if (id) openNetworkTransferModal(id);
    return;
  }
  const act = t.closest("[data-nt-action]");
  if (act && t.closest("[data-network-transfer-modal-body]")) {
    e.preventDefault();
    const action = act.getAttribute("data-nt-action");
    const tid = act.getAttribute("data-nt-id");
    if (action && tid) void networkTransferPatchAction(tid, action);
  }
});

loadAccount();

if (trialButton) {
  trialButton.addEventListener("click", createTrialLicense);
}

