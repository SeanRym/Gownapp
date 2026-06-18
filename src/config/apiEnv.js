import Constants from "expo-constants";

/** Deployed backend default when .env / EAS env is missing (same host as live website) */
const DEFAULT_API_BASE_URL = "https://plankton-app-bjwn2.ondigitalocean.app";

/** Fallback when .env / device storage has no secret (should match server ADMIN_SECRET). */
const DEFAULT_ADMIN_SECRET = "qweqwe123";

function readExtra() {
  const c = Constants;
  return (
    c.expoConfig?.extra ||
    c.manifest?.extra ||
    c.manifest2?.extra ||
    {}
  );
}

function stripTrailingSlashes(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

const extra = readExtra();

export const API_BASE_URL = stripTrailingSlashes(
  extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL
);

// Safety: if someone sets API_BASE_URL to localhost in a device build, warn loudly.
if (String(API_BASE_URL).includes("localhost") || String(API_BASE_URL).includes("127.0.0.1")) {
  console.warn(
    "[apiEnv] API_BASE_URL points to localhost. Mobile will NOT sync with the deployed web backend. Set EXPO_PUBLIC_API_BASE_URL to the deployed server."
  );
}

const envAdminSecret = String(
  extra.adminSecret || process.env.EXPO_PUBLIC_ADMIN_SECRET || DEFAULT_ADMIN_SECRET
).trim();

/**
 * Same value as the web admin uses (localStorage). Override on device via Admin dashboard
 * so APK builds work without rebuilding when the server secret differs from .env.
 */
export function getAdminSecret() {
  const o = globalThis.__JCE_ADMIN_SECRET_OVERRIDE__;
  if (o != null && String(o).trim() !== "") return String(o).trim();
  return envAdminSecret;
}

/** Match web admin fetch headers (`X-Admin-Secret` + lowercase alias). */
export function adminAuthHeaders(more = {}) {
  const s = getAdminSecret();
  return { "x-admin-secret": s, "X-Admin-Secret": s, ...more };
}
