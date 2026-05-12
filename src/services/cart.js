import { API_BASE_URL } from "../config/apiEnv";
import { normalizeId } from "../utils/id";

/**
 * Fetch user's cart from backend database
 * Associated with user email/ID
 */
export async function fetchCartFromServer(userEmail) {
  try {
    if (!userEmail) return [];
    
    const res = await fetch(`${API_BASE_URL}/api/mobile/cart`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-Email": userEmail,
      },
    });
    
    if (!res.ok) {
      console.warn("Failed to fetch cart from server:", res.status);
      return [];
    }
    
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    console.warn("Error fetching cart from server:", err);
    return [];
  }
}

/**
 * Save cart to backend database
 * Syncs across all devices (mobile, web, etc)
 * Falls back to local-only if server endpoint unavailable
 */
export async function saveCartToServer(userEmail, cartItems) {
  try {
    if (!userEmail) return { ok: false, reason: "User not authenticated" };
    
    const res = await fetch(`${API_BASE_URL}/api/mobile/cart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Email": userEmail,
      },
      body: JSON.stringify({
        items: Array.isArray(cartItems) ? cartItems : [],
        syncedAt: new Date().toISOString(),
      }),
    });
    
    if (!res.ok) {
      // If endpoint doesn't exist (404), allow local cart to work
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
    // Network errors - allow local cart to work
    console.warn("Error saving cart to server, falling back to local:", err);
    return { ok: true, data: { local: true } };
  }
}

/**
 * Add item to cart on both local storage and server
 * Returns merged cart (local + server)
 */
export async function addItemToCart(userEmail, gownId, quantity, currentCart, gowns) {
  try {
    const normalizedId = normalizeId(gownId);
    if (!normalizedId) {
      return { ok: false, reason: "Invalid item ID" };
    }
    
    // Find gown to check stock
    const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
    if (!gown) {
      return { ok: false, reason: "Item not found in catalog" };
    }
    
    const stockQty = Number(gown?.stockQty);
    const addQty = Math.max(1, Number(quantity) || 1);
    
    if (Number.isFinite(stockQty) && stockQty <= 0) {
      return { ok: false, reason: "Out of stock" };
    }
    
    // Build new cart
    const nextCart = [...currentCart];
    const existingItem = nextCart.find((i) => normalizeId(i?.id) === normalizedId);
    
    if (existingItem) {
      const newQty = existingItem.qty + addQty;
      if (Number.isFinite(stockQty) && newQty > stockQty) {
        return { ok: false, reason: `Only ${stockQty} available` };
      }
      existingItem.qty = newQty;
    } else {
      if (Number.isFinite(stockQty) && addQty > stockQty) {
        return { ok: false, reason: `Only ${stockQty} available` };
      }
      nextCart.push({ id: normalizedId, qty: addQty });
    }
    
    // Save to server
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
 * Remove item from cart on both local and server
 */
export async function removeItemFromCart(userEmail, gownId, currentCart) {
  try {
    const normalizedId = normalizeId(gownId);
    const nextCart = currentCart.filter((i) => normalizeId(i?.id) !== normalizedId);
    
    // Save to server
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
 * Update quantity for a cart item
 */
export async function updateCartItemQty(userEmail, gownId, newQty, currentCart, gowns) {
  try {
    const normalizedId = normalizeId(gownId);
    const safeQty = Math.max(1, Number(newQty) || 1);
    
    // Check stock
    const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
    const stockQty = Number(gown?.stockQty);
    const cappedQty = Number.isFinite(stockQty) && stockQty >= 0 
      ? Math.min(safeQty, stockQty) 
      : safeQty;
    
    const nextCart = currentCart.map((i) =>
      normalizeId(i?.id) === normalizedId 
        ? { ...i, qty: cappedQty }
        : i
    );
    
    // Save to server
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
