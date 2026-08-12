export const ROLES = /** @type {const} */ (["admin", "staff", "customer"]);

export function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return ROLES.includes(r) ? r : "customer";
}

export function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === "admin" || r === "staff";
}

export function canAccess(user, area) {
  const role = normalizeRole(user?.role);
  const key = String(area || "").trim().toLowerCase();

  // Areas: admin_tab, admin_orders, admin_gowns, admin_stats, admin_users, admin_audit
  if (key === "admin_tab") return isAdminRole(role);

  if (key === "admin_audit") return role === "admin";
  if (key === "admin_users") return role === "admin";

  if (role === "admin") return true;
  if (role === "staff") return key === "admin_gowns" || key === "admin_orders" || key === "admin_stats";

  return false;
}

