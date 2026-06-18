import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchGowns } from "../services/gowns";
import { clearUser, loadCart, loadCartUpdatedAt, loadFavorites, loadUser, saveCart, saveFavorites, saveUser } from "../utils/storage";
import { getLastSyncAt, syncUserData } from "../services/sync";
import { idsEqual, normalizeId } from "../utils/id";
import { cartLineKey, findCartLine, normalizeCartItems, resolveInventoryKey, sizeStockAvailable } from "../utils/cartLine";
import {
  fetchCartSnapshotFromServer,
  addItemToCart,
  changeCartItemSize,
  removeItemFromCart,
  updateCartItemQty,
  clearCartOnServer,
  saveCartToServer,
} from "../services/cart";
import { trackInteraction, syncInteractionsToServer } from "../services/recommendations";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [gowns, setGowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [favoritesIds, setFavoritesIds] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const reloadGowns = useCallback(async () => {
    const data = await fetchGowns();
    setGowns(Array.isArray(data) ? data : []);
    return data;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [gownsData, guestCartData, userData, favoritesData] = await Promise.all([
          fetchGowns(),
          loadUser(),
          loadFavorites(),
          loadCart(), // guest cart
        ]);
        const lastSync = await getLastSyncAt();
        if (!mounted) return;
        setGowns(gownsData);
        
        // Normalize local cart
        const normalizedGuestCart = normalizeCartItems(guestCartData);

        let cartToUse = normalizedGuestCart;
        if (userData?.email) {
          const email = String(userData.email).trim().toLowerCase();
          const localUserCart = normalizeCartItems(await loadCart(email));

          // Merge guest + user-local (sum qty per lineKey)
          const mergedLocal = (() => {
            const map = new Map();
            for (const it of [...normalizedGuestCart, ...localUserCart]) {
              const key = String(it?.lineKey || "");
              if (!key) continue;
              const prev = map.get(key);
              map.set(key, prev ? { ...prev, qty: (Number(prev.qty) || 0) + (Number(it.qty) || 0) } : { ...it });
            }
            return [...map.values()].map((x) => ({ ...x, qty: Math.max(1, Number(x.qty) || 1) }));
          })();

          // Conflict resolution (like web):
          // if local updated_at >= backend updated_at -> push local to backend, else pull backend.
          try {
            const [serverSnap, localUpdatedAt] = await Promise.all([
              fetchCartSnapshotFromServer(email),
              loadCartUpdatedAt(email),
            ]);
            const backendUpdatedAt = serverSnap?.lastUpdated ? new Date(serverSnap.lastUpdated) : null;
            const localUpdated = localUpdatedAt ? new Date(localUpdatedAt) : null;

            if (localUpdated && backendUpdatedAt && localUpdated >= backendUpdatedAt) {
              await saveCartToServer(email, mergedLocal);
              cartToUse = mergedLocal;
            } else if (Array.isArray(serverSnap?.items) && serverSnap.items.length > 0) {
              cartToUse = serverSnap.items;
            } else {
              // backend empty: push local if we have it
              if (mergedLocal.length > 0) await saveCartToServer(email, mergedLocal);
              cartToUse = mergedLocal;
            }
          } catch (err) {
            console.warn("Failed to resolve cart vs server, using local:", err);
            cartToUse = mergedLocal;
          }

          await saveCart(cartToUse, email);
        } else {
          await saveCart(cartToUse); // keep guest timestamp updated
        }
        
        setCart(cartToUse);
        setUser(userData);
        setFavoritesIds(favoritesData.map((x) => normalizeId(x)).filter(Boolean));
        setLastSyncedAt(lastSync);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Periodic sync of interactions to server
  useEffect(() => {
    const interval = setInterval(() => {
      syncInteractionsToServer().catch(() => {});
    }, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const syncCartFromServer = useCallback(async () => {
    if (!user?.email) return cart;
    try {
      const email = String(user.email).trim().toLowerCase();
      const serverSnap = await fetchCartSnapshotFromServer(email);
      if (serverSnap?.ok && Array.isArray(serverSnap?.items)) {
        setCart(serverSnap.items);
        await saveCart(serverSnap.items, email);
        return serverSnap.items;
      }
      console.warn("Cart sync skipped due to fetch failure, keeping local cart.");
    } catch (err) {
      console.warn("Cart sync failed:", err);
    }
    return cart;
  }, [cart, user?.email]);

  const addToCart = async (id, quantity = 1, options = {}) => {
    const normalizedId = normalizeId(id);
    if (!normalizedId) return { ok: false, reason: "Invalid item." };

    try {
      // Guest: local-only cart (sync later on login)
      if (!user?.email) {
        const size = options?.size == null || options?.size === "" ? null : String(options.size).trim();
        const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
        const available = gown ? sizeStockAvailable(gown, size) : null;
        const addQty = Math.max(1, Number(quantity) || 1);
        const next = [...normalizeCartItems(cart)];
        const key = next.find((x) => x.id === normalizedId && (x.size ?? null) === size);
        if (available !== null && available <= 0) return { ok: false, reason: "Out of stock" };
        if (key) {
          const proposed = key.qty + addQty;
          key.qty = available !== null ? Math.min(proposed, available) : proposed;
        } else {
          const capped = available !== null ? Math.min(addQty, available) : addQty;
          next.push({ id: normalizedId, qty: capped, size, lineKey: `${normalizedId}__${size == null ? "" : String(size).trim()}` });
        }
        setCart(next);
        await saveCart(next);
        return { ok: true, cart: next, localOnly: true };
      }

      const email = String(user.email).trim().toLowerCase();
      const result = await addItemToCart(email, normalizedId, quantity, cart, gowns, options);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart, email);
        await trackInteraction(email, normalizedId, "cart_add");
      }
      return result;
    } catch (err) {
      console.error("Error adding to cart:", err);
      return { ok: false, reason: err.message };
    }
  };

  const setQty = async (id, qty, size = null) => {
    try {
      const normalizedId = normalizeId(id);
      if (!normalizedId) return { ok: false, reason: "Invalid item." };

      if (!user?.email) {
        const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
        const available = sizeStockAvailable(gown, size);
        const safeQty = Math.max(1, Number(qty) || 1);
        const cappedQty = available !== null ? Math.min(safeQty, available) : safeQty;
        const lineKey = `${normalizedId}__${size == null ? "" : String(size).trim()}`;
        const next = normalizeCartItems(cart).map((i) => (i.lineKey === lineKey ? { ...i, qty: cappedQty } : i));
        setCart(next);
        await saveCart(next);
        return { ok: true, cart: next, qty: cappedQty, localOnly: true };
      }

      const email = String(user.email).trim().toLowerCase();
      const result = await updateCartItemQty(email, normalizedId, qty, cart, gowns, size);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart, email);
      }
      return result;
    } catch (err) {
      console.error("Error updating cart quantity:", err);
      return { ok: false, reason: err.message };
    }
  };

  const changeCartLineSize = async (id, fromSize, toSize) => {
    try {
      const normalizedId = normalizeId(id);
      if (!normalizedId) return { ok: false, reason: "Invalid item." };

      const gown = gowns.find((g) => normalizeId(g?.id) === normalizedId);
      if (!gown) return { ok: false, reason: "Item not found in catalog" };

      const fromKey =
        resolveInventoryKey(gown.sizeInventory, fromSize) ??
        (fromSize == null || fromSize === "" ? null : String(fromSize).trim());
      const toKey =
        resolveInventoryKey(gown.sizeInventory, toSize) ??
        (toSize == null || toSize === "" ? null : String(toSize).trim());

      if (fromKey === toKey) {
        return { ok: true, cart, newLineKey: cartLineKey(normalizedId, toKey) };
      }

      const available = sizeStockAvailable(gown, toKey);
      if (available !== null && available <= 0) {
        return { ok: false, reason: "That size is out of stock" };
      }

      if (!user?.email) {
        const cartNorm = normalizeCartItems(cart);
        const fromLine = findCartLine(cartNorm, normalizedId, fromKey);
        if (!fromLine) return { ok: false, reason: "Item not in cart" };

        const cappedQty = available !== null ? Math.min(fromLine.qty, available) : fromLine.qty;
        let nextCart = cartNorm.filter((i) => i.lineKey !== fromLine.lineKey);
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
        setCart(nextCart);
        await saveCart(nextCart);
        return {
          ok: true,
          cart: nextCart,
          newLineKey: cartLineKey(normalizedId, toKey),
          previousLineKey: fromLine.lineKey,
          localOnly: true,
        };
      }

      const email = String(user.email).trim().toLowerCase();
      const result = await changeCartItemSize(email, normalizedId, fromKey, toKey, cart, gowns);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart, email);
      }
      return result;
    } catch (err) {
      console.error("Error changing cart size:", err);
      return { ok: false, reason: err.message };
    }
  };

  const removeFromCart = async (id, size = null) => {
    try {
      const normalizedId = normalizeId(id);
      if (!normalizedId) return { ok: false, reason: "Invalid item." };

      if (!user?.email) {
        const key = `${normalizedId}__${size == null ? "" : String(size).trim()}`;
        const next = normalizeCartItems(cart).filter((i) => i.lineKey !== key);
        setCart(next);
        await saveCart(next);
        return { ok: true, cart: next, localOnly: true };
      }

      const email = String(user.email).trim().toLowerCase();
      const result = await removeItemFromCart(email, normalizedId, cart, size);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart, email);
      }
      return result;
    } catch (err) {
      console.error("Error removing from cart:", err);
      return { ok: false, reason: err.message };
    }
  };

  const clearCart = async () => {
    if (user?.email) {
      try {
        await clearCartOnServer(String(user.email).trim().toLowerCase());
      } catch (err) {
        console.warn("Failed to clear cart on server:", err);
      }
    }
    setCart([]);
    await saveCart([], user?.email ? String(user.email).trim().toLowerCase() : undefined);
  };

  const removePurchasedLines = async (lineKeys = []) => {
    const keys = Array.isArray(lineKeys) ? lineKeys.map((k) => String(k || "").trim()).filter(Boolean) : [];
    if (keys.length === 0) return { ok: true, cart };

    const keySet = new Set(keys);
    const nextCart = normalizeCartItems(cart).filter((item) => !keySet.has(item.lineKey));

    if (user?.email) {
      const email = String(user.email).trim().toLowerCase();
      const saveResult = await saveCartToServer(email, nextCart);
      if (!saveResult?.ok) {
        return { ok: false, reason: saveResult?.reason || "Failed to update cart on server" };
      }
      setCart(nextCart);
      await saveCart(nextCart, email);
      return { ok: true, cart: nextCart };
    }

    setCart(nextCart);
    await saveCart(nextCart);
    return { ok: true, cart: nextCart };
  };

  const login = async (nextUser) => {
    setUser(nextUser);
    await saveUser(nextUser);
    
    // After login: merge guest cart, reconcile with backend, then save/sync.
    if (nextUser?.email) {
      const email = String(nextUser.email).trim().toLowerCase();
      try {
        const [guestCart, localUserCart, serverSnap, localUpdatedAt] = await Promise.all([
          loadCart(), // guest
          loadCart(email),
          fetchCartSnapshotFromServer(email),
          loadCartUpdatedAt(email),
        ]);

        const mergedLocal = (() => {
          const map = new Map();
          for (const it of [...normalizeCartItems(guestCart), ...normalizeCartItems(localUserCart)]) {
            const key = String(it?.lineKey || "");
            if (!key) continue;
            const prev = map.get(key);
            map.set(key, prev ? { ...prev, qty: (Number(prev.qty) || 0) + (Number(it.qty) || 0) } : { ...it });
          }
          return [...map.values()].map((x) => ({ ...x, qty: Math.max(1, Number(x.qty) || 1) }));
        })();

        const backendUpdatedAt = serverSnap?.lastUpdated ? new Date(serverSnap.lastUpdated) : null;
        const localUpdated = localUpdatedAt ? new Date(localUpdatedAt) : null;

        let cartToUse = mergedLocal;
        if (localUpdated && backendUpdatedAt && localUpdated >= backendUpdatedAt) {
          await saveCartToServer(email, mergedLocal);
          cartToUse = mergedLocal;
        } else if (Array.isArray(serverSnap?.items) && serverSnap.items.length > 0) {
          cartToUse = serverSnap.items;
        } else {
          if (mergedLocal.length > 0) await saveCartToServer(email, mergedLocal);
          cartToUse = mergedLocal;
        }

        setCart(cartToUse);
        await saveCart(cartToUse, email);
      } catch (err) {
        console.warn("Failed to fetch cart from server on login:", err);
      }
    }
  };

  const logout = async () => {
    if (user?.email) {
      try {
        // Save session basket before logout
        const { saveSessionBasket } = await import("../services/recommendations");
        await saveSessionBasket();
        // Sync pending interactions
        await syncInteractionsToServer();
        await clearCartOnServer(String(user.email).trim().toLowerCase());
      } catch (err) {
        console.warn("Failed during logout cleanup:", err);
      }
    }
    setUser(null);
    setCart([]);
    await clearUser();
    await saveCart([]);
  };

  const syncNow = async () => {
    if (!user?.email) return { ok: false, reason: "Please sign in first." };
    const result = await syncUserData({
      user,
      cart,
      favoritesIds,
      syncedAt: new Date().toISOString(),
    });
    if (result?.ok && result?.lastSyncedAt) {
      setLastSyncedAt(result.lastSyncedAt);
    }
    return result;
  };

  const cartDetailed = useMemo(() => {
    return normalizeCartItems(cart)
      .map((c) => {
        const gown = gowns.find((g) => idsEqual(g.id, c.id));
        if (!gown) return null;
        const priceNum = Number(String(gown.price || "").replace(/[^\d]/g, "")) || 0;
        const available = sizeStockAvailable(gown, c.size);
        return {
          ...gown,
          qty: c.qty,
          size: c.size,
          lineKey: c.lineKey,
          subtotal: priceNum * c.qty,
          priceNum,
          stockAvailable: available,
        };
      })
      .filter(Boolean);
  }, [cart, gowns]);

  const subtotal = useMemo(
    () => cartDetailed.reduce((sum, item) => sum + item.subtotal, 0),
    [cartDetailed]
  );

  const favoritesSet = useMemo(() => new Set(favoritesIds.map((id) => normalizeId(id))), [favoritesIds]);

  const favoritesDetailed = useMemo(() => {
    return favoritesIds
      .map((id) => gowns.find((g) => idsEqual(g.id, id)))
      .filter(Boolean);
  }, [favoritesIds, gowns]);

  const toggleFavorite = async (id) => {
    const normalizedId = normalizeId(id);
    const next = favoritesIds.map(normalizeId).includes(normalizedId)
      ? favoritesIds.map(normalizeId).filter((x) => x !== normalizedId)
      : [...favoritesIds.map(normalizeId), normalizedId];
    setFavoritesIds(next);
    await saveFavorites(next);
    // Sync to backend and track interaction
    if (user?.email) {
      await syncUserData({
        user,
        cart,
        favoritesIds: next,
        syncedAt: new Date().toISOString(),
      }).catch(() => {});
      // Track as favorite interaction
      await trackInteraction(user.email, id, "favorite");
    }
  };

  const value = {
    loading,
    gowns,
    reloadGowns,
    cart,
    cartDetailed,
    subtotal,
    syncCartFromServer,
    favoritesIds,
    favoritesDetailed,
    favoritesSet,
    toggleFavorite,
    user,
    addToCart,
    setQty,
    changeCartLineSize,
    removeFromCart,
    clearCart,
    removePurchasedLines,
    login,
    logout,
    lastSyncedAt,
    syncNow,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  return ctx;
}
