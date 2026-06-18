import { pushNotification } from "./notifications";
import { normalizeId, orderMatchesKey } from "../utils/id";
import { API_BASE_URL, adminAuthHeaders } from "../config/apiEnv";

const STATUS_FLOW = ["placed", "paid", "processing", "shipped", "completed", "cancelled", "refunded"];
const TRACKING_STATUS_FLOW = [
  "order_placed",
  "preparing_to_ship",
  "picked_up",
  "in_transit",
  "arrived_hub",
  "out_for_delivery",
  "delivered",
];

function makeUrl(path) {
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

function apiHostHint() {
  try {
    return new URL(String(API_BASE_URL).replace(/\/+$/, "") || "http://localhost").host;
  } catch {
    return API_BASE_URL || "API server";
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toMoney(value) {
  return `P${Number(value || 0).toLocaleString("en-PH")}`;
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestJson(path, options = {}) {
  const url = makeUrl(path);
  // Add cache-control headers to ensure fresh data from server
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...(options.headers || {}),
  };
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, { ...options, headers });
      break;
    } catch (e) {
      const lastTry = attempt === 2;
      if (lastTry) {
        throw new Error(
          `Cannot reach ${apiHostHint()}: ${e?.message || "network error"}. Check internet/VPN and EXPO_PUBLIC_API_BASE_URL.`
        );
      }
      await sleep(450 * (attempt + 1));
    }
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  return body;
}

async function resolveBackendUser({ email, firstName, lastName, fullName }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Missing customer email.");
  const resolvedName =
    String(fullName || "").trim() ||
    `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
  const data = await requestJson("/api/mobile/ensure-user", {
    method: "POST",
    headers: adminAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: cleanEmail, name: resolvedName }),
  });
  const userId = String(data?.userId || "").trim();
  if (!userId) throw new Error("Unable to resolve backend user.");
  return userId;
}

/** Prefer ID from /api/auth/login; only call ensure-user (admin secret) when missing. */
async function getBackendUserId({ email, firstName, lastName, sessionUserId }) {
  const direct = String(sessionUserId || "").trim();
  if (direct) return direct;
  return resolveBackendUser({ email, firstName, lastName });
}

function mapOrderForMobile(order) {
  const contactName = String(order?.customerName || order?.contact?.name || "").trim();
  const parts = contactName.split(/\s+/).filter(Boolean);
  const firstName = String(order?.contact?.firstName || parts[0] || "").trim();
  const lastName = String(order?.contact?.lastName || parts.slice(1).join(" ") || "").trim();
  // Match web admin: only `proofStatus === 'pending'` counts as "proofs to review".
  // Do not default null/empty to pending — that inflated counts vs /admin/orders.
  const rawProofStatus = order?.proofStatus ?? order?.paymentProofStatus;
  const paymentProofStatus =
    rawProofStatus == null || rawProofStatus === ""
      ? ""
      : String(rawProofStatus).trim().toLowerCase();
  const paymentProofImage =
    String(order?.proofImageUrl || order?.paymentProof?.imageUri || "").trim() || "";

  const rawItems = Array.isArray(order?.items) ? order.items : [];
  const items = rawItems.map((it, index) => {
    const qty = Number(it?.qty ?? it?.quantity ?? 1) || 1;
    const subtotal = Number(it?.subtotal ?? it?.lineTotal) || 0;
    const priceValue =
      it?.price !== undefined ? parseAmount(it?.price) : qty > 0 ? subtotal / qty : Number(it?.unitPrice || 0);
    return {
      id: normalizeId(it?.id || it?.gownId || index),
      name: String(it?.name || it?.gownName || "Gown").trim(),
      image: String(it?.image || "").trim(),
      size: String(it?.size || it?.sizeLabel || "").trim(),
      qty,
      price: toMoney(priceValue),
      subtotal,
    };
  });

  const orderNumber = String(order?.orderNumber || order?.order_number || "").trim() || null;
  const id =
    normalizeId(order?.id || order?.orderId || order?.order_id) ||
    orderNumber ||
    "";

  return {
    id,
    orderNumber,
    status: String(order?.status || "placed").toLowerCase(),
    payment: String(order?.payment || order?.paymentMethod || "").toLowerCase(),
    paymentStatus: String(order?.paymentStatus || "").toLowerCase(),
    paymentProofStatus,
    paymentProof: {
      imageUri: paymentProofImage,
      referenceNumber: String(order?.proofReferenceNo || order?.paymentProof?.referenceNumber || "").trim(),
      submittedAt: order?.proofUploadedAt || order?.paymentProof?.submittedAt || null,
    },
    contact: {
      firstName,
      lastName,
      email: String(order?.customerEmail || order?.contact?.email || "").trim().toLowerCase(),
      phone: String(order?.customerPhone || order?.contact?.phone || "").trim(),
    },
    delivery: {
      method: String(order?.deliveryMethod || order?.delivery?.method || "pickup")
        .toLowerCase()
        .replace("lalamove", "delivery"),
      address: String(order?.deliveryAddress || order?.delivery?.address || "").trim(),
    },
    items,
    subtotal: Number(order?.subtotal || 0),
    total: Number(order?.total || order?.subtotal || 0),
    createdAt: order?.placedAt || order?.createdAt || order?.updatedAt || new Date().toISOString(),
    statusTimeline: Array.isArray(order?.statusHistory)
      ? order.statusHistory.map((x) => ({
          status: String(x?.status || "").toLowerCase(),
          at: x?.changedAt || x?.at || new Date().toISOString(),
          note: String(x?.note || "").trim(),
        }))
      : [],
  };
}

async function fetchMyOrdersByUserId(userId) {
  const data = await requestJson("/api/my-orders", {
    headers: { "x-user-id": String(userId) },
  });
  return (Array.isArray(data?.orders) ? data.orders : []).map(mapOrderForMobile);
}

export async function submitOrder(order) {
  const customerEmail = String(order?.contact?.email || "").trim().toLowerCase();
  const firstName = String(order?.contact?.firstName || "").trim();
  const lastName = String(order?.contact?.lastName || "").trim();
  const userId = await getBackendUserId({
    email: customerEmail,
    firstName,
    lastName,
    sessionUserId: order?.userId,
  });

  const deliveryMethodRaw = String(order?.delivery?.method || "pickup").toLowerCase();
  const deliveryMethod = deliveryMethodRaw === "delivery" ? "lalamove" : "pickup";
  const items = (Array.isArray(order?.items) ? order.items : []).map((it) => {
    const quantity = Math.max(1, Number(it?.qty) || 1);
    const unitPrice = parseAmount(it?.price) || (Number(it?.subtotal) || 0) / quantity;
    return {
      gownId: normalizeId(it?.id) || null,
      gownName: String(it?.name || "Gown").trim(),
      sizeLabel: String(it?.size || "").trim() || null,
      quantity,
      unitPrice,
    };
  });

  const customerName = `${firstName} ${lastName}`.trim() || customerEmail.split("@")[0];
  const payload = {
    customerEmail,
    customerName,
    paymentMethod: String(order?.payment || "gcash").toLowerCase(),
    deliveryMethod,
    deliveryAddress: String(order?.delivery?.address || "").trim(),
    lalamoveVehicle:
      deliveryMethod === "lalamove"
        ? String(order?.delivery?.lalamoveVehicle || order?.lalamoveVehicle || "sedan").trim().toLowerCase()
        : null,
    items,
    subtotal: Number(order?.subtotal || 0),
    shippingFee: Number(order?.shipping?.shippingFee || order?.shippingFee || 0),
    total: Number(order?.total || order?.subtotal || 0),
    notes: String(order?.notes || "").trim(),
  };

  const created = await requestJson("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify(payload),
  });

  const freshOrders = await fetchMyOrdersByUserId(userId);
  const newId =
    normalizeId(created?.orderId || created?.id || created?.order?.id) ||
    normalizeId(created?.orderNumber || created?.order_number);
  const placedOrder = freshOrders.find((x) => orderMatchesKey(x, newId)) || {
    id: newId,
    orderNumber: created?.orderNumber || created?.order_number || null,
    ...mapOrderForMobile({
      id: newId,
      orderNumber: created?.orderNumber,
      contact: order?.contact,
      delivery: order?.delivery,
      payment: order?.payment,
      items: order?.items,
      subtotal: order?.subtotal,
      total: order?.total,
      status: "placed",
      createdAt: new Date().toISOString(),
    }),
  };

  await pushNotification({
    email: customerEmail,
    title: "Order placed",
    body: `Order #${placedOrder.orderNumber || placedOrder.id} has been placed.`,
    data: { orderId: placedOrder.id, status: placedOrder.status },
  });

  return { ok: true, order: placedOrder };
}

export async function getOrdersByEmail(email, sessionUserId) {
  try {
    const userId = await getBackendUserId({ email, sessionUserId });
    return await fetchMyOrdersByUserId(userId);
  } catch {
    return [];
  }
}

function findOrderInList(orders, key) {
  const list = Array.isArray(orders) ? orders : [];
  return list.find((x) => orderMatchesKey(x, key)) || null;
}

export async function getCustomerOrderById(orderKey, email, sessionUserId) {
  const orders = await getOrdersByEmail(email, sessionUserId);
  return findOrderInList(orders, orderKey);
}

export async function getAllOrdersAdmin() {
  try {
    const data = await requestJson("/api/admin/orders", {
      headers: adminAuthHeaders(),
    });
    return (Array.isArray(data?.orders) ? data.orders : []).map(mapOrderForMobile);
  } catch {
    return [];
  }
}

export async function getOrderById(orderKey) {
  const target = normalizeId(orderKey);
  if (!target) return null;
  const data = await getAllOrdersAdmin();
  return findOrderInList(data, target);
}

export function getOrderStatusOptions() {
  return STATUS_FLOW;
}

export async function submitOrderPaymentProof(orderKey, payload, sessionUserId) {
  try {
    const email = String(payload?.email || "").trim().toLowerCase();
    const userId = await getBackendUserId({ email, sessionUserId });
    const lookupKey =
      normalizeId(orderKey) ||
      normalizeId(payload?.orderNumber) ||
      normalizeId(payload?.fallbackOrder?.id) ||
      normalizeId(payload?.fallbackOrder?.orderNumber);
    if (!lookupKey) return { ok: false, error: "Missing order reference." };

    let current = payload?.fallbackOrder || null;
    if (userId) {
      const mine = await fetchMyOrdersByUserId(userId);
      current = findOrderInList(mine, lookupKey) || current;
    }
    if (!current) {
      current = await getOrderById(lookupKey);
    }

    const proofOrderId =
      normalizeId(current?.id) ||
      normalizeId(lookupKey);
    const image = String(payload?.imageUri || "").trim();
    const referenceNo = String(payload?.referenceNumber || "").trim();

    await requestJson("/api/orders/upload-proof", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(userId),
      },
      body: JSON.stringify({
        orderId: proofOrderId,
        orderNumber: normalizeId(current?.orderNumber || payload?.orderNumber) || undefined,
        image,
        referenceNo,
      }),
    });

    const proofPatch = {
      imageUri: image,
      referenceNumber: referenceNo,
      submittedAt: new Date().toISOString(),
    };
    const merged = current
      ? {
          ...current,
          paymentProofStatus: "pending",
          paymentProof: { ...(current.paymentProof || {}), ...proofPatch },
        }
      : null;

    if (userId) {
      const mine = await fetchMyOrdersByUserId(userId);
      const latest = findOrderInList(mine, lookupKey);
      return { ok: true, order: latest || merged };
    }
    const latest = await getOrderById(lookupKey);
    return { ok: true, order: latest || merged };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not submit payment proof." };
  }
}

export async function reviewOrderPaymentProofAdmin(orderId, payload) {
  const action = String(payload?.action || "").trim().toLowerCase();
  if (!["verify", "reject"].includes(action)) {
    return { ok: false, error: "Invalid review action." };
  }
  try {
    await requestJson("/api/admin/orders", {
      method: "PATCH",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: action === "verify" ? "verify-payment" : "reject-payment",
        orderId: normalizeId(orderId),
        referenceNo: String(payload?.referenceNumber || "").trim(),
        reason: String(payload?.reason || "").trim(),
      }),
    });
    const latest = await getOrderById(orderId);
    return { ok: true, order: latest };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not review payment proof." };
  }
}

export async function updateOrderStatusAdmin(orderId, nextStatus) {
  const targetStatus = String(nextStatus || "").trim().toLowerCase();
  if (!STATUS_FLOW.includes(targetStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  try {
    await requestJson("/api/admin/orders", {
      method: "PATCH",
      headers: adminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        action: "status",
        orderId: normalizeId(orderId),
        status: targetStatus,
      }),
    });
    const latest = await getOrderById(orderId);
    return { ok: true, order: latest };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not update order status." };
  }
}

export async function confirmOrderReceipt(orderId, userId) {
  const normalizedOrderId = normalizeId(orderId);
  if (!normalizedOrderId) return { ok: false, error: "Missing order id." };
  if (!userId) return { ok: false, error: "Sign in required." };
  try {
    await requestJson("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-id": String(userId) },
      body: JSON.stringify({ orderId: normalizedOrderId, status: "completed" }),
    });
    const latest = await getOrderById(normalizedOrderId);
    return { ok: true, order: latest };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not confirm receipt." };
  }
}

export function getTrackingStatusOptions() {
  return TRACKING_STATUS_FLOW;
}

export async function addOrderTrackingEventAdmin() {
  return { ok: false, error: "Tracking timeline update endpoint is not available yet on backend." };
}
