import { API_BASE_URL } from "../config/apiEnv";
import { normalizeId } from "../utils/id";
import {
  cartLineKey,
  findCartLine,
  getGownSizeOptions,
  normalizeCartItems,
  resolveInventoryKey,
  sizeStockAvailable,
} from "../utils/cartLine";

export { cartLineKey, normalizeCartItems, sizeStockAvailable, getGownSizeOptions, resolveInventoryKey };

/**
 * Fetch user's cart from backend database
 * Associated with user email/ID
 */
export async function fetchCartSnapshotFromServer(userEmail) {
  try {
    if (!userEmail) return { ok: false, items: [], lastUpdated: "", reason: "missing_user_email" };

    const res = await fetch(`${API_BASE_URL}/api/mobile/cart`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-Email": userEmail,
      },
    });

    if (!res.ok) {
      console.warn("Failed to fetch cart from server:", res.status);
      return { ok: false, items: [], lastUpdated: "", reason: `http_${res.status}` };
    }

    const data = await res.json();
    return {
      ok: true,
      items: normalizeCartItems(data?.items),
      lastUpdated: String(data?.lastUpdated || data?.lastUpdatedAt || data?.updatedAt || ""),
    };
  } catch (err) {
    console.warn("Error fetching cart from server:", err);
    return { ok: false, items: [], lastUpdated: "", reason: err?.message || "network_error" };
  }
}

export async function fetchCartFromServer(userEmail) {
  const snap = await fetchCartSnapshotFromServer(userEmail);
  return snap.items;
}

/**
 * Save cart to backend database
 * Syncs across all devices (mobile, web, etc)
 */
export async function saveCartToServer(userEmail, cartItems) {
  try {
    if (!userEmail) return { ok: false, reason: "User not authenticated" };

    const items = normalizeCartItems(cartItems).map(({ id, qty, size }) => ({
      id,
      qty,
      ...(size ? { size } : {}),
    }));

    const res = await fetch(`${API_BASE_URL}/api/mobile/cart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Email": userEmail,
      },
      body: JSON.stringify({
        items,
        syncedAt: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.warn("Cart sync endpoint not available, using local storage only");
        return { ok: true, data: { local: true } };
      }
      const msg = await res.text();
      return { ok: false, reason: msg || `Save failed (${res.status})` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.warn("Error saving cart to server, falling back to local:", err);
    return { ok: true, data: { local: true } };
  }
}

/**
 * Add item to cart (unique per id + size)
 */
export async function addItemToCart(userEmail, gownId, quantity, currentCart, gowns, options = {}) {
  try {
    const normalizedId = normalizeId(gownId);
    if (!normalizedId) {
      return { ok: false, reason: "Invalid item ID" };
    }

    const size = options?.size == null || options?.size === "" ? null : String(options.size).trim();
    const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
    if (!gown) {
      return { ok: false, reason: "Item not found in catalog" };
    }

    const available = sizeStockAvailable(gown, size);
    const addQty = Math.max(1, Number(quantity) || 1);

    if (available !== null && available <= 0) {
      return { ok: false, reason: "Out of stock" };
    }

    const nextCart = [...normalizeCartItems(currentCart)];
    const existing = findCartLine(nextCart, normalizedId, size);

    if (existing) {
      const proposed = existing.qty + addQty;
      existing.qty = available !== null ? Math.min(proposed, available) : proposed;
    } else {
      const capped = available !== null ? Math.min(addQty, available) : addQty;
      nextCart.push({
        id: normalizedId,
        qty: capped,
        size,
        lineKey: cartLineKey(normalizedId, size),
      });
    }

    const saveResult = await saveCartToServer(userEmail, nextCart);
    if (!saveResult.ok) {
      return { ok: false, reason: saveResult.reason };
    }

    return { ok: true, cart: nextCart };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Remove one cart line (id + size)
 */
export async function removeItemFromCart(userEmail, gownId, currentCart, size = null) {
  try {
    const key = cartLineKey(gownId, size);
    const nextCart = normalizeCartItems(currentCart).filter((i) => i.lineKey !== key);

    const saveResult = await saveCartToServer(userEmail, nextCart);
    if (!saveResult.ok) {
      return { ok: false, reason: saveResult.reason };
    }

    return { ok: true, cart: nextCart };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Update quantity for a cart line (id + size)
 */
export async function updateCartItemQty(userEmail, gownId, newQty, currentCart, gowns, size = null) {
  try {
    const normalizedId = normalizeId(gownId);
    const safeQty = Math.max(1, Number(newQty) || 1);
    const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
    const available = sizeStockAvailable(gown, size);
    const cappedQty = available !== null ? Math.min(safeQty, available) : safeQty;

    const key = cartLineKey(normalizedId, size);
    const nextCart = normalizeCartItems(currentCart).map((i) =>
      i.lineKey === key ? { ...i, qty: cappedQty } : i
    );

    const saveResult = await saveCartToServer(userEmail, nextCart);
    if (!saveResult.ok) {
      return { ok: false, reason: saveResult.reason };
    }

    return { ok: true, cart: nextCart, qty: cappedQty };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Change size on a cart line (remove old line, merge into target size). Syncs to server.
 */
export async function changeCartItemSize(userEmail, gownId, fromSize, toSize, currentCart, gowns) {
  try {
    const normalizedId = normalizeId(gownId);
    if (!normalizedId) return { ok: false, reason: "Invalid item ID" };

    const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
    if (!gown) return { ok: false, reason: "Item not found in catalog" };

    const fromKey = resolveInventoryKey(gown.sizeInventory, fromSize) ?? (fromSize == null || fromSize === "" ? null : String(fromSize).trim());
    const toKey = resolveInventoryKey(gown.sizeInventory, toSize) ?? (toSize == null || toSize === "" ? null : String(toSize).trim());

    if (fromKey === toKey) return { ok: true, cart: normalizeCartItems(currentCart) };

    const available = sizeStockAvailable(gown, toKey);
    if (available !== null && available <= 0) {
      return { ok: false, reason: "That size is out of stock" };
    }

    const cart = normalizeCartItems(currentCart);
    const fromLine = findCartLine(cart, normalizedId, fromKey);
    if (!fromLine) return { ok: false, reason: "Item not in cart" };

    const cappedQty = available !== null ? Math.min(fromLine.qty, available) : fromLine.qty;
    let nextCart = cart.filter((i) => i.lineKey !== fromLine.lineKey);

    const targetLine = findCartLine(nextCart, normalizedId, toKey);
    if (targetLine) {
      const proposed = targetLine.qty + cappedQty;
      targetLine.qty = available !== null ? Math.min(proposed, available) : proposed;
    } else {
      nextCart.push({
        id: normalizedId,
        qty: cappedQty,
        size: toKey,
        lineKey: cartLineKey(normalizedId, toKey),
      });
    }

    const saveResult = await saveCartToServer(userEmail, nextCart);
    if (!saveResult.ok) {
      return { ok: false, reason: saveResult.reason };
    }

    return {
      ok: true,
      cart: nextCart,
      newLineKey: cartLineKey(normalizedId, toKey),
      previousLineKey: fromLine.lineKey,
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Clear entire cart
 */
export async function clearCartOnServer(userEmail) {
  try {
    const saveResult = await saveCartToServer(userEmail, []);
    if (!saveResult.ok) {
      return { ok: false, reason: saveResult.reason };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
