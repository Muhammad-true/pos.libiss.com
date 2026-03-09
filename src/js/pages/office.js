import { translations } from "../lib/translations.js";
import { AppHeader } from "../components/app-header.js";
import { api } from "../lib/api.js";
import "../../styles.css";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
const STORAGE_KEY = "libiss-pos-lang";
const SEEN_ORDERS_KEY = "officeSeenOrderIds";
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
  if (s === "confirmed" || s === "accepted" || s === "принят" || s === "completed" || s === "done") return "office-order-status--accepted";
  if (s === "rejected" || s === "отклонён" || s === "cancelled" || s === "canceled") return "office-order-status--rejected";
  if (s === "returned") return "office-order-status--returned";
  if (s === "indelivery" || s === "in_delivery" || s === "preparing") return "office-order-status--pending";
  return "";
};

const fetchOrders = async (token) => {
  const body = document.querySelector("[data-office-orders-body]");
  if (!body) return;
  const res = await api.get("/shop/orders/?limit=100", { token });
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
    const res = await api.get("/shop/orders/?limit=100", { token });
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
    const res = await api.get(`/shop/orders/${id}`, { token });
    if (!res || res.error) {
      body.innerHTML = '<p class="status is-error">' + (res?.message || "Не удалось загрузить заказ") + "</p>";
      return;
    }
    const order = res.data?.order ?? res.order ?? res.data ?? res;
    renderOrderDetails(order);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<p class="status is-error">Ошибка сети</p>';
  }
};

const updateOrderStatus = async (orderId, status) => {
  const token = localStorage.getItem("userToken");
  if (!token) return;
  try {
    const res = await api.put(`/shop/orders/${orderId}/status`, { status }, { token });
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

const renderOrderDetails = (order) => {
  const body = getOrderModalBody();
  if (!body) return;
  const t = translations[detectLang()];
  const orderNumber = order.order_number ?? order.id ?? "—";
  const total = order.total_amount ?? order.totalAmount ?? order.total ?? 0;
  const currency = order.currency || "USD";
  const date = order.created_at ?? order.createdAt ?? order.date;
  const statusText = orderStatusLabel(order.status);
  const statusClass = orderStatusBadgeClass(order.status);
  const items = order.items ?? order.order_items ?? [];
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
      </div>
    </div>
  `;
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
  const res = await api.get("/shop/products/?limit=100", { token });
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
          const res = await api.delete(`/shop/products/${id}`, { token });
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

const renderLogo = (logoUrl) => {
  if (!logoImg || !logoPlaceholder || !logoRemove) return;
  
  if (logoUrl) {
    logoImg.src = api.resolveAssetUrl(logoUrl);
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
  stopOrdersPolling();
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
      const shops = await api.get("/shops/", { token });
      if (shops == null || (shops && shops.error)) return;
      
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

  currentShopsList = shopsList.length > 0 ? shopsList : [{ id: cachedShopId, name: cachedShopName }];
  renderStores(currentShopsList);

  if (token) {
    const shopMe = await fetchShopMe(token);
    if (shopMe) renderVerificationBanner(shopMe);
    await fetchLicenses(token, shopsList);
    await fetchOrders(token);
    await fetchProducts(token);
    updateOrdersBadge();
    startOrdersPolling(token);
  } else {
    renderVerificationBanner(null);
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
      
      const logoUrl = result === true ? null : api.resolveAssetUrl(result);
      
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
};

AppHeader.init({
  onNavClick: (id) => setActivePanel(id),
  onLangChange: (lang) => applyLang(lang)
});

// Открыть панель по хешу при загрузке
const hash = window.location.hash.slice(1);
if (hash && ["dashboard", "stores", "orders", "products", "licenses"].includes(hash)) {
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

loadAccount();

if (trialButton) {
  trialButton.addEventListener("click", createTrialLicense);
}

