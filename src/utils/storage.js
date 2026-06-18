import AsyncStorage from "@react-native-async-storage/async-storage";

const CART_PREFIX = "jce_mobile_cart_";
const CART_UPDATED_AT_PREFIX = "jce_mobile_cart_updated_at__";
const USER_KEY = "jce_mobile_user";
const FAVORITES_KEY = "jce_mobile_favorites";
const AR_FIT_PROFILES_KEY = "jce_mobile_ar_fit_profiles";
const ADDRESSES_KEY = "jce_mobile_addresses";
const CHECKOUT_PROFILE_KEY = "jce_mobile_checkout_profiles";
const CART_NOTE_PREFIX = "jce_mobile_cart_note_";

function normalizeEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e || null;
}

function cartKeyForEmail(email) {
  const e = normalizeEmail(email);
  return `${CART_PREFIX}${e || "guest"}`;
}

function cartUpdatedAtKey(email) {
  const e = normalizeEmail(email);
  return `${CART_UPDATED_AT_PREFIX}${e || "guest"}`;
}

export async function loadCart(email) {
  try {
    const raw = await AsyncStorage.getItem(cartKeyForEmail(email));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCart(items, email) {
  await AsyncStorage.setItem(cartKeyForEmail(email), JSON.stringify(items));
  await AsyncStorage.setItem(cartUpdatedAtKey(email), new Date().toISOString());
}

export async function loadCartUpdatedAt(email) {
  try {
    return (await AsyncStorage.getItem(cartUpdatedAtKey(email))) || "";
  } catch {
    return "";
  }
}

export async function loadUser() {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveUser(user) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearUser() {
  await AsyncStorage.removeItem(USER_KEY);
}

export async function loadFavorites() {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveFavorites(ids) {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export async function loadArFitProfiles() {
  try {
    const raw = await AsyncStorage.getItem(AR_FIT_PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveArFitProfiles(profiles) {
  await AsyncStorage.setItem(AR_FIT_PROFILES_KEY, JSON.stringify(profiles));
}

export async function loadAddresses() {
  try {
    const raw = await AsyncStorage.getItem(ADDRESSES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveAddresses(addressesByEmail) {
  await AsyncStorage.setItem(ADDRESSES_KEY, JSON.stringify(addressesByEmail || {}));
}

export async function loadCheckoutProfiles() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_PROFILE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveCheckoutProfiles(profilesByEmail) {
  await AsyncStorage.setItem(CHECKOUT_PROFILE_KEY, JSON.stringify(profilesByEmail || {}));
}

export async function loadCartNote(email) {
  const key = `${CART_NOTE_PREFIX}${String(email || "").trim().toLowerCase()}`;
  if (!key || key === CART_NOTE_PREFIX) return "";
  try {
    return (await AsyncStorage.getItem(key)) || "";
  } catch {
    return "";
  }
}

export async function saveCartNote(email, note) {
  const key = `${CART_NOTE_PREFIX}${String(email || "").trim().toLowerCase()}`;
  if (!key || key === CART_NOTE_PREFIX) return;
  await AsyncStorage.setItem(key, String(note || ""));
}
