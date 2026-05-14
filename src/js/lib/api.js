/**
 * Единый клиент для работы с API.
 * Base URL задаётся через VITE_API_URL в .env (по умолчанию https://api.libiss.com/api/v1).
 * При 401 (кроме /auth/login) — очистка токена и редирект на страницу входа.
 */

const DEFAULT_BASE = "https://api.libiss.com/api/v1";

function getApiBase() {
  return import.meta.env.VITE_API_URL || DEFAULT_BASE;
}

function getApiOrigin() {
  try {
    return new URL(getApiBase()).origin;
  } catch {
    return "https://api.libiss.com";
  }
}

function getToken() {
  return localStorage.getItem("userToken");
}

function handleUnauthorized() {
  localStorage.removeItem("userToken");
  localStorage.removeItem("shopId");
  localStorage.removeItem("officeSelectedShopId");
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = "/login.html?redirect=" + redirect;
}

/**
 * @param {string} url — полный URL или путь (например /shop/orders/)
 * @param {{ method?: string, body?: any, token?: string | null, headers?: Record<string,string>, suppress401?: boolean }} options
 * @returns {Promise<object | { error: true, status: number, message: string } | null>}
 *   null — при 401 (редирект выполнен, если не suppress401); иначе JSON или { error, status, message }.
 */
/**
 * Для владельца с несколькими точками: заголовок X-Shop-Id (из localStorage officeSelectedShopId).
 * Отключите для агрегированных запросов: options.shopContext === false
 */
function shouldAttachShopContext(path, options) {
  if (options?.shopContext === false) return false;
  if (!path.includes("/shop/")) return false;
  if (path.includes("shop-registration")) return false;
  return Boolean(localStorage.getItem("officeSelectedShopId"));
}

async function request(url, options = {}) {
  const isFullUrl = url.startsWith("http://") || url.startsWith("https://");
  const fullUrl = isFullUrl ? url : getApiBase() + (url.startsWith("/") ? url : "/" + url);
  const token = options.token !== undefined ? options.token : getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const pathForCtx = isFullUrl ? (() => {
    try {
      return new URL(fullUrl).pathname.replace(/^\/api\/v1/, "") || "/";
    } catch {
      return url;
    }
  })() : url;
  if (shouldAttachShopContext(pathForCtx, options)) {
    const sid = localStorage.getItem("officeSelectedShopId");
    if (sid) headers["X-Shop-Id"] = sid;
  }
  const body = options.body;
  if (body != null && !(body instanceof FormData)) {
    if (typeof body === "object" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const fetchOptions = {
    method: options.method || "GET",
    headers
  };
  if (body !== undefined) {
    fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const res = await fetch(fullUrl, fetchOptions);

  if (res.status === 401 && !fullUrl.includes("/auth/login")) {
    if (options.suppress401) {
        return { error: true, status: 401, message: "Unauthorized" };
    }
    handleUnauthorized();
    return null;
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.error === "string" && data?.details) {
        message = `${data.error}: ${data.details}`;
      } else if (data?.error && typeof data.error === "object" && data.error.message) {
        message = data.error.details
          ? `${data.error.message}: ${data.error.details}`
          : data.error.message;
      } else {
        message = data.message || (typeof data.error === "string" ? data.error : data.error?.message) || data.details || message;
      }
    } catch (_) {}
    return { error: true, status: res.status, message };
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

/**
 * Загрузка изображения в /api/upload/image?folder=...&readyWebp=...
 * @param {string} folder — например 'shops', 'products' или 'variations'
 * @param {File} file
 * @param {{ token?: string | null, useCloudinary?: boolean, readyWebp?: boolean }} options
 */
async function uploadImage(folder, file, options = {}) {
  const useCloudinary = options.useCloudinary ? "true" : "false";
  let url = `${getApiBase()}/upload/image?folder=${encodeURIComponent(folder)}&useCloudinary=${useCloudinary}`;
  if (options.readyWebp === true) {
    url += "&readyWebp=true";
  }
  const fd = new FormData();
  fd.append("image", file);
  const result = await request(url, {
    method: "POST",
    body: fd,
    token: options.token !== undefined ? options.token : getToken()
  });
  if (result && result.error) return result;
  const urlFromResponse = result?.url ?? result?.data?.url ?? result?.data;
  if (!urlFromResponse) return { error: true, status: 0, message: "No URL in response" };
  return urlFromResponse;
}

async function generateAiImages(files, promptId, options = {}) {
  const url = `${getApiBase()}/upload/ai-generate`;
  const fd = new FormData();
  files.forEach((file) => fd.append("images", file));
  if (promptId) fd.append("promptId", promptId);

  const result = await request(url, {
    method: "POST",
    body: fd,
    token: options.token !== undefined ? options.token : getToken()
  });
  
  if (result && result.error) return result;
  // Expecting array of URLs in data
  const urls = result?.data ?? result?.urls ?? [];
  if (!Array.isArray(urls)) return { error: true, status: 0, message: "Invalid AI response" };
  return urls;
}

export const api = {
  getBase: getApiBase,
  getOrigin: getApiOrigin,
  getToken,

  get(path, options = {}) {
    return request(path, { ...options, method: "GET" });
  },

  post(path, body, options = {}) {
    return request(path, { ...options, method: "POST", body });
  },

  patch(path, body, options = {}) {
    return request(path, { ...options, method: "PATCH", body });
  },

  put(path, body, options = {}) {
    return request(path, { ...options, method: "PUT", body });
  },

  delete(path, options = {}) {
    return request(path, { ...options, method: "DELETE" });
  },

  uploadImage,
  generateAiImages,

  /**
   * Собрать полный URL для статики/файлов (например логотип).
   * @param {string} path — путь вида /images/shops/xxx.jpg
   */
  resolveAssetUrl(path) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const origin = getApiOrigin();
    return path.startsWith("/") ? origin + path : origin + "/" + path;
  }
};
