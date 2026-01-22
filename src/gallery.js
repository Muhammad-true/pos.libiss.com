import { translations } from "./translations.js";
import "./styles.css";

const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const attrElements = Array.from(document.querySelectorAll("[data-i18n-attr]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const galleryItems = Array.from(document.querySelectorAll("[data-gallery]"));
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const zoomInButton = document.querySelector("[data-zoom-in]");
const zoomOutButton = document.querySelector("[data-zoom-out]");
const prevButton = document.querySelector("[data-prev]");
const nextButton = document.querySelector("[data-next]");
const lightboxCloseButtons = Array.from(
  document.querySelectorAll("[data-lightbox-close]")
);

let zoomLevel = 1;
let currentIndex = -1;

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

const openLightbox = (src, alt, index = 0) => {
  if (!lightbox || !lightboxImage) return;
  zoomLevel = 1;
  currentIndex = index;
  lightboxImage.src = src;
  lightboxImage.alt = alt || "";
  lightboxImage.style.transform = `scale(${zoomLevel})`;
  lightbox.classList.add("is-open");
  document.body.style.overflow = "hidden";
};

const closeLightbox = () => {
  if (!lightbox) return;
  lightbox.classList.remove("is-open");
  document.body.style.overflow = "";
  currentIndex = -1;
  if (lightboxImage) {
    lightboxImage.src = "";
    lightboxImage.alt = "";
  }
};

const setZoom = (nextZoom) => {
  zoomLevel = Math.min(3, Math.max(0.6, nextZoom));
  if (lightboxImage) {
    lightboxImage.style.transform = `scale(${zoomLevel})`;
  }
};

galleryItems.forEach((item) => {
  item.addEventListener("click", () => {
    const index = galleryItems.indexOf(item);
    openLightbox(item.dataset.src, item.dataset.alt, index);
  });
});

if (zoomInButton) {
  zoomInButton.addEventListener("click", () => setZoom(zoomLevel + 0.2));
}

if (zoomOutButton) {
  zoomOutButton.addEventListener("click", () => setZoom(zoomLevel - 0.2));
}

const showByIndex = (index) => {
  if (!galleryItems.length) return;
  const safeIndex = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[safeIndex];
  openLightbox(item.dataset.src, item.dataset.alt, safeIndex);
};

if (prevButton) {
  prevButton.addEventListener("click", () => showByIndex(currentIndex - 1));
}

if (nextButton) {
  nextButton.addEventListener("click", () => showByIndex(currentIndex + 1));
}

lightboxCloseButtons.forEach((btn) => {
  btn.addEventListener("click", closeLightbox);
});

window.addEventListener("keydown", (event) => {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  if (event.key === "Escape") {
    closeLightbox();
  }
  if (event.key === "ArrowLeft") {
    showByIndex(currentIndex - 1);
  }
  if (event.key === "ArrowRight") {
    showByIndex(currentIndex + 1);
  }
});

applyLang(detectLang());

