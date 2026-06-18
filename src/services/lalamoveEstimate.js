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
    baseFare: 24,
    rate3to5: 9,
    rateAfter: 5,
    minFee: 50,
  },
  {
    id: "sedan",
    label: "200kg Sedan",
    labelShort: "Sedan",
    baseFare: 100,
    rate3to5: 18,
    rateAfter: 15,
    minFee: 118,
  },
  {
    id: "suv",
    label: "300kg Small Crossover SUV",
    labelShort: "Crossover SUV",
    baseFare: 150,
    rate3to5: 22,
    rateAfter: 18,
    minFee: 172,
  },
];

export const DEFAULT_LALAMOVE_VEHICLE = "sedan";

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
  const coords = await geocodeAddressPH(address);
  if (!coords) return { ok: false, fee: 0, reason: "geocode_failed" };
  const distKm = haversineKm(STORE_LAT, STORE_LNG, coords.lat, coords.lng);
  const fee = estimateShippingFee(distKm, vehicleId);
  return { ok: true, fee, distKm };
}

