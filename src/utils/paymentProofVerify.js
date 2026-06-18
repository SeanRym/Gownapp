/**
 * Payment proof validation — aligned with gownweb `app/order-confirmation/[id]/page.jsx`
 */

const GCASH_PATTERN = /^\d[\d\s]{10,14}\d$/;
const BDO_FT = /^FT-\d{8}-\d{6,10}$/i;
const BDO_PC = /^(?:MA_)?PC-\d{8}-\d{6,10}$/i;
const BDO_NUMERIC = /^\d{10,18}$/;

function stripSpaces(s) {
  return String(s || "").replace(/\s+/g, "");
}

export function validateReferenceNumber(refNo, paymentMethod) {
  const raw = String(refNo || "").trim();
  const compact = stripSpaces(raw);
  if (!raw) return { valid: true, warning: null };

  if (paymentMethod === "gcash") {
    const digits = compact.replace(/\D/g, "");
    if (digits.length === 13 && GCASH_PATTERN.test(raw)) return { valid: true, warning: null };
    if (digits.length !== 13) {
      return { valid: false, warning: `GCash reference numbers are 13 digits. You entered ${digits.length}.` };
    }
    if (/[a-zA-Z]/.test(compact)) {
      return { valid: false, warning: "GCash reference numbers contain digits only — no letters." };
    }
    return { valid: true, warning: null };
  }

  if (paymentMethod === "bdo") {
    if (BDO_FT.test(compact) || BDO_PC.test(compact) || BDO_NUMERIC.test(compact)) {
      return { valid: true, warning: null };
    }
    if (/^\d{13}$/.test(compact)) {
      return { valid: false, warning: "This looks like a GCash number. BDO refs look like FT-YYYYMMDD-NNNNNNNN." };
    }
    return { valid: false, warning: "BDO reference numbers look like FT-20240315-12345678 or PC-20240315-12345678." };
  }

  return { valid: true, warning: null };
}

/** Signal 1 — structural heuristics from image dimensions (0–30). */
export function scoreStructuralFromDimensions(width, height) {
  let score = 0;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return 0;

  const ratio = h / w;
  if (ratio >= 1.5 && ratio <= 2.8) score += 12;
  else if (ratio >= 1.0 && ratio <= 3.5) score += 6;

  const area = w * h;
  if (area >= 80_000 && area <= 4_000_000) score += 8;
  else if (area >= 40_000) score += 3;

  // Mobile screenshots are usually portrait with light UI backgrounds.
  if (ratio >= 1.4) score += 10;
  else if (ratio >= 1.0) score += 5;

  return Math.min(score, 30);
}

/**
 * verifyPaymentImage — same thresholds as web checkout.
 * OCR/visual API signals are optional; structural scoring drives client-side checks.
 */
export async function verifyPaymentImage(dataUrl, paymentMethod, dimensions = null) {
  const FAIL_OPEN = {
    verdict: "pass",
    score: 50,
    message: "Image check unavailable — you may proceed.",
    canOverride: false,
  };

  try {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { ...FAIL_OPEN, verdict: "warn", message: "Could not read image data." };
    }

    const mediaType = match[1];
    const supported = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!supported.includes(mediaType)) {
      return {
        verdict: "reject",
        score: 0,
        message: "Please upload a JPEG or PNG file.",
        canOverride: false,
      };
    }

    const structuralScore = dimensions
      ? scoreStructuralFromDimensions(dimensions.width, dimensions.height)
      : 0;

    const totalScore = structuralScore;
    const methodLabel = paymentMethod === "gcash" ? "GCash" : "BDO";

    if (totalScore >= 55) {
      return {
        verdict: "pass",
        score: totalScore,
        message: "Image looks like a valid payment screenshot.",
        canOverride: false,
      };
    }

    if (totalScore >= 30) {
      return {
        verdict: "warn",
        score: totalScore,
        message: `Image may not be a ${methodLabel} payment screenshot — check that it shows the transaction confirmation screen. You can still submit if this is correct.`,
        canOverride: true,
      };
    }

    return {
      verdict: "reject",
      score: totalScore,
      message: `This doesn't look like a ${methodLabel} payment confirmation. Please upload a screenshot of your ${methodLabel} transaction success screen. You can still proceed if you believe this is correct.`,
      canOverride: true,
    };
  } catch {
    return FAIL_OPEN;
  }
}

export function verdictStyles(verdict) {
  if (verdict === "pass") {
    return { color: "#0F6E56", bg: "rgba(29,158,117,0.08)", border: "rgba(29,158,117,0.25)" };
  }
  if (verdict === "warn") {
    return { color: "#854F0B", bg: "rgba(239,159,39,0.09)", border: "rgba(239,159,39,0.30)" };
  }
  if (verdict === "reject") {
    return { color: "#791F1F", bg: "rgba(226,75,74,0.09)", border: "rgba(226,75,74,0.30)" };
  }
  return null;
}
