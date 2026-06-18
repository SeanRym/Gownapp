export const MEASUREMENT_BOUNDS = {
  bust: [50, 200],
  waist: [40, 180],
  hips: [50, 200],
  height: [100, 250],
  weight: [30, 300],
};

export function validateMeasurementField(key, value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Must be a number";
  const bounds = MEASUREMENT_BOUNDS[key];
  if (bounds && (n < bounds[0] || n > bounds[1])) {
    return `${bounds[0]}–${bounds[1]}`;
  }
  return null;
}

export function sizeMatchConfidence(score) {
  if (score == null) return { pct: 0, color: "#E24B4A" };
  const pct = Math.min(95, Math.max(10, Math.round(100 - score * 3)));
  const color = pct >= 75 ? "#1D9E75" : pct >= 55 ? "#EF9F27" : "#E24B4A";
  return { pct, color };
}
