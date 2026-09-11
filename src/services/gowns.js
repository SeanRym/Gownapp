import { GOWNS } from "../data/gowns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, adminAuthHeaders } from "../config/apiEnv";
const GOWN_PROMO_OVERRIDES_KEY = "jce_gown_promo_overrides";

function makeUrl(path) {
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

function toPriceText(value) {
  if (typeof value === "string" && value.trim()) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return "P0";
  return `P${n.toLocaleString("en-PH")}`;
}

function toInventoryObject(raw) {
  const obj = {};
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const size = String(row?.size || row?.sizeLabel || "").trim();
    if (!size) continue;
    const available = row?.available ?? row?.stock ?? row?.stockQty ?? 0;
    obj[size] = Math.max(0, Number(available) || 0);
  }
  return obj;
}

function normalizeRemoteImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|file:|content:|ph:|assets-library:)/i.test(raw)) return raw;
  return `${String(API_BASE_URL).replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

function normalizeRemoteGown(item, archivedFallback = false) {
  const sizeInventory = toInventoryObject(item?.inventory || item?.sizeStock || []);
  const stockQtyFromInventory = Object.values(sizeInventory).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  const explicitStock = Number(item?.stockQty);
  const stockQty = Number.isFinite(explicitStock) ? explicitStock : stockQtyFromInventory;
  return {
    id: String(item?.id || ""),
    name: String(item?.name || "").trim(),
    price: toPriceText(item?.price ?? item?.salePrice),
    promoPrice: String(item?.promoPrice || "").trim(),
    promo: Boolean(item?.promo),
    image: normalizeRemoteImageUrl(item?.image),
    tryonImage: normalizeRemoteImageUrl(item?.tryonImage || item?.tryon_image_url || item?.image),
    tryonImageBack: normalizeRemoteImageUrl(item?.tryonImageBack || item?.tryon_image_back_url) || null,
    tryonCalibration: item?.tryonCalibration ?? item?.tryon_calibration ?? null,
    alt: String(item?.alt || item?.name || "").trim(),
    type: String(item?.type || "Gowns").trim(),
    color: String(item?.color || "").trim(),
    silhouette: String(item?.silhouette || "").trim(),
    description: String(item?.description || "").trim(),
    neckline: String(item?.neckline || "").trim(),
    fabric: String(item?.fabric || "").trim(),
    additionalImages: Array.isArray(item?.additionalImages)
      ? item.additionalImages.map(normalizeRemoteImageUrl).filter(Boolean)
      : [],
    sizeInventory,
    stockQty: Math.max(0, stockQty),
    lowStockThreshold: Math.max(0, Number(item?.lowStockThreshold) || 0),
    archived: item?.archived !== undefined ? Boolean(item.archived) : archivedFallback || item?.isActive === false,
  };
}

async function loadPromoOverrides() {
  try {
    const raw = await AsyncStorage.getItem(GOWN_PROMO_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function savePromoOverrides(next) {
  try {
    await AsyncStorage.setItem(GOWN_PROMO_OVERRIDES_KEY, JSON.stringify(next || {}));
  } catch {
    // ignore storage write issues
  }
}

function applyPromoOverride(item, promoOverrides) {
  const id = String(item?.id || "").trim();
  if (!id) return item;
  const override = promoOverrides?.[id];
  if (!override || typeof override !== "object") return item;
  const promoPrice = String(override?.promoPrice || "").trim();
  const promo = Boolean(override?.promo) && Boolean(promoPrice);
  return { ...item, promo, promoPrice: promo ? promoPrice : "" };
}

function buildInventoryList(sizeInventory) {
  if (!sizeInventory || typeof sizeInventory !== "object") return [];
  return Object.entries(sizeInventory)
    .map(([size, qty]) => ({
      size: String(size || "").trim().toUpperCase(),
      stock: Math.max(0, Number(qty) || 0),
    }))
    .filter((x) => x.size);
}

function parseSalePrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function coerceNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const compact = value.replace(/[^\d.\-]/g, "");
    const n = Number(compact);
    if (Number.isFinite(n)) return n;
  }
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function buildSkuName(value) {
  const seed = String(value || "").trim();
  if (!seed) return `gown-${Date.now().toString().slice(-8)}`;
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || `gown-${Date.now().toString().slice(-8)}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(makeUrl(path), options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function fetchGowns() {
  try {
    const data = await requestJson("/api/gowns");
    const items = Array.isArray(data?.gowns) ? data.gowns : [];
    const promoOverrides = await loadPromoOverrides();
    return items
      .map((x) => normalizeRemoteGown(x, false))
      .map((x) => applyPromoOverride(x, promoOverrides))
      .filter((x) => !x.archived);
  } catch {
    const promoOverrides = await loadPromoOverrides();
    return GOWNS.map((x) => ({ ...x, archived: false })).map((x) => applyPromoOverride(x, promoOverrides));
  }
}

export async function setGownsCatalogAdmin(items) {
  return { ok: false, error: "Catalog sync is server-managed when API mode is enabled.", items };
}

export async function getAllGownsAdmin() {
  try {
    const [active, archived] = await Promise.all([
      requestJson("/api/admin/gowns?tab=active", { headers: adminAuthHeaders() }),
      requestJson("/api/admin/gowns?tab=archived", { headers: adminAuthHeaders() }),
    ]);
    const promoOverrides = await loadPromoOverrides();
    const activeItems = (Array.isArray(active?.gowns) ? active.gowns : []).map((x) => normalizeRemoteGown(x, false));
    const archivedItems = (Array.isArray(archived?.gowns) ? archived.gowns : []).map((x) => normalizeRemoteGown(x, true));
    return [...activeItems, ...archivedItems].map((x) => applyPromoOverride(x, promoOverrides));
  } catch {
    const promoOverrides = await loadPromoOverrides();
    return GOWNS.map((x) => ({ ...x, archived: false })).map((x) => applyPromoOverride(x, promoOverrides));
  }
}

export async function uploadAdminTryonImage(localUri) {
  const uri = String(localUri || "").trim();
  if (!uri) return { ok: false, error: "No image selected." };
  if (/^https?:\/\//i.test(uri)) return { ok: true, url: uri };

  const name = uri.split("/").pop()?.split("?")[0] || `upload-${Date.now()}.jpg`;
  const lower = name.toLowerCase();
  const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";

  const form = new FormData();
  form.append("file", { uri, name, type });

  const response = await fetch(makeUrl("/api/admin/upload-tryon-image"), {
    method: "POST",
    headers: adminAuthHeaders(),
    body: form,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok) {
    return { ok: false, error: body?.error || `Upload failed (${response.status}).` };
  }
  return { ok: true, url: String(body.url || "").trim() };
}

export async function removeBackgroundFromImage(sourceUrl, tolerance = 35) {
  const value = String(sourceUrl || "").trim();
  if (!value) return { ok: false, error: "No image selected." };

  try {
    const payload = {
      imageUrl: value,
      tolerance: Math.max(0, Math.min(100, Number(tolerance) || 35)),
    };
    const response = await fetch(makeUrl("/api/admin/remove-background"), {
      method: "POST",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.ok && (body?.ok || body?.url || body?.imageUrl || body?.outputUrl)) {
      return { ok: true, url: String(body?.url || body?.imageUrl || body?.outputUrl || value).trim() };
    }
  } catch (err) {
    console.log("[removeBackgroundFromImage] Endpoint call failed:", err.message);
  }

  // Fallback: return original image
  return { ok: true, url: value, fallback: true };
}

async function resolveRemoteImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("file:") || raw.startsWith("content:") || raw.startsWith("ph://") || raw.startsWith("assets-library:")) {
    const uploaded = await uploadAdminTryonImage(raw);
    if (!uploaded.ok) throw new Error(uploaded.error || "Image upload failed.");
    return uploaded.url;
  }
  return raw;
}

export async function upsertGownAdmin(payload) {
  try {
    const id = String(payload?.id || "").trim();
    const [image, tryonImage, tryonImageBack, additionalImage1] = await Promise.all([
      resolveRemoteImageUrl(payload?.image),
      resolveRemoteImageUrl(payload?.tryonImage),
      resolveRemoteImageUrl(payload?.tryonImageBack),
      resolveRemoteImageUrl(payload?.additionalImage1),
    ]);
    const inventoryRows = buildInventoryList(payload?.sizeInventory);
    const salePrice = parseSalePrice(payload?.salePrice ?? payload?.price ?? 0);
    const priceNumber = coerceNumber(payload?.salePrice ?? payload?.price ?? salePrice, salePrice);
    const name = String(payload?.name || "").trim();
    const explicitPriceText = String(payload?.price || "").trim();
    const normalizedPrice = explicitPriceText || `P${salePrice.toLocaleString("en-PH")}`;
    const sizeInventory = Object.fromEntries(
      inventoryRows.map(({ size, stock }) => [String(size).trim(), Math.max(0, Number(stock) || 0)])
    );
    const stockQty = inventoryRows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
    const promoPriceText = String(payload?.promoPrice || "").trim();
    const body = {
      id: id || undefined,
      sku: String(payload?.sku || "").trim() || `${buildSkuName(name)}-${Date.now().toString().slice(-6)}`,
      name,
      salePrice: priceNumber,
      price: priceNumber || normalizedPrice,
      priceText: normalizedPrice,
      image,
      alt: String(payload?.alt || "").trim(),
      tryonImage: tryonImage || image,
      tryonImageBack: tryonImageBack || null,
      tryonCalibration: payload?.tryonCalibration ?? null,
      type: String(payload?.type || "Gowns").trim(),
      color: String(payload?.color || "").trim(),
      silhouette: String(payload?.silhouette || "").trim(),
      description: String(payload?.description || "").trim(),
      neckline: String(payload?.neckline || "").trim(),
      fabric: String(payload?.fabric || "").trim(),
      promo: Boolean(payload?.promo),
      promoPrice: promoPriceText,
      stockQty,
      lowStockThreshold: Math.max(0, Number(payload?.lowStockThreshold) || 0),
      inventory: inventoryRows,
      sizeInventory,
      sizeStock: inventoryRows,
      stockBySize: sizeInventory,
      sale_price: priceNumber,
      price_value: priceNumber,
      promo_price: promoPriceText,
    };
    if (additionalImage1) {
      body.additionalImages = [additionalImage1];
    }
    const method = id ? "PUT" : "POST";
    const data = await requestJson("/api/admin/gowns", {
      method,
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const savedItem = normalizeRemoteGown(data?.gown || {}, false);
    const resolvedId = String(savedItem?.id || payload?.id || "").trim();
    if (resolvedId) {
      const promoOverrides = await loadPromoOverrides();
      const nextPromoPrice = String(payload?.promoPrice || "").trim();
      const nextPromo = Boolean(payload?.promo) && Boolean(nextPromoPrice);
      const nextOverrides = { ...promoOverrides };
      if (nextPromo) {
        nextOverrides[resolvedId] = { promo: true, promoPrice: nextPromoPrice };
      } else {
        delete nextOverrides[resolvedId];
      }
      await savePromoOverrides(nextOverrides);
      return { ok: true, item: applyPromoOverride(savedItem, nextOverrides) };
    }
    return { ok: true, item: savedItem };
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to save gown." };
  }
}

export async function deleteGownAdmin(id) {
  try {
    const gownId = String(id || "").trim();
    await requestJson(`/api/admin/gowns?id=${encodeURIComponent(gownId)}&permanent=1`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    if (gownId) {
      const promoOverrides = await loadPromoOverrides();
      if (promoOverrides[gownId]) {
        const next = { ...promoOverrides };
        delete next[gownId];
        await savePromoOverrides(next);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to delete gown." };
  }
}

export async function setGownArchivedAdmin(id, archived = true) {
  try {
    const gownId = String(id || "").trim();
    if (archived) {
      await requestJson(`/api/admin/gowns?id=${encodeURIComponent(gownId)}`, {
        method: "DELETE",
        headers: adminAuthHeaders(),
      });
      return { ok: true };
    }
    const data = await requestJson("/api/admin/gowns", {
      method: "PUT",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: gownId, restore: true }),
    });
    return { ok: true, item: normalizeRemoteGown(data?.gown || {}, false) };
  } catch (e) {
    return { ok: false, error: e?.message || "Failed to update archive status." };
  }
}
