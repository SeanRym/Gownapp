/** Labels aligned with gownweb `app/order-confirmation/[id]/page.jsx` */

export const PROOF_STATUS_LABELS = {
  pending: "Uploaded — Awaiting Verification",
  verified: "Verified",
  rejected: "Rejected — Please Re-upload",
  unpaid: "Not yet uploaded",
  none: "Not yet uploaded",
};

export const ORDER_STATUS_LABELS = {
  placed: "Order Placed",
  pending_payment: "Awaiting Payment",
  paid: "Payment Confirmed",
  processing: "Processing",
  ready: "Ready for Pickup / Delivery",
  shipped: "Out for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  expired: "Expired",
};

export function paymentMethodLabel(payment) {
  const p = String(payment || "").toLowerCase();
  if (p === "bdo") return "BDO Bank Transfer";
  if (p === "cash") return "Cash on Pickup";
  return "GCash";
}

export function deliveryMethodLabel(order) {
  const method = String(order?.delivery?.method || "pickup").toLowerCase();
  if (method === "delivery" || method === "lalamove") return "Lalamove Delivery";
  return "Store Pickup";
}

export function resolveProofStatus(order) {
  const raw = order?.paymentProofStatus || order?.proofStatus;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim().toLowerCase();
  }
  if (order?.paymentProof?.imageUri) return "pending";
  return "none";
}

export function resolvePaymentStatus(order) {
  const raw = order?.paymentStatus;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim().toLowerCase();
  }
  return resolveProofStatus(order) === "pending" ? "pending" : "unpaid";
}

export function formatPaymentStatusLabel(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "paid" || s === "verified") return "Paid";
  if (s === "pending") return "Pending";
  if (s === "unpaid") return "Unpaid";
  if (s === "refunded") return "Refunded";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function orderStatusLabel(order) {
  const status = String(order?.status || "placed").toLowerCase();
  return ORDER_STATUS_LABELS[status] || status.replace(/_/g, " ");
}

export function proofStatusLabel(proofStatus) {
  const key = String(proofStatus || "none").toLowerCase();
  return PROOF_STATUS_LABELS[key] || PROOF_STATUS_LABELS.none;
}

export function getWhatHappensNextSteps(order) {
  const payment = String(order?.payment || order?.paymentMethod || "gcash").toLowerCase();
  const delivery = String(order?.delivery?.method || "pickup").toLowerCase();

  if (payment === "cash") {
    return [
      "Bring the exact amount when you collect your order",
      "Our team will prepare your order and notify you when it's ready",
      "Collect at the boutique — Mon–Sat 9AM–6PM",
    ];
  }

  const proofStatus = resolveProofStatus(order);
  const proofSubmitted = ["pending", "verified"].includes(proofStatus);

  const steps = proofSubmitted
    ? [
        "Our team verifies your payment (usually within 1–2 hours)",
        "You'll receive an email when your order is confirmed and being prepared",
      ]
    : [
        "Upload your proof of payment below",
        "Our team verifies your payment (usually within 1–2 hours)",
        "You'll receive an email when your order is confirmed and being prepared",
      ];

  if (delivery === "delivery" || delivery === "lalamove") {
    steps.push("We'll arrange Lalamove and notify you of the delivery fee");
  } else {
    steps.push("We'll notify you when your order is ready for pickup");
  }

  return steps;
}
