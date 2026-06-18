import { API_BASE_URL } from "../config/apiEnv";
import { normalizeId } from "../utils/id";

function makeUrl(path) {
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

async function requestJson(path, options = {}) {
  const res = await fetch(makeUrl(path), {
    ...options,
    headers: {
      "Cache-Control": "no-cache",
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status}).`);
  }
  return body;
}

/** GET /api/favorites — same as gownweb `useFavorites.fetchFavorites` */
export async function fetchFavoriteIds(userId) {
  if (!userId) return [];
  const data = await requestJson("/api/favorites", {
    headers: { "x-user-id": String(userId) },
  });
  const ids = Array.isArray(data?.favoriteIds) ? data.favoriteIds : [];
  return ids.map((x) => normalizeId(x)).filter(Boolean);
}

export async function addFavorite(userId, gownId) {
  const id = normalizeId(gownId);
  if (!userId || !id) return { ok: false, error: "Missing user or gown." };
  await requestJson("/api/favorites", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify({ gownId: id }),
  });
  return { ok: true };
}

export async function removeFavorite(userId, gownId) {
  const id = normalizeId(gownId);
  if (!userId || !id) return { ok: false, error: "Missing user or gown." };
  await requestJson("/api/favorites", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify({ gownId: id }),
  });
  return { ok: true };
}

/** Merge local favorites into server, then return fresh server list. */
export async function syncFavoritesWithServer(userId, localIds = []) {
  if (!userId) return [];
  const serverIds = await fetchFavoriteIds(userId);
  const serverSet = new Set(serverIds.map(String));
  const local = (Array.isArray(localIds) ? localIds : [])
    .map((x) => normalizeId(x))
    .filter(Boolean);

  for (const id of local) {
    if (!serverSet.has(String(id))) {
      try {
        await addFavorite(userId, id);
      } catch {
        // continue — best effort merge
      }
    }
  }

  try {
    return await fetchFavoriteIds(userId);
  } catch {
    return [...new Set([...serverIds, ...local])];
  }
}
