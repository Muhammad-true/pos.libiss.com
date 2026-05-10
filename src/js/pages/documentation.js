import { translations } from "../lib/translations.js";
import "../../styles.css";

const STORAGE_KEY = "libiss-pos-lang";

const detectLang = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
};

const applyLang = (lang) => {
  const copy = translations[lang] || translations.ru;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (copy[key]) el.textContent = copy[key];
  });
  document.documentElement.lang = lang;
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === lang);
  });
  localStorage.setItem(STORAGE_KEY, lang);
};

let activeTab = "install";

const loadBody = async () => {
  const lang = detectLang();
  const tr = translations[lang] || translations.ru;
  const name = activeTab === "install" ? `install.${lang}.md` : `usage.${lang}.md`;
  const pre = document.getElementById("doc-manual-body");
  const err = document.querySelector("[data-doc-error]");
  if (!pre) return;
  err.hidden = true;
  pre.textContent = tr["documentation.loading"] || "…";
  try {
    const res = await fetch(`/documentation/${name}?v=${Date.now()}`);
    if (!res.ok) throw new Error(String(res.status));
    pre.textContent = await res.text();
  } catch {
    err.textContent = tr["documentation.error"] || "Error";
    err.hidden = false;
    pre.textContent = "";
  }
};

const setTab = (tab) => {
  activeTab = tab === "usage" ? "usage" : "install";
  document.querySelectorAll("[data-doc-tab]").forEach((b) => {
    const on = b.dataset.docTab === activeTab;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  loadBody();
};

document.querySelectorAll("[data-doc-tab]").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.docTab));
});

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.lang;
    if (!lang) return;
    applyLang(lang);
    loadBody();
  });
});

const tabParam = new URLSearchParams(window.location.search).get("tab");
applyLang(detectLang());
setTab(tabParam === "usage" ? "usage" : "install");

document.body.style.opacity = "1";
