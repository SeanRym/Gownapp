import { API_BASE_URL } from "../config/apiEnv";

const DEFAULTS = {
  cart: {
    heading: "Your Fitting Room",
    empty_title: "Your fitting room is empty",
    empty_body: "Browse our catalogue to add gowns to your fitting room.",
    checkout_label: "Proceed to Checkout",
    promo_banner: "",
  },
  "fitting-room": {
    heading: "My Fitting Room",
    subheading: "Scan, find your size, discover styles, and try on gowns virtually.",
  },
};

export async function fetchCmsSection(section) {
  const key = String(section || "").trim();
  if (!key) return DEFAULTS.cart;
  try {
    const url = `${String(API_BASE_URL).replace(/\/+$/, "")}/api/cms/content?section=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.fields) {
      return { ...(DEFAULTS[key] || {}), ...data.fields };
    }
  } catch {
    // use defaults
  }
  return DEFAULTS[key] || {};
}
