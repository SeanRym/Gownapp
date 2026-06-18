import { API_BASE_URL, adminAuthHeaders } from "../config/apiEnv";

function makeUrl(path) {
  return `${String(API_BASE_URL).replace(/\/+$/, "")}${path}`;
}

async function requestJson(path, options = {}) {
  const url = makeUrl(path);
  const res = await fetch(url, {
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

export async function getMyReturns(userId) {
  const data = await requestJson("/api/returns", {
    headers: { "x-user-id": String(userId) },
  });
  return Array.isArray(data?.returns) ? data.returns : [];
}

export async function submitReturnRequest(userId, payload) {
  return requestJson("/api/returns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify(payload),
  });
}

export async function uploadReturnEvidence(userId, assets) {
  const form = new FormData();
  for (const a of assets) {
    if (!a?.uri) continue;
    const name = a.fileName || a.filename || a.name || `evidence-${Date.now()}`;
    const type = a.mimeType || a.type || "application/octet-stream";
    form.append("file", { uri: a.uri, name, type });
  }

  const url = makeUrl("/api/returns/upload");
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-user-id": String(userId) },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Upload failed (${res.status}).`);
  return Array.isArray(data?.files) ? data.files : [];
}

export async function getAllReturnsAdmin(status = "") {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await requestJson(`/api/admin/returns${qs}`, {
    headers: adminAuthHeaders(),
  });
  return Array.isArray(data?.returns) ? data.returns : [];
}

export async function updateReturnAdmin(returnId, { action, adminNote, refundAmount } = {}) {
  return requestJson("/api/admin/returns", {
    method: "PATCH",
    headers: adminAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ returnId, action, adminNote, refundAmount }),
  });
}

