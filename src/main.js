import { translations } from "./translations.js";
import "./styles.css";

const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));

const animatedNodes = [
  ...document.querySelectorAll(
    ".slide-inner, .section-title, .section-subtitle, .card, .list-item, .step, .actions"
  )
];

animatedNodes.forEach((node) => node.classList.add("animate"));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
      }
    });
  },
  { threshold: 0.2 }
);

animatedNodes.forEach((node) => observer.observe(node));

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

const updateAuthButtons = () => {
  const token = localStorage.getItem("userToken");
  const authButtons = Array.from(document.querySelectorAll("[data-auth-toggle]"));
  const lang = detectLang();
  
  authButtons.forEach((btn) => {
    const currentKey = btn.getAttribute("data-i18n");
    if (token) {
      btn.href = "/office.html";
      if (currentKey === "form.login") {
        // Для ссылок "Уже есть магазин? Войти"
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
updateAuthButtons();

