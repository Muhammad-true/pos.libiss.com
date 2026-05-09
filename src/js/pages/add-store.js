import { injectSpeedInsights } from "@vercel/speed-insights";
import "../../styles.css";
import { translations } from "../lib/translations.js";
import { api } from "../lib/api.js";

injectSpeedInsights();

const STORAGE_KEY = "libiss-pos-lang";
const DEFAULT_LANG = "ru";

const form = document.querySelector("[data-form]");
const status = document.querySelector("[data-status]");
const citySelect = document.querySelector("#cityId");
const logoInput = document.querySelector("[data-logo-input]");
const logoPreview = document.querySelector("[data-logo-preview]");
const logoPreviewImg = document.querySelector("[data-logo-preview-img]");
const logoRemove = document.querySelector("[data-logo-remove]");
const certificatePhotoInput = document.querySelector("[data-certificate-photo-input]");
const certificatePhotoPreview = document.querySelector("[data-certificate-photo-preview]");
const certificatePhotoPreviewImg = document.querySelector("[data-certificate-photo-preview-img]");
const certificatePhotoRemove = document.querySelector("[data-certificate-photo-remove]");
const elements = Array.from(document.querySelectorAll("[data-i18n]"));
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));

const detectLang = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
};

const applyLang = (lang) => {
  const copy = translations[lang] || translations[DEFAULT_LANG];
  elements.forEach((el) => {
    const key = el.dataset.i18n;
    if (copy[key]) el.textContent = copy[key];
  });
  document.documentElement.lang = lang;
  langButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.lang === lang));
  localStorage.setItem(STORAGE_KEY, lang);
};

langButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.lang) applyLang(btn.dataset.lang);
  });
});
applyLang(detectLang());

const setStatus = (message, type) => {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", type === "error");
  status.classList.toggle("is-success", type === "success");
};

const compressToWebp = (file, quality = 0.82, maxWidth = 1920) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const name = (file.name || "image").replace(/\.[^/.]+$/, "") + ".webp";
              resolve(new File([blob], name, { type: "image/webp", lastModified: Date.now() }));
            } else reject(new Error("Canvas toBlob failed"));
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
  });

const uploadImageShops = async (file, token) => {
  const result = await api.uploadImage("shops", file, { token, readyWebp: true });
  if (typeof result === "string") return result;
  throw new Error(result?.message || "Upload failed");
};

const validateImageFile = (file) => {
  const maxSize = 50 * 1024 * 1024;
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    return { valid: false, error: translations[detectLang()]["form.errorLogoFormat"] || "Bad format" };
  }
  if (file.size > maxSize) {
    return { valid: false, error: translations[detectLang()]["form.errorLogoSize"] || "Too large" };
  }
  return { valid: true };
};

const showProgressModal = (message) => {
  const modal = document.querySelector("[data-create-store-progress-modal]");
  const textEl = document.querySelector("[data-create-store-progress-text]");
  const spinner = document.querySelector("[data-create-store-progress-spinner]");
  const actions = document.querySelector("[data-create-store-progress-actions]");
  if (modal) modal.hidden = false;
  if (textEl) textEl.textContent = message || "";
  if (spinner) spinner.hidden = false;
  if (actions) actions.hidden = true;
};

const showProgressDone = (message, isError = false) => {
  const spinner = document.querySelector("[data-create-store-progress-spinner]");
  const actions = document.querySelector("[data-create-store-progress-actions]");
  const textEl = document.querySelector("[data-create-store-progress-text]");
  if (textEl) {
    textEl.textContent = message || "";
    textEl.classList.toggle("is-error", isError);
  }
  if (spinner) spinner.hidden = true;
  if (actions) actions.hidden = false;
};

const hideProgressModal = () => {
  const modal = document.querySelector("[data-create-store-progress-modal]");
  if (modal) modal.hidden = true;
};

document.querySelector("[data-create-store-progress-close]")?.addEventListener("click", () => hideProgressModal());

const loadCities = async () => {
  if (!citySelect) return;
  try {
    const payload = await api.get("/cities/", { token: null });
    if (payload && payload.error) throw new Error("cities");
    const cities = payload?.data?.cities || payload?.data || [];
    cities.forEach((city) => {
      if (!city?.id || !city?.name) return;
      const option = document.createElement("option");
      option.value = city.id;
      option.textContent = city.name;
      citySelect.appendChild(option);
    });
  } catch (_) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = translations[detectLang()]["form.cityError"] || "—";
    citySelect.appendChild(option);
  }
};

if (logoInput) {
  logoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !logoPreview || !logoPreviewImg) return;
    const v = validateImageFile(file);
    if (!v.valid) {
      setStatus(v.error, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      logoPreviewImg.src = ev.target.result;
      logoPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });
}
logoRemove?.addEventListener("click", () => {
  if (logoInput) logoInput.value = "";
  if (logoPreview) logoPreview.hidden = true;
});

if (certificatePhotoInput) {
  certificatePhotoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      if (certificatePhotoPreview) certificatePhotoPreview.hidden = true;
      return;
    }
    const v = validateImageFile(file);
    if (!v.valid) {
      setStatus(v.error, "error");
      return;
    }
    if (!certificatePhotoPreview || !certificatePhotoPreviewImg) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      certificatePhotoPreviewImg.src = ev.target.result;
      certificatePhotoPreview.hidden = false;
    };
    reader.readAsDataURL(file);
  });
}
certificatePhotoRemove?.addEventListener("click", () => {
  if (certificatePhotoInput) certificatePhotoInput.value = "";
  if (certificatePhotoPreview) certificatePhotoPreview.hidden = true;
});

const redirectLogin = () => {
  window.location.href = "/login.html?redirect=" + encodeURIComponent("/add-store.html");
};

if (!localStorage.getItem("userToken")) {
  redirectLogin();
} else {
  loadCities();
  document.body.style.opacity = "1";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = localStorage.getItem("userToken");
  if (!token) {
    redirectLogin();
    return;
  }
  const t = translations[detectLang()];
  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton?.disabled) return;

  const certFile = certificatePhotoInput?.files[0];
  if (!certFile) {
    setStatus(t["form.errorCertificatePhotoRequired"] || "Certificate photo required", "error");
    return;
  }

  if (submitButton) submitButton.disabled = true;
  showProgressModal(t["form.progressPreparing"] || "…");

  let certificatePhotoUrl = "";
  try {
    const certWebp = await compressToWebp(certFile);
    certificatePhotoUrl = await uploadImageShops(certWebp, token);
  } catch (err) {
    showProgressDone(t["form.errorCertificatePhotoUpload"] || String(err), true);
    if (submitButton) submitButton.disabled = false;
    return;
  }

  let logoUrl = "";
  const logoFile = logoInput?.files[0];
  if (logoFile) {
    try {
      const logoWebp = await compressToWebp(logoFile);
      logoUrl = await uploadImageShops(logoWebp, token);
    } catch (_) {
      /* optional */
    }
  }

  const payload = {
    shopName: form.querySelector("#shopName")?.value?.trim(),
    inn: form.querySelector("#inn")?.value?.trim(),
    certificate: form.querySelector("#certificate")?.value?.trim(),
    certificatePhotoUrl,
    description: form.querySelector("#description")?.value?.trim(),
    address: form.querySelector("#address")?.value?.trim()
  };
  const cityId = form.querySelector("#cityId")?.value?.trim();
  if (cityId) payload.cityId = cityId;
  if (logoUrl) payload.logo = logoUrl;

  try {
    const result = await api.post("/shop/stores", payload, { token });
    if (result && result.error) {
      showProgressDone(result.message || t["form.errorGeneric"] || "Error", true);
      if (submitButton) submitButton.disabled = false;
      return;
    }
    const newId = result?.data?.shop?.id;
    if (newId) {
      localStorage.setItem("officeSelectedShopId", String(newId));
      localStorage.setItem("shopId", String(newId));
    }
    showProgressDone(t["form.progressSuccess"] || "OK", false);
    setTimeout(() => {
      hideProgressModal();
      window.location.href = "/office.html";
    }, 1200);
  } catch (err) {
    showProgressDone(t["form.errorGeneric"] || String(err), true);
    if (submitButton) submitButton.disabled = false;
  }
});
