import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, adminAuthHeaders, getAdminSecret } from "../config/apiEnv";

const STORAGE_KEY = "jce_mobile_admin_secret";
const PING_CACHE_MS = 5 * 60 * 1000;

let secretLoaded = false;
let pingCache = { ok: null, at: 0, secretKey: "" };
let secretJustChanged = false;
/** Resets when the app process restarts — gate required again after closing the app. */
let adminSessionUnlocked = false;

function secretFingerprint() {
  return getAdminSecret() || "";
}

/** True when the user has saved a secret on this device. */
export function hasDeviceAdminSecret() {
  const o = globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
  return o != null && String(o).trim() !== "";
}

/** True after the user passed the admin secret gate this app session. */
export function isAdminSessionUnlocked() {
  return adminSessionUnlocked;
}

export function unlockAdminSession() {
  adminSessionUnlocked = true;
}

/** Lock admin UI and clear in-memory secret (called on app start and Clear secret). */
export function lockAdminSession() {
  adminSessionUnlocked = false;
  delete globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
}

export function invalidateAdminSecretCache() {
  pingCache = { ok: null, at: 0, secretKey: "" };
}

/** Call after a successful server secret change so the dashboard unlocks without re-prompting. */
export function markAdminSecretChanged() {
  secretJustChanged = true;
  adminSessionUnlocked = true;
  invalidateAdminSecretCache();
}

export function consumeAdminSecretChanged() {
  const changed = secretJustChanged;
  secretJustChanged = false;
  return changed;
}

/** Reset admin gate for a fresh app launch (do not auto-unlock from storage). */
export function prepareAdminForAppLaunch() {
  lockAdminSession();
  secretLoaded = true;
}

/** Call on app start before any admin API requests. */
export async function loadStoredAdminSecret() {
  if (!adminSessionUnlocked) {
    delete globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
    secretLoaded = true;
    return;
  }
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    const t = String(v || "").trim();
    if (t) globalThis.__JCE_ADMIN_SECRET_OVERRIDE__ = t;
    else delete globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
  } catch {
    delete globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
  } finally {
    secretLoaded = true;
  }
}

/** Persist the same secret you use on the web admin panel (browser localStorage). */
export async function saveAdminSecret(secret) {
  const t = String(secret || "").trim();
  invalidateAdminSecretCache();
  if (t) {
    await AsyncStorage.setItem(STORAGE_KEY, t);
    globalThis.__JCE_ADMIN_SECRET_OVERRIDE__ = t;
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
    delete globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
  }
}

export async function pingAdminApi({ force = false } = {}) {
  const key = secretFingerprint();
  if (!key) return { ok: false, error: "No admin secret configured." };

  const now = Date.now();
  if (
    !force &&
    pingCache.secretKey === key &&
    pingCache.ok === true &&
    now - pingCache.at < PING_CACHE_MS
  ) {
    return { ok: true, cached: true };
  }

  const url = `${String(API_BASE_URL).replace(/\/+$/, "")}/api/admin/ping`;
  try {
    const r = await fetch(url, { headers: adminAuthHeaders() });
    const body = await r.json().catch(() => ({}));
    const ok = r.ok && body?.ok === true;
    if (r.status === 401) {
      await saveAdminSecret("");
    }
    pingCache = { ok, at: now, secretKey: key };
    return { ok, status: r.status, cached: false };
  } catch (e) {
    pingCache = { ok: false, at: now, secretKey: key };
    return { ok: false, error: e?.message || "Network error", cached: false };
  }
}

/** Load device secret once (if needed) then validate with ping. */
export async function ensureAdminSecretValid({ force = false } = {}) {
  if (!secretLoaded) await loadStoredAdminSecret();
  if (!hasDeviceAdminSecret()) return false;
  const ping = await pingAdminApi({ force });
  return ping.ok;
}
