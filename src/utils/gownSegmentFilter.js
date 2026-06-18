/**
 * Match catalog items to fitting-room segment (who is being measured).
 * Women / girls → gowns & dresses; men / boys → suits.
 */

const SUIT_TYPE_RE = /^suits?$/i;
const GOWN_TYPE_RE = /^(gowns?|dresses?)$/i;

export function isSuitProduct(gown) {
  const type = String(gown?.type || "").trim();
  if (SUIT_TYPE_RE.test(type)) return true;
  const sil = String(gown?.silhouette || "").toLowerCase();
  if (sil.includes("suit")) return true;
  const name = String(gown?.name || "").toLowerCase();
  return /\bsuit\b/.test(name);
}

export function isGownProduct(gown) {
  if (isSuitProduct(gown)) return false;
  const type = String(gown?.type || "").trim();
  if (!type || GOWN_TYPE_RE.test(type)) return true;
  return !isSuitProduct(gown);
}

/** True when style / try-on should show suits (men, or children → boy). */
export function profileWantsSuits(profile) {
  const seg = profile?.segment || "women";
  if (seg === "men") return true;
  if (seg === "children") return profile?.childGender === "boy";
  return false;
}

export function profileNeedsChildGender(profile) {
  return profile?.segment === "children" && !profile?.childGender;
}

export function filterGownsForProfile(gowns, profile) {
  if (!Array.isArray(gowns)) return [];
  if (profileNeedsChildGender(profile)) return [];
  const suits = profileWantsSuits(profile);
  return gowns.filter((g) => (suits ? isSuitProduct(g) : isGownProduct(g)));
}

export function getCatalogKindLabel(profile) {
  return profileWantsSuits(profile) ? "suit" : "gown";
}

export function getCatalogKindLabelPlural(profile) {
  return profileWantsSuits(profile) ? "suits" : "gowns";
}
