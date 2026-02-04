import "./styles.css";
import { translations } from "./translations.js";
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();

const API_BASE = "https://api.libiss.com/api/v1";
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
  const payload = {
    phone: formData.get("phone")?.toString().trim(),
    password: formData.get("password")?.toString()
  };

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const copy = translations[detectLang()];
      if (response.status === 400) {
        setStatus(copy["login.error400"], "error");
      } else if (response.status === 401) {
        setStatus(copy["login.error401"], "error");
      } else if (response.status === 404) {
        setStatus(copy["login.error404"], "error");
      } else {
        setStatus(copy["login.error500"], "error");
      }
      return;
    }
    const result = await response.json();
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

applyLang(detectLang());

