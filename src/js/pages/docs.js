import { translations } from "../lib/translations.js";
import { api } from "../lib/api.js";
import "../../styles.css";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const welcome = document.querySelector("[data-docs-welcome]");

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
    if (lang) {
      applyLang(lang);
      if (tutorialSteps.length > 0) {
        updateTutorialUI();
      }
    }
  });
});

const renderWelcome = () => {
  if (!welcome) return;
  const userData = localStorage.getItem("userData");
  const shopId = localStorage.getItem("shopId");
  const parsed = userData ? JSON.parse(userData) : null;
  const name = parsed?.name;
  if (!name && !shopId) return;
  const message =
    translations[detectLang()]["docs.welcome"] ||
    "Регистрация завершена. Давайте настроим POS.";
  const details = [];
  if (name) details.push(name);
  if (shopId) details.push(shopId);
  welcome.textContent = `${message}${details.length ? " • " + details.join(" • ") : ""}`;
};

const tutorialSteps = Array.from(document.querySelectorAll("[data-tutorial-step]"));
const tutorialNext = document.querySelector("[data-tutorial-next]");
const tutorialPrev = document.querySelector("[data-tutorial-prev]");
const tutorialRestart = document.querySelector("[data-tutorial-restart]");
let currentTutorialStep = 0;

const updateTutorialUI = () => {
  tutorialSteps.forEach((step, index) => {
    step.hidden = index !== currentTutorialStep;
  });
  
  if (tutorialPrev) {
    tutorialPrev.hidden = currentTutorialStep === 0;
  }
  
  if (tutorialNext) {
    const isLast = currentTutorialStep === tutorialSteps.length - 1;
    tutorialNext.hidden = isLast;
    if (isLast) {
      tutorialNext.textContent = translations[detectLang()]["docs.tutorialComplete"] || "Завершено";
    } else {
      tutorialNext.textContent = translations[detectLang()]["docs.tutorialNext"] || "Далее";
    }
  }
  
  if (tutorialRestart) {
    tutorialRestart.hidden = currentTutorialStep !== tutorialSteps.length - 1;
  }
};

if (tutorialNext) {
  tutorialNext.addEventListener("click", () => {
    if (currentTutorialStep < tutorialSteps.length - 1) {
      currentTutorialStep++;
      updateTutorialUI();
    }
  });
}

if (tutorialPrev) {
  tutorialPrev.addEventListener("click", () => {
    if (currentTutorialStep > 0) {
      currentTutorialStep--;
      updateTutorialUI();
    }
  });
}

if (tutorialRestart) {
  tutorialRestart.addEventListener("click", () => {
    currentTutorialStep = 0;
    updateTutorialUI();
  });
}

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "—";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const formatDate = (dateString, lang) => {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    const locale = lang === "en" ? "en-US" : "ru-RU";
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "—";
  }
};

const getPlatformName = (platform, lang) => {
  const names = {
    ru: {
      windows: "Windows",
      android: "Android",
      server: "Сервер"
    },
    en: {
      windows: "Windows",
      android: "Android",
      server: "Server"
    }
  };
  return names[lang]?.[platform] || platform;
};

/**
 * Публичный эндпоинт: GET /api/v1/updates/latest?platform=server|windows|android|shop
 * Владелец магазина и любой пользователь могут скачивать. Ответ: { success, data: { fileUrl, fileName, version, ... } }
 */
const resolveFileUrl = (url) => api.resolveAssetUrl(url || "");

const loadLatestUpdate = async (platform) => {
  const card = document.querySelector(`.docs-update-card[data-updates-platform="${platform}"]`);
  const link = card?.querySelector(`[data-updates-download][data-platform="${platform}"]`);
  const textSpan = link?.querySelector("[data-updates-btn-text]");
  const versionEl = card?.querySelector("[data-updates-version]");
  const sizeEl = card?.querySelector("[data-updates-size]");
  const dateEl = card?.querySelector("[data-updates-date]");
  const lang = detectLang();
  const t = translations[lang];
  const lblDownload = t["docs.download"] || "Скачать";
  const lblLoading = t["docs.updatesBtnLoading"] || "Загрузка...";
  const lblUnavailable = t["docs.updatesBtnUnavailable"] || "Недоступно";
  const lblVersion = t["docs.updateVersion"] || "Версия";
  const lblSize = t["docs.updateSize"] || "Размер";
  const lblDate = t["docs.updateDateLabel"] || t["docs.updateDate"] || "Загружено";

  if (!link || !textSpan) return;

  textSpan.textContent = lblLoading;
  link.removeAttribute("href");
  link.classList.add("is-loading");

  const setMeta = (version, size, date) => {
    if (versionEl) versionEl.textContent = version != null ? `${lblVersion}: ${version}` : "—";
    if (sizeEl) sizeEl.textContent = size != null ? `${lblSize}: ${size}` : "—";
    if (dateEl) dateEl.textContent = date != null ? `${lblDate}: ${date}` : "—";
  };

  try {
    const result = await api.get(`/updates/latest?platform=${encodeURIComponent(platform)}`, { token: null });

    if (!result || result.error || !result?.success || !result?.data) {
      link.classList.remove("is-loading");
      link.classList.add("is-unavailable");
      textSpan.textContent = lblUnavailable;
      setMeta(null, null, null);
      return;
    }

    const data = result.data;
    const fileUrl = data.fileUrl ? resolveFileUrl(data.fileUrl) : "";
    const fileName = data.fileName || "";
    const version = data.version || "";
    const sizeStr = formatFileSize(data.fileSize);
    const dateStr = formatDate(data.createdAt, lang);

    setMeta(version, sizeStr, dateStr);

    if (fileUrl) {
      link.href = fileUrl;
      if (fileName) link.setAttribute("download", fileName.replace(/"/g, "&quot;"));
      link.classList.remove("is-loading", "is-unavailable");
      textSpan.textContent = lblDownload;
    } else {
      link.classList.remove("is-loading");
      link.classList.add("is-unavailable");
      textSpan.textContent = lblUnavailable;
    }
  } catch (err) {
    console.error("Error fetching latest update for", platform, err);
    link.classList.remove("is-loading");
    link.classList.add("is-unavailable");
    textSpan.textContent = lblUnavailable;
    setMeta(null, null, null);
  }
};

const fetchUpdates = () => {
  ["server", "windows", "android", "shop"].forEach((platform) => loadLatestUpdate(platform));
};

applyLang(detectLang());
document.body.style.opacity = "1";
renderWelcome();
if (tutorialSteps.length > 0) {
  updateTutorialUI();
}
fetchUpdates();

