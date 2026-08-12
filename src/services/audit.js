import { API_BASE_URL, adminAuthHeaders } from "../config/apiEnv";

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
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body;
}

/**
 * Same contract as gownweb GET /api/admin/audit
 * @param {{ action?: string, entityType?: string, actor?: string, from?: string, to?: string, limit?: number, offset?: number }} filters
 */
export async function getAuditLogsAdmin(filters = {}) {
  const params = new URLSearchParams();
  const limit = Math.min(Number(filters.limit ?? 50) || 50, 200);
  const offset = Math.max(Number(filters.offset ?? 0) || 0, 0);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const action = String(filters.action || "").trim();
  const entityType = String(filters.entityType || filters.entity_type || "").trim();
  const actor = String(filters.actor || "").trim();
  const from = String(filters.from || "").trim();
  const to = String(filters.to || "").trim();

  if (action) params.set("action", action);
  if (entityType) params.set("entity_type", entityType);
  if (actor) params.set("actor", actor);
  if (from) params.set("from", from.includes("T") ? from : `${from}T00:00:00`);
  if (to) params.set("to", to.includes("T") ? to : `${to}T23:59:59`);

  const data = await requestJson(`/api/admin/audit?${params.toString()}`, {
    headers: adminAuthHeaders(),
  });

  return {
    ok: Boolean(data?.ok),
    total: Number(data?.total || 0),
    limit: Number(data?.limit || limit),
    offset: Number(data?.offset || offset),
    logs: Array.isArray(data?.logs) ? data.logs : [],
  };
}
