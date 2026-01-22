import { translations } from "./translations.js";

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

applyLang(detectLang());
renderWelcome();
if (tutorialSteps.length > 0) {
  updateTutorialUI();
}

