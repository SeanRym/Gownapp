/** Admin returns UI helpers — aligned with gownweb `app/admin/returns/page.jsx` */

export const STATUS_META = {
  pending: { label: "Pending", bg: "#fff3cd", color: "#856404" },
  approved: { label: "Approved", bg: "#d4edda", color: "#155724" },
  rejected: { label: "Rejected", bg: "#f8d7da", color: "#721c24" },
  completed: { label: "Completed", bg: "#d4edda", color: "#155724" },
  cancelled: { label: "Cancelled", bg: "#e2e3e5", color: "#383d41" },
};

export const TYPE_META = {
  return: { label: "Return", icon: "↩", bg: "#e8f0ff", color: "#2d5be3" },
  refund: { label: "Refund", icon: "₱", bg: "#fce8d4", color: "#7a3608" },
  exchange: { label: "Exchange", icon: "⇄", bg: "#e2d9f3", color: "#4a2c82" },
};

export const VALID_ACTIONS = {
  pending: ["approve", "reject"],
  approved: ["complete", "reject", "cancel"],
};

export const ACTION_META = {
  approve: { label: "Approve", danger: false },
  reject: { label: "Reject", danger: true },
  complete: { label: "Complete", danger: false },
  cancel: { label: "Cancel", danger: true },
};

export function fmtPhp(n) {
  return `P${Number(n || 0).toLocaleString("en-PH")}`;
}

export function fmtRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isVideo(type) {
  return String(type || "").startsWith("video/");
}

export function computeReturnStats(returns) {
  const all = Array.isArray(returns) ? returns : [];
  return {
    total: all.length,
    pending: all.filter((r) => r.status === "pending").length,
    approved: all.filter((r) => r.status === "approved").length,
    completed: all.filter((r) => r.status === "completed").length,
    refunds: all
      .filter((r) => r.refundAmount != null)
      .reduce((s, r) => s + Number(r.refundAmount || 0), 0),
  };
}

export function filterReturns(returns, { search = "", filterStatus = "", filterType = "" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return (Array.isArray(returns) ? returns : []).filter((r) => {
    const matchStatus = !filterStatus || r.status === filterStatus;
    const matchType = !filterType || r.type === filterType;
    const matchSearch =
      !q ||
      String(r.orderNumber || "")
        .toLowerCase()
        .includes(q) ||
      String(r.customerName || "")
        .toLowerCase()
        .includes(q) ||
      String(r.customerEmail || "")
        .toLowerCase()
        .includes(q);
    return matchStatus && matchType && matchSearch;
  });
}
