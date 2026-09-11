import { API_BASE_URL } from "../config/apiEnv";
import { recommendSize } from "../constants/sizeConstants";
import { scoreGown, normaliseScore } from "../constants/styleOptions";
import { loadArFitProfiles, saveArFitProfiles } from "../utils/storage";

function makeUrl(path) {
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

async function requestJson(path, options = {}) {
  const res = await fetch(makeUrl(path), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchMeasurements(userId) {
  if (!userId) return null;
  const profiles = await loadArFitProfiles();
  const localMeasurements = profiles?.[String(userId)] || null;
  const hasValues = (record) =>
    record && ["bust_cm", "waist_cm", "hips_cm", "height_cm", "weight_kg", "bust", "waist", "hips", "height", "weight"]
      .some((key) => Number(record[key]) > 0);
  try {
    const data = await requestJson("/api/measurements", {
      headers: { "x-user-id": String(userId) },
    });
    const remoteMeasurements = data?.measurements;
    if (!hasValues(remoteMeasurements)) return localMeasurements;
    const remoteTime = Date.parse(remoteMeasurements.updatedAt || remoteMeasurements.updated_at || "");
    const localTime = Date.parse(localMeasurements?.updatedAt || localMeasurements?.updated_at || "");
    return localTime > remoteTime && hasValues(localMeasurements) ? localMeasurements : remoteMeasurements;
  } catch {
    return localMeasurements;
  }
}

export async function saveMeasurements(userId, payload) {
  if (!userId) throw new Error("Sign in required.");
  const measurements = {
    ...(payload || {}),
    source: payload?.source || "manual",
    updatedAt: new Date().toISOString(),
  };
  const profiles = await loadArFitProfiles();
  await saveArFitProfiles({ ...(profiles || {}), [String(userId)]: measurements });
  try {
    const data = await requestJson("/api/measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": String(userId) },
      body: JSON.stringify(measurements),
    });
    return data?.measurements || measurements;
  } catch {
    return measurements;
  }
}

export async function clearMeasurements(userId) {
  if (!userId) return;
  try {
    await requestJson("/api/measurements", {
      method: "DELETE",
      headers: { "x-user-id": String(userId) },
    });
  } catch {
    // The deployed web API may not expose this route yet; clear the mobile copy below.
  } finally {
    const profiles = await loadArFitProfiles();
    const next = { ...(profiles || {}) };
    delete next[String(userId)];
    await saveArFitProfiles(next);
  }
}

export async function fetchSizeChart(segment = "women") {
  try {
    const data = await requestJson(`/api/size-chart?segment=${encodeURIComponent(segment)}`);
    return {
      sizes: Array.isArray(data?.sizes) ? data.sizes : [],
      supplierName: data?.supplierName || "Philippine Standard",
      isFallback: Boolean(data?.isFallback),
    };
  } catch {
    const rec = recommendSize(segment);
    return {
      sizes: [],
      supplierName: "Philippine Standard",
      isFallback: true,
      fallbackResult: rec,
    };
  }
}

export async function fetchStylePrefs(userId) {
  if (!userId) return null;
  try {
    const data = await requestJson("/api/auth/style-prefs", {
      headers: { "x-user-id": String(userId) },
    });
    return data?.prefs || null;
  } catch {
    return null;
  }
}

export async function saveStylePreferences(userId, profile) {
  if (!userId) throw new Error("Sign in required.");
  try {
    await requestJson("/api/auth/save-style-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": String(userId) },
      body: JSON.stringify({
        bodyType: profile?.bodyShape || null,
        skinTone: profile?.skinTone || null,
        styleTags: profile?.occasion ? [profile.occasion] : [],
        preferredSilhouettes: [],
        preferredColors: Array.isArray(profile?.colors) ? profile.colors : [],
      }),
    });
  } catch {
    // Measurements remain usable locally if this optional web route is unavailable.
  }
}

export async function saveTryonSnapshot(userId, { image, gownId, gownName }) {
  if (!userId) throw new Error("Sign in required.");
  await requestJson("/api/auth/save-tryon", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": String(userId) },
    body: JSON.stringify({ image, gownId, gownName }),
  });
}

export function parseGownPrice(gown) {
  const raw = gown?.salePrice ?? gown?.price ?? gown?.promoPrice;
  if (typeof raw === "number") return raw;
  const n = Number(String(raw || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Same scoring pipeline as web fitting-room StylePanel */
export function computeStyleResults(gowns, profile) {
  if (!profile?.bodyShape || !Array.isArray(gowns)) return [];
  return gowns
    .map((g) => {
      const { score, reasons } = scoreGown(
        {
          ...g,
          salePrice: parseGownPrice(g),
          silhouette: g.silhouette,
          color: g.color,
          fabric: g.fabric,
        },
        profile
      );
      return { ...g, _score: score, _reasons: reasons, _pct: normaliseScore(score) };
    })
    .filter((g) => g._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8);
}

export function computeSizeResult(profile, sizes) {
  if (!sizes?.length) return null;
  if (!profile?.bust && !profile?.waist && !profile?.hips) return null;
  const { bust, waist, hips } = profile;
  let best = null;
  let bestScore = Infinity;
  for (const sz of sizes) {
    let score = 0;
    let hits = 0;
    if (bust && sz.bust_min != null) {
      score += Math.abs(bust - (sz.bust_min + sz.bust_max) / 2);
      hits++;
    }
    if (waist && sz.waist_min != null) {
      score += Math.abs(waist - (sz.waist_min + sz.waist_max) / 2);
      hits++;
    }
    if (hips && sz.hip_min != null) {
      score += Math.abs(hips - (sz.hip_min + sz.hip_max) / 2);
      hits++;
    }
    if (hits === 0) continue;
    score /= hits;
    if (score < bestScore) {
      bestScore = score;
      best = sz;
    }
  }
  if (!best) return null;
  const idx = sizes.findIndex((s) => s.label === best.label);
  const adjacent = sizes.slice(Math.max(0, idx - 1), Math.min(sizes.length, idx + 2));
  return { size: best, score: bestScore, adjacent };
}
