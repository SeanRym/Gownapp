export function normalizeId(value) {
  return String(value ?? "").trim();
}

export function idsEqual(a, b) {
  const left = normalizeId(a);
  const right = normalizeId(b);
  if (!left || !right) return false;
  return left === right;
}

/** Match an order by database id and/or human-readable order number (e.g. JCE-20260518-0035). */
export function orderMatchesKey(order, key) {
  const target = normalizeId(key);
  if (!target || !order) return false;
  const id = normalizeId(order?.id);
  const orderNumber = normalizeId(order?.orderNumber);
  if (id && idsEqual(id, target)) return true;
  if (orderNumber && orderNumber === target) return true;
  return false;
}
