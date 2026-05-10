/**
 * Единый апбар для всех приложений: иконка слева, заголовок по центру, меню справа.
 * Использование: поместите <div data-app-header data-app-title="Заголовок"></div> в page,
 * затем вызовите AppHeader.init() после загрузки DOM.
 */
import { translations } from "../lib/translations.js";

const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";
const DRAWER_OPEN_GUARD_MS = 320;

let container = null;
let titleEl = null;
let drawerBackdrop = null;
let drawer = null;
let drawerOpenedAt = 0;
let onNavClick = null;

function detectLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function t(key) {
  return (translations[detectLang()] && translations[detectLang()][key]) || key;
}

function applyLangToHeader() {
  const lang = detectLang();
  if (titleEl && container) {
    const key = container.dataset.appTitleKey;
    if (key) titleEl.textContent = t(key);
  }
  const items = container?.querySelectorAll("[data-i18n]");
  const langBtns = container?.querySelectorAll(".lang-btn");
  const copy = translations[lang] || translations[DEFAULT_LANG];
  items?.forEach((el) => {
    const k = el.dataset.i18n;
    if (copy[k]) el.textContent = copy[k];
  });
  langBtns?.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.lang === lang));
  localStorage.setItem(STORAGE_KEY, lang);
}

function openDrawer() {
  drawerOpenedAt = Date.now();
  requestAnimationFrame(() => {
    if (drawerBackdrop) {
      drawerBackdrop.hidden = false;
      drawerBackdrop.setAttribute("aria-hidden", "false");
    }
    if (drawer) drawer.classList.add("is-open");
    document.body.classList.add("office-drawer-open");
  });
}

function closeDrawer() {
  if (drawerBackdrop) {
    drawerBackdrop.hidden = true;
    drawerBackdrop.setAttribute("aria-hidden", "true");
  }
  if (drawer) drawer.classList.remove("is-open");
  document.body.classList.remove("office-drawer-open");
}

function getTitle() {
  const key = container?.dataset?.appTitleKey;
  if (key) return t(key);
  return container?.dataset?.appTitle ?? "";
}

function render() {
  const title = container.dataset.appTitle ?? getTitle();
  const logoHref = container.dataset.appLogoHref ?? "/office.html";
  const isOffice = window.location.pathname.includes("office");
  const navItems = [
    { id: "dashboard", key: "office.menuDashboard" },
    { id: "stores", key: "office.menuStores" },
    { id: "orders", key: "office.menuOrders" },
    { id: "products", key: "office.menuProducts" },
    { id: "reports", key: "office.menuReports" },
    { id: "cashier", key: "office.menuCashier" },
    { id: "debtors", key: "office.menuDebtors" },
    { id: "updates", key: "office.menuUpdates" },
    { id: "licenses", key: "office.menuLicenses" }
  ];
  const navHtml = navItems
    .map(
      (item) =>
        `<a class="office-drawer-item" href="/office.html#${item.id}" data-nav-id="${item.id}" data-i18n="${item.key}">${t(item.key)}</a>`
    )
    .join("");
  container.innerHTML = `
    <header class="topbar office-topbar">
      <div class="container nav">
        <a class="office-topbar-logo" href="${logoHref}" aria-label="Libiss POS">
          <img class="logo-image" src="/logo.png" alt="Libiss" width="32" height="32" />
        </a>
        <h1 class="office-topbar-title" data-app-header-title>${title}</h1>
        <button type="button" class="office-menu-btn" aria-label="Меню" data-app-menu-open>
          <span class="office-menu-btn__line"></span>
          <span class="office-menu-btn__line"></span>
          <span class="office-menu-btn__line"></span>
        </button>
      </div>
    </header>
    <div class="office-drawer-backdrop" data-app-drawer-backdrop hidden aria-hidden="true"></div>
    <aside class="office-drawer" data-app-drawer aria-label="Меню">
      <div class="office-drawer-inner">
        <nav class="office-drawer-nav">
          ${navHtml}
        </nav>
        <div class="office-drawer-footer">
          <div class="lang-toggle" role="group" aria-label="Language">
            <button class="lang-btn is-active" type="button" data-lang="ru">RU</button>
            <button class="lang-btn" type="button" data-lang="en">EN</button>
          </div>
          <button type="button" class="btn btn-secondary office-drawer-logout" data-app-logout data-i18n="office.logout">${t("office.logout")}</button>
        </div>
      </div>
    </aside>
  `;
  titleEl = container.querySelector("[data-app-header-title]");
  drawerBackdrop = container.querySelector("[data-app-drawer-backdrop]");
  drawer = container.querySelector("[data-app-drawer]");

  container.querySelector("[data-app-menu-open]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openDrawer();
  });

  drawerBackdrop?.addEventListener("click", (e) => {
    if (e.target !== drawerBackdrop) return;
    if (Date.now() - drawerOpenedAt < DRAWER_OPEN_GUARD_MS) return;
    closeDrawer();
  });

  container.querySelectorAll("[data-nav-id]").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (onNavClick && isOffice) {
        e.preventDefault();
        const id = link.dataset.navId;
        if (id) onNavClick(id);
        closeDrawer();
      }
    });
  });

  container.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (lang) {
        localStorage.setItem(STORAGE_KEY, lang);
        applyLangToHeader();
        container._appHeaderOnLangChange?.(lang);
      }
    });
  });

  container.querySelector("[data-app-logout]")?.addEventListener("click", () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("shopId");
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = "/login.html?redirect=" + redirect;
  });
}

export const AppHeader = {
  init(options = {}) {
    container = document.querySelector("[data-app-header]");
    if (!container) return;
    onNavClick = options.onNavClick || null;
    if (options.logoHref) container.dataset.appLogoHref = options.logoHref;
    if (options.titleKey) container.dataset.appTitleKey = options.titleKey;
    else if (options.title) container.dataset.appTitle = options.title;
    container._appHeaderOnLangChange = options.onLangChange || null;
    render();
  },

  setTitle(text) {
    if (titleEl) titleEl.textContent = text;
  },

  setActiveNav(id) {
    container?.querySelectorAll("[data-nav-id]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.navId === id);
    });
  }
};
