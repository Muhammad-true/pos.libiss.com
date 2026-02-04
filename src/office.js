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
      // API возвращает { success: true, data: { id, name, ... } }
      user = profile?.data || profile?.user || profile?.data?.user || profile;
      localStorage.setItem("userData", JSON.stringify(user));
      console.log("User profile loaded:", user);
    }
  }

  renderWelcome(user?.name);

  let shopsList = [];
  if (token) {
    try {
      const shops = await fetchJson(`${API_BASE}/shops/`, token);
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
  }
};

applyLang(detectLang());
loadAccount();

if (trialButton) {
  trialButton.addEventListener("click", createTrialLicense);
}

