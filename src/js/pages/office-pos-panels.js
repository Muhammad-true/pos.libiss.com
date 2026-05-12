import { api } from "../lib/api.js";

const DEFAULT_POS_CURRENCY = "TJS";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n));
}

/**
 * @param {{ formatCurrency: (n: number, c?: string) => string, detectLang: () => string, translations: object }} deps
 */
export function initOfficePosPanels(deps) {
  const { formatCurrency, detectLang, translations } = deps;
  const t = () => translations[detectLang()] || {};

  const reportsEl = () => document.querySelector("[data-office-pos-reports-body]");
  const cashierEl = () => document.querySelector("[data-office-pos-cashier-body]");
  const debtorsEl = () => document.querySelector("[data-office-pos-debtors-body]");
  const movementsEl = () => document.querySelector("[data-office-pos-movements-body]");
  const statusEls = () => document.querySelectorAll("[data-office-pos-sync-status]");

  let snapshotsCache = null;
  let receivedAtCache = null;
  let pendingCashierRangeCache = null;
  let loading = false;

  const setStatus = (msg) => {
    statusEls().forEach((el) => {
      el.textContent = msg || "";
    });
  };

  async function fetchSnapshots(token) {
    const res = await api.get("/shop/pos-snapshots", { token });
    if (res == null || res.error) {
      return { error: res?.message || "Network error" };
    }
    const data = res.data ?? res;
    return {
      receivedAt: data.localApiDataReceivedAt ?? data.local_api_data_received_at ?? null,
      snapshots: data.snapshots ?? null,
      pendingCashierRange: data.pendingCashierRange ?? data.pending_cashier_range ?? null
    };
  }

  function syncCashierDateInputsFromPending() {
    const fromEl = document.querySelector("[data-office-cashier-from]");
    const toEl = document.querySelector("[data-office-cashier-to]");
    if (!fromEl || !toEl || !pendingCashierRangeCache) return;
    const s = pendingCashierRangeCache.startDate;
    const e = pendingCashierRangeCache.endDate;
    if (s) fromEl.value = String(s).slice(0, 10);
    if (e) toEl.value = String(e).slice(0, 10);
  }

  function setRangeMsg(text, kind) {
    const el = document.querySelector("[data-office-pos-range-msg]");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "office-pos-range-msg";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = "office-pos-range-msg" + (kind === "error" ? " is-error" : kind === "success" ? " is-success" : "");
  }

  function renderWarehouse(snap) {
    const el = reportsEl();
    if (!el) return;
    const tr = t();
    const cur = DEFAULT_POS_CURRENCY;
    if (!snap) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posLoading"] || "Загрузка…")}</div>`;
      return;
    }

    const v2 = snap.inventoryV2;
    const v2Ok = v2 && v2.active && Array.isArray(v2.byLocation) && v2.byLocation.length > 0;
    const legacy = snap.warehouse;
    const parts = [];

    if (snap.inventoryV2Error) {
      parts.push(
        `<div class="office-pos-empty office-pos-error">${esc(tr["office.posInventoryV2ErrorPrefix"] || "Multi-store склад:")} ${esc(snap.inventoryV2Error)}</div>`
      );
    }

    if (v2Ok) {
      const gt = v2.globalTotals || {};
      const gRow = `
      <div class="office-pos-kpi-grid office-pos-kpi-grid--compact">
        <div class="office-pos-kpi"><span>${esc(tr["office.posV2Locations"] || "Локаций в снимке")}</span><strong>${gt.locationsInSnapshot ?? 0}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiStock"] || "Остаток, шт.")}</span><strong>${fmtNum(gt.totalQty)}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiCost"] || "Закуп, оценка")}</span><strong>${formatCurrency(gt.totalCostValue ?? 0, cur)}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiRetail"] || "Розница, оценка")}</span><strong>${formatCurrency(gt.totalRetailValue ?? 0, cur)}</strong></div>
      </div>`;

      const locBlocks = v2.byLocation
        .map((loc) => {
          const tit =
            loc.storeName ||
            loc.locationName ||
            `${tr["office.posV2Location"] || "Локация"} #${loc.locationId}`;
          const sub =
            loc.storeId != null
              ? `${esc(tr["office.posV2StoreId"] || "Магазин")}: ${loc.storeId} · ${esc(loc.locationType || "")}`
              : esc(loc.locationType || "");
          const lt = loc.totals || {};
          const cats = Array.isArray(loc.categories) ? loc.categories : [];
          const catRows = cats
            .map(
              (c) => `
          <tr>
            <td>${esc(c.categoryName)}</td>
            <td class="office-pos-num">${c.productsCount ?? 0}</td>
            <td class="office-pos-num">${c.variationsCount ?? 0}</td>
            <td class="office-pos-num">${fmtNum(c.totalStock)}</td>
            <td class="office-pos-num">${formatCurrency(c.totalCostValue ?? 0, cur)}</td>
            <td class="office-pos-num">${formatCurrency(c.totalRetailValue ?? 0, cur)}</td>
          </tr>`
            )
            .join("");
          return `
        <div class="office-pos-location-block">
          <h4 class="office-pos-location-title">${esc(tit)}</h4>
          <p class="office-pos-muted">${sub}</p>
          <div class="office-pos-kpi-grid office-pos-kpi-grid--compact">
            <div class="office-pos-kpi"><span>${esc(tr["office.posV2Variations"] || "Позиций")}</span><strong>${lt.variationsWithStock ?? 0}</strong></div>
            <div class="office-pos-kpi"><span>${esc(tr["office.posV2Products"] || "Товаров")}</span><strong>${lt.productsWithStock ?? 0}</strong></div>
            <div class="office-pos-kpi"><span>${esc(tr["office.posKpiStock"] || "Остаток")}</span><strong>${fmtNum(lt.totalQty)}</strong></div>
            <div class="office-pos-kpi"><span>${esc(tr["office.posKpiCost"] || "Закуп")}</span><strong>${formatCurrency(lt.totalCostValue ?? 0, cur)}</strong></div>
            <div class="office-pos-kpi"><span>${esc(tr["office.posKpiRetail"] || "Розница")}</span><strong>${formatCurrency(lt.totalRetailValue ?? 0, cur)}</strong></div>
          </div>
          <div class="office-pos-table-wrap">
            <table class="office-pos-table">
              <thead>
                <tr>
                  <th>${esc(tr["office.posColCategory"] || "Категория")}</th>
                  <th class="office-pos-num">${esc(tr["office.posColProducts"] || "Тов.")}</th>
                  <th class="office-pos-num">${esc(tr["office.posColVariations"] || "Вар.")}</th>
                  <th class="office-pos-num">${esc(tr["office.posColStock"] || "Остаток")}</th>
                  <th class="office-pos-num">${esc(tr["office.posColCost"] || "Закуп")}</th>
                  <th class="office-pos-num">${esc(tr["office.posColRetail"] || "Розница")}</th>
                </tr>
              </thead>
              <tbody>${catRows || `<tr><td colspan="6" class="office-pos-muted">${esc(tr["office.posNoCategories"] || "Нет категорий")}</td></tr>`}</tbody>
            </table>
          </div>
          ${loc.categoriesTruncated ? `<p class="office-pos-note">${esc(tr["office.posTruncated"] || "Показаны не все категории.")}</p>` : ""}
        </div>`;
        })
        .join("");

      const truncNote = v2.rowsTruncated
        ? `<p class="office-pos-note">${esc(tr["office.posV2RowsTruncated"] || "Список остатков усечён по лимиту строк — увеличьте SYNC_V2_BALANCE_ROWS_MAX на сервере при необходимости.")}</p>`
        : "";

      parts.push(`
      <h3 class="office-pos-subheading">${esc(tr["office.posV2Heading"] || "Multi-store склад (v2)")}</h3>
      <p class="office-pos-muted">${esc(tr["office.posV2Intro"] || "Остатки по inventory_balances по каждой локации (точке).")}</p>
      ${gRow}
      ${locBlocks}
      ${truncNote}
    `);
    }

    if (snap.warehouseError) {
      parts.push(`<div class="office-pos-empty office-pos-error">${esc(snap.warehouseError)}</div>`);
    } else if (legacy) {
      const cats = Array.isArray(legacy.categories) ? legacy.categories : [];
      const rows = cats
        .map(
          (c) => `
      <tr>
        <td>${esc(c.categoryName)}</td>
        <td class="office-pos-num">${c.productsCount ?? 0}</td>
        <td class="office-pos-num">${c.variationsCount ?? 0}</td>
        <td class="office-pos-num">${fmtNum(c.totalStock)}</td>
        <td class="office-pos-num">${formatCurrency(c.totalCostValue ?? 0, cur)}</td>
        <td class="office-pos-num">${formatCurrency(c.totalRetailValue ?? 0, cur)}</td>
      </tr>`
        )
        .join("");
      parts.push(`
      <h3 class="office-pos-subheading">${esc(tr["office.posLegacyWarehouseTitle"] || "Каталог товаров (legacy)")}</h3>
      <p class="office-pos-muted">${esc(tr["office.posLegacyIntro"] || "Сводка по полям stock у товаров/вариаций. При multi-store ориентируйтесь на блок v2 выше.")}</p>
      <div class="office-pos-kpi-grid">
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiProducts"] || "Товары")}</span><strong>${legacy.totalProducts ?? 0}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiVariations"] || "Вариации")}</span><strong>${legacy.totalVariations ?? 0}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiStock"] || "Остаток, шт.")}</span><strong>${fmtNum(legacy.totalStock)}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiCost"] || "Закуп, оценка")}</span><strong>${formatCurrency(legacy.totalCostValue ?? 0, cur)}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posKpiRetail"] || "Розница, оценка")}</span><strong>${formatCurrency(legacy.totalRetailValue ?? 0, cur)}</strong></div>
      </div>
      <div class="office-pos-table-wrap">
        <table class="office-pos-table">
          <thead>
            <tr>
              <th>${esc(tr["office.posColCategory"] || "Категория")}</th>
              <th class="office-pos-num">${esc(tr["office.posColProducts"] || "Тов.")}</th>
              <th class="office-pos-num">${esc(tr["office.posColVariations"] || "Вар.")}</th>
              <th class="office-pos-num">${esc(tr["office.posColStock"] || "Остаток")}</th>
              <th class="office-pos-num">${esc(tr["office.posColCost"] || "Закуп")}</th>
              <th class="office-pos-num">${esc(tr["office.posColRetail"] || "Розница")}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" class="office-pos-muted">${esc(tr["office.posNoCategories"] || "Нет категорий")}</td></tr>`}</tbody>
        </table>
      </div>
      ${legacy.categoriesTruncated ? `<p class="office-pos-note">${esc(tr["office.posTruncated"] || "Показаны не все категории (лимит синхронизации).")}</p>` : ""}
    `);
    }

    if (parts.length === 0) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posNoWarehouse"] || "Нет данных склада. Запустите локальный сервер с интернетом для синхронизации.")}</div>`;
      return;
    }

    el.innerHTML = parts.join("");
  }

  function getCashierSlice(snap) {
    const sel = document.querySelector("[data-office-cashier-period]");
    const key = sel?.value || "today";
    if (!snap) return { cr: null, err: null, periodKey: key, waiting: false, pending: null };
    if (key === "customRange") {
      if (snap.cashierReportCustomError) {
        return { cr: null, err: snap.cashierReportCustomError, periodKey: key, waiting: false, pending: null };
      }
      if (snap.cashierReportCustom) {
        return { cr: snap.cashierReportCustom, err: null, periodKey: key, waiting: false, pending: null };
      }
      if (pendingCashierRangeCache?.startDate && pendingCashierRangeCache?.endDate) {
        return {
          cr: null,
          err: null,
          periodKey: key,
          waiting: true,
          pending: pendingCashierRangeCache
        };
      }
      return { cr: null, err: null, periodKey: key, waiting: true, pending: null };
    }
    const multi = snap.cashierReports;
    if (multi && typeof multi === "object") {
      if (key === "today") {
        if (snap.cashierReportsTodayError) return { cr: null, err: snap.cashierReportsTodayError, periodKey: key, waiting: false, pending: null };
        return { cr: multi.today, err: null, periodKey: key, waiting: false, pending: null };
      }
      if (key === "last7") {
        if (snap.cashierReportsLast7Error) return { cr: null, err: snap.cashierReportsLast7Error, periodKey: key, waiting: false, pending: null };
        return { cr: multi.last7Days, err: null, periodKey: key, waiting: false, pending: null };
      }
      if (key === "last30") {
        if (snap.cashierReportsLast30Error) return { cr: null, err: snap.cashierReportsLast30Error, periodKey: key, waiting: false, pending: null };
        return { cr: multi.last30Days, err: null, periodKey: key, waiting: false, pending: null };
      }
    }
    if (snap.cashierReportError) return { cr: null, err: snap.cashierReportError, periodKey: key, waiting: false, pending: null };
    if (snap.cashierReport) {
      return {
        cr: { ...snap.cashierReport, period: snap.cashierPeriod },
        err: null,
        periodKey: "legacy",
        waiting: false,
        pending: null
      };
    }
    return { cr: null, err: null, periodKey: key, waiting: false, pending: null };
  }

  function renderCashier(snap) {
    const el = cashierEl();
    if (!el) return;
    const tr = t();
    const cur = DEFAULT_POS_CURRENCY;
    if (!snap) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posLoading"] || "Загрузка…")}</div>`;
      return;
    }
    const { cr, err, waiting, pending } = getCashierSlice(snap);
    if (waiting) {
      const trw = t();
      let msg =
        trw["office.posCustomRangeHelp"] ||
        "Укажите две даты ниже и нажмите «Сохранить», затем перезапустите локальный сервер POS с интернетом.";
      if (pending?.startDate && pending?.endDate) {
        msg =
          (trw["office.posWaitingSync"] || "Запрос %s принят. Перезапустите локальный сервер POS с интернетом — отчёт появится после синхронизации.").replace(
            "%s",
            `${pending.startDate} — ${pending.endDate}`
          );
      }
      el.innerHTML = `<div class="office-pos-empty">${esc(msg)}</div>`;
      return;
    }
    if (err) {
      el.innerHTML = `<div class="office-pos-empty office-pos-error">${esc(err)}</div>`;
      return;
    }
    if (!cr || !Array.isArray(cr.data) || cr.data.length === 0) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posNoCashier"] || "Нет данных по кассирам за выбранный период.")}</div>`;
      return;
    }
    const period = cr.period || snap?.cashierReportCustomMeta;
    const locale = detectLang() === "ru" ? "ru-RU" : "en-US";
    const pText =
      period && period.start && period.end
        ? `${new Date(period.start).toLocaleString(locale)} — ${new Date(period.end).toLocaleString(locale)}`
        : "";
    const ref = cr.refundsPeriodSummary || {};
    const rows = cr.data
      .map(
        (r) => `
      <tr>
        <td>${esc(r.userName)}</td>
        <td class="office-pos-num">${r.totalReceipts ?? 0}</td>
        <td class="office-pos-num">${formatCurrency(r.netRevenue ?? 0, cur)}</td>
        <td class="office-pos-num">${formatCurrency(r.totalRevenue ?? 0, cur)}</td>
        <td class="office-pos-num">${r.refundsCount ?? 0}</td>
        <td class="office-pos-num">${formatCurrency(r.refundsAmount ?? 0, cur)}</td>
        <td class="office-pos-num">${fmtNum(r.totalQuantity)}</td>
        <td class="office-pos-num">${formatCurrency(r.averageCheck ?? 0, cur)}</td>
      </tr>`
      )
      .join("");
    el.innerHTML = `
      ${pText ? `<p class="office-pos-period">${esc(tr["office.posCashierPeriod"] || "Период")}: ${esc(pText)}</p>` : ""}
      <div class="office-pos-refund-bar">
        <span>${esc(tr["office.posRefundsOps"] || "Возвратов, операций")}: <strong>${ref.refundOperationsCount ?? 0}</strong></span>
        <span>${esc(tr["office.posRefundsSum"] || "Сумма возвратов")}: <strong>${formatCurrency(ref.totalAmount ?? 0, cur)}</strong></span>
        <span>${esc(tr["office.posRefundsQty"] || "Единиц по возвратам")}: <strong>${fmtNum(ref.refundedItemsQty)}</strong></span>
      </div>
      <div class="office-pos-table-wrap">
        <table class="office-pos-table">
          <thead>
            <tr>
              <th>${esc(tr["office.posCashierName"] || "Кассир")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierReceipts"] || "Чеков")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierNet"] || "Чистая")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierGross"] || "Выручка")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierRefN"] || "Возвр.")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierRefSum"] || "Сумма в.")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierQty"] || "Шт.")}</th>
              <th class="office-pos-num">${esc(tr["office.posCashierAvg"] || "Средний")}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      return esc(new Date(iso).toLocaleString(detectLang() === "ru" ? "ru-RU" : "en-US"));
    } catch (_) {
      return esc(String(iso));
    }
  }

  function movementsPeriodHint(block, tr) {
    if (!block) return tr["office.posStockMovementsHint"] || "";
    if (block.source === "site_pending_range" && block.startDate && block.endDate) {
      const tpl =
        tr["office.posMovementsPeriodFromSite"] ||
        "Saved dates: {start} — {end}. Rows: {count}, limit {limit}. Restart local API and upload.";
      return tpl
        .replace("{start}", String(block.startDate))
        .replace("{end}", String(block.endDate))
        .replace("{count}", String(block.count ?? 0))
        .replace("{limit}", String(block.limit ?? "—"));
    }
    if (block.source === "rolling_days" && block.days != null) {
      const tpl =
        tr["office.posStockMovementsHintRolling"] ||
        "Last {days} days. Rows: {count}, limit {limit}.";
      return tpl
        .replace("{days}", String(block.days))
        .replace("{count}", String(block.count ?? 0))
        .replace("{limit}", String(block.limit ?? "—"));
    }
    return tr["office.posStockMovementsHint"] || "";
  }

  function renderMovements(snap) {
    const el = movementsEl();
    if (!el) return;
    const tr = t();
    if (!snap) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posLoading"] || "Загрузка…")}</div>`;
      return;
    }
    const parts = [];

    if (snap.stockMovementsError) {
      parts.push(
        `<h3 class="office-pos-subheading">${esc(tr["office.posStockMovementsTitle"] || "Движения склада")}</h3><div class="office-pos-empty office-pos-error">${esc(snap.stockMovementsError)}</div>`
      );
    } else if (snap.stockMovementsRecent && Array.isArray(snap.stockMovementsRecent.rows)) {
      const sm = snap.stockMovementsRecent;
      const rows = sm.rows
        .map(
          (r) => `
        <tr>
          <td>${fmtWhen(r.createdAt)}</td>
          <td>${esc(r.movementType || "—")}</td>
          <td class="office-pos-num">${fmtNum(r.quantity)}</td>
          <td>${esc(r.productName || "—")}</td>
          <td class="office-pos-num">${r.variationId ?? "—"}</td>
          <td class="office-pos-num">${r.receiptId ?? "—"}</td>
        </tr>`
        )
        .join("");
      parts.push(`
        <h3 class="office-pos-subheading">${esc(tr["office.posStockMovementsTitle"] || "Движения склада")}</h3>
        <p class="office-pos-muted">${esc(movementsPeriodHint(sm, tr))}</p>
        <div class="office-pos-table-wrap">
          <table class="office-pos-table">
            <thead>
              <tr>
                <th>${esc(tr["office.posMovWhen"] || "Когда")}</th>
                <th>${esc(tr["office.posMovType"] || "Тип")}</th>
                <th class="office-pos-num">${esc(tr["office.posMovQty"] || "Кол-во")}</th>
                <th>${esc(tr["office.posMovProduct"] || "Товар")}</th>
                <th class="office-pos-num">${esc(tr["office.posMovVar"] || "Вар.")}</th>
                <th class="office-pos-num">${esc(tr["office.posMovReceipt"] || "Чек")}</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6" class="office-pos-muted">${esc(tr["office.posNoStockMovements"] || "Нет записей за период")}</td></tr>`}</tbody>
          </table>
        </div>
      `);
    } else {
      parts.push(
        `<h3 class="office-pos-subheading">${esc(tr["office.posStockMovementsTitle"] || "Движения склада")}</h3><div class="office-pos-empty">${esc(tr["office.posNoStockMovementsData"] || "Данных движений нет в этом снимке (обновите POS-сервер).")}</div>`
      );
    }

    if (snap.inventoryTransfersError) {
      parts.push(
        `<h3 class="office-pos-subheading">${esc(tr["office.posTransfersTitle"] || "Перемещения между точками")}</h3><div class="office-pos-empty office-pos-error">${esc(snap.inventoryTransfersError)}</div>`
      );
    } else if (snap.inventoryTransfersRecent && Array.isArray(snap.inventoryTransfersRecent.transfers)) {
      const ir = snap.inventoryTransfersRecent;
      const trows = ir.transfers
        .map(
          (r) => `
        <tr>
          <td class="office-pos-num">${r.transferId ?? "—"}</td>
          <td>${esc(r.status || "—")}</td>
          <td>${esc(`${r.fromStoreName || r.fromStoreId || "—"} → ${r.toStoreName || r.toStoreId || "—"}`)}</td>
          <td class="office-pos-num">${r.itemsCount ?? "—"}</td>
          <td>${fmtWhen(r.requestedAt)}</td>
        </tr>`
        )
        .join("");
      parts.push(`
        <h3 class="office-pos-subheading">${esc(tr["office.posTransfersTitle"] || "Перемещения между точками")}</h3>
        <p class="office-pos-muted">${esc(movementsPeriodHint(ir, tr))}</p>
        <div class="office-pos-table-wrap">
          <table class="office-pos-table">
            <thead>
              <tr>
                <th class="office-pos-num">${esc(tr["office.posTransferId"] || "№")}</th>
                <th>${esc(tr["office.posTransferStatus"] || "Статус")}</th>
                <th>${esc(tr["office.posTransferRoute"] || "Откуда → куда")}</th>
                <th class="office-pos-num">${esc(tr["office.posTransferItems"] || "Поз.")}</th>
                <th>${esc(tr["office.posTransferWhen"] || "Запрошено")}</th>
              </tr>
            </thead>
            <tbody>${trows || `<tr><td colspan="5" class="office-pos-muted">${esc(tr["office.posNoTransfers"] || "Нет перемещений")}</td></tr>`}</tbody>
          </table>
        </div>
      `);
    } else {
      parts.push(
        `<h3 class="office-pos-subheading">${esc(tr["office.posTransfersTitle"] || "Перемещения между точками")}</h3><div class="office-pos-empty">${esc(tr["office.posNoTransfersData"] || "Блок перемещений недоступен (нет multi-store или старая версия снимка).")}</div>`
      );
    }

    el.innerHTML = parts.join("");
  }

  function renderDebtors(snap) {
    const el = debtorsEl();
    if (!el) return;
    const tr = t();
    const cur = DEFAULT_POS_CURRENCY;
    if (!snap) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posLoading"] || "Загрузка…")}</div>`;
      return;
    }
    const d = snap?.debtors;
    if (snap?.debtorsError) {
      el.innerHTML = `<div class="office-pos-empty office-pos-error">${esc(snap.debtorsError)}</div>`;
      return;
    }
    if (!d || !Array.isArray(d.debtors) || d.debtors.length === 0) {
      el.innerHTML = `<div class="office-pos-empty">${esc(tr["office.posNoDebtors"] || "Открытых долгов нет или данные ещё не синхронизированы.")}</div>`;
      return;
    }
    const rows = d.debtors
      .map(
        (row) => `
      <tr>
        <td>${esc(row.clientName)}</td>
        <td>${esc(row.clientPhone || "—")}</td>
        <td class="office-pos-num">${row.openDebtsCount ?? 0}</td>
        <td class="office-pos-num">${formatCurrency(row.totalRemaining ?? 0, cur)}</td>
        <td>${row.oldestDebtAt ? esc(new Date(row.oldestDebtAt).toLocaleDateString()) : "—"}</td>
      </tr>`
      )
      .join("");
    el.innerHTML = `
      <div class="office-pos-kpi-grid office-pos-kpi-grid--compact">
        <div class="office-pos-kpi"><span>${esc(tr["office.posDebtorsCount"] || "Должников")}</span><strong>${d.debtorsCount ?? 0}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posDebtOpen"] || "Открытых долгов")}</span><strong>${d.openDebtsCount ?? 0}</strong></div>
        <div class="office-pos-kpi"><span>${esc(tr["office.posDebtTotal"] || "Сумма долга")}</span><strong>${formatCurrency(d.totalRemaining ?? 0, cur)}</strong></div>
      </div>
      <div class="office-pos-table-wrap">
        <table class="office-pos-table">
          <thead>
            <tr>
              <th>${esc(tr["office.posDebtClient"] || "Клиент")}</th>
              <th>${esc(tr["office.posDebtPhone"] || "Телефон")}</th>
              <th class="office-pos-num">${esc(tr["office.posDebtOpenCnt"] || "Долгов")}</th>
              <th class="office-pos-num">${esc(tr["office.posDebtRemain"] || "Остаток")}</th>
              <th>${esc(tr["office.posDebtOldest"] || "Самый ранний")}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderAll() {
    const snap = snapshotsCache;
    renderWarehouse(snap);
    renderCashier(snap);
    renderDebtors(snap);
    renderMovements(snap);
  }

  async function load(token, force) {
    if (!token) {
      const msg = t()["office.posNeedLogin"] || "Войдите в аккаунт.";
      setStatus("");
      [reportsEl(), cashierEl(), debtorsEl(), movementsEl()].forEach((el) => {
        if (el) el.innerHTML = `<div class="office-pos-empty">${esc(msg)}</div>`;
      });
      return;
    }
    if (loading) return;
    if (!force && snapshotsCache !== null) {
      renderAll();
      return;
    }
    loading = true;
    setStatus(t()["office.posLoading"] || "Загрузка…");
    try {
      const pack = await fetchSnapshots(token);
      if (pack.error) {
        snapshotsCache = null;
        receivedAtCache = null;
        pendingCashierRangeCache = null;
        const err = pack.error;
        [reportsEl(), cashierEl(), debtorsEl(), movementsEl()].forEach((el) => {
          if (el) el.innerHTML = `<div class="office-pos-empty office-pos-error">${esc(err)}</div>`;
        });
        setStatus("");
        return;
      }
      receivedAtCache = pack.receivedAt;
      snapshotsCache = pack.snapshots;
      pendingCashierRangeCache = pack.pendingCashierRange || null;
      syncCashierDateInputsFromPending();
      if (!snapshotsCache) {
        const hint =
          t()["office.posEmptySnapshots"] ||
          "Снимки отчётов ещё не поступили. Убедитесь, что локальный сервер POS запущен с интернетом (данные с расшифровкой цен отправляются при старте).";
        [reportsEl(), cashierEl(), debtorsEl(), movementsEl()].forEach((el) => {
          if (el) el.innerHTML = `<div class="office-pos-empty">${esc(hint)}</div>`;
        });
      } else {
        renderAll();
      }
      const ra = receivedAtCache ? new Date(receivedAtCache).toLocaleString(detectLang() === "ru" ? "ru-RU" : "en-US") : "";
      setStatus(ra ? `${t()["office.posSyncedAt"] || "Синхронизация"}: ${ra}` : "");
    } finally {
      loading = false;
    }
  }

  function bindRefresh() {
    document.querySelectorAll("[data-office-pos-refresh]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const token = localStorage.getItem("userToken");
        snapshotsCache = null;
        load(token, true);
      });
    });
  }

  document.addEventListener("change", (e) => {
    const tEl = e.target;
    if (tEl && tEl.matches && tEl.matches("[data-office-cashier-period]") && snapshotsCache) {
      renderCashier(snapshotsCache);
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target && e.target.closest && e.target.closest("[data-office-cashier-range-save]");
    if (!btn) return;
    const token = localStorage.getItem("userToken");
    const trs = t();
    if (!token) {
      setRangeMsg(trs["office.posNeedLogin"] || "Войдите в аккаунт.", "error");
      return;
    }
    const fromEl = document.querySelector("[data-office-cashier-from]");
    const toEl = document.querySelector("[data-office-cashier-to]");
    const startDate = fromEl?.value?.trim();
    const endDate = toEl?.value?.trim();
    if (!startDate || !endDate) {
      setRangeMsg(trs["office.posRangeNeedBoth"] || "Укажите обе даты.", "error");
      return;
    }
    if (startDate > endDate) {
      setRangeMsg(trs["office.posRangeOrder"] || "Начальная дата не позже конечной.", "error");
      return;
    }
    setRangeMsg(trs["office.posRangeSaving"] || "Сохранение…", "");
    try {
      const res = await api.put(
        "/shop/pos-snapshots/cashier-range-request",
        { startDate, endDate },
        { token }
      );
      if (res == null || res.error) {
        setRangeMsg(res?.message || "Ошибка", "error");
        return;
      }
      const d = res.data ?? res;
      const saved = d.data ?? d;
      if (saved?.startDate && saved?.endDate) {
        pendingCashierRangeCache = { startDate: saved.startDate, endDate: saved.endDate };
      } else {
        pendingCashierRangeCache = { startDate, endDate };
      }
      syncCashierDateInputsFromPending();
      const sel = document.querySelector("[data-office-cashier-period]");
      if (sel) sel.value = "customRange";
      setRangeMsg(res.message || trs["office.posRangeSaved"] || "Сохранено.", "success");
      if (snapshotsCache) renderCashier(snapshotsCache);
    } catch (err) {
      setRangeMsg(err?.message || String(err), "error");
    }
  });

  bindRefresh();

  return {
    /** @param {string|null} token */
    async onPanelShown(panelId, token) {
      if (panelId === "reports" || panelId === "cashier" || panelId === "debtors" || panelId === "movements") {
        await load(token, false);
      }
    },
    invalidate() {
      snapshotsCache = null;
    }
  };
}
