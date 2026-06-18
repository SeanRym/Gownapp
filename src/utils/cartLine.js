import { normalizeId } from "./id";

/** Unique cart line = gown id + size (matches gownweb cartClient). */
export function cartLineKey(id, size = null) {
  return `${normalizeId(id)}__${size == null || size === "" ? "" : String(size).trim()}`;
}

export function normalizeCartItem(raw) {
  const id = normalizeId(raw?.id);
  if (!id) return null;
  const size = raw?.size == null || raw?.size === "" ? null : String(raw.size).trim();
  return {
    id,
    qty: Math.max(1, Number(raw?.qty) || 1),
    size,
    lineKey: cartLineKey(id, size),
  };
}

export function normalizeCartItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeCartItem)
    .filter(Boolean);
}

export function findCartLine(cart, id, size = null) {
  const key = cartLineKey(id, size);
  const direct = (Array.isArray(cart) ? cart : []).find((x) => x.lineKey === key);
  if (direct) return direct;
  if (size == null || size === "") return null;
  const want = String(size).trim().toLowerCase();
  return (Array.isArray(cart) ? cart : []).find(
    (x) => normalizeId(x?.id) === normalizeId(id) && String(x?.size || "").trim().toLowerCase() === want
  ) || null;
}

export function resolveInventoryKey(inventory, size) {
  if (!inventory || typeof inventory !== "object" || size == null || size === "") return null;
  const s = String(size).trim();
  if (Object.prototype.hasOwnProperty.call(inventory, s)) return s;
  const lower = s.toLowerCase();
  return Object.keys(inventory).find((k) => k.toLowerCase() === lower) || s;
}

export function sizeStockAvailable(gown, size) {
  if (!gown) return null;
  const inv = gown.sizeInventory;
  if (inv && typeof inv === "object" && size) {
    const key = resolveInventoryKey(inv, size);
    const row = inv[key];
    if (typeof row === "number") return Math.max(0, row);
    if (row && typeof row === "object") {
      const stock = Number(row.stock ?? row.stockQty ?? 0);
      const reserved = Number(row.reserved ?? row.reservedQty ?? 0);
      return Math.max(0, stock - reserved);
    }
    return 0;
  }
  const stockQty = Number(gown.stockQty);
  return Number.isFinite(stockQty) ? Math.max(0, stockQty) : null;
}

/** All size keys from inventory with live availability (matches web cart size pills). */
export function getGownSizeOptions(gown) {
  const inv = gown?.sizeInventory;
  if (!inv || typeof inv !== "object") return [];
  return Object.keys(inv)
    .filter(Boolean)
    .map((sizeKey) => ({
      size: sizeKey,
      available: sizeStockAvailable(gown, sizeKey),
    }));
}
