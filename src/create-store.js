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
const logoInput = document.querySelector("[data-logo-input]");
const logoPreview = document.querySelector("[data-logo-preview]");
const logoPreviewImg = document.querySelector("[data-logo-preview-img]");
const logoRemove = document.querySelector("[data-logo-remove]");
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
    const isVisible = index === currentStep;
    step.hidden = !isVisible;
    
    // Отключаем required для полей на скрытых шагах, чтобы избежать ошибок валидации браузера
    const fields = step.querySelectorAll("input[required], textarea[required], select[required]");
    fields.forEach((field) => {
      if (!isVisible) {
        // Сохраняем состояние required перед отключением
        if (field.hasAttribute("required")) {
          field.setAttribute("data-was-required", "true");
          field.removeAttribute("required");
        }
      } else {
        // Восстанавливаем required для видимого шага
        if (field.getAttribute("data-was-required") === "true") {
          field.setAttribute("required", "");
        }
        field.removeAttribute("data-was-required");
      }
    });
  });
  
  const isLastStep = currentStep === steps.length - 1;
  
  if (prevButton) {
    prevButton.disabled = currentStep === 0;
  }
  
  if (nextButton) {
    // Скрываем "Далее" на последнем шаге
    nextButton.hidden = isLastStep;
    nextButton.disabled = false;
  }
  
  const submitButton = form?.querySelector("button[type='submit']");
  if (submitButton) {
    // Показываем "Создать магазин" только на последнем шаге
    submitButton.hidden = !isLastStep;
  }
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

const uploadLogo = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  // Используем базовый URL API без /api/v1 для эндпоинта загрузки
  const uploadUrl = API_BASE.replace("/api/v1", "") + "/api/upload/image?folder=shops";
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Ошибка загрузки изображения");
  }

  const data = await response.json();
  if (data.success) {
    return data.url;
  } else {
    throw new Error(data.error || "Ошибка загрузки изображения");
  }
};

const validateLogoFile = (file) => {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: translations[detectLang()]["form.errorLogoFormat"] || "Неподдерживаемый формат изображения."
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: translations[detectLang()]["form.errorLogoSize"] || "Размер файла превышает 50MB."
    };
  }

  return { valid: true };
};

const showLogoPreview = (file) => {
  if (!logoPreview || !logoPreviewImg) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    logoPreviewImg.src = e.target.result;
    logoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
};

const hideLogoPreview = () => {
  if (logoPreview) logoPreview.hidden = true;
  if (logoInput) logoInput.value = "";
};

if (logoInput) {
  logoInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      hideLogoPreview();
      return;
    }

    const validation = validateLogoFile(file);
    if (!validation.valid) {
      setStatus(validation.error, "error");
      hideLogoPreview();
      return;
    }

    clearFieldError(logoInput);
    showLogoPreview(file);
  });
}

if (logoRemove) {
  logoRemove.addEventListener("click", () => {
    hideLogoPreview();
  });
}

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
  
  const submitButton = form.querySelector("button[type='submit']");
  // Защита от двойного клика
  if (submitButton && submitButton.disabled) return;
  
  setStatus("", "");
  
  // Восстанавливаем required для всех полей перед валидацией
  steps.forEach((step) => {
    const fields = step.querySelectorAll("input[data-was-required='true'], textarea[data-was-required='true'], select[data-was-required='true']");
    fields.forEach((field) => {
      field.setAttribute("required", "");
    });
  });
  
  // Валидируем все шаги
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const fields = Array.from(step.querySelectorAll("input, textarea, select"));
    for (const field of fields) {
      if (field.hasAttribute("required") && !field.checkValidity()) {
        setStatus(translations[detectLang()]["form.errorStep"], "error");
        // Переключаемся на шаг с ошибкой
        currentStep = i;
        updateStepUI();
        field.focus();
        return;
      }
    }
  }
  
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
  // Получаем код страны и номер телефона
  const countryCode = formData.get("countryCode")?.toString().trim() || "+992";
  const phoneNumber = formData.get("phone")?.toString().trim();
  const fullPhone = phoneNumber ? `${countryCode}${phoneNumber}` : "";
  
  const payload = {
    name: formData.get("name")?.toString().trim(),
    email: formData.get("email")?.toString().trim(),
    password: password,
    phone: fullPhone,
    shopName: formData.get("shopName")?.toString().trim(),
    inn: formData.get("inn")?.toString().trim(),
    description: formData.get("description")?.toString().trim(),
    address: formData.get("address")?.toString().trim()
  };
  const cityId = formData.get("cityId")?.toString().trim();
  if (cityId) payload.cityId = cityId;

  // Загружаем логотип, если он выбран (опционально)
  let logoUrl = "";
  const logoFile = logoInput?.files[0];
  if (logoFile) {
    try {
      setStatus(translations[detectLang()]["form.logoUploading"] || "Загрузка логотипа...", "");
      logoUrl = await uploadLogo(logoFile);
      // Очищаем статус после успешной загрузки
      setStatus("", "");
    } catch (error) {
      // Если загрузка не удалась, продолжаем без логотипа
      // Показываем предупреждение, но не блокируем регистрацию
      console.warn("Не удалось загрузить логотип, продолжаем без него:", error);
      logoUrl = ""; // Продолжаем без логотипа
      // Не показываем ошибку, чтобы не блокировать регистрацию
      // setStatus("", ""); // Очищаем статус, чтобы продолжить
    }
  }

  // Добавляем логотип в payload только если он был успешно загружен
  if (logoUrl) {
    payload.logo = logoUrl;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/shop-registration/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.status === 409) {
      setStatus(translations[detectLang()]["form.errorEmail"], "error");
      if (submitButton) submitButton.disabled = false;
      return;
    }
    if (!response.ok) {
      setStatus(translations[detectLang()]["form.errorGeneric"], "error");
      if (submitButton) submitButton.disabled = false;
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
    hideLogoPreview();
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
    // Защита от двойного клика
    if (nextButton.disabled) return;
    setStatus("", "");
    if (!validateStep()) return;
    nextButton.disabled = true;
    currentStep = Math.min(currentStep + 1, steps.length - 1);
    updateStepUI();
    // Включаем кнопку обратно после небольшой задержки
    setTimeout(() => {
      nextButton.disabled = false;
    }, 300);
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

// Инициализация селектора страны
const initCountrySelector = () => {
  const selectors = document.querySelectorAll("[data-country-selector]");
  
  selectors.forEach((selector) => {
    const btn = selector.querySelector("[data-country-btn]");
    const dropdown = selector.querySelector("[data-country-dropdown]");
    const flag = selector.querySelector("[data-country-flag]");
    const code = selector.querySelector("[data-country-code]");
    
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
loadCities();
// Инициализируем UI шагов перед обновлением, чтобы правильно настроить required атрибуты
updateStepUI();
updateAuthButtons();
initCountrySelector();

