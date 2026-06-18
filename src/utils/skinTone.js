/**
 * Skin tone & undertone detection (ported from gownweb/utils/skinTone.js)
 */

export const TONE_BUCKETS = [
  { id: "fair", label: "Fair", hex: "#F8E8D8", brightnessMin: 210 },
  { id: "light", label: "Light", hex: "#F0D0A8", brightnessMin: 185 },
  { id: "medium", label: "Medium", hex: "#D4956A", brightnessMin: 148 },
  { id: "olive", label: "Olive", hex: "#B8804A", brightnessMin: 120 },
  { id: "tan", label: "Tan", hex: "#9A6438", brightnessMin: 92 },
  { id: "deep", label: "Deep", hex: "#6B3E26", brightnessMin: 60 },
  { id: "ebony", label: "Ebony", hex: "#3D1F10", brightnessMin: 0 },
];

export function detectSkinToneFromPixels(r, g, b) {
  const brightness = r * 0.299 + g * 0.587 + b * 0.114;
  for (const bucket of TONE_BUCKETS) {
    if (brightness >= bucket.brightnessMin) {
      if (bucket.id === "medium") {
        const rednessRatio = r / Math.max(g, 1);
        if (rednessRatio < 1.15) return "olive";
      }
      return bucket.id;
    }
  }
  return "ebony";
}

export function detectUndertone(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 12) return "neutral";
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  const h = ((hue * 60) + 360) % 360;
  if (h < 50 || h >= 330) return "warm";
  if (h >= 270) return "cool";
  if (h >= 160 && h < 220) return "cool";
  return "neutral";
}

const PATCH_HALF = 12;

/** Sample RGBA JPEG/PNG buffer at pixel center (cx, cy). */
export function sampleFaceRegionFromRgba(data, width, height, cx, cy) {
  const px = Math.max(0, Math.min(Math.round(cx) - PATCH_HALF, width - PATCH_HALF * 2));
  const py = Math.max(0, Math.min(Math.round(cy) - PATCH_HALF, height - PATCH_HALF * 2));
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let n = 0;
  const w = PATCH_HALF * 2;
  const h = PATCH_HALF * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ix = px + x;
      const iy = py + y;
      const i = (iy * width + ix) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      if (luma < 20 || luma > 240) continue;
      rSum += r;
      gSum += g;
      bSum += b;
      n++;
    }
  }
  if (n < 10) return null;
  return { r: rSum / n, g: gSum / n, b: bSum / n };
}

export function detectSkinProfileFromRgba(data, width, height, noseX, noseY) {
  if (noseX == null || noseY == null) return null;
  const sample = sampleFaceRegionFromRgba(data, width, height, noseX, noseY);
  if (!sample) return null;
  const { r, g, b } = sample;
  return {
    skinTone: detectSkinToneFromPixels(r, g, b),
    undertone: detectUndertone(r, g, b),
  };
}
