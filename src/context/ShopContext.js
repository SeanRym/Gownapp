import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchGowns } from "../services/gowns";
import { clearUser, loadCart, loadFavorites, loadUser, saveCart, saveFavorites, saveUser } from "../utils/storage";
import { getLastSyncAt, syncUserData } from "../services/sync";
import { idsEqual, normalizeId } from "../utils/id";
import {
  fetchCartFromServer,
  saveCartToServer,
  addItemToCart,
  removeItemFromCart,
  updateCartItemQty,
  clearCartOnServer,
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
        const [gownsData, cartData, userData, favoritesData] = await Promise.all([
          fetchGowns(),
          loadCart(),
          loadUser(),
          loadFavorites(),
        ]);
        const lastSync = await getLastSyncAt();
        if (!mounted) return;
        setGowns(gownsData);
        
        // Normalize local cart
        const normalizedCart = Array.isArray(cartData)
          ? cartData
              .map((x) => ({
                id: normalizeId(x?.id),
                qty: Math.max(1, Number(x?.qty) || 1),
              }))
              .filter((x) => x.id)
          : [];
        
        // If user is logged in, fetch cart from server (cloud sync)
        let cartToUse = normalizedCart;
        if (userData?.email) {
          try {
            const serverCart = await fetchCartFromServer(userData.email);
            if (Array.isArray(serverCart) && serverCart.length > 0) {
              cartToUse = serverCart.map((x) => ({
                id: normalizeId(x?.id),
                qty: Math.max(1, Number(x?.qty) || 1),
              })).filter((x) => x.id);
              // Update local storage with server cart
              await saveCart(cartToUse);
            }
          } catch (err) {
            console.warn("Failed to fetch cart from server, using local:", err);
            // Fallback to local cart
          }
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

  const addToCart = async (id, quantity = 1) => {
    if (!user?.email) {
      return { ok: false, reason: "Please sign in first before adding items to cart.", requiresAuth: true };
    }

    try {
      // Use cart service which syncs to server
      const result = await addItemToCart(user.email, id, quantity, cart, gowns);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart);
        // Track the interaction
        await trackInteraction(user.email, id, "cart_add");
      }
      return result;
    } catch (err) {
      console.error("Error adding to cart:", err);
      return { ok: false, reason: err.message };
    }
  };

  const setQty = async (id, qty) => {
    if (!user?.email) {
      return { ok: false, reason: "Please sign in first." };
    }

    try {
      // Use cart service which syncs to server
      const result = await updateCartItemQty(user.email, id, qty, cart, gowns);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart);
      }
      return result;
    } catch (err) {
      console.error("Error updating cart quantity:", err);
      return { ok: false, reason: err.message };
    }
  };

  const removeFromCart = async (id) => {
    if (!user?.email) {
      return { ok: false, reason: "Please sign in first." };
    }

    try {
      // Use cart service which syncs to server
      const result = await removeItemFromCart(user.email, id, cart);
      if (result.ok) {
        setCart(result.cart);
        await saveCart(result.cart);
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
        await clearCartOnServer(user.email);
      } catch (err) {
        console.warn("Failed to clear cart on server:", err);
      }
    }
    setCart([]);
    await saveCart([]);
  };

  const login = async (nextUser) => {
    setUser(nextUser);
    await saveUser(nextUser);
    
    // Fetch user's cart from server after login
    if (nextUser?.email) {
      try {
        const serverCart = await fetchCartFromServer(nextUser.email);
        if (Array.isArray(serverCart) && serverCart.length > 0) {
          const normalizedCart = serverCart.map((x) => ({
            id: normalizeId(x?.id),
            qty: Math.max(1, Number(x?.qty) || 1),
          })).filter((x) => x.id);
          setCart(normalizedCart);
          await saveCart(normalizedCart);
        }
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
        await clearCartOnServer(user.email);
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
    return cart
      .map((c) => {
        const gown = gowns.find((g) => idsEqual(g.id, c.id));
        if (!gown) return null;
        const priceNum = Number(String(gown.price || "").replace(/[^\d]/g, "")) || 0;
        return { ...gown, qty: c.qty, subtotal: priceNum * c.qty, priceNum };
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
    cartDetailed,
    subtotal,
    favoritesIds,
    favoritesDetailed,
    favoritesSet,
    toggleFavorite,
    user,
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
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
