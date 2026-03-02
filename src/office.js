import { translations } from "./translations.js";
import "./styles.css";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();

const API_BASE = "https://api.libiss.com/api/v1";
const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
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
const logoSection = document.querySelector("[data-office-logo-section]");
const logoInput = document.querySelector("[data-office-logo-input]");
const logoImg = document.querySelector("[data-office-logo-img]");
const logoPlaceholder = document.querySelector("[data-office-logo-placeholder]");
const logoRemove = document.querySelector("[data-office-logo-remove]");
const logoStatus = document.querySelector("[data-office-logo-status]");

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
    }
  });
  document.documentElement.lang = lang;
  langButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === lang);
  });
  localStorage.setItem(STORAGE_KEY, lang);
};

langButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;
    if (lang) applyLang(lang);
  });
});

const renderWelcome = (name) => {
  if (!welcome) return;
  const message =
    translations[detectLang()]["office.welcome"] ||
    "Регистрация завершена. Ваш кабинет готов.";
  welcome.textContent = name ? `${message} ${name}` : message;
};

const storeStatusBadgeClass = (isSubscribed) => {
  if (isSubscribed === true) return "office-store-status--yes";
  if (isSubscribed === false) return "office-store-status--no";
  return "office-store-status--unknown";
};

const renderStores = (shops) => {
  if (!storesBody) return;
  const list = Array.isArray(shops) ? shops : [];
  const t = translations[detectLang()];
  const btnDetails = t["office.orderDetails"] || "Подробнее";
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
    card.innerHTML = `
      <div class="office-store-card__header">
        <span class="office-store-card__name">${(shop?.name || "—").replace(/</g, "&lt;")}</span>
        <span class="office-store-card__status ${statusClass}">${statusText}</span>
      </div>
      <div class="office-store-card__info">
        <div><strong>${t["office.storeId"] || "ID"}:</strong> <span class="office-store-card__id">${(shop?.id || "—").replace(/</g, "&lt;")}</span></div>
        <div><strong>${t["office.storePlan"] || "Подписка"}:</strong> ${(plan || "—").replace(/</g, "&lt;")}</div>
      </div>
      <div class="office-store-card__action">
        <a href="/create-store.html" class="btn btn-secondary office-store-card__btn">${btnDetails}</a>
      </div>
    `;
    storesBody.appendChild(card);
  });
  renderLogo(list[0]?.logo || null);
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
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

const orderStatusLabel = (status) => {
  const key = `office.orderStatus_${status}`;
  const t = translations[detectLang()];
  return t[key] || status || "—";
};

const orderStatusBadgeClass = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "pending" || s === "ожидает" || s === "waiting") return "office-order-status--pending";
  if (s === "accepted" || s === "принят" || s === "completed" || s === "done") return "office-order-status--accepted";
  if (s === "rejected" || s === "отклонён" || s === "cancelled" || s === "canceled") return "office-order-status--rejected";
  return "";
};

const fetchOrders = async (token) => {
  const body = document.querySelector("[data-office-orders-body]");
  if (!body) return;
  const res = await fetchJson(`${API_BASE}/shop/orders/?limit=100`, token);
  if (!res) return;
  const orders = res?.data?.orders ?? res?.orders ?? (Array.isArray(res?.data) ? res.data : []);
  const list = Array.isArray(orders) ? orders : [];
  const t = translations[detectLang()];
  const btnDetails = t["office.orderDetails"] || "Подробнее";
  body.innerHTML = "";
  if (list.length === 0) {
    body.innerHTML = `<div class="office-orders-empty" data-i18n="office.ordersEmpty">${t["office.ordersEmpty"] || "Заказов пока нет"}</div>`;
    return;
  }
  list.forEach((order, index) => {
    const orderNumber = order.order_number ?? order.id ?? index + 1;
    const total = order.total_amount ?? order.totalAmount ?? order.total ?? 0;
    const currency = order.currency || "USD";
    const date = order.created_at ?? order.createdAt ?? order.date;
    const statusText = orderStatusLabel(order.status);
    const statusClass = orderStatusBadgeClass(order.status);
    const card = document.createElement("div");
    card.className = "office-order-card";
    card.innerHTML = `
      <div class="office-order-card__header">
        <span class="office-order-card__id">№ ${orderNumber}</span>
        <span class="office-order-card__status ${statusClass}">${statusText}</span>
      </div>
      <div class="office-order-card__info">
        <div><strong>${t["office.orderTotal"] || "Сумма"}:</strong> ${formatCurrency(total, currency)}</div>
        <div><strong>${t["office.orderDate"] || "Дата"}:</strong> ${formatDate(date)}</div>
      </div>
      <div class="office-order-card__action">
        <button type="button" class="btn btn-secondary office-order-card__btn">${btnDetails}</button>
      </div>
    `;
    body.appendChild(card);
  });
};

const fetchProducts = async (token) => {
  const body = document.querySelector("[data-office-products-body]");
  if (!body) return;
  const res = await fetchJson(`${API_BASE}/shop/products/?limit=100`, token);
  if (!res) return;
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
  list.forEach((product) => {
    const name = (product.name || "—").replace(/</g, "&lt;");
    const categoryName = (product.category?.name ?? product.categoryName ?? "—").replace(/</g, "&lt;");
    const variations = product.variations ?? [];
    const totalStock = variations.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0);
    const firstPrice = variations[0];
    const price = firstPrice?.price ?? product.price ?? 0;
    const card = document.createElement("div");
    card.className = "office-product-card";
    card.innerHTML = `
      <div class="office-product-card__header">
        <span class="office-product-card__name">${name}</span>
      </div>
      <div class="office-product-card__info">
        <div><strong>${lblCat}:</strong> ${categoryName}</div>
        <div><strong>${lblStock}:</strong> ${totalStock}</div>
        <div><strong>${lblPrice}:</strong> ${formatCurrency(price)}</div>
      </div>
      <div class="office-product-card__action">
        <button type="button" class="btn btn-secondary office-product-card__btn">${btnDetails}</button>
      </div>
    `;
    body.appendChild(card);
  });
};

const COPY_BTN_SVG = `<svg class="icon-copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="4" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
  const licenses = await fetchJson(`${API_BASE}/licenses/my`, token);
  // Если fetchJson вернул null из-за истекшего токена, logout уже вызван
  if (!licenses) return;
  
  const list = normalizeList(licenses);
  const mapped = list.map((license) => {
    if (license?.shop) return license;
    const shop = shops?.find?.((item) => item?.id === license?.shopId);
    return shop ? { ...license, shop } : license;
  });
  renderLicenses(mapped);
  setTrialState(mapped.length > 0);
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
    const response = await fetch(`${API_BASE}/licenses/trial`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ shopId })
    });
    if (!response.ok) {
      // Если токен истек или недействителен (401 Unauthorized), перенаправляем на вход
      if (response.status === 401) {
        logout();
        return;
      }
      if (response.status === 409) {
        setTrialStatus(translations[detectLang()]["office.trialExists"], "error");
      } else {
        setTrialStatus(translations[detectLang()]["office.trialError"], "error");
      }
      trialButton.disabled = false;
      return;
    }
    const result = await response.json();
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

const fetchJson = async (url, token) => {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  
  // Если токен истек или недействителен (401 Unauthorized), перенаправляем на вход
  if (response.status === 401) {
    logout();
    return null;
  }
  
  if (!response.ok) return null;
  return response.json();
};

/**
 * Загрузка логотипа магазина по API: POST /api/v1/shop/:id/logo
 * Тело: multipart/form-data, поле "logo" — файл изображения.
 */
const uploadShopLogo = async (file, token, shopId) => {
  const formData = new FormData();
  formData.append("logo", file);

  const response = await fetch(`${API_BASE}/shop/${shopId}/logo`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  if (response.status === 401) {
    logout();
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Ошибка загрузки логотипа");
  }

  const data = await response.json();
  const logoUrl =
    data?.data?.logo ??
    data?.data?.shop?.logo ??
    data?.logo ??
    (typeof data?.data === "string" ? data.data : null);
  return logoUrl || true;
};

/**
 * Удаление логотипа (если бэкенд поддерживает PATCH shops с пустым logo).
 */
const clearShopLogo = async (token, shopId) => {
  const response = await fetch(`${API_BASE}/shops/${shopId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ logo: "" })
  });

  if (response.status === 401) {
    logout();
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Ошибка удаления логотипа");
  }

  return response.json();
};

const resolveLogoUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = "https://api.libiss.com";
  return url.startsWith("/") ? base + url : base + "/" + url;
};

const renderLogo = (logoUrl) => {
  if (!logoImg || !logoPlaceholder || !logoRemove) return;
  
  if (logoUrl) {
    logoImg.src = resolveLogoUrl(logoUrl);
    logoImg.hidden = false;
    logoPlaceholder.hidden = true;
    logoRemove.hidden = false;
  } else {
    logoImg.hidden = true;
    logoPlaceholder.hidden = false;
    logoRemove.hidden = true;
  }
};

const setLogoStatus = (message, type) => {
  if (!logoStatus) return;
  logoStatus.textContent = message;
  logoStatus.classList.toggle("is-error", type === "error");
  logoStatus.classList.toggle("is-success", type === "success");
};

const logout = () => {
  // Очищаем все данные пользователя
  localStorage.removeItem("userToken");
  localStorage.removeItem("userData");
  localStorage.removeItem("shopId");
  localStorage.removeItem("shopName");
  localStorage.removeItem("licenseData");
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
    const profile = await fetchJson(`${API_BASE}/users/profile`, token);
    // Если fetchJson вернул null из-за истекшего токена, logout уже вызван
    if (!profile) return;
    
    // API возвращает { success: true, data: { id, name, ... } }
    user = profile?.data || profile?.user || profile?.data?.user || profile;
    localStorage.setItem("userData", JSON.stringify(user));
    console.log("User profile loaded:", user);
  }

  renderWelcome(user?.name);

  let shopsList = [];
  if (token) {
    try {
      const shops = await fetchJson(`${API_BASE}/shops/`, token);
      // Если fetchJson вернул null из-за истекшего токена, logout уже вызван
      if (!shops) return;
      
      console.log("Shops API response:", shops);
      
      // Пробуем разные форматы ответа
      let list = [];
      if (Array.isArray(shops)) {
        list = shops;
      } else if (Array.isArray(shops?.data?.shops)) {
        list = shops.data.shops;
      } else if (Array.isArray(shops?.data)) {
        list = shops.data;
      } else if (Array.isArray(shops?.shops)) {
        list = shops.shops;
      } else if (shops?.data && typeof shops.data === 'object') {
        // Если data это объект, пробуем извлечь массив
        list = Object.values(shops.data).filter(Array.isArray).flat() || [];
      }
      
      const allShops = Array.isArray(list) ? list : [];
      
      // Фильтруем только магазины текущего пользователя по ownerId
      // ID может быть как строкой, так и числом
      let userId = null;
      if (user?.id !== undefined && user?.id !== null) {
        userId = String(user.id);
      } else if (user?.userId !== undefined && user?.userId !== null) {
        userId = String(user.userId);
      }
      
      if (userId) {
        shopsList = allShops.filter((shop) => {
          if (!shop?.ownerId) return false;
          const shopOwnerId = String(shop.ownerId);
          return shopOwnerId === userId;
        });
        console.log("Filtered shops for user ID:", userId, "Found:", shopsList.length, shopsList);
      } else {
        // Если нет user.id, показываем все (fallback)
        shopsList = allShops;
        console.log("No user ID found. User object:", user);
        console.log("Showing all shops:", shopsList.length);
      }
      
      const firstShop = shopsList[0] || null;
      if (firstShop?.id) {
        localStorage.setItem("shopId", firstShop.id);
        if (firstShop?.name) {
          localStorage.setItem("shopName", firstShop.name);
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

  renderStores(
    shopsList.length > 0
      ? shopsList
      : [{ id: cachedShopId, name: cachedShopName }]
  );

  if (token) {
    await fetchLicenses(token, shopsList);
    await fetchOrders(token);
    await fetchProducts(token);
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
      
      const logoUrl = result === true ? null : (result.startsWith("http") ? result : `https://api.libiss.com${result.startsWith("/") ? "" : "/"}${result}`);
      
      // Обновляем отображение
      renderLogo(logoUrl || undefined);
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
      
      renderLogo(null);
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

// Вкладки кабинета: переключение панелей
const officeNavItems = document.querySelectorAll("[data-office-nav]");
const officePanels = document.querySelectorAll("[data-office-panel]");

const setActivePanel = (panelId) => {
  officeNavItems.forEach((btn) => {
    const id = btn.getAttribute("data-office-nav");
    btn.classList.toggle("is-active", id === panelId);
    btn.setAttribute("aria-current", id === panelId ? "page" : null);
  });
  officePanels.forEach((panel) => {
    const id = panel.getAttribute("data-office-panel");
    const isActive = id === panelId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
  if (typeof window.history !== "undefined" && window.history.replaceState) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${panelId}`);
  }
};

officeNavItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const panelId = btn.getAttribute("data-office-nav");
    if (panelId) setActivePanel(panelId);
  });
});

// Открыть панель по хешу при загрузке
const hash = window.location.hash.slice(1);
if (hash && ["dashboard", "stores", "orders", "products", "licenses"].includes(hash)) {
  setActivePanel(hash);
}

applyLang(detectLang());

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

loadAccount();

if (trialButton) {
  trialButton.addEventListener("click", createTrialLicense);
}

