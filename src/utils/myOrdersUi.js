/** Shared My Orders UI helpers — aligned with gownweb `app/my-orders/page.jsx` */

export const ONGOING_STATUSES = new Set([
  "placed",
  "pending_payment",
  "paid",
  "processing",
  "ready",
  "shipped",
]);

export const TERMINAL_STATUSES = new Set(["completed", "cancelled", "refunded"]);

export const STATUS_LABEL = {
  placed: "Order Placed",
  pending_payment: "Awaiting Payment",
  paid: "Payment Confirmed",
  processing: "Processing",
  ready: "Ready",
  shipped: "Out for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const STATUS_LABEL_SHORT = {
  placed: "Placed",
  pending_payment: "Pending",
  paid: "Paid",
  processing: "Processing",
  ready: "Ready",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const STATUS_DESC = {
  placed: "Your order has been received.",
  pending_payment: "Upload your proof of payment to proceed.",
  paid: "Your payment has been verified.",
  processing: "We're preparing your gown.",
  ready: "Your gown is ready.",
  shipped: "Your order is on its way.",
  completed: "Order delivered — thank you!",
  cancelled: "This order has been cancelled.",
  refunded: "A refund has been issued.",
};

export const STATUS_COLOR_HEX = {
  placed: "#2d5be3",
  pending_payment: "#856404",
  paid: "#155724",
  processing: "#4a2c82",
  ready: "#0a5276",
  shipped: "#0c5460",
  completed: "#c9a96e",
  cancelled: "#721c24",
  refunded: "#7a3608",
};

export const DELIVERY_LABEL = {
  pickup: "Store Pickup",
  lalamove: "Lalamove Delivery",
  delivery: "Lalamove Delivery",
};

export const PAYMENT_LABEL = {
  gcash: "GCash",
  bdo: "BDO Transfer",
  cash: "Cash on Pickup",
};

export const PROGRESS_STEPS = {
  pickup: ["placed", "pending_payment", "paid", "processing", "ready", "completed"],
  lalamove: ["placed", "pending_payment", "paid", "processing", "ready", "shipped", "completed"],
};

export const RETURN_STATUS_META = {
  pending: { bg: "#fff3cd", color: "#856404", label: "Pending Review" },
  approved: { bg: "#d4edda", color: "#155724", label: "Approved" },
  rejected: { bg: "#f8d7da", color: "#721c24", label: "Rejected" },
  completed: { bg: "#d4edda", color: "#155724", label: "Processed" },
  cancelled: { bg: "#f0e6d3", color: "#6b3f2a", label: "Cancelled" },
};

export const RETURN_TYPE_LABEL = {
  return: "Return",
  refund: "Refund",
  exchange: "Exchange",
};

export function fmtPhp(n) {
  return `P${Number(n || 0).toLocaleString("en-PH")}`;
}

export function resolveDeliveryMethod(order) {
  const raw = String(order?.deliveryMethod || order?.delivery?.method || "pickup").toLowerCase();
  if (raw === "delivery") return "lalamove";
  return raw;
}

export function lalamoveLabel(order) {
  const vehicle = order?.lalamoveVehicle;
  if (!vehicle) return "Lalamove Delivery";
  return `Lalamove · ${String(vehicle).charAt(0).toUpperCase()}${String(vehicle).slice(1)}`;
}

export function deliveryLabel(order) {
  const method = resolveDeliveryMethod(order);
  if (method === "lalamove") return lalamoveLabel(order);
  return DELIVERY_LABEL[method] || method;
}

export function paymentLabel(order) {
  const p = String(order?.payment || order?.paymentMethod || "").toLowerCase();
  return PAYMENT_LABEL[p] || p || "—";
}

export function resolveProofStatus(order) {
  const raw = order?.proofStatus ?? order?.paymentProofStatus;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim().toLowerCase();
  }
  if (order?.paymentProof?.imageUri) return "pending";
  return "";
}

export function orderNeedsProof(order) {
  const paymentMethod = String(order?.payment || order?.paymentMethod || "").toLowerCase();
  const proofStatus = resolveProofStatus(order);
  return (
    String(order?.status || "").toLowerCase() === "pending_payment" &&
    paymentMethod !== "cash" &&
    proofStatus !== "pending" &&
    proofStatus !== "verified"
  );
}

export function isWithinReturnWindow(order) {
  if (String(order?.status || "").toLowerCase() !== "completed") return false;
  const completedAt = new Date(order?.updatedAt || order?.createdAt || order?.placedAt);
  const diffHours = (Date.now() - completedAt.getTime()) / 3600000;
  return diffHours <= 48;
}

export function getReturnWindowRemaining(order) {
  const completedAt = new Date(order?.updatedAt || order?.createdAt || order?.placedAt);
  const hoursElapsed = (Date.now() - completedAt.getTime()) / 3600000;
  const hoursLeft = Math.max(0, 48 - hoursElapsed);
  const minsLeft = Math.round((hoursLeft % 1) * 60);
  return { hoursLeft, minsLeft, withinWindow: hoursElapsed <= 48 };
}

export function navigateToOrderConfirmation(navigation, order) {
  navigation.navigate("OrderPlaced", {
    orderId: order?.id,
    orderNumber: order?.orderNumber,
    order,
  });
}

export function buildStatusTimelineRows(history, status, deliveryMethod) {
  const steps = PROGRESS_STEPS[deliveryMethod] || PROGRESS_STEPS.lalamove;
  const isBad = status === "cancelled" || status === "refunded";

  const logMap = {};
  (history || []).forEach((entry) => {
    const key = String(entry?.status || "").toLowerCase();
    const at = entry?.changedAt || entry?.at;
    if (!key) return;
    if (!logMap[key] || new Date(at) > new Date(logMap[key].changedAt)) {
      logMap[key] = { ...entry, status: key, changedAt: at };
    }
  });

  const curIdx = steps.indexOf(status);

  if (isBad) {
    const loggedSteps = (history || [])
      .slice()
      .sort((a, b) => new Date(b?.changedAt || b?.at) - new Date(a?.changedAt || a?.at));
    const alreadyHasTerminal = loggedSteps.some((e) => String(e?.status || "").toLowerCase() === status);
    return alreadyHasTerminal
      ? loggedSteps.map((e) => ({
          status: String(e?.status || "").toLowerCase(),
          changedAt: e?.changedAt || e?.at || null,
          note: e?.note || null,
          state: "bad",
        }))
      : [{ status, changedAt: null, note: null, state: "bad" }, ...loggedSteps.map((e) => ({
          status: String(e?.status || "").toLowerCase(),
          changedAt: e?.changedAt || e?.at || null,
          note: e?.note || null,
          state: "bad",
        }))];
  }

  return steps.map((step, i) => {
    const logged = logMap[step];
    let state;
    if (i < curIdx) state = "done";
    else if (i === curIdx) state = "current";
    else state = "upcoming";
    return {
      status: step,
      changedAt: logged?.changedAt || null,
      note: logged?.note || null,
      state,
    };
  });
}
