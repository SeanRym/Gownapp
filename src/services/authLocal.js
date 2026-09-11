import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRealName, passwordMeetsRules } from "../utils/authValidation";
import { normalizeRole } from "../utils/access";
import { API_BASE_URL, adminAuthHeaders, getAdminSecret } from "../config/apiEnv";

const USERS_KEY = "jce_users";
const LOGIN_ATTEMPTS_KEY = "jce_login_attempts";
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function loadLoginAttempts() {
  try {
    const raw = await AsyncStorage.getItem(LOGIN_ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveLoginAttempts(attempts) {
  await AsyncStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
}

function lockedMessage(untilMs) {
  const remaining = Math.max(0, untilMs - Date.now());
  const minutes = Math.ceil(remaining / 60000);
  return `Too many login attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function sha256(input) {
  const text = String(input || "");
  try {
    if (!globalThis.crypto?.subtle) return text;
    const bytes = new TextEncoder().encode(text);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return text;
  }
}

export async function loadUsers() {
  try {
    const raw = await AsyncStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function upsertLocalUserRecord(user) {
  const users = await loadUsers();
  const email = normalizeEmail(user?.email);
  const id = user?.id != null ? String(user.id) : "";
  const nextUser = {
    id: id || String(Date.now()),
    name: String(user?.name || user?.firstName || "Customer").trim() || "Customer",
    email: email || "",
    phone: String(user?.phone || "").trim(),
    role: normalizeRole(user?.role),
    address: String(user?.address || "").trim(),
    city: String(user?.city || "").trim(),
    province: String(user?.province || "").trim(),
    zip: String(user?.zip || "").trim(),
  };

  if (!nextUser.email && !nextUser.id) return users;

  const index = users.findIndex((item) => {
    const sameEmail = email && normalizeEmail(item?.email) === email;
    const sameId = id && String(item?.id) === id;
    return sameEmail || sameId;
  });

  const nextUsers = [...users];
  if (index >= 0) {
    nextUsers[index] = { ...nextUsers[index], ...nextUser, id: nextUsers[index]?.id || nextUser.id };
  } else {
    nextUsers.push(nextUser);
  }

  await saveUsers(nextUsers);
  return nextUsers;
}

export async function checkEmailTaken(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return false;

  const remote = await requestJson(`/api/auth/check-email?email=${encodeURIComponent(cleanEmail)}`, {
    method: "GET",
    includeAdminSecret: false,
  });

  if (remote.ok && typeof remote.data?.taken === "boolean") {
    return Boolean(remote.data.taken);
  }

  const user = await getUserByEmail(cleanEmail);
  return Boolean(user);
}

export async function getUserByEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const remoteUsers = await requestJson("/api/admin/users");
  if (remoteUsers.ok && Array.isArray(remoteUsers.data?.users)) {
    const match = remoteUsers.data.users.find((user) => normalizeEmail(user?.email) === cleanEmail);
    if (match) {
      return {
        id: String(match.id),
        firstName: String(match.firstName || "").trim(),
        lastName: String(match.lastName || "").trim(),
        name: String(match.name || `${match.firstName || ""} ${match.lastName || ""}`).trim(),
        email: cleanEmail,
        role: normalizeRole(match.role),
      };
    }
  }

  const users = await loadUsers();
  return users.find((user) => normalizeEmail(user.email) === cleanEmail) || null;
}

async function saveUsers(users) {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function requestJson(path, options = {}) {
  if (!API_BASE_URL) {
    return { ok: false, error: "API base URL is missing.", networkError: false };
  }
  try {
    const res = await fetch(makeUrl(path), {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.includeAdminSecret !== false && getAdminSecret() ? adminAuthHeaders() : {}),
        ...(options.headers || {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || `Request failed (${res.status})`,
        data,
        networkError: false,
      };
    }
    return { ok: true, status: res.status, data, networkError: false };
  } catch (error) {
    return { ok: false, error: error?.message || "Network request failed.", status: null, networkError: true };
  }
}

function splitName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  const parts = clean.split(" ").filter(Boolean);
  const firstName = parts[0] || clean;
  const lastName = parts.slice(1).join(" ") || firstName || "User";
  return { firstName, lastName, name: clean };
}

async function resolveUserByEmail(email, fallbackName = "") {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const usersRes = await requestJson("/api/admin/users");
  if (usersRes.ok) {
    const match = (Array.isArray(usersRes.data?.users) ? usersRes.data.users : []).find(
      (u) => normalizeEmail(u?.email) === cleanEmail
    );
    if (match?.id) {
      return {
        id: String(match.id),
        firstName: String(match.firstName || "").trim(),
        lastName: String(match.lastName || "").trim(),
        name: String(match.name || `${match.firstName || ""} ${match.lastName || ""}`).trim(),
        email: cleanEmail,
        role: normalizeRole(match.role),
      };
    }
  }

  const ensured = await requestJson("/api/mobile/ensure-user", {
    method: "POST",
    body: { email: cleanEmail, name: String(fallbackName || "").trim() },
  });
  if (ensured.ok && ensured.data?.userId) {
    const { firstName, lastName, name } = splitName(fallbackName);
    return {
      id: String(ensured.data.userId),
      firstName,
      lastName,
      name,
      email: cleanEmail,
      role: "customer",
    };
  }
  return null;
}

export async function registerUser({ name, email, password }) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!isRealName(cleanName)) {
    return { ok: false, error: "Please use a real name (letters/spaces/hyphen/apostrophe only)." };
  }
  if (!isValidEmail(cleanEmail)) return { ok: false, error: "Please enter a valid email." };
  if (!passwordMeetsRules(cleanPassword)) {
    return { ok: false, error: "Password must be at least 8 chars with letters and numbers." };
  }
  const { firstName, lastName } = splitName(cleanName);

  const remote = await requestJson("/api/auth/register", {
    method: "POST",
    includeAdminSecret: false,
    body: {
      firstName,
      lastName,
      email: cleanEmail,
      password: cleanPassword,
    },
  });
  if (remote.ok && remote.data?.user) {
    const user = {
      id: remote.data.user.id,
      name: remote.data.user.name,
      email: remote.data.user.email,
      role: normalizeRole(remote.data.user.role),
    };
    await upsertLocalUserRecord(user);
    return { ok: true, user };
  }

  if (!remote.networkError) {
    return { ok: false, error: remote.error || "Unable to create account." };
  }

  const users = await loadUsers();
  if (users.some((u) => normalizeEmail(u.email) === cleanEmail)) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const passwordHash = await sha256(cleanPassword);
  const role = cleanEmail.includes("admin") ? "admin" : "customer";
  const user = { id: Date.now(), name: cleanName, email: cleanEmail, passwordHash, role };
  const next = [...users, user];
  await saveUsers(next);
  return { ok: true, user };
}

export async function verifyLoginCredentials({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPass = String(password || "");
  const attempts = await loadLoginAttempts();
  const existing = attempts[cleanEmail] || {};

  if (existing.blockedUntil && Date.now() < Number(existing.blockedUntil)) {
    return { ok: false, error: lockedMessage(Number(existing.blockedUntil)), lockedUntil: Number(existing.blockedUntil) };
  }

  const remote = await requestJson("/api/auth/login", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, password: cleanPass },
  });
  if (remote.ok && remote.data?.user) {
    delete attempts[cleanEmail];
    await saveLoginAttempts(attempts);
    const user = {
      id: remote.data.user.id,
      name: remote.data.user.name,
      email: remote.data.user.email,
      role: normalizeRole(remote.data.user.role),
    };
    await upsertLocalUserRecord(user);
    return { ok: true, user };
  }

  if (!remote.networkError) {
    return { ok: false, error: remote.error || "Invalid email or password." };
  }

  const users = await loadUsers();
  const hash = await sha256(password);
  const match = users.find((u) => normalizeEmail(u.email) === cleanEmail && u.passwordHash === hash);
  if (match) {
    delete attempts[cleanEmail];
    await saveLoginAttempts(attempts);
    return { ok: true, user: match };
  }

  const nextCount = Number(existing.count || 0) + 1;
  const nextAttempt = {
    count: nextCount,
    firstFailedAt: existing.firstFailedAt || Date.now(),
    blockedUntil: null,
  };

  if (nextCount >= LOGIN_ATTEMPT_LIMIT) {
    nextAttempt.blockedUntil = Date.now() + LOGIN_LOCKOUT_DURATION_MS;
  }

  attempts[cleanEmail] = nextAttempt;
  await saveLoginAttempts(attempts);

  if (nextAttempt.blockedUntil) {
    return { ok: false, error: lockedMessage(nextAttempt.blockedUntil), lockedUntil: nextAttempt.blockedUntil };
  }

  return { ok: false, error: "Invalid email or password." };
}

export async function resetUserPassword({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (!passwordMeetsRules(password)) {
    return { ok: false, error: "Password must be at least 8 chars with letters and numbers." };
  }

  const remote = await requestJson("/api/auth/reset-password", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, password: String(password || "") },
  });
  if (remote.ok) return { ok: true };
  if (!remote.networkError) return { ok: false, error: remote.error || "Unable to reset password." };

  const users = await loadUsers();
  const index = users.findIndex((u) => normalizeEmail(u.email) === cleanEmail);
  if (index < 0) return { ok: false, error: "No account found with this email." };
  const hash = await sha256(password);
  const updated = [...users];
  updated[index] = { ...updated[index], passwordHash: hash };
  await saveUsers(updated);
  return { ok: true, user: updated[index] };
}

export async function updateUserProfile({ id, email, name, phone, address = "", city = "", province = "", zip = "" }) {
  const cleanId = id ? String(id).trim() : "";
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanPhone = String(phone || "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanCity = String(city || "").trim();
  const cleanProvince = String(province || "").trim();
  const cleanZip = String(zip || "").trim();
  if (!isRealName(cleanName)) {
    return { ok: false, error: "Please use a real name (letters/spaces/hyphen/apostrophe only)." };
  }

  const { firstName, lastName } = splitName(cleanName);
  const buildUserPayload = (user) => ({
    id: user?.id || cleanId || "",
    name: user?.name || cleanName,
    email: normalizeEmail(user?.email || cleanEmail),
    phone: cleanPhone,
    role: normalizeRole(user?.role),
    address: cleanAddress || String(user?.address || "").trim(),
    city: cleanCity || String(user?.city || "").trim(),
    province: cleanProvince || String(user?.province || "").trim(),
    zip: cleanZip || String(user?.zip || "").trim(),
  });

  const remoteBody = {
    firstName,
    lastName,
    email: cleanEmail,
    phone: cleanPhone,
    address: cleanAddress,
    city: cleanCity,
    province: cleanProvince,
    zip: cleanZip,
  };

  if (cleanId) {
    const remote = await requestJson("/api/auth/update-profile", {
      method: "PATCH",
      includeAdminSecret: false,
      headers: { "x-user-id": cleanId },
      body: remoteBody,
    });
    if (remote.ok && remote.data?.user) {
      return { ok: true, user: buildUserPayload(remote.data.user) };
    }
  }

  const resolved = await resolveUserByEmail(cleanEmail, cleanName);
  if (resolved?.id) {
    const remote = await requestJson("/api/auth/update-profile", {
      method: "PATCH",
      includeAdminSecret: false,
      headers: { "x-user-id": String(resolved.id) },
      body: remoteBody,
    });
    if (remote.ok && remote.data?.user) {
      return { ok: true, user: buildUserPayload(remote.data.user) };
    }
  }

  const users = await loadUsers();
  const index = users.findIndex((u) => normalizeEmail(u.email) === cleanEmail || (cleanId && String(u.id) === cleanId));
  if (index >= 0) {
    const updated = [...users];
    updated[index] = {
      ...updated[index],
      id: updated[index]?.id || cleanId || Date.now(),
      email: cleanEmail || updated[index]?.email,
      name: cleanName,
      phone: cleanPhone,
      address: cleanAddress,
      city: cleanCity,
      province: cleanProvince,
      zip: cleanZip,
    };
    await saveUsers(updated);
    return { ok: true, user: updated[index] };
  }

  if (cleanEmail || cleanId) {
    const created = {
      id: cleanId || String(Date.now()),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: "customer",
      address: cleanAddress,
      city: cleanCity,
      province: cleanProvince,
      zip: cleanZip,
    };
    await saveUsers([...users, created]);
    return { ok: true, user: created };
  }

  return { ok: false, error: "No account found with this email." };
}

export async function changeUserPassword({ id, email, currentPassword, nextPassword, otpVerified = false }) {
  const cleanId = id ? String(id).trim() : "";
  const cleanEmail = normalizeEmail(email);
  if (!passwordMeetsRules(nextPassword)) {
    return { ok: false, error: "New password must be at least 8 chars with letters and numbers." };
  }

  if (otpVerified) {
    const remote = await requestJson("/api/auth/reset-password", {
      method: "POST",
      includeAdminSecret: false,
      body: { email: cleanEmail, password: String(nextPassword || "") },
    });
    if (remote.ok) return { ok: true };
  }

  const loginCheck = await requestJson("/api/auth/login", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, password: String(currentPassword || "") },
  });
  if (loginCheck.ok && loginCheck.data?.user?.id) {
    const remote = await requestJson("/api/auth/update-profile", {
      method: "PATCH",
      includeAdminSecret: false,
      headers: { "x-user-id": String(loginCheck.data.user.id) },
      body: { password: String(nextPassword || "") },
    });
    if (remote.ok) return { ok: true };
  }

  const users = await loadUsers();
  const index = users.findIndex((u) => normalizeEmail(u.email) === cleanEmail);
  if (index < 0) return { ok: false, error: "No account found with this email." };
  if (!otpVerified) {
    const currentHash = await sha256(currentPassword);
    if (users[index].passwordHash !== currentHash) {
      return { ok: false, error: "Current password is incorrect." };
    }
  }
  const nextHash = await sha256(nextPassword);
  const updated = [...users];
  updated[index] = { ...updated[index], passwordHash: nextHash };
  await saveUsers(updated);
  return { ok: true };
}

export async function deleteUserAccount({ email, password }) {
  const cleanEmail = normalizeEmail(email);

  const loginCheck = await requestJson("/api/auth/login", {
    method: "POST",
    includeAdminSecret: false,
    body: { email: cleanEmail, password: String(password || "") },
  });
  if (loginCheck.ok && loginCheck.data?.user?.id) {
    const remote = await requestJson(`/api/admin/users?id=${encodeURIComponent(String(loginCheck.data.user.id))}`, {
      method: "DELETE",
    });
    if (remote.ok) return { ok: true };
  }

  const users = await loadUsers();
  const index = users.findIndex((u) => normalizeEmail(u.email) === cleanEmail);
  if (index < 0) return { ok: false, error: "No account found with this email." };
  const hash = await sha256(password);
  if (users[index].passwordHash !== hash) {
    return { ok: false, error: "Password is incorrect." };
  }
  const updated = users.filter((u) => normalizeEmail(u.email) !== cleanEmail);
  await saveUsers(updated);
  return { ok: true };
}

// -------- Admin helpers (local staff management) --------

export async function listUsersAdmin() {
  const remote = await requestJson("/api/admin/users");
  if (remote.ok) {
    return (Array.isArray(remote.data?.users) ? remote.data.users : []).map((u) => ({
      id: u?.id,
      name: String(u?.name || `${u?.firstName || ""} ${u?.lastName || ""}`).trim(),
      firstName: u?.firstName || "",
      lastName: u?.lastName || "",
      email: String(u?.email || ""),
      phone: String(u?.phone || ""),
      address:
        typeof u?.address === "string"
          ? u.address
          : [u?.address?.line1, u?.address?.city, u?.address?.province, u?.address?.postalCode]
              .filter(Boolean)
              .join(", ") || [u?.defaultAddress?.line1, u?.defaultAddress?.city, u?.defaultAddress?.province, u?.defaultAddress?.postalCode]
              .filter(Boolean)
              .join(", "),
      role: normalizeRole(u?.role),
      isActive: u?.isActive !== false,
      createdAt: u?.createdAt || u?.created_at || null,
    }));
  }
  return [];
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const prefix = "Temp";
  let output = prefix;
  for (let i = 0; i < 6; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

export async function createUserAdmin({ firstName, lastName, name, email, password, role }) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanFirstName = String(firstName || "").trim().replace(/\s+/g, " ");
  const cleanLastName = String(lastName || "").trim().replace(/\s+/g, " ");
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "").trim();
  const tempPassword = cleanPassword || generateTemporaryPassword();
  const nextRole = normalizeRole(role);

  const inferredFirstName = cleanFirstName || splitName(cleanName).firstName || "";
  const inferredLastName = cleanLastName || splitName(cleanName).lastName || "";
  const finalName = `${inferredFirstName} ${inferredLastName}`.trim();

  if (!inferredFirstName) {
    return { ok: false, error: "Please enter a first name." };
  }
  if (!inferredLastName) {
    return { ok: false, error: "Please enter a last name." };
  }
  if (!isRealName(inferredFirstName)) {
    return { ok: false, error: "Please use a real first name." };
  }
  if (!isRealName(inferredLastName)) {
    return { ok: false, error: "Please use a real last name." };
  }
  if (!isValidEmail(cleanEmail)) return { ok: false, error: "Please enter a valid email." };
  if (cleanPassword && !passwordMeetsRules(cleanPassword)) {
    return { ok: false, error: "Password must be at least 8 chars with letters and numbers." };
  }

  const remote = await requestJson("/api/admin/users", {
    method: "POST",
    body: {
      firstName: inferredFirstName,
      lastName: inferredLastName || "User",
      name: finalName,
      email: cleanEmail,
      password: tempPassword,
      role: nextRole,
    },
  });
  if (remote.ok) {
    const responseData = remote.data?.data || remote.data;
    const createdUser = remote.data?.user || responseData?.user || remote.data?.createdUser || null;
    const serverPassword = String(
      remote.data?.temporaryPassword ||
      remote.data?.tempPassword ||
      remote.data?.temporary_password ||
      remote.data?.temp_password ||
      remote.data?.password ||
      responseData?.temporaryPassword ||
      responseData?.tempPassword ||
      responseData?.temporary_password ||
      responseData?.temp_password ||
      responseData?.password ||
      createdUser?.temporaryPassword ||
      createdUser?.tempPassword ||
      createdUser?.temporary_password ||
      createdUser?.temp_password ||
      tempPassword ||
      ""
    ).trim();
    return {
      ok: true,
      password: serverPassword || tempPassword,
      temporaryPassword: serverPassword || tempPassword,
      user: {
        id: createdUser?.id || remote.data?.id,
        name: createdUser?.name || createdUser?.fullName || finalName,
        firstName: createdUser?.firstName || inferredFirstName,
        lastName: createdUser?.lastName || inferredLastName,
        email: createdUser?.email || cleanEmail,
        role: normalizeRole(createdUser?.role || nextRole),
        isActive: createdUser?.isActive !== false,
      },
    };
  }
  return { ok: false, error: remote.error || "Unable to create user on the deployed server." };
}

export async function updateUserRoleAdmin({ id, email, role }) {
  const cleanEmail = normalizeEmail(email);
  const nextRole = normalizeRole(role);
  if (id) {
    const remote = await requestJson("/api/admin/users", {
      method: "PUT",
      body: { id, role: nextRole },
    });
    if (remote.ok) return { ok: true, user: remote.data?.user };
    return { ok: false, error: remote.error || "Unable to update user on the deployed server." };
  }
  return { ok: false, error: "A server user id is required to update this account." };
}

export async function deleteUserAdmin({ id, email }) {
  const cleanEmail = normalizeEmail(email);
  if (id) {
    const remote = await requestJson(`/api/admin/users?id=${encodeURIComponent(String(id))}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (remote.ok) return { ok: true };
    return { ok: false, error: remote.error || "Unable to archive user on the deployed server." };
  }
  return { ok: false, error: "A server user id is required to archive this account." };
}

export async function restoreUserAdmin({ id, email }) {
  const cleanEmail = normalizeEmail(email);
  if (id) {
    const remote = await requestJson("/api/admin/users", {
      method: "PUT",
      body: { id, isActive: true },
    });
    if (remote.ok) return { ok: true };
    return { ok: false, error: remote.error || "Unable to restore user on the deployed server." };
  }
  return { ok: false, error: "A server user id is required to restore this account." };
}
