import { Html5Qrcode } from "html5-qrcode";
import "../../styles.css";
import { translations } from "../lib/translations.js";
import { AppHeader } from "../components/app-header.js";
import { api } from "../lib/api.js";
import { CategorySelector } from "../components/category-selector.js";

const STORAGE_KEY = "libiss-pos-lang";
const DRAFT_KEY = "addProductDraft";
const DEFAULT_LANG = "ru";

const form = document.querySelector("[data-add-product-form]");
const steps = form ? Array.from(form.querySelectorAll("[data-step]")) : [];
const nextBtn = document.querySelector("[data-next]");
const prevBtn = document.querySelector("[data-prev]");
const statusEl = document.querySelector("[data-status]");
const categorySelect = document.getElementById("categoryId");
const seasonSelect = document.getElementById("seasonId");
const colorContainer = document.querySelector("[data-color-options]");
const sizeContainer = document.querySelector("[data-size-options]");
const variationsContainer = document.querySelector("[data-variations-container]");
const photosContainer = document.querySelector("[data-photos-container]");
const reviewContainer = document.querySelector("[data-review-container]");
const scannerModal = document.querySelector("[data-scanner-modal]");
const scanBtn = document.querySelector("[data-scan-btn]");
const stopScanBtn = document.querySelector("[data-stop-scan]");
let html5QrCode = null;
let scanTargetInput = null;

const errorEls = new Map(
  Array.from(document.querySelectorAll("[data-error-for]")).map((el) => [
    el.dataset.errorFor,
    el
  ])
);

// State
const urlParams = new URLSearchParams(window.location.search);
const editProductId = urlParams.get("id") || null;
let currentStep = 0;
let colorsData = [];
let sizesData = [];
let sizeTypesData = [];
let seasonsData = [];
let categoriesData = [];
let variationsData = []; // { colorId, sizeId, stock, price, qrCodeUrl, discount, originalPrice }
let photosData = {}; // { colorId: [File, File...] }
let uploadedPhotos = {}; // { colorId: [url, url...] } — при редактировании заполняем из API
let compressedPhotos = {}; // { colorId: [Blob/File...] }
let currentSizeType = null;

const detectLang = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && translations[saved]) return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
};

const t = (key) => (translations[detectLang()] && translations[detectLang()][key]) || key;

const setStatus = (message, type) => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", type === "error");
  statusEl.classList.toggle("is-success", type === "success");
};

const setFieldError = (name, message) => {
  const el = errorEls.get(name);
  if (el) el.textContent = message;
};
const clearFieldError = (name) => setFieldError(name, "");

// --- Scanner ---

const startScanner = async (targetInput) => {
  scanTargetInput = targetInput;
  if (!scannerModal) return;
  scannerModal.hidden = false;
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }
  
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (scanTargetInput) {
          scanTargetInput.value = decodedText;
          // Trigger change event if needed
          scanTargetInput.dispatchEvent(new Event('change'));
          // If scanning for a variation, update data immediately
          if (scanTargetInput.dataset.variationIdx !== undefined) {
            updateVariation(scanTargetInput.dataset.variationIdx, "qrCodeUrl", decodedText);
          }
        }
        stopScanner();
      },
      (errorMessage) => {
        // ignore errors
      }
    );
  } catch (err) {
    console.error(err);
    setStatus(t("addProduct.scanError"), "error");
    scannerModal.hidden = true;
  }
};

const stopScanner = async () => {
  if (html5QrCode && html5QrCode.isScanning) {
    await html5QrCode.stop();
  }
  if (scannerModal) scannerModal.hidden = true;
};

if (scanBtn) {
  scanBtn.addEventListener("click", () => {
    const input = document.getElementById("productQrCodeUrl");
    if (input) startScanner(input);
  });
}

if (stopScanBtn) {
  stopScanBtn.addEventListener("click", stopScanner);
}

// --- Final Price Calculation ---

const updateFinalPrice = () => {
  const priceInput = document.getElementById("price");
  const discountInput = document.getElementById("discount");
  const finalPriceContainer = document.querySelector("[data-final-price]");
  const oldPriceEl = document.querySelector("[data-old-price]");
  const newPriceEl = document.querySelector("[data-new-price]");

  if (!priceInput || !discountInput || !finalPriceContainer) return;

  const price = parseFloat(priceInput.value) || 0;
  const discount = parseFloat(discountInput.value) || 0;

  if (price > 0 && discount > 0) {
    const finalPrice = price - (price * discount / 100);
    oldPriceEl.textContent = price.toFixed(2);
    newPriceEl.textContent = finalPrice.toFixed(2) + " TJS"; // Assuming TJS currency
    finalPriceContainer.hidden = false;
  } else {
    finalPriceContainer.hidden = true;
  }
};

if (form) {
  const priceInput = document.getElementById("price");
  const discountInput = document.getElementById("discount");
  
  if (priceInput) priceInput.addEventListener("input", updateFinalPrice);
  if (discountInput) discountInput.addEventListener("input", updateFinalPrice);
}

// --- Photo Modes ---
// Removed AI modes as requested. Defaulting to local upload.
// let photoModes = [];
let currentPhotoMode = "local"; 

async function loadPhotoModes() {
  // Disabled photo modes loading
}

function renderPhotoModes() {
    // Disabled photo modes rendering
    const container = document.querySelector("[data-photo-modes]");
    if (container) container.hidden = true;
}

// Call this in loadAttributes or init
// loadPhotoModes();

async function loadAttributes() {
  try {
    const [cats, seasons, colors, sizeTypes] = await Promise.all([
      api.get("/categories/", { token: null }),
      api.get("/seasons/", { token: null }),
      api.get("/colors/", { token: null }),
      api.get("/size-types/", { token: null })
    ]);

    categoriesData = cats?.data ?? [];
    seasonsData = seasons?.data ?? [];
    colorsData = colors?.data ?? [];
    const types = sizeTypes?.data ?? [];
    sizeTypesData = types;

    if (categorySelector) {
      categorySelector.setData(categoriesData);
    }
    if (seasonSelector) {
      seasonSelector.setData(seasonsData);
    }
    
    renderColors(colorsData);
    renderSizeTypes(sizeTypesData);
    
    // Select first type by default or load all
    if (sizeTypesData.length > 0) {
        // Default select first
        const firstId = sizeTypesData[0].id;
        if (sizeTypeSelector) sizeTypeSelector.setValue(firstId);
        await selectSizeType(firstId);
    } else {
        await loadSizes(); // Load all if no types
    }
    
    loadDraft();
    loadPhotoModes();
    if (editProductId) {
      await loadProductForEdit(editProductId);
    }
  } catch (e) {
    console.error(e);
    setStatus(t("addProduct.errorCategories"), "error");
  }
}

async function loadProductForEdit(id) {
  try {
    const token = localStorage.getItem("userToken");
    const res = await api.get(`/products/${id}`, { token });
    if (!res || res.error) {
      setStatus(res?.message || "Не удалось загрузить товар", "error");
      return;
    }
    const product = res.product ?? res.data?.product ?? res.data;
    if (!product) {
      setStatus("Нет данных товара", "error");
      return;
    }
    form.name.value = (product.name || "").replace(/</g, "&lt;");
    form.description.value = (product.description || "").replace(/</g, "&lt;");
    form.gender.value = product.gender === "male" || product.gender === "female" ? product.gender : "unisex";
    const firstVar = product.variations?.[0];
    if (form.price) form.price.value = firstVar?.price ?? product.price ?? "";
    if (form.discount) form.discount.value = firstVar?.discount ?? 0;
    if (form.qrCodeUrl) form.qrCodeUrl.value = firstVar?.qrCodeUrl ?? "";
    if (product.categoryId && categorySelector) categorySelector.setValue(product.categoryId);
    if (product.seasonId != null && seasonSelector) seasonSelector.setValue(String(product.seasonId));

    const variations = product.variations || [];
    const sizeIdsFromProduct = [];
    variations.forEach((v) => {
      const ids = v.sizeIds ?? (v.sizes && v.sizes.map((s) => (typeof s === "object" ? s.id : s))) ?? (v.sizeId ? [v.sizeId] : []);
      sizeIdsFromProduct.push(...ids);
    });
    await loadSizes(null);
    let typeId = product.sizeTypeId ?? null;
    if (!typeId && sizeIdsFromProduct.length > 0 && sizesData.length > 0) {
      const firstSize = sizesData.find((s) => sizeIdsFromProduct.some((id) => String(s.id) === String(id)));
      typeId = firstSize?.size_type_id ?? firstSize?.sizeTypeId ?? null;
    }
    if (!typeId && sizeTypesData.length > 0) typeId = sizeTypesData[0].id;
    if (typeId) {
      if (sizeTypeSelector) sizeTypeSelector.setValue(typeId);
      await selectSizeType(typeId);
    }

    variationsData = [];
    variations.forEach((v) => {
      const colorIds = v.colorIds?.length ? v.colorIds : (v.colors && v.colors.map((c) => (typeof c === "object" ? c.id : c))) || (v.colorId ? [v.colorId] : []);
      const sizeIds = v.sizeIds?.length ? v.sizeIds : (v.sizes && v.sizes.map((s) => (typeof s === "object" ? s.id : s))) || (v.sizeId ? [v.sizeId] : []);
      const price = v.price ?? 0;
      const stock = v.stockQuantity ?? v.stock_quantity ?? 0;
      const qrCodeUrl = v.qrCodeUrl ?? "";
      const discount = v.discount ?? 0;
      const originalPrice = v.originalPrice ?? v.original_price ?? price;
      const cIds = colorIds.length ? colorIds : [null];
      const sIds = sizeIds.length ? sizeIds : [null];
      cIds.forEach((cid) => {
        sIds.forEach((sid) => {
          const colorObj = colorsData.find((c) => String(c.id) === String(cid));
          const sizeObj = sizesData.find((s) => String(s.id) === String(sid));
          variationsData.push({
            colorId: cid,
            colorName: colorObj?.name ?? "—",
            sizeId: sid,
            sizeName: sizeObj?.name ?? "—",
            stock: String(stock),
            price: String(price),
            qrCodeUrl,
            discount,
            originalPrice,
            imageUrls: v.imageUrls,
            imageUrlsByColor: v.imageUrlsByColor,
          });
        });
      });
    });
    if (variations.length && !variationsData.length) {
      variations.forEach((v) => {
        const cid = v.colorIds?.[0] ?? v.colors?.[0]?.id ?? v.colorId;
        const sid = v.sizeIds?.[0] ?? v.sizes?.[0]?.id ?? v.sizeId;
        const colorObj = colorsData.find((c) => String(c.id) === String(cid)) || { name: "—" };
        const sizeObj = sizesData.find((s) => String(s.id) === String(sid)) || { name: "—" };
        variationsData.push({
          colorId: cid,
          colorName: colorObj.name,
          sizeId: sid,
          sizeName: sizeObj.name,
          stock: String(v.stockQuantity ?? v.stock_quantity ?? 0),
          price: String(v.price ?? 0),
          qrCodeUrl: v.qrCodeUrl ?? "",
          discount: v.discount ?? 0,
          originalPrice: v.originalPrice ?? v.original_price ?? v.price,
          imageUrls: v.imageUrls,
          imageUrlsByColor: v.imageUrlsByColor,
        });
      });
    }
    const colorIdsUsed = [...new Set(variationsData.map((x) => x.colorId).filter(Boolean))];
    const sizeIdsUsed = [...new Set(variationsData.map((x) => x.sizeId).filter(Boolean))];
    colorIdsUsed.forEach((cid) => {
      const cb = colorContainer?.querySelector(`input[value="${cid}"]`);
      if (cb) cb.checked = true;
    });
    sizeIdsUsed.forEach((sid) => {
      const cb = sizeContainer?.querySelector(`input[value="${sid}"]`);
      if (cb) cb.checked = true;
    });
    uploadedPhotos = {};
    const seenUrlsByColor = {};
    (product.variations || []).forEach((v) => {
      const byColor = v.imageUrlsByColor || {};
      Object.keys(byColor).forEach((colorId) => {
        const urls = Array.isArray(byColor[colorId]) ? byColor[colorId] : [byColor[colorId]].filter(Boolean);
        if (!seenUrlsByColor[colorId]) seenUrlsByColor[colorId] = new Set();
        urls.forEach((u) => seenUrlsByColor[colorId].add(u));
      });
      if (v.imageUrls?.length && !v.imageUrlsByColor) {
        const cid = v.colorIds?.[0] ?? v.colors?.[0]?.id ?? v.colorId ?? "_";
        if (!seenUrlsByColor[cid]) seenUrlsByColor[cid] = new Set();
        v.imageUrls.forEach((u) => seenUrlsByColor[cid].add(u));
      }
    });
    Object.keys(seenUrlsByColor).forEach((colorId) => {
      uploadedPhotos[colorId] = [...seenUrlsByColor[colorId]];
    });
    renderVariations();
  } catch (e) {
    console.error(e);
    setStatus("Ошибка загрузки товара", "error");
  }
}

async function loadSizes(typeId = null) {
    try {
        const url = typeId ? `/sizes/?size_type_id=${typeId}` : "/sizes/";
        const res = await api.get(url, { token: null });
        sizesData = res?.data ?? [];
        renderSizes(sizesData);
    } catch (e) {
        console.error(e);
        setStatus("Error loading sizes", "error");
    }
}

// --- Size Type Selector Logic ---

const sizeTypeSelectorEl = document.getElementById("sizeTypeSelector");
let sizeTypeSelector = null;

if (sizeTypeSelectorEl) {
  sizeTypeSelector = new CategorySelector({
    container: sizeTypeSelectorEl,
    input: document.getElementById("sizeTypeId"),
    data: [], // Will be set later
    onSelect: (item) => {
      selectSizeType(item.id);
    }
  });
}

function renderSizeTypes(items) {
    if (sizeTypeSelector) {
        sizeTypeSelector.setData(items);
    }
}

function selectSizeType(id) {
    currentSizeType = id;
    return loadSizes(id);
}


// --- Category Selector Logic ---

const categorySelectorEl = document.getElementById("categorySelector");
let categorySelector = null;

if (categorySelectorEl) {
  categorySelector = new CategorySelector({
    container: categorySelectorEl,
    input: document.getElementById("categoryId"),
    data: [], // Will be set later
    onSelect: (item) => {
      clearFieldError("categoryId");
    }
  });
}

// --- Season Selector Logic ---

const seasonSelectorEl = document.getElementById("seasonSelector");
let seasonSelector = null;

if (seasonSelectorEl) {
  seasonSelector = new CategorySelector({
    container: seasonSelectorEl,
    input: document.getElementById("seasonId"),
    data: [], // Will be set later
    onSelect: (item) => {
      clearFieldError("seasonId");
    }
  });
}

function renderColors(items) {
  if (!colorContainer) return;
  colorContainer.innerHTML = "";
  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "color-option";
    label.title = item.name; // Tooltip for accessibility
    label.innerHTML = `
      <input type="checkbox" name="color" value="${item.id}" data-name="${item.name}" data-hex="${item.hex}">
      <span class="color-option__swatch" style="background-color: ${item.hex}"></span>
    `;
    colorContainer.appendChild(label);
  });
}

function renderSizes(items) {
  if (!sizeContainer) return;
  sizeContainer.innerHTML = "";
  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "size-option";
    label.innerHTML = `
      <input type="checkbox" name="size" value="${item.id}" data-name="${item.name}">
      <span>${item.name}</span>
    `;
    sizeContainer.appendChild(label);
  });
}

// --- Logic ---

function getSelectedAttributes() {
  const selectedColors = Array.from(colorContainer.querySelectorAll("input:checked")).map(i => ({ 
    id: i.value, 
    name: i.dataset.name,
    hex: i.dataset.hex 
  }));
  const selectedSizes = Array.from(sizeContainer.querySelectorAll("input:checked")).map(i => ({ id: i.value, name: i.dataset.name }));
  return { selectedColors, selectedSizes };
}

function generateVariations() {
  const { selectedColors, selectedSizes } = getSelectedAttributes();
  
  // Calculate default price (final price with discount)
  const basePriceVal = parseFloat(form.price.value) || 0;
  const discountVal = parseFloat(form.discount.value) || 0;
  let defaultPrice = basePriceVal;
  
  if (basePriceVal > 0 && discountVal > 0) {
    defaultPrice = basePriceVal - (basePriceVal * discountVal / 100);
    defaultPrice = parseFloat(defaultPrice.toFixed(2));
  }

  const commonQrCodeUrl = form.qrCodeUrl?.value || "";
  const newVariations = [];
  selectedColors.forEach(color => {
    selectedSizes.forEach(size => {
      const existing = variationsData.find(v => v.colorId === color.id && v.sizeId === size.id);
      newVariations.push({
        colorId: color.id,
        colorName: color.name,
        sizeId: size.id,
        sizeName: size.name,
        stock: existing?.stock !== undefined ? existing.stock : 1,
        price: existing?.price !== undefined ? existing.price : defaultPrice,
        qrCodeUrl: existing?.qrCodeUrl || commonQrCodeUrl,
        discount: existing?.discount != null ? existing.discount : discountVal,
        originalPrice: existing?.originalPrice != null ? existing.originalPrice : basePriceVal,
      });
    });
  });

  variationsData = newVariations;
  renderVariations();
}

function renderVariations() {
  if (!variationsContainer) return;
  variationsContainer.innerHTML = "";

  const byColor = {};
  variationsData.forEach((v, idx) => {
    const key = v.colorId != null ? String(v.colorId) : "_";
    if (!byColor[key]) {
      const colorObj = colorsData.find((c) => String(c.id) === String(v.colorId));
      byColor[key] = { colorName: v.colorName, colorHex: colorObj?.hex ?? "#ccc", items: [] };
    }
    byColor[key].items.push({ v, idx });
  });

  Object.keys(byColor).forEach((colorKey) => {
    const group = byColor[colorKey];
    const section = document.createElement("div");
    section.className = "variations-group-by-color";
    section.innerHTML = `
      <div class="review-color-header">
        <span class="variation-color-swatch" style="background-color: ${(group.colorHex + "").replace(/"/g, "&quot;")}"></span>
        <strong>${(group.colorName + "").replace(/</g, "&lt;")}</strong>
      </div>
    `;
    const rowsWrap = document.createElement("div");
    rowsWrap.className = "variation-rows-by-color";
    group.items.forEach(({ v, idx }) => {
      const row = document.createElement("div");
      row.className = "variation-row";
      row.innerHTML = `
        <div class="variation-label">
          <span>${(v.sizeName + "").replace(/</g, "&lt;")}</span>
        </div>
        <div class="variation-inputs">
          <label>
            <span>${t("addProduct.variationStock")}</span>
            <input type="number" min="0" value="${(v.stock + "").replace(/"/g, "&quot;")}" onchange="updateVariation(${idx}, 'stock', this.value)">
          </label>
          <label>
            <span>${t("addProduct.variationPrice")}</span>
            <input type="number" min="0" step="0.01" value="${(v.price + "").replace(/"/g, "&quot;")}" onchange="updateVariation(${idx}, 'price', this.value)">
          </label>
          <label class="barcode-label">
            <span>QR-код</span>
            <div class="barcode-wrapper">
              <input type="text" readonly value="${(v.qrCodeUrl || "").replace(/"/g, "&quot;")}" data-variation-idx="${idx}" placeholder="Только со сканера" data-scan-only>
              <button type="button" class="btn btn-secondary btn-icon btn-sm" onclick="scanVariation(${idx})" title="Сканировать камерой">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <rect x="7" y="7" width="10" height="10" rx="1"/>
                  <path d="M12 12h.01"/>
                </svg>
              </button>
            </div>
          </label>
        </div>
      `;
      rowsWrap.appendChild(row);
    });
    section.appendChild(rowsWrap);
    variationsContainer.appendChild(section);
  });
}

window.scanVariation = (idx) => {
  const input = document.querySelector(`input[data-variation-idx="${idx}"]`);
  if (input) startScanner(input);
};

window.updateVariation = (idx, field, value) => {
  if (variationsData[idx]) {
    variationsData[idx][field] = value;
    if (field === "stock" || field === "price") variationsData[idx][field] = String(value);
    saveDraft();
  }
};

function renderPhotoUploads() {
  if (!photosContainer) return;
  photosContainer.innerHTML = "";

  const { selectedColors } = getSelectedAttributes();

  selectedColors.forEach((color) => {
    const wrapper = document.createElement("div");
    wrapper.className = "photo-group";

    const existingUrls = uploadedPhotos[color.id] || [];
    const currentFiles = photosData[color.id] || [];
    const totalCount = existingUrls.length + currentFiles.length;
    if (totalCount >= 5) wrapper.dataset.maxReached = "1";

    let previewsHtml = "";
    existingUrls.forEach((url, idx) => {
      const fullUrl = url.startsWith("http") ? url : api.resolveAssetUrl(url);
      const safeUrl = fullUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
      previewsHtml += `
        <div class="photo-preview-item" data-source="url">
          <img src="${safeUrl}" alt="">
          <button type="button" class="photo-remove-btn" onclick="removeExistingPhoto('${String(color.id).replace(/'/g, "\\'")}', ${idx})" title="Удалить">×</button>
        </div>
      `;
    });
    currentFiles.forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      previewsHtml += `
        <div class="photo-preview-item" data-source="file">
          <img src="${url}" alt="">
          <button type="button" class="photo-remove-btn" onclick="removePhoto('${String(color.id).replace(/'/g, "\\'")}', ${idx})" title="Удалить">×</button>
        </div>
      `;
    });

    wrapper.innerHTML = `
      <h4>
        <span class="variation-color-swatch" style="background-color: ${(color.hex || "#ccc").replace(/"/g, "&quot;")}"></span>
        ${(color.name + "").replace(/</g, "&lt;")}
      </h4>
      <div class="photos-for-color__preview">${previewsHtml}</div>
      <div class="photos-for-color__actions" style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;" ${totalCount >= 5 ? "hidden" : ""}>
        <label class="btn btn-secondary btn-sm">
          ${t("addProduct.addPhotos")}
          <input type="file" accept="image/*" multiple hidden onchange="addPhotos('${String(color.id).replace(/'/g, "\\'")}', this.files)">
        </label>
        <label class="btn btn-secondary btn-sm">
          ${t("addProduct.takePhoto")}
          <input type="file" accept="image/*" capture="environment" hidden onchange="addPhotos('${String(color.id).replace(/'/g, "\\'")}', this.files)">
        </label>
      </div>
    `;
    photosContainer.appendChild(wrapper);
  });
}

window.removeExistingPhoto = (colorId, urlIdx) => {
  if (uploadedPhotos[colorId] && uploadedPhotos[colorId].length > urlIdx) {
    uploadedPhotos[colorId].splice(urlIdx, 1);
    if (uploadedPhotos[colorId].length === 0) delete uploadedPhotos[colorId];
    renderPhotoUploads();
  }
};

window.addPhotos = (colorId, files) => {
  if (!photosData[colorId]) photosData[colorId] = [];
  const existingUrls = (uploadedPhotos[colorId] || []).length;
  const existingFiles = photosData[colorId].length;
  const newFiles = Array.from(files);
  if (existingUrls + existingFiles + newFiles.length > 5) {
    alert("Максимум 5 фото на один цвет");
    return;
  }
  photosData[colorId].push(...newFiles);
  renderPhotoUploads();
  saveDraft();
};

window.removePhoto = (colorId, idx) => {
  if (photosData[colorId]) {
    photosData[colorId].splice(idx, 1);
    renderPhotoUploads();
  }
};

function renderReview() {
  if (!reviewContainer) return;
  
  // Basic Info
  const basicInfoHtml = `
    <div class="review-section">
      <div class="review-item"><strong>${t("addProduct.reviewName")}</strong> ${form.name.value}</div>
      <div class="review-item"><strong>${t("addProduct.reviewCategory")}</strong> ${categorySelector?.selectedText?.textContent || "-"}</div>
      <div class="review-item"><strong>${t("addProduct.reviewSeason")}</strong> ${seasonSelector?.selectedText?.textContent || "-"}</div>
      <div class="review-item"><strong>${t("addProduct.reviewPrice")}</strong> ${form.price.value}</div>
      <div class="review-item"><strong>${t("addProduct.reviewDiscount")}</strong> ${form.discount.value || 0}%</div>
    </div>
  `;

  // Group variations by Color
  const variationsByColor = {};
  variationsData.forEach(v => {
    if (!variationsByColor[v.colorId]) {
      // Find color object for hex and name
      const colorObj = colorsData.find(c => String(c.id) === String(v.colorId));
      variationsByColor[v.colorId] = {
        colorName: v.colorName,
        colorHex: colorObj ? colorObj.hex : '#ccc',
        items: []
      };
    }
    variationsByColor[v.colorId].items.push(v);
  });

  let variationsHtml = '<div class="review-variations">';
  
  for (const colorId in variationsByColor) {
    const group = variationsByColor[colorId];

    const existingUrls = uploadedPhotos[colorId] || [];
    const files = compressedPhotos[colorId] || photosData[colorId] || [];
    let photosHtml = "";
    if (existingUrls.length > 0 || files.length > 0) {
      photosHtml = `<div class="review-photos">`;
      existingUrls.forEach((url) => {
        const fullUrl = url.startsWith("http") ? url : api.resolveAssetUrl(url);
        photosHtml += `<img src="${fullUrl.replace(/"/g, "&quot;")}" class="review-thumb" alt="">`;
      });
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        photosHtml += `<img src="${url}" class="review-thumb" alt="">`;
      });
      photosHtml += `</div>`;
    } else {
      photosHtml = `<div class="review-no-photos">Нет фото</div>`;
    }

    // Sizes list
    let sizesHtml = `<div class="review-sizes-grid">`;
    group.items.forEach(item => {
        sizesHtml += `
            <div class="review-size-row">
                <span class="size-badge">${item.sizeName}</span>
                <span class="review-stock">${item.stock} шт.</span>
                <span class="review-price">${item.price} TJS</span>
            </div>
        `;
    });
    sizesHtml += `</div>`;

    variationsHtml += `
      <div class="review-group">
        <div class="review-color-header">
          <span class="variation-color-swatch" style="background-color: ${group.colorHex}"></span>
          <strong>${group.colorName}</strong>
        </div>
        ${photosHtml}
        ${sizesHtml}
      </div>
    `;
  }
  variationsHtml += '</div>';

  reviewContainer.innerHTML = basicInfoHtml + variationsHtml;
}

// --- Draft System ---

function saveDraft() {
  const draft = {
    step: currentStep,
    fields: {
      name: form.name.value,
      description: form.description.value,
      gender: form.gender.value,
      categoryId: form.categoryId.value,
      seasonId: form.seasonId.value,
      price: form.price.value,
      discount: form.discount.value,
      qrCodeUrl: form.qrCodeUrl?.value ?? ""
    },
    colors: Array.from(colorContainer.querySelectorAll("input:checked")).map(i => i.value),
    sizes: Array.from(sizeContainer.querySelectorAll("input:checked")).map(i => i.value),
    sizeTypeId: currentSizeType,
    variations: variationsData
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  setStatus(t("addProduct.draftSaved"), "success");
}

async function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (!saved) return;
  try {
    const draft = JSON.parse(saved);
    
    // Restore fields
    Object.keys(draft.fields).forEach(key => {
      if (form[key]) form[key].value = draft.fields[key];
    });

    if (draft.fields.categoryId && categorySelector) {
      categorySelector.setValue(draft.fields.categoryId);
    }
    if (draft.fields.seasonId && seasonSelector) {
      seasonSelector.setValue(draft.fields.seasonId);
    }
    
    if (draft.fields.sizeTypeId && sizeTypeSelector) {
      sizeTypeSelector.setValue(draft.fields.sizeTypeId);
      // Logic inside setValue doesn't trigger onSelect, so we call it manually
      selectSizeType(draft.fields.sizeTypeId);
    }
    
    // Restore checkboxes
    if (draft.colors) {
      draft.colors.forEach(id => {
        const cb = colorContainer.querySelector(`input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
    }
    if (draft.sizes) {
      draft.sizes.forEach(id => {
        const cb = sizeContainer.querySelector(`input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
    }
    
    if (draft.variations) variationsData = draft.variations;
    
    // Restore step (optional, maybe better to start at 0)
    // currentStep = draft.step || 0;
    // updateStepUI();
  } catch (e) {
    console.error("Draft load error", e);
  }
}

// --- Navigation & Validation ---

function validateStep() {
  const stepEl = steps[currentStep];
  const inputs = stepEl.querySelectorAll("input[required], select[required], textarea[required]");
  let valid = true;
  
  inputs.forEach(input => {
    if (!input.checkValidity()) {
      valid = false;
      if (input.id === "categoryId") {
        setFieldError("categoryId", t("addProduct.errorCategoryRequired") || "Выберите категорию");
      } else {
        input.reportValidity();
      }
    }
  });

  if (currentStep === 1) { // Attributes step
    const { selectedColors, selectedSizes } = getSelectedAttributes();
    if (selectedColors.length === 0 || selectedSizes.length === 0) {
      setStatus(t("addProduct.errorColorRequired"), "error"); // Reuse error msg or add new
      valid = false;
    }
  }
  
  if (currentStep === 2) { // Variations step
    // Check if all stocks are filled? Usually optional, but let's ensure at least one variation exists
    if (variationsData.length === 0) valid = false;
  }

  return valid;
}

async function prepareReviewData() {
  if (!reviewContainer) return;
  
  // Show loader
  reviewContainer.innerHTML = `
    <div class="review-loading">
      <div class="spinner"></div>
      <p>Конвертация фото, пожалуйста подождите...</p>
    </div>
  `;
  
  compressedPhotos = {};
  
  // Process all photos
  for (const colorId in photosData) {
    const files = photosData[colorId] || [];
    if (files.length > 0) {
      compressedPhotos[colorId] = [];
      for (const file of files) {
        try {
          const compressed = await compressImage(file);
          compressedPhotos[colorId].push(compressed);
        } catch (e) {
          console.error("Compression failed", e);
          // Fallback to original if compression fails
          compressedPhotos[colorId].push(file);
        }
      }
    }
  }
  
  renderReview();
}

function updateStepUI() {
  steps.forEach((step, index) => {
    step.hidden = index !== currentStep;
  });
  
  if (prevBtn) prevBtn.disabled = currentStep === 0;

  if (nextBtn) {
    const isLast = currentStep === steps.length - 1;
    nextBtn.textContent = isLast ? t("addProduct.submit") : t("addProduct.next");
  }
  
  if (currentStep === 2) {
    if (editProductId && variationsData.length > 0) renderVariations();
    else generateVariations();
  }
  if (currentStep === 3) renderPhotoUploads();
  if (currentStep === 4) prepareReviewData();
}

// --- Image Compression ---

async function compressImage(file, quality = 0.8, maxWidth = 3024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            // Create a new File object
            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(newFile);
          } else {
            reject(new Error("Canvas to Blob failed"));
          }
        }, 'image/webp', quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

// --- Submission ---

// --- Loading Overlay ---
function showLoading(message, subtext = "") {
  let overlay = document.querySelector(".loading-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "loading-overlay";
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text"></div>
      <div class="loading-subtext"></div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.querySelector(".loading-text").textContent = message;
  overlay.querySelector(".loading-subtext").textContent = subtext;
  overlay.hidden = false;
}

function hideLoading() {
  const overlay = document.querySelector(".loading-overlay");
  if (overlay) overlay.hidden = true;
}

async function uploadImages() {
  const { selectedColors } = getSelectedAttributes();
  const totalFiles = selectedColors.reduce((sum, c) => sum + (photosData[c.id] || []).length, 0);

  if (totalFiles === 0) {
    return;
  }

  const mode = (document.querySelector('input[name="uploadPhotoMode"]:checked') || {}).value || "compressed";
  const useCompressed = mode === "compressed";

  const previousUploaded = { ...uploadedPhotos };
  let processed = 0;
  const updateProgress = () => {
    processed++;
    showLoading(
      `Загрузка фото (${processed}/${totalFiles})`,
      totalFiles > 1 ? `Осталось примерно ${(totalFiles - processed) * 2} сек...` : ""
    );
  };

  for (const color of selectedColors) {
    const files = photosData[color.id] || [];
    if (files.length === 0) continue;

    const existingUrls = previousUploaded[color.id] || [];
    const newUrls = [];

    for (const file of files) {
      try {
        let toUpload = file;
        if (useCompressed) {
          toUpload = file.type === "image/webp" ? file : await compressImage(file, 0.82, 3024);
        }
        const isWebp = toUpload.type === "image/webp";
        const url = await api.uploadImage("products", toUpload, {
          token: localStorage.getItem("userToken"),
          useCloudinary: false,
          readyWebp: isWebp,
        });
        if (typeof url === "string") {
          newUrls.push(url);
        } else {
          throw new Error("Upload failed");
        }
        updateProgress();
      } catch (e) {
        console.error(e);
        throw new Error(t("addProduct.errorPhotoUpload"));
      }
    }

    uploadedPhotos[color.id] = [...existingUrls, ...newUrls];
  }

  for (const color of selectedColors) {
    if (!uploadedPhotos[color.id] && previousUploaded[color.id]) {
      uploadedPhotos[color.id] = previousUploaded[color.id];
    }
  }
}


async function handleSubmit(e) {
  if (e) e.preventDefault();
  
  if (!validateStep()) return;
  
  // Prevent double click
  if (nextBtn.disabled) return;
  nextBtn.disabled = true;
  
  try {
    showLoading("Подготовка данных...");
    
    await uploadImages();
    
    showLoading("Создание товара...", "Пожалуйста, подождите");
    
    const basePrice = parseFloat(form.price.value) || 0;
    const baseDiscount = parseInt(form.discount.value) || 0;
    const payload = {
      name: form.name.value.trim(),
      description: (form.description.value || "").trim(),
      gender: form.gender.value,
      categoryId: form.categoryId.value,
      seasonId: form.seasonId.value ? parseInt(form.seasonId.value, 10) : null,
      brand: (form.brand && form.brand.value) || "Libiss",
      sortOrder: 0,
      qrCodeUrl: (form.qrCodeUrl && form.qrCodeUrl.value) || null,
      variations: variationsData.map((v) => {
        const priceNum = parseFloat(v.price) || 0;
        const origNum = v.originalPrice != null ? parseFloat(v.originalPrice) : basePrice;
        const discNum = v.discount != null ? Number(v.discount) : baseDiscount;
        const toNumIds = (ids) => (Array.isArray(ids) ? ids : [ids])
          .filter((id) => id != null && id !== "")
          .map((id) => (typeof id === "number" ? id : Number(id)))
          .filter((n) => !Number.isNaN(n));
        return {
          sizeIds: toNumIds(v.sizeId),
          colorIds: toNumIds(v.colorId),
          price: priceNum > 0 ? priceNum : (origNum - (origNum * discNum / 100)),
          originalPrice: origNum || null,
          discount: discNum,
          stockQuantity: parseInt(v.stock, 10) || 0,
          qrCodeUrl: (v.qrCodeUrl != null && v.qrCodeUrl !== "") ? String(v.qrCodeUrl) : undefined,
          imageUrls: v.imageUrls && v.imageUrls.length ? v.imageUrls : undefined,
          imageUrlsByColor: uploadedPhotos[v.colorId] ? { [v.colorId]: uploadedPhotos[v.colorId] } : (v.imageUrlsByColor || undefined),
        };
      }),
    };

    let res;
    if (editProductId) {
      showLoading("Обновление товара...", "Пожалуйста, подождите");
      res = await api.put(`/shop/products/${editProductId}`, payload);
    } else {
      res = await api.post("/shop/products/", payload);
    }
    if (res && res.error) {
      throw new Error(res.message || "Ошибка сохранения");
    }
    showLoading("Готово!", editProductId ? "Товар обновлён." : "Переход к списку товаров...");
    localStorage.removeItem(DRAFT_KEY);
    setTimeout(() => {
      window.location.href = "/office.html#products";
    }, 1500);
    
  } catch (err) {
    hideLoading();
    setStatus(err.message || t("addProduct.errorCreate"), "error");
      nextBtn.disabled = false;
  }
}

// --- Init ---

if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    if (currentStep === steps.length - 1) {
      handleSubmit();
    } else {
      if (validateStep()) {
        currentStep++;
        updateStepUI();
        saveDraft();
      }
    }
  });
}

if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
    updateStepUI();
    }
  });
}

// Global lang update
const applyLang = () => {
  const elements = document.querySelectorAll("[data-i18n]");
  const copy = translations[detectLang()] || translations[DEFAULT_LANG];
  elements.forEach(el => {
    const key = el.dataset.i18n;
    if (copy[key]) el.textContent = copy[key];
  });
  // Update placeholders
  const inputs = document.querySelectorAll("[data-i18n-attr]");
  inputs.forEach(el => {
    const attr = el.dataset.i18nAttr;
    const key = el.dataset.i18nKey;
    if (copy[key]) el.setAttribute(attr, copy[key]);
  });
};

AppHeader.init({
  titleKey: "addProduct.title",
  logoHref: "/office.html",
  onLangChange: (lang) => {
    applyLang();
    renderVariations(); // Re-render to update labels if needed
    renderReview();
  }
});

// Check auth immediately
const token = localStorage.getItem("userToken");
if (!token) {
  window.location.href = "/login.html?redirect=" + encodeURIComponent(window.location.pathname);
}

applyLang();
loadAttributes();
updateStepUI();

// Restore opacity
document.body.style.opacity = "1";
