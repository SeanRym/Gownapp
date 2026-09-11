import { API_BASE_URL } from "../config/apiEnv";

/**
 * Same gown body-fit math as gownweb TryOnCamera / fitting-room getGownLayout.
 * Landmarks are in pixel coordinates (matching mirrored preview space).
 */

function normalizeRemoteAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|file:|content:|ph:|assets-library:)/i.test(raw)) return raw;
  return `${String(API_BASE_URL).replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
}

// MoveNet keypoint confidence threshold.
// Web version uses 0.45, but native Android TFLite Lightning model returns slightly lower scores (0.35-0.45).
// Lowered to 0.35 to allow mobile detection while still filtering jittery frames.
const CONF = 0.3;

function resolveShapeDefaults(cal = {}) {
  const raw = String(cal?.silhouette || cal?.shape || cal?.gownShape || cal?.style || "").trim();
  const shapeKey = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  const ballLabels = [
    "ballgown",
    "ball gown",
    "full skirt",
    "princess",
    "princess ballgown",
    "princess gown",
    "ballgown princess",
    "ballgown gown",
  ];
  const mermaidLabels = [
    "mermaid",
    "mermaid gown",
    "trumpet",
    "fishtail",
    "mermaid silhouette",
  ];
  const alineLabels = [
    "a line",
    "a-line",
    "aline",
    "a line gown",
    "aline gown",
    "a line silhouette",
  ];
  const sheathLabels = [
    "sheath",
    "column",
    "column gown",
    "slip",
    "bodycon",
    "fit and flare",
    "fit flare",
    "fit-and-flare",
    "fit and flare gown",
    "fit flare gown",
    "fitted gown",
  ];
  const suitLabels = [
    "suit",
    "jacket",
    "pantsuit",
    "dress suit",
    "minimal suit",
  ];

  if (ballLabels.some((label) => shapeKey.includes(label))) {
    return {
      necklineY: 0.165,
      shoulderPad: 1.58,
      skirtFlare: 1.56,
      fitScale: 1.12,
      imageAspectRatio: 0.82,
      offsetY: -10,
      offsetX: 0,
    };
  }

  if (mermaidLabels.some((label) => shapeKey.includes(label))) {
    return {
      necklineY: 0.19,
      shoulderPad: 1.35,
      skirtFlare: 1.22,
      fitScale: 1.02,
      imageAspectRatio: 0.74,
      offsetY: -2,
      offsetX: 0,
    };
  }

  if (alineLabels.some((label) => shapeKey.includes(label))) {
    return {
      necklineY: 0.18,
      shoulderPad: 1.4,
      skirtFlare: 1.33,
      fitScale: 1.04,
      imageAspectRatio: 0.77,
      offsetY: 0,
      offsetX: 0,
    };
  }

  if (sheathLabels.some((label) => shapeKey.includes(label))) {
    return {
      necklineY: 0.205,
      shoulderPad: 1.24,
      skirtFlare: 1.08,
      fitScale: 0.96,
      imageAspectRatio: 0.7,
      offsetY: 3,
      offsetX: 0,
    };
  }

  if (suitLabels.some((label) => shapeKey.includes(label))) {
    return {
      necklineY: 0.16,
      shoulderPad: 1.18,
      skirtFlare: 1.14,
      fitScale: 0.93,
      imageAspectRatio: 0.74,
      offsetY: 2,
      offsetX: 0,
    };
  }

  return {
    necklineY: 0.18,
    shoulderPad: 1.2,
    skirtFlare: 1.3,
    fitScale: 1,
    imageAspectRatio: 0.7,
    offsetY: 0,
    offsetX: 0,
  };
}

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

/**
 * Convert pose landmarks to pixel keypoints for layout.
 *
 * Web version receives landmarks in screen-space pixels already, not normalized 0..1 values.
 * Some inputs are normalized (raw MLKit), others are already mapped to preview pixels.
 * This keeps both working and prevents double-scaling the shoulders/hip center.
 */
export function landmarksToPixelKps(lm, vw, vh) {
  if (!lm || !vw || !vh) return null;

  if (Array.isArray(lm)) {
    const keys = {
      0: "nose",
      5: "leftShoulder",
      6: "rightShoulder",
      11: "leftHip",
      12: "rightHip",
      13: "leftKnee",
      14: "rightKnee",
      15: "leftAnkle",
      16: "rightAnkle",
    };
    const out = {};
    Object.entries(keys).forEach(([idx, name]) => {
      const p = lm[Number(idx)];
      if (!p) return;
      const x = Number(p.x ?? 0);
      const y = Number(p.y ?? 0);
      const isNormalized = x >= 0 && x <= 1.5 && y >= 0 && y <= 1.5;
      out[name] = {
        x: isNormalized ? x * vw : x,
        y: isNormalized ? y * vh : y,
        score: p.score ?? 1,
      };
    });
    return out;
  }

  const map = (name) => {
    const p = lm[name];
    if (!p) return null;
    const x = Number(p.x ?? 0);
    const y = Number(p.y ?? 0);
    const isNormalized = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    return {
      x: isNormalized ? x * vw : x,
      y: isNormalized ? y * vh : y,
      score: p.score ?? 1,
    };
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

/**
 * analyzeTryonPose — exact copy of web's analyzePose() logic.
 * Evaluates pose quality including tilt/rotation checks.
 * Web version is proven to work correctly, so we use it as-is.
 */
export function analyzeTryonPose(kps, vw, vh) {
  if (!kps) return { ok: false, issues: ["no_pose"], shouldersOk: false, hipsOk: false, facingBack: false };

  const ls = kps?.leftShoulder;
  const rs = kps?.rightShoulder;
  const lh = kps?.leftHip;
  const rh = kps?.rightHip;
  const lk = kps?.leftKnee;
  const rk = kps?.rightKnee;
  const la = kps?.leftAnkle;
  const ra = kps?.rightAnkle;
  const nose = kps?.nose;

  const issues = [];

  // Check point validity against confidence threshold
  const shouldersOk = ls?.score > CONF && rs?.score > CONF;
  const hipsOk = lh?.score > CONF && rh?.score > CONF;
  const kneesOk = lk?.score > CONF && rk?.score > CONF;
  const anklesOk = la?.score > CONF && ra?.score > CONF;

  const margin = vw * 0.08;
  const tooCloseFrame =
    shouldersOk &&
    (ls.x < margin || rs.x > vw - margin || (hipsOk && mid(lh, rh).y > vh * 0.72));

  const faceVisible = nose && nose.score > 0.3;
  const bodyStable = shouldersOk && hipsOk;
  const shoulderSpan = shouldersOk ? dist(ls, rs) : 0;
  const bodyWideEnough = shoulderSpan > vw * 0.1;
  const facingBack = !faceVisible && bodyStable && bodyWideEnough && !tooCloseFrame;

  // Early return — can't assess tilt/rotation without shoulders and hips
  if (!shouldersOk) {
    issues.push("no_shoulders");
    return { ok: false, issues, shouldersOk, hipsOk, kneesOk, anklesOk, facingBack };
  }
  if (!hipsOk) {
    issues.push("no_hips");
    return { ok: false, issues, shouldersOk, hipsOk, kneesOk, anklesOk, facingBack };
  }

  // Tilt / rotation checks (require both shoulders and hips) — WEB LOGIC
  const shoulderTilt = Math.abs(ls.y - rs.y);
  const hipTilt = Math.abs(lh.y - rh.y);
  const torsoOffset = Math.abs(mid(ls, rs).x - mid(lh, rh).x);

  if (shoulderTilt > vh * 0.035 || hipTilt > vh * 0.04) issues.push("tilted");
  if (torsoOffset > vw * 0.06) issues.push("rotated");

  if (!kneesOk) issues.push("no_legs");
  if (tooCloseFrame) issues.push("too_close");
  if (nose?.score > 0.15 && nose.y < vh * 0.06) issues.push("head_cut");

  // If hips are very low in frame and knees aren't visible, subject is too close
  if (!kneesOk && hipsOk && mid(lh, rh).y > vh * 0.55 && !tooCloseFrame) {
    issues.unshift("too_close");
  }
  if (kneesOk && !anklesOk && mid(lk, rk).y < vh * 0.82) {
    issues.push("too_close");
  }

  const ok = shouldersOk && hipsOk && issues.length === 0;
  return { ok, issues, shouldersOk, hipsOk, kneesOk, anklesOk, facingBack };
}

/**
 * @param {object} kps - pixel keypoints (leftShoulder, rightShoulder, …)
 * @param {object} cal - tryonCalibration from admin (necklineY, hemY, shoulderPad, skirtFlare)
 */
export function getGownLayout(kps, cal = {}, vw = 640, vh = 480) {
  if (vw < 100 || vh < 100) return null;

  const shapeDefaults = resolveShapeDefaults(cal);
  const mergedCal = { ...shapeDefaults, ...cal };

  const ls = pt(kps, "leftShoulder");
  const rs = pt(kps, "rightShoulder");
  const nose = pt(kps, "nose");
  const lh = pt(kps, "leftHip");
  const rh = pt(kps, "rightHip");
  const lk = pt(kps, "leftKnee");
  const rk = pt(kps, "rightKnee");
  const la = pt(kps, "leftAnkle");
  const ra = pt(kps, "rightAnkle");

  if ([ls, rs, lh, rh].some((k) => !k || !Number.isFinite(k.x) || !Number.isFinite(k.y))) return null;

  const sm = mid(ls, rs);
  const hm = mid(lh, rh);
  const torsoH = hm.y - sm.y;
  if (torsoH < 8) return null;

  const rawSw = dist(ls, rs);
  // Keep the gown tied to the detected shoulders at a distance instead of making
  // a small person look artificially close to the camera.
  const distanceBoost = rawSw < vw * 0.22 ? 1.1 : 1;
  const sw = Math.min(Math.max(rawSw * distanceBoost, vw * 0.12), vw * 0.8);
  const rawHw = dist(lh, rh);
  const hw = Math.max(rawHw, sw * 0.9);

  const neckOff = mergedCal.necklineY ?? 0.18;
  const necklineLift = Math.min(torsoH * neckOff, Math.max(rawSw * 0.06, vh * 0.015));
  const topY = Math.max(
    sm.y - necklineLift,
    nose ? nose.y + Math.max(rawSw * 0.08, vh * 0.02) : 0
  );

  let bottomY;
  if (la && ra && (la.score ?? 1) > CONF && (ra.score ?? 1) > CONF) {
    bottomY = Math.max(la.y, ra.y) + torsoH * 0.45;
  } else if (lk && rk && (lk.score ?? 1) > CONF && (rk.score ?? 1) > CONF) {
    const km = mid(lk, rk);
    const legH = km.y - hm.y;
    bottomY = km.y + legH * 1.1;
  } else {
    bottomY = sm.y + torsoH * 4.8;
  }

  if (mergedCal.hemY != null) {
    const fullH = sm.y + torsoH * 4.8 - topY;
    bottomY = topY + fullH * mergedCal.hemY;
    if (la && ra && (la.score ?? 1) > CONF && (ra.score ?? 1) > CONF) {
      bottomY = Math.max(bottomY, Math.max(la.y, ra.y) + torsoH * 0.45);
    }
  }

  const shoulderPad = mergedCal.shoulderPad ?? 1.45;
  const skirtFlare = mergedCal.skirtFlare ?? 1.2;
  const topW = sw * shoulderPad;
  const ankleSpan = la && ra ? dist(la, ra) : 0;
  const botW = Math.max(hw * 1.8, topW * 1.35, ankleSpan * 2) * skirtFlare;
  const cx = sm.x;

  const fitScale = Number(mergedCal.fitScale ?? 1);
  const imageAspectRatio = Number(mergedCal.imageAspectRatio ?? mergedCal.aspectRatio ?? 0.7);
  const offsetX = Number(mergedCal.offsetX ?? mergedCal.xOffset ?? 0);
  const offsetY = Number(mergedCal.offsetY ?? mergedCal.yOffset ?? 0);

  return {
    topY: topY + offsetY,
    bottomY: bottomY + offsetY,
    cx: cx + offsetX,
    topW,
    botW,
    torsoH,
    fitScale: Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1,
    imageAspectRatio: Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 0.7,
    offsetX,
    offsetY,
  };
}

/** Lenient layout for AR try-on — falls back to shoulder-only estimate when hips are weak. */
export function getGownLayoutTryon(kps, cal = {}, vw = 640, vh = 480) {
  const layout = getGownLayout(kps, cal, vw, vh);
  if (layout) return layout;

  const ls = pt(kps, "leftShoulder");
  const rs = pt(kps, "rightShoulder");
  if (!ls || !rs) return null;

  const shapeDefaults = resolveShapeDefaults(cal);
  const mergedCal = { ...shapeDefaults, ...cal };
  const sm = mid(ls, rs);
  const rawSw = dist(ls, rs);
  const distanceBoost = rawSw < vw * 0.22 ? 1.1 : 1;
  const sw = Math.min(Math.max(rawSw * distanceBoost, vw * 0.12), vw * 0.75);
  const torsoH = Math.max(sw * 1.2, vh * 0.14);
  const hm = {
    x: kps?.leftHip && kps?.rightHip ? (kps.leftHip.x + kps.rightHip.x) / 2 : sm.x,
    y: kps?.leftHip && kps?.rightHip ? (kps.leftHip.y + kps.rightHip.y) / 2 : sm.y + torsoH * 0.55,
  };

  const neckOff = mergedCal.necklineY ?? 0.18;
  const necklineLift = Math.min(torsoH * neckOff, Math.max(sw * 0.06, vh * 0.015));
  const nose = pt(kps, "nose");
  const topY = Math.max(
    sm.y - necklineLift,
    nose ? nose.y + Math.max(rawSw * 0.08, vh * 0.02) : 0
  );
  const bottomY = Math.min(vh * 0.98, sm.y + torsoH * 4.8);
  const shoulderPad = mergedCal.shoulderPad ?? 1.45;
  const skirtFlare = mergedCal.skirtFlare ?? 1.2;
  const topW = sw * shoulderPad;
  const botW = topW * 1.7 * skirtFlare;
  const cx = sm.x;

  return {
    topY: topY + Number(mergedCal.offsetY ?? 0),
    bottomY: bottomY + Number(mergedCal.offsetY ?? 0),
    cx: cx + Number(mergedCal.offsetX ?? 0),
    topW,
    botW,
    torsoH,
    fitScale: Number(mergedCal.fitScale ?? 1),
    imageAspectRatio: Number(mergedCal.imageAspectRatio ?? 0.7),
    offsetX: Number(mergedCal.offsetX ?? 0),
    offsetY: Number(mergedCal.offsetY ?? 0),
  };
}

export function getFallbackBodyLayout(kps, vw = 640, vh = 480) {
  if (!kps?.leftShoulder || !kps?.rightShoulder) return null;

  const ls = pt(kps, "leftShoulder");
  const rs = pt(kps, "rightShoulder");
  const lh = pt(kps, "leftHip") || pt(kps, "leftShoulder");
  const rh = pt(kps, "rightHip") || pt(kps, "rightShoulder");

  const sm = mid(ls, rs);
  const hm = mid(lh, rh);
  const torsoH = Math.max(Math.abs(hm.y - sm.y), vh * 0.18);

  const topY = sm.y - torsoH * 0.18;
  const bottomY = Math.min(vh * 0.96, sm.y + torsoH * 4.2);
  const sw = Math.min(Math.max(dist(ls, rs), vw * 0.2), vw * 0.8);
  const hw = Math.max(dist(lh, rh), sw * 0.9);
  const cx = (sm.x + hm.x) / 2;

  return {
    topY,
    bottomY,
    cx,
    topW: sw * 1.45,
    botW: Math.max(hw * 1.55, sw * 1.8) * 1.2,
    torsoH,
    fitScale: 1,
    imageAspectRatio: 0.72,
    offsetX: 0,
    offsetY: 0,
  };
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
    fitScale: Number(next.fitScale ?? prev.fitScale ?? 1),
    imageAspectRatio: Number(next.imageAspectRatio ?? prev.imageAspectRatio ?? 0.7),
    offsetX: Number(next.offsetX ?? prev.offsetX ?? 0),
    offsetY: Number(next.offsetY ?? prev.offsetY ?? 0),
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

  if (facingBack && gown.tryonImageBack) {
    const back = String(gown.tryonImageBack || "").trim();
    if (back.length > 0) return normalizeRemoteAssetUrl(back);
  }

  const tryonImg = String(gown.tryonImage || "").trim();
  if (tryonImg.length > 0) return normalizeRemoteAssetUrl(tryonImg);

  const img = String(gown.image || "").trim();
  return img.length > 0 ? normalizeRemoteAssetUrl(img) : "";
}
