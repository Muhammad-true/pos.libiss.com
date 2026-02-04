import { injectSpeedInsights } from "@vercel/speed-insights";
import "./styles.css";
import { translations } from "./translations.js";

injectSpeedInsights();

const API_BASE = "https://api.libiss.com/api/v1";
const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const form = document.querySelector("[data-form]");
const status = document.querySelector("[data-status]");
const citySelect = document.querySelector("#cityId");
const steps = Array.from(document.querySelectorAll("[data-step]"));
const nextButton = document.querySelector("[data-next]");
const prevButton = document.querySelector("[data-prev]");
const errorFields = new Map(
  Array.from(document.querySelectorAll("[data-error-for]")).map((el) => [
    el.dataset.errorFor,
    el
  ])
);

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
      updateAuthButtons();
    }
  });
});

const setStatus = (message, type) => {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-success", type === "success");
};

const clearFieldError = (field) => {
  field.classList.remove("is-invalid");
  const errorNode = errorFields.get(field.name);
  if (errorNode) errorNode.textContent = "";
};

const setFieldError = (field, message) => {
  field.classList.add("is-invalid");
  const errorNode = errorFields.get(field.name);
  if (errorNode) errorNode.textContent = message;
};

const getFieldMessage = (field) => {
  const copy = translations[detectLang()];
  if (field.validity.valueMissing) {
    return copy["form.errorRequired"];
  }
  if (field.validity.typeMismatch && field.type === "email") {
    return copy["form.errorEmailFormat"];
  }
  if (field.validity.tooShort) {
    return copy["form.errorPasswordShort"];
  }
  return copy["form.errorInvalid"];
};

let currentStep = 0;

const updateStepUI = () => {
  steps.forEach((step, index) => {
    step.hidden = index !== currentStep;
  });
  if (prevButton) prevButton.disabled = currentStep === 0;
  if (nextButton) {
    nextButton.hidden = currentStep === steps.length - 1;
    nextButton.disabled = false;
  }
  const submitButton = form?.querySelector("button[type='submit']");
  if (submitButton) submitButton.hidden = currentStep !== steps.length - 1;
};

const isStepValid = () => {
  const step = steps[currentStep];
  if (!step) return true;
  const fields = Array.from(step.querySelectorAll("input, textarea, select"));
  for (const field of fields) {
    if (!field.checkValidity()) {
      return false;
    }
  }
  return true;
};

const validateStep = () => {
  if (!isStepValid()) {
    setStatus(translations[detectLang()]["form.errorStep"], "error");
    const step = steps[currentStep];
    const fields = Array.from(step.querySelectorAll("input, textarea, select"));
    const invalidFields = fields.filter((field) => !field.checkValidity());
    invalidFields.forEach((field) => {
      setFieldError(field, getFieldMessage(field));
    });
    if (invalidFields[0]) {
      invalidFields[0].focus();
    }
    return false;
  }
  return true;
};

const loadCities = async () => {
  if (!citySelect) return;
  try {
    const response = await fetch(`${API_BASE}/cities/`);
    if (!response.ok) throw new Error("cities");
    const payload = await response.json();
    const cities = payload?.data?.cities || [];
    cities.forEach((city) => {
      if (!city?.id || !city?.name) return;
      const option = document.createElement("option");
      option.value = city.id;
      option.textContent = city.name;
      citySelect.appendChild(option);
    });
  } catch (error) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent =
      translations[detectLang()]["form.cityError"] || "Города недоступны";
    citySelect.appendChild(option);
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!form) return;
  setStatus("", "");
  if (!validateStep()) return;
  const formData = new FormData(form);
  const password = formData.get("password")?.toString() || "";
  const passwordConfirm = formData.get("passwordConfirm")?.toString() || "";
  if (password !== passwordConfirm) {
    setStatus(translations[detectLang()]["form.errorPasswordMatch"], "error");
    const passwordConfirmField = form.querySelector("#passwordConfirm");
    if (passwordConfirmField) {
      setFieldError(
        passwordConfirmField,
        translations[detectLang()]["form.errorPasswordMatch"]
      );
    }
    return;
  }
  const payload = {
    name: formData.get("name")?.toString().trim(),
    email: formData.get("email")?.toString().trim(),
    password: password,
    phone: formData.get("phone")?.toString().trim(),
    shopName: formData.get("shopName")?.toString().trim(),
    inn: formData.get("inn")?.toString().trim(),
    description: formData.get("description")?.toString().trim(),
    address: formData.get("address")?.toString().trim()
  };
  const cityId = formData.get("cityId")?.toString().trim();
  if (cityId) payload.cityId = cityId;

  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/shop-registration/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.status === 409) {
      setStatus(translations[detectLang()]["form.errorEmail"], "error");
      return;
    }
    if (!response.ok) {
      setStatus(translations[detectLang()]["form.errorGeneric"], "error");
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
    if (result?.data?.shop?.name) {
      localStorage.setItem("shopName", result.data.shop.name);
    }
    form.reset();
    setStatus(translations[detectLang()]["form.success"], "success");
    window.location.href = "/office.html";
  } catch (error) {
    setStatus(translations[detectLang()]["form.errorGeneric"], "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
};

if (form) {
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", () => {
    setStatus("", "");
  });
  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      clearFieldError(target);
    }
    if (target instanceof HTMLTextAreaElement) {
      clearFieldError(target);
    }
    if (target instanceof HTMLSelectElement) {
      clearFieldError(target);
    }
  });
}

if (nextButton) {
  nextButton.addEventListener("click", () => {
    setStatus("", "");
    if (!validateStep()) return;
    currentStep = Math.min(currentStep + 1, steps.length - 1);
    updateStepUI();
  });
}

if (prevButton) {
  prevButton.addEventListener("click", () => {
    setStatus("", "");
    currentStep = Math.max(currentStep - 1, 0);
    updateStepUI();
  });
}

const updateAuthButtons = () => {
  const token = localStorage.getItem("userToken");
  const authButtons = Array.from(document.querySelectorAll("[data-auth-toggle]"));
  const lang = detectLang();
  
  authButtons.forEach((btn) => {
    const currentKey = btn.getAttribute("data-i18n");
    if (token) {
      btn.href = "/office.html";
      if (currentKey === "form.login") {
        btn.textContent = translations[lang]["form.loginOffice"] || "Уже есть магазин? В кабинет";
        btn.setAttribute("data-i18n", "form.loginOffice");
      } else {
        btn.textContent = translations[lang]["cta.office"] || "В кабинет";
        btn.setAttribute("data-i18n", "cta.office");
      }
    } else {
      btn.href = "/login.html";
      if (currentKey === "form.loginOffice") {
        btn.textContent = translations[lang]["form.login"] || "Уже есть магазин? Войти";
        btn.setAttribute("data-i18n", "form.login");
      } else {
        btn.textContent = translations[lang]["cta.login"] || "Войти";
        btn.setAttribute("data-i18n", "cta.login");
      }
    }
  });
};

applyLang(detectLang());
loadCities();
updateStepUI();
updateAuthButtons();

