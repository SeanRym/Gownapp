import { API_BASE_URL } from "../config/apiEnv";

// Keep these values aligned with gownweb `app/checkout/page.jsx`
const STORE_LAT = 14.5995;
const STORE_LNG = 120.9842;
const ROAD_MULTIPLIER = 1.6;
const DAYTIME_FACTOR = 1.25;

export const LALAMOVE_VEHICLES = [
  {
    id: "motorcycle",
    label: "Motorcycle",
    labelShort: "Motorcycle",
    subtitle: "Up to 20 kg — small parcels only",
    badge: "available",
    iconName: "motorbike",
    baseFare: 24,
    rate3to5: 9,
    rateAfter: 5,
    minFee: 50,
  },
  {
    id: "sedan",
    label: "200kg Sedan",
    labelShort: "Sedan",
    subtitle: "Up to 200 kg — recommended for gown orders",
    badge: "recommended",
    iconName: "car",
    baseFare: 100,
    rate3to5: 18,
    rateAfter: 15,
    minFee: 118,
  },
  {
    id: "suv",
    label: "300kg Small Crossover SUV",
    labelShort: "Crossover SUV",
    subtitle: "Up to 300 kg — bulk or 5+ gown orders",
    badge: null,
    iconName: "car-sports-utility-vehicle",
    baseFare: 150,
    rate3to5: 22,
    rateAfter: 18,
    minFee: 172,
  },
];

export const DEFAULT_LALAMOVE_VEHICLE = "sedan";

/** Matches gownweb checkout business tax (3% of subtotal + shipping). */
export const BUSINESS_TAX_RATE = 0.03;

export function calculateBusinessTax(subtotal, shippingFee = 0) {
  const base = Math.max(0, Number(subtotal) || 0) + Math.max(0, Number(shippingFee) || 0);
  return Math.round(base * BUSINESS_TAX_RATE);
}

export const MOTORCYCLE_DELIVERY_WARNING =
  "Motorcycle can only carry lightweight parcels (up to 20 kg). Suitable for a single light accessory — not recommended for gowns.";

/** Matches gownweb checkout vehicle hint copy (uses cart line count, not total qty). */
export function getLalamoveVehicleHint(itemCount = 1) {
  const count = Math.max(1, Number(itemCount) || 1);
  if (count > 5) {
    return `You have ${count} items — a Crossover SUV is recommended.`;
  }
  if (count === 1) {
    return "Single item — Sedan is recommended. Motorcycle available for lightweight accessories only.";
  }
  return `${count} items — Sedan is recommended.`;
}

/** Dynamic badge tags — aligned with gownweb checkout `getTag`. */
export function getLalamoveVehicleTag(itemCount, vehicleId) {
  const count = Math.max(1, Number(itemCount) || 1);
  if (count <= 1 && vehicleId === "motorcycle") {
    return { label: "Available", style: "neutral" };
  }
  if (count <= 5 && vehicleId === "sedan") {
    return { label: "Recommended", style: "good" };
  }
  if (count > 5 && vehicleId === "suv") {
    return { label: "Recommended", style: "good" };
  }
  if (count > 1 && vehicleId === "motorcycle") {
    return { label: "Not recommended", style: "warn" };
  }
  return null;
}

/** Auto-select vehicle from cart line count — matches gownweb checkout. */
export function pickDefaultLalamoveVehicle(itemCount = 1) {
  const count = Math.max(1, Number(itemCount) || 1);
  if (count > 5) return "suv";
  return DEFAULT_LALAMOVE_VEHICLE;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateShippingFee(distanceKm, vehicleId = DEFAULT_LALAMOVE_VEHICLE) {
  const v = LALAMOVE_VEHICLES.find((x) => x.id === vehicleId) || LALAMOVE_VEHICLES[1];
  const roadKm = distanceKm * ROAD_MULTIPLIER;
  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 6;
  const surge = isNight ? 1.2 : DAYTIME_FACTOR;

  const km3to5 = Math.max(0, Math.min(roadKm - 3, 2));
  const kmAfter = Math.max(0, roadKm - 5);

  const raw = (v.baseFare + km3to5 * v.rate3to5 + kmAfter * v.rateAfter) * surge;
  return Math.max(v.minFee, Math.ceil(raw / 5) * 5);
}

function flatFallbackFees() {
  const flat = { motorcycle: 100, sedan: 250, suv: 300 };
  const fees = {};
  for (const v of LALAMOVE_VEHICLES) {
    fees[v.id] = flat[v.id] ?? 250;
  }
  return fees;
}

/** Compute Lalamove estimates for every vehicle from one geocode (matches web checkout). */
export async function estimateAllLalamoveFeesFromAddress(address) {
  const coords = await geocodeAddressPH(address);
  if (!coords) {
    return { ok: false, fees: flatFallbackFees(), reason: "geocode_failed", usedFallback: true };
  }
  const distKm = haversineKm(STORE_LAT, STORE_LNG, coords.lat, coords.lng);
  const fees = {};
  for (const v of LALAMOVE_VEHICLES) {
    fees[v.id] = estimateShippingFee(distKm, v.id);
  }
  return { ok: true, fees, distKm, usedFallback: false };
}

export async function geocodeAddressPH(address) {
  const clean = String(address || "").trim();
  if (!clean) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: clean }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data?.noKey) return null;
    if (!res.ok || !data?.ok) return null;
    if (!data?.found) return null;
    return { lat: Number(data.lat), lng: Number(data.lng) };
  } catch {
    return null;
  }
}

export async function estimateLalamoveFeeFromAddress(address, vehicleId = DEFAULT_LALAMOVE_VEHICLE) {
  const result = await estimateAllLalamoveFeesFromAddress(address);
  const fee = Number(result?.fees?.[vehicleId] ?? 0);
  if (!result.ok) {
    return { ok: false, fee, reason: result.reason || "geocode_failed", usedFallback: true };
  }
  return { ok: true, fee, distKm: result.distKm, fees: result.fees };
}

