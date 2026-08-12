import { API_BASE_URL } from "../config/apiEnv";

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

/** POST /api/payments/paymongo/create — same as gownweb checkout StepPayment */
export async function createPaymongoQr(orderId, userId) {
  return requestJson("/api/payments/paymongo/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify({ orderId: String(orderId) }),
  });
}

/** GET /api/payments/paymongo/create?orderId= — poll payment status */
export async function pollPaymongoPayment(orderId, userId) {
  const qs = `orderId=${encodeURIComponent(String(orderId))}`;
  return requestJson(`/api/payments/paymongo/create?${qs}`, {
    headers: { "x-user-id": String(userId) },
  });
}

/** PATCH /api/orders — switch payment method (e.g. QR Ph → GCash) */
export async function switchOrderPaymentMethod(orderId, paymentMethod, userId) {
  return requestJson("/api/orders", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify({
      orderId: String(orderId),
      paymentMethod: String(paymentMethod).toLowerCase(),
    }),
  });
}
