/**
 * ML Kit landmarks → portrait-up measurement space → preview overlay (mirrored for front camera).
 */
import { mapLandmarkToPreview } from "./posePreviewMap";

function cloneLm(lm) {
  const out = {};
  for (const [k, p] of Object.entries(lm)) {
    if (p) out[k] = { ...p };
  }
  return out;
}

export function rotateLandmarksCCW(lm) {
  const out = {};
  for (const [k, p] of Object.entries(lm)) {
    if (!p) continue;
    out[k] = { ...p, x: p.y, y: 1 - p.x };
  }
  return out;
}

export function rotateLandmarksCW(lm) {
  const out = {};
  for (const [k, p] of Object.entries(lm)) {
    if (!p) continue;
    out[k] = { ...p, x: 1 - p.y, y: p.x };
  }
  return out;
}

export function mirrorLandmarksX(lm) {
  const out = {};
  for (const [k, p] of Object.entries(lm)) {
    if (!p) continue;
    out[k] = { ...p, x: 1 - p.x };
  }
  return out;
}

function bodyVerticalScore(lm) {
  const pts = Object.values(lm).filter(Boolean);
  if (pts.length < 3) return 0;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return spanY / Math.max(spanX, 0.02);
}

function uprightScore(lm) {
  const nose = lm.nose;
  const la = lm.leftAnkle;
  const ra = lm.rightAnkle;
  const lk = lm.leftKnee;
  const rk = lm.rightKnee;
  const foot = la && ra ? Math.max(la.y, ra.y) : lk && rk ? Math.max(lk.y, rk.y) : null;
  if (!nose || foot == null) return 0.5;
  return foot > nose.y ? 1 : 0;
}

function transformScore(lm) {
  return bodyVerticalScore(lm) * 2 + uprightScore(lm) * 3;
}

function pickBestRotation(lm) {
  const candidates = [
    { lm, label: "none" },
    { lm: rotateLandmarksCCW(lm), label: "ccw" },
    { lm: rotateLandmarksCW(lm), label: "cw" },
  ];
  let best = candidates[0];
  let bestScore = transformScore(best.lm);
  for (let i = 1; i < candidates.length; i += 1) {
    const s = transformScore(candidates[i].lm);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return best;
}

/** Only rotate when the ML image buffer is landscape — avoids skeleton beside the body. */
export function canonicalizePoseLandmarks(lm, imageWidth, imageHeight) {
  if (!lm) return { landmarks: null, imageWidth, imageHeight };

  let out = cloneLm(lm);
  let w = imageWidth;
  let h = imageHeight;

  if (w > h * 1.05) {
    const best = pickBestRotation(out);
    out = best.lm;
    if (best.label === "ccw" || best.label === "cw") [w, h] = [h, w];
  }

  return { landmarks: out, imageWidth: w, imageHeight: h };
}

/** Skeleton forms a vertical person (not a sideways blob). */
export function poseBodyCoherent(lm) {
  const ls = lm?.leftShoulder;
  const rs = lm?.rightShoulder;
  const lh = lm?.leftHip;
  const rh = lm?.rightHip;
  if (!ls || !rs || !lh || !rh) return false;

  const sm = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hm = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  if (sm.y >= hm.y) return false;

  const shoulderW = Math.abs(rs.x - ls.x);
  const torsoH = hm.y - sm.y;
  if (torsoH < 0.08 || shoulderW < 0.06) return false;
  if (torsoH < shoulderW * 0.85) return false;

  const nose = lm.nose;
  if (nose) {
    if (nose.y > sm.y + 0.02) return false;
    if (Math.abs(nose.x - sm.x) > shoulderW * 0.55) return false;
  }

  if (Math.abs(sm.x - hm.x) > 0.1) return false;
  return true;
}

function screenAlignmentScore(mapped) {
  if (!mapped) return -1;
  const ls = mapped.leftShoulder;
  const rs = mapped.rightShoulder;
  const lh = mapped.leftHip;
  const rh = mapped.rightHip;
  const nose = mapped.nose;
  if (!ls || !rs || !lh || !rh) return -1;

  let score = 0;
  const minSx = Math.min(ls.x, rs.x);
  const maxSx = Math.max(ls.x, rs.x);
  const smY = (ls.y + rs.y) / 2;
  const hmY = (lh.y + rh.y) / 2;

  if (smY < hmY) score += 3;
  if (lh.y < rh.y + 0.5 && rh.y < lh.y + 0.5) score += 1;
  if (nose) {
    if (nose.y < smY) score += 2;
    if (nose.x >= minSx - 20 && nose.x <= maxSx + 20) score += 3;
  }

  const midX = (minSx + maxSx) / 2;
  const spanX = maxSx - minSx;
  if (spanX > 20) score += 1;
  if (Math.abs(midX - (lh.x + rh.x) / 2) < spanX * 0.35) score += 1;

  return score;
}

/**
 * Pick mirrored or not so overlay lines sit on the body in the Camera preview.
 */
export function pickDisplayLandmarks(
  measureLm,
  layoutW,
  layoutH,
  imageW,
  imageH,
  facing,
  resizeMode = "contain"
) {
  if (!measureLm || !layoutW || !layoutH || !imageW || !imageH) return null;

  const tries =
    facing === "front"
      ? [
          { mirrorX: false, lm: cloneLm(measureLm) },
          { mirrorX: true, lm: mirrorLandmarksX(measureLm) },
        ]
      : [{ mirrorX: false, lm: cloneLm(measureLm) }];

  let best = tries[0].lm;
  let bestScore = -1;

  for (const t of tries) {
    const mapped = mapLandmarkToPreview(t.lm, layoutW, layoutH, imageW, imageH, resizeMode);
    const s = screenAlignmentScore(mapped);
    if (s > bestScore) {
      bestScore = s;
      best = t.lm;
    }
  }

  return best;
}

export function toDisplayLandmarks(measureLm, { mirrorX = false } = {}) {
  if (!measureLm) return null;
  return mirrorX ? mirrorLandmarksX(measureLm) : cloneLm(measureLm);
}

export function resolvePreviewMapSize(canonicalW, canonicalH) {
  return { mapWidth: canonicalW, mapHeight: canonicalH };
}
