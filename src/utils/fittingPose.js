import { CAMERA_MULTS, recommendSize } from "../constants/sizeConstants";

function dist(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function iqm(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const lo = Math.floor(s.length * 0.2);
  const hi = Math.ceil(s.length * 0.8);
  const trimmed = s.slice(lo, hi);
  return trimmed.length ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : s[0];
}

/** Body shape from normalized pose landmarks (0–1). */
export function detectBodyShapeFromLandmarks(lm) {
  const ls = lm.leftShoulder;
  const rs = lm.rightShoulder;
  const lh = lm.leftHip;
  const rh = lm.rightHip;
  if (!ls || !rs || !lh || !rh) return null;

  const shoulderW = dist(ls, rs);
  const hipW = dist(lh, rh);
  const sm = mid(ls, rs);
  const hm = mid(lh, rh);
  const torsoH = hm.y - sm.y;
  if (torsoH <= 0.02) return null;

  const waistProxy = shoulderW * 0.72;
  const sToH = shoulderW / Math.max(hipW, 0.01);
  const wToH = waistProxy / Math.max(hipW, 0.01);
  const frameH = torsoH * 4.5;
  const heightFraction = torsoH / Math.max(frameH, 0.01);

  if (heightFraction < 0.19) return "petite";
  if (sToH > 1.18) return "invertedTriangle";
  if (sToH < 0.83) return "pear";
  if (wToH > 0.9 && sToH > 0.93) return "rectangle";
  if (wToH < 0.78) return "hourglass";
  if (wToH > 0.88 && sToH < 0.93) return "apple";
  return "rectangle";
}

export function analyzePoseLandmarks(lm) {
  const issues = [];
  if (!lm?.leftShoulder || !lm?.rightShoulder) {
    return { ok: false, issues: ["no_shoulders"] };
  }
  if (!lm?.leftHip || !lm?.rightHip) {
    return { ok: false, issues: ["no_hips"] };
  }
  const shoulderSpan = dist(lm.leftShoulder, lm.rightShoulder);
  if (shoulderSpan < 0.1) issues.push("too_close");
  if (lm.leftShoulder.y > 0.72 || lm.rightShoulder.y > 0.72) issues.push("too_close");
  const shoulderTilt = Math.abs(lm.leftShoulder.y - lm.rightShoulder.y);
  if (shoulderTilt > 0.04) issues.push("tilted");
  return { ok: issues.length === 0, issues };
}

/**
 * Estimate bust/waist/hips (cm) from normalized landmarks + optional height cm.
 */
export function estimateMeasurementsFromLandmarks(lm, { heightCm = null, segment = "women", bodyShape = null } = {}) {
  const analysis = analyzePoseLandmarks(lm);
  if (!analysis.ok) return { ok: false, error: analysis.issues[0] || "pose_not_ready" };

  const ls = lm.leftShoulder;
  const rs = lm.rightShoulder;
  const lh = lm.leftHip;
  const rh = lm.rightHip;
  const nose = lm.nose;

  const previewH = 1;
  const shoulderPx = dist(ls, rs) * previewH;
  const hipPx = dist(lh, rh) * previewH;
  const torsoPx = (mid(lh, rh).y - mid(ls, rs).y) * previewH;

  let pxPerCm;
  if (heightCm && nose) {
    const ankleY = Math.max(lm.leftHip?.y || 0, lm.rightHip?.y || 0) + 0.35;
    const fullPx = (ankleY - nose.y) * previewH;
    pxPerCm = fullPx > 0.05 ? fullPx / heightCm : torsoPx / CAMERA_MULTS.torsoAnchorCm;
  } else {
    pxPerCm = torsoPx / CAMERA_MULTS.torsoAnchorCm;
  }

  if (!pxPerCm || pxPerCm <= 0) return { ok: false, error: "scale_failed" };

  const bust = Math.round((shoulderPx / pxPerCm) * CAMERA_MULTS.bust);
  const waist = Math.round((shoulderPx / pxPerCm) * CAMERA_MULTS.waist);
  const hips = Math.round((hipPx / pxPerCm) * CAMERA_MULTS.hip);
  const computedBodyShape = bodyShape ?? detectBodyShapeFromLandmarks(lm);

  const sizeRec = recommendSize(segment, { bust, waist, hips });

  return {
    ok: true,
    bust,
    waist,
    hips,
    bodyShape: computedBodyShape,
    sizeRec,
    confidence: Math.min(95, 55 + (analysis.ok ? 25 : 0)),
  };
}
