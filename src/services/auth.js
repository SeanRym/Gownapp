import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, getAdminSecret, adminAuthHeaders } from "../config/apiEnv";

const OTP_KEY = "jce_mobile_otp_store";

function makeUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson(path, options = {}) {
  if (!API_BASE_URL) {
    return { ok: false, error: "API base URL is missing." };
  }
  try {
    const res = await fetch(makeUrl(path), {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.includeAdminSecret !== false && getAdminSecret() ? adminAuthHeaders() : {}),
        ...(options.headers || {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `Request failed (${res.status})`, data };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error?.message || "Network request failed." };
  }
}

async function loadOtpStore() {
  try {
    const raw = await AsyncStorage.getItem(OTP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveOtpStore(store) {
  await AsyncStorage.setItem(OTP_KEY, JSON.stringify(store));
}

export async function sendLoginOtp(email, purpose = "login") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Email is required.");

  const remote = await requestJson("/api/auth/send-otp", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, purpose },
  });

  if (remote.ok) {
    return {
      ok: true,
      devMode: Boolean(remote.data?.devMode),
      otp: remote.data?.devMode ? String(remote.data?.otp || "") : "",
    };
  }

  // Fallback for local/dev usage if remote OTP endpoint is unavailable.
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const store = await loadOtpStore();
  store[cleanEmail] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  await saveOtpStore(store);
  return { ok: true, devMode: true, otp };
}

// Remote-only OTP sender: calls the backend and returns the raw remote result
// without falling back to local dev mode. Useful for flows (like signup)
// where a real email must be delivered.
export async function sendOtpRemote(email, purpose = "login") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Email is required.");

  const remote = await requestJson("/api/auth/send-otp", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, purpose },
  });

  // Return the backend response as-is.
  if (remote.ok) return { ok: true, data: remote.data };
  return { ok: false, error: remote.error, data: remote.data };
}

export async function verifyOtpRemote(email, otp, purpose = "login") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const code = String(otp || "").trim();

  const remote = await requestJson("/api/auth/verify-otp", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, otp: code, purpose },
  });

  if (remote.ok) {
    return { ok: true };
  }
  return { ok: false, error: remote.error || `OTP verification failed (${remote.data?.status || "error"})` };
}

export async function verifyLoginOtp(email, otp, purpose = "login") {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const code = String(otp || "").trim();

  const remote = await requestJson("/api/auth/verify-otp", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, otp: code, purpose },
  });

  if (remote.ok) {
    return { ok: true };
  }

  const store = await loadOtpStore();
  const entry = store[cleanEmail];
  if (!entry) throw new Error(remote.error || "No OTP found for this email.");
  if (Date.now() > Number(entry.expiresAt || 0)) {
    delete store[cleanEmail];
    await saveOtpStore(store);
    throw new Error("OTP expired.");
  }
  if (String(entry.otp) !== code) throw new Error("Invalid OTP");
  delete store[cleanEmail];
  await saveOtpStore(store);
  return { ok: true };
}
