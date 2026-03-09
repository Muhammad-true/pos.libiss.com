import "../../styles.css";
import { translations } from "../lib/translations.js";
import { api } from "../lib/api.js";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const form = document.querySelector("[data-form]");
const status = document.querySelector("[data-status]");

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

const setStatus = (message, type) => {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-success", type === "success");
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!form) return;
  
  const submitButton = form.querySelector("button[type='submit']");
  // Защита от двойного клика
  if (submitButton && submitButton.disabled) return;
  
  setStatus("", "");

  const formData = new FormData(form);
  // Получаем код страны и номер телефона
  const countryCode = formData.get("countryCode")?.toString().trim() || "+992";
  const phoneNumber = formData.get("phone")?.toString().trim();
  
  // Объединяем код страны и номер телефона
  const fullPhone = phoneNumber ? `${countryCode}${phoneNumber}` : "";
  
  // Проверяем, что номер телефона введен
  if (!phoneNumber) {
    setStatus(translations[detectLang()]["login.error400"] || "Введите номер телефона", "error");
    if (submitButton) submitButton.disabled = false;
    return;
  }
  
  const payload = {
    phone: fullPhone,
    password: formData.get("password")?.toString()
  };
  
  console.log("Отправка входа:", { phone: fullPhone, countryCode, phoneNumber });

  if (submitButton) submitButton.disabled = true;

  try {
    const result = await api.post("/auth/login", payload, { token: null });
    const copy = translations[detectLang()];

    if (result && result.error) {
      let errorMessage = "";
      if (result.status === 400) errorMessage = copy["login.error400"] || "Неверные данные. Проверьте формат телефона и пароля.";
      else if (result.status === 401) errorMessage = copy["login.error401"] || "Неверный телефон или пароль.";
      else if (result.status === 404) errorMessage = copy["login.error404"] || "Эндпоинт входа еще не реализован.";
      else errorMessage = copy["login.error500"] || "Ошибка сервера. Попробуйте позже.";
      if (result.message) errorMessage = result.message;
      setStatus(errorMessage, "error");
      if (submitButton) submitButton.disabled = false;
      return;
    }
    if (result?.data?.token) {
      localStorage.setItem("userToken", result.data.token);
    }
    if (result?.data?.user) {
      localStorage.setItem("userData", JSON.stringify(result.data.user));
    }
    if (result?.data?.shop?.id) {
      localStorage.setItem("shopId", result.data.shop.id);
    }
    setStatus(translations[detectLang()]["login.success"], "success");
    window.location.href = "/office.html";
  } catch (error) {
    setStatus(translations[detectLang()]["login.error"], "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

if (form) {
  form.addEventListener("submit", handleSubmit);
}

// Инициализация селектора страны
const initCountrySelector = () => {
  const selectors = document.querySelectorAll("[data-country-selector]");
  
  selectors.forEach((selector) => {
    const btn = selector.querySelector("[data-country-btn]");
    const dropdown = selector.querySelector("[data-country-dropdown]");
    const flag = selector.querySelector("[data-country-flag]");
    const code = selector.querySelector("[data-country-code]");
    const codeInput = document.querySelector("[data-country-code-input]");
    
    if (!btn || !dropdown) return;
    
    // Обработчик клика на кнопку
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = dropdown.hidden;
      // Закрываем все другие дропдауны
      document.querySelectorAll("[data-country-dropdown]").forEach((d) => {
        d.hidden = true;
      });
      dropdown.hidden = !isHidden;
    });
    
    // Обработчик выбора страны
    const countryOptions = dropdown.querySelectorAll(".country-option");
    countryOptions.forEach((option) => {
      option.addEventListener("click", () => {
        const country = option.dataset.country;
        const countryCode = option.dataset.code;
        const countryFlag = option.querySelector(".country-flag").textContent;
        
        if (flag) flag.textContent = countryFlag;
        if (code) code.textContent = countryCode;
        
        // Находим соответствующий codeInput для этого селектора
        const form = selector.closest("form");
        const formCodeInput = form?.querySelector("[data-country-code-input]");
        if (formCodeInput) formCodeInput.value = countryCode;
        
        dropdown.hidden = true;
      });
    });
    
    // Закрытие при клике вне
    document.addEventListener("click", (e) => {
      if (!selector.contains(e.target)) {
        dropdown.hidden = true;
      }
    });
  });
};

applyLang(detectLang());
document.body.style.opacity = "1";
initCountrySelector();

