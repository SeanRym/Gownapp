/**
 * Same gown body-fit math as gownweb TryOnCamera / fitting-room getGownLayout.
 * Landmarks are in pixel coordinates (matching mirrored preview space).
 */

const CONF = 0.25;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pt(lm, name) {
  const p = lm?.[name];
  if (!p || typeof p.x !== "number" || typeof p.y !== "number") return null;
  const score = p.score ?? 1;
  return { x: p.x, y: p.y, score };
}

/** Normalized landmarks (0–1) → pixel keypoints for layout. */
export function landmarksToPixelKps(lm, vw, vh) {
  if (!lm || !vw || !vh) return null;
  const map = (name) => {
    const p = lm[name];
    if (!p) return null;
    return { x: p.x * vw, y: p.y * vh, score: p.score ?? 1 };
  };
  return {
    nose: map("nose"),
    leftShoulder: map("leftShoulder"),
    rightShoulder: map("rightShoulder"),
    leftHip: map("leftHip"),
    rightHip: map("rightHip"),
    leftKnee: map("leftKnee"),
    rightKnee: map("rightKnee"),
    leftAnkle: map("leftAnkle"),
    rightAnkle: map("rightAnkle"),
  };
}

export function analyzeTryonPose(kps, vw, vh) {
  const ls = kps?.leftShoulder;
  const rs = kps?.rightShoulder;
  const lh = kps?.leftHip;
  const rh = kps?.rightHip;
  const shouldersOk = ls && rs && (ls.score ?? 1) > CONF && (rs.score ?? 1) > CONF;
  const hipsOk = lh && rh && (lh.score ?? 1) > CONF && (rh.score ?? 1) > CONF;
  const margin = vw * 0.08;
  const tooClose =
    shouldersOk &&
    (ls.x < margin || rs.x > vw - margin || (hipsOk && mid(lh, rh).y > vh * 0.72));
  const issues = [];
  if (!shouldersOk) issues.push("no_shoulders");
  if (!hipsOk) issues.push("no_hips");
  if (tooClose) issues.push("too_close");
  return { shouldersOk, hipsOk, issues, ok: shouldersOk && hipsOk && issues.length === 0 };
}

/**
 * @param {object} kps - pixel keypoints (leftShoulder, rightShoulder, …)
 * @param {object} cal - tryonCalibration from admin (necklineY, hemY, shoulderPad, skirtFlare)
 */
export function getGownLayout(kps, cal = {}, vw = 640, vh = 480) {
  const ls = pt(kps, "leftShoulder");
  const rs = pt(kps, "rightShoulder");
  const lh = pt(kps, "leftHip");
  const rh = pt(kps, "rightHip");
  const lk = pt(kps, "leftKnee");
  const rk = pt(kps, "rightKnee");
  const la = pt(kps, "leftAnkle");
  const ra = pt(kps, "rightAnkle");

  if ([ls, rs, lh, rh].some((k) => !k || (k.score ?? 1) < CONF)) return null;

  const sm = mid(ls, rs);
  const hm = mid(lh, rh);
  const torsoH = hm.y - sm.y;
  if (torsoH < 8) return null;

  const rawSw = dist(ls, rs);
  const sw = Math.min(Math.max(rawSw, vw * 0.28), vw * 0.8);
  const rawHw = dist(lh, rh);
  const hw = Math.max(rawHw, sw * 0.9);

  const neckOff = cal.necklineY ?? 0.18;
  const topY = sm.y - torsoH * neckOff;

  let bottomY;
  if (la && ra && (la.score ?? 1) > CONF && (ra.score ?? 1) > CONF) {
    bottomY = Math.max(la.y, ra.y) + torsoH * 0.15;
  } else if (lk && rk && (lk.score ?? 1) > CONF && (rk.score ?? 1) > CONF) {
    const km = mid(lk, rk);
    const legH = km.y - hm.y;
    bottomY = km.y + legH * 1.1;
  } else {
    bottomY = sm.y + torsoH * 4.8;
  }

  if (cal.hemY != null) {
    const fullH = sm.y + torsoH * 4.8 - topY;
    bottomY = topY + fullH * cal.hemY;
  }

  const shoulderPad = cal.shoulderPad ?? 1.45;
  const skirtFlare = cal.skirtFlare ?? 1.2;
  const topW = sw * shoulderPad;
  const botW = Math.max(hw * 1.55, topW) * skirtFlare;
  const cx = (sm.x + hm.x) / 2;

  return { topY, bottomY, cx, topW, botW, torsoH };
}

export function smoothGownLayout(prev, next, t = 0.35) {
  if (!next) return prev;
  if (!prev) return next;
  const lerp = (a, b) => a + (b - a) * t;
  return {
    topY: lerp(prev.topY, next.topY),
    bottomY: lerp(prev.bottomY, next.bottomY),
    cx: lerp(prev.cx, next.cx),
    topW: lerp(prev.topW, next.topW),
    botW: lerp(prev.botW, next.botW),
    torsoH: lerp(prev.torsoH, next.torsoH),
  };
}

export function parseTryonCalibration(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveTryonImageUri(gown, facingBack = false) {
  if (!gown) return "";
  if (facingBack && gown.tryonImageBack) return gown.tryonImageBack;
  return gown.tryonImage || gown.image || "";
}
