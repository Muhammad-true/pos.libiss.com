/**
 * Страница просмотра юридического документа по slug из hash (#terms_shop, #privacy_shop и т.д.)
 * Загружает контент с GET /api/v1/legal/:slug
 */

const DEFAULT_BASE = "https://api.libiss.com/api/v1";

function getApiBase() {
  return import.meta.env.VITE_API_URL || DEFAULT_BASE;
}

const titleEl = document.querySelector("[data-legal-title]");
const contentEl = document.querySelector("[data-legal-content]");

const SLUGS = ["terms_shop", "privacy_shop", "terms_client", "privacy_client"];

function getSlug() {
  const hash = (window.location.hash || "").replace(/^#/, "").trim();
  if (SLUGS.includes(hash)) return hash;
  return "terms_shop";
}

async function load() {
  const slug = getSlug();
  if (titleEl) titleEl.textContent = "Загрузка…";
  if (contentEl) contentEl.innerHTML = "";

  try {
    const base = getApiBase();
    const url = `${base.replace(/\/$/, "")}/legal/${slug}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      if (titleEl) titleEl.textContent = "Документ не найден";
      if (contentEl) contentEl.innerHTML = "<p>Не удалось загрузить документ. Попробуйте позже.</p>";
      return;
    }

    const doc = data?.data ?? data;
    const title = doc?.title ?? "Условия";
    const content = doc?.content ?? "";

    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.innerHTML = content || "<p>Текст не задан.</p>";
    document.title = `${title} — Libiss POS`;
  } catch (err) {
    if (titleEl) titleEl.textContent = "Ошибка";
    if (contentEl) contentEl.innerHTML = "<p>Не удалось загрузить документ. Проверьте интернет-соединение.</p>";
  }
}

window.addEventListener("hashchange", load);
load();
document.body.style.opacity = "1";
