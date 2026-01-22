import { translations } from "./translations.js";
import "./styles.css";

const API_BASE = "https://api.libiss.com/api/v1";
const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const welcome = document.querySelector("[data-office-welcome]");
const storeRow = document.querySelector("[data-office-store]");
const storeName = document.querySelector("[data-office-store-name]");
const storeId = document.querySelector("[data-office-store-id]");
const storePlan = document.querySelector("[data-office-store-plan]");
const storeSubscribed = document.querySelector("[data-office-store-subscribed]");
const licenseRow = document.querySelector("[data-office-license]");
const licenseShop = document.querySelector("[data-office-license-shop]");
const licenseShopId = document.querySelector("[data-office-license-shop-id]");
const licenseKey = document.querySelector("[data-office-license-key]");
const licenseDays = document.querySelector("[data-office-license-days]");
const licenseExpires = document.querySelector("[data-office-license-expires]");
const trialButton = document.querySelector("[data-trial-btn]");
const trialStatus = document.querySelector("[data-trial-status]");

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

const renderStore = (row, shop) => {
  if (!row) return;
  const nameNode = row.querySelector("[data-office-store-name]");
  const idNode = row.querySelector("[data-office-store-id]");
  const planNode = row.querySelector("[data-office-store-plan]");
  const subNode = row.querySelector("[data-office-store-subscribed]");
  if (nameNode) nameNode.textContent = shop?.name || "—";
  if (idNode) idNode.textContent = shop?.id || "—";
  if (planNode) {
    planNode.textContent =
      shop?.license?.subscriptionType ||
      shop?.license?.subscriptionStatus ||
      translations[detectLang()]["office.planEmpty"];
  }
  if (subNode) {
    if (shop?.isSubscribed === true) {
      subNode.textContent = translations[detectLang()]["office.subscribedYes"];
    } else if (shop?.isSubscribed === false) {
      subNode.textContent = translations[detectLang()]["office.subscribedNo"];
    } else {
      subNode.textContent =
        translations[detectLang()]["office.subscribedUnknown"];
    }
  }
};

const renderStores = (shops) => {
  if (!storeRow) return;
  const list = Array.isArray(shops) ? shops : [];
  const parent = storeRow.parentElement;
  if (!parent) return;
  parent.querySelectorAll("[data-office-store]").forEach((node) => node.remove());
  if (list.length === 0) {
    const row = storeRow.cloneNode(true);
    renderStore(row, {});
    parent.appendChild(row);
    return;
  }
  list.forEach((shop) => {
    const row = storeRow.cloneNode(true);
    renderStore(row, shop);
    parent.appendChild(row);
  });
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const renderLicense = (license) => {
  if (!licenseRow) return;
  if (licenseShop) licenseShop.textContent = license?.shop?.name || "—";
  if (licenseShopId) {
    licenseShopId.textContent = license?.shop?.id || license?.shopId || "—";
  }
  if (licenseKey) {
    licenseKey.textContent = license?.licenseKey || license?.key || "—";
  }
  if (licenseDays) {
    licenseDays.textContent =
      Number.isFinite(license?.daysRemaining) ? String(license.daysRemaining) : "—";
  }
  if (licenseExpires) {
    licenseExpires.textContent = formatDate(license?.expiresAt || license?.expires_at);
  }
};

const renderLicenses = (licenses) => {
  if (!licenseRow || !Array.isArray(licenses) || licenses.length === 0) {
    renderLicense(null);
    return;
  }
  const list = licenses.map((license) => {
    const row = licenseRow.cloneNode(true);
    row.querySelector("[data-office-license-shop]").textContent =
      license?.shop?.name || "—";
    row.querySelector("[data-office-license-shop-id]").textContent =
      license?.shop?.id || license?.shopId || "—";
    row.querySelector("[data-office-license-key]").textContent =
      license?.licenseKey || license?.key || "—";
    row.querySelector("[data-office-license-days]").textContent =
      Number.isFinite(license?.daysRemaining) ? String(license.daysRemaining) : "—";
    row.querySelector("[data-office-license-expires]").textContent =
      formatDate(license?.expiresAt || license?.expires_at);
    return row;
  });
  const parent = licenseRow.parentElement;
  if (parent) {
    parent.querySelectorAll("[data-office-license]").forEach((node) => node.remove());
    list.forEach((row) => parent.appendChild(row));
  }
};

const handleCopy = async (button) => {
  const field = button.dataset.copy;
  const row = button.closest("[data-office-license]");
  if (!row) return;
  const valueNode =
    field === "shopId"
      ? row.querySelector("[data-office-license-shop-id]")
      : row.querySelector("[data-office-license-key]");
  const value = valueNode?.textContent?.trim();
  if (!value || value === "—") return;
  try {
    await navigator.clipboard.writeText(value);
    button.classList.add("is-copied");
    button.setAttribute("aria-label", translations[detectLang()]["office.copied"]);
    setTimeout(() => {
      button.classList.remove("is-copied");
      button.setAttribute("aria-label", translations[detectLang()]["office.copy"]);
    }, 1200);
  } catch (error) {
    button.setAttribute("aria-label", translations[detectLang()]["office.copyFailed"]);
    setTimeout(() => {
      button.setAttribute("aria-label", translations[detectLang()]["office.copy"]);
    }, 1200);
  }
};

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("[data-copy]")) {
    handleCopy(target);
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
      if (response.status === 409) {
        setTrialStatus(translations[detectLang()]["office.trialExists"], "error");
      } else {
        setTrialStatus(translations[detectLang()]["office.trialError"], "error");
      }
      return;
    }
    const result = await response.json();
    if (result?.data) {
      localStorage.setItem("licenseData", JSON.stringify(result.data));
      setTrialStatus(translations[detectLang()]["office.trialSuccess"], "success");
      await fetchLicenses(token);
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
  if (!response.ok) return null;
  return response.json();
};

const loadAccount = async () => {
  const token = localStorage.getItem("userToken");
  const cachedUser = localStorage.getItem("userData");
  const cachedShopId = localStorage.getItem("shopId");
  const cachedShopName = localStorage.getItem("shopName");
  let user = cachedUser ? JSON.parse(cachedUser) : null;

  if (token) {
    const profile = await fetchJson(`${API_BASE}/users/profile`, token);
    if (profile) {
      user = profile;
      localStorage.setItem("userData", JSON.stringify(profile));
    }
  }

  renderWelcome(user?.name);

  let shopsList = [];
  if (token && user?.id) {
    const shops = await fetchJson(`${API_BASE}/shops/`, token);
    const list =
      (Array.isArray(shops) && shops) ||
      shops?.data?.shops ||
      shops?.data ||
      shops?.shops ||
      [];
    const allShops = Array.isArray(list) ? list : [];
    
    // Фильтруем только магазины текущего пользователя
    const userId = String(user.id);
    shopsList = allShops.filter((shop) => {
      // Проверяем все возможные поля для идентификации владельца
      const shopUserId = shop?.userId ? String(shop.userId) : null;
      const shopOwnerId = shop?.ownerId ? String(shop.ownerId) : null;
      const shopUser = shop?.user;
      const shopUserIdFromObj = shopUser?.id ? String(shopUser.id) : null;
      const shopOwner = shop?.owner;
      const shopOwnerIdFromObj = shopOwner?.id ? String(shopOwner.id) : null;
      
      return (
        shopUserId === userId ||
        shopOwnerId === userId ||
        shopUserIdFromObj === userId ||
        shopOwnerIdFromObj === userId
      );
    });
    const firstShop = shopsList[0] || null;
    if (firstShop?.id) {
      localStorage.setItem("shopId", firstShop.id);
      if (firstShop?.name) {
        localStorage.setItem("shopName", firstShop.name);
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
  }
};

applyLang(detectLang());
loadAccount();

if (trialButton) {
  trialButton.addEventListener("click", createTrialLicense);
}

