/**
 * Interaction Tracking Service - Mobile Version
 * ──────────────────────────────────────────────
 * Tracks user actions (view, favorite, cart_add, inquiry) and syncs them
 * to the backend so recommendations are consistent across mobile and web.
 *
 * Also maintains a session basket to track which gowns are viewed together.
 */

import { recordInteraction as recordLocalInteraction } from "../utils/recommender/knnCollaborative";
import { recordBasket } from "../utils/recommender/apriori";
import { API_BASE_URL } from "../config/apiEnv";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_BASKET_KEY = "jce_session_basket";
const SYNC_QUEUE_KEY = "jce_sync_queue";

/**
 * Track a user action locally and queue for server sync.
 */
export async function trackInteraction(userEmail, gownId, eventType) {
  if (!userEmail || !gownId || !eventType) return;

  try {
    // Record locally for instant recommendations
    await recordLocalInteraction(userEmail, gownId, eventType);

    // Queue for server sync
    const queue = await getSyncQueue();
    queue.push({
      userEmail,
      gownId: String(gownId),
      eventType,
      timestamp: new Date().toISOString(),
    });
    await saveSyncQueue(queue);

    // Try to sync immediately (fire and forget)
    syncInteractionsToServer().catch(() => {});

    // Add to session basket
    await addToSessionBasket(gownId);
  } catch (err) {
    console.warn("Failed to track interaction:", err);
  }
}

/**
 * Get the session basket (gowns viewed in current session).
 */
async function getSessionBasket() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_BASKET_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Add gown to session basket.
 */
async function addToSessionBasket(gownId) {
  try {
    const basket = await getSessionBasket();
    const id = String(gownId);
    if (!basket.includes(id)) {
      basket.push(id);
      await AsyncStorage.setItem(SESSION_BASKET_KEY, JSON.stringify(basket));
    }
  } catch (err) {
    console.warn("Failed to add to session basket:", err);
  }
}

/**
 * Save session basket to history when session ends.
 */
export async function saveSessionBasket() {
  try {
    const basket = await getSessionBasket();
    if (basket.length >= 2) {
      await recordBasket(basket);
    }
    await AsyncStorage.removeItem(SESSION_BASKET_KEY);
  } catch (err) {
    console.warn("Failed to save session basket:", err);
  }
}

/**
 * Get pending interactions to sync.
 */
async function getSyncQueue() {
  try {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save sync queue.
 */
async function saveSyncQueue(queue) {
  try {
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn("Failed to save sync queue:", err);
  }
}

/**
 * Sync interactions to backend server.
 */
export async function syncInteractionsToServer() {
  try {
    const queue = await getSyncQueue();
    if (queue.length === 0) return { ok: true, synced: 0 };

    const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: queue,
      }),
    });

    if (!res.ok) {
      console.warn("Failed to sync interactions:", res.status);
      return { ok: false, synced: 0 };
    }

    // Clear queue on success
    await saveSyncQueue([]);
    return { ok: true, synced: queue.length };
  } catch (err) {
    console.warn("Error syncing interactions:", err);
    return { ok: false, synced: 0 };
  }
}

/**
 * Get recommendations for a gown (uses hybrid algorithm).
 */
export async function getRecommendationsForGown(userEmail, gownId, allGowns) {
  try {
    const { getHybridRecommendations } = await import("../utils/recommender/hybridRecommender");

    const seedGown = allGowns.find((g) => String(g?.id) === String(gownId));
    if (!seedGown) return [];

    return await getHybridRecommendations(seedGown, userEmail, allGowns, 4);
  } catch (err) {
    console.warn("Failed to get recommendations:", err);
    return [];
  }
}
