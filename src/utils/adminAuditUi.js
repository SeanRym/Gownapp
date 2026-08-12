/** Admin audit UI helpers — aligned with gownweb `app/admin/audit/page.jsx` */

export const PAGE_SIZE = 50;

export const ENTITY_TYPES = [
  { value: "", label: "All types" },
  { value: "order", label: "order" },
  { value: "user", label: "user" },
  { value: "gown", label: "gown" },
  { value: "cms_block", label: "cms_block" },
  { value: "hero_slide", label: "hero_slide" },
  { value: "testimonial", label: "testimonial" },
  { value: "upload", label: "upload" },
  { value: "secret", label: "secret" },
  { value: "report", label: "report" },
];

const ACTION_DOMAINS = {
  order: { color: "#4a7fd4", bg: "rgba(74,127,212,0.12)" },
  user: { color: "#b8860b", bg: "rgba(184,134,11,0.15)" },
  gown: { color: "#155724", bg: "rgba(21,87,36,0.12)" },
  cms: { color: "#4a2c82", bg: "rgba(74,44,130,0.12)" },
  report: { color: "#666", bg: "#f0f0f0" },
  upload: { color: "#666", bg: "#f0f0f0" },
  secret: { color: "#a33d54", bg: "rgba(163,61,84,0.12)" },
};

export function getActionDomain(action = "") {
  const prefix = String(action || "").split(".")[0];
  return ACTION_DOMAINS[prefix] || { color: "#666", bg: "#f0f0f0" };
}

export function fmtAuditTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} · ${time}`;
}

export function formatPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function hasPayload(payload) {
  return payload && typeof payload === "object" && Object.keys(payload).length > 0;
}

export function shortEntityId(id) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export function toIsoDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Web-style mm/dd/yyyy for filter inputs */
export function fmtFilterDate(iso) {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function fmtFilterDateRange(from, to) {
  const f = fmtFilterDate(from);
  const t = fmtFilterDate(to);
  if (f && t) return `${f} – ${t}`;
  if (f) return `from ${f}`;
  if (t) return `through ${t}`;
  return "";
}
