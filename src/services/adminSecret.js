import { API_BASE_URL } from "../config/apiEnv";

async function postChangeSecret(body) {
  const url = `${String(API_BASE_URL).replace(/\/+$/, "")}/api/admin/change-secret`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!data?.ok) {
    throw new Error(data?.error || `Request failed (${r.status})`);
  }
  return data;
}

/** Step 1 — verify admin password and email OTP (same as web /admin/change-secret). */
export async function sendAdminChangeSecretOtp({ adminEmail, password }) {
  return postChangeSecret({
    step: "send_otp",
    adminEmail: String(adminEmail || "").trim().toLowerCase(),
    password,
  });
}

/** Step 2 — verify OTP and persist new server admin secret (syncs with web). */
export async function changeAdminSecretOnServer({ adminEmail, password, otp, newSecret }) {
  return postChangeSecret({
    step: "change",
    adminEmail: String(adminEmail || "").trim().toLowerCase(),
    password,
    otp: String(otp || "").trim(),
    newSecret: String(newSecret || "").trim(),
  });
}
