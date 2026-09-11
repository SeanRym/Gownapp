/**
 * ML Kit pose plugin — pixel coords in rotated image space (imageWidth × imageHeight).
 */
import { canonicalizePoseLandmarks } from "../utils/poseCoordinateTransform";
import { MOVENET_KEY_INDEX } from "./movenetPose";

const LANDMARK_KEY_ALIASES = {
  leftShoulder: ["leftShoulderX", "leftShoulderPosition", "leftShoulder", "left_shoulder"],
  rightShoulder: ["rightShoulderX", "rightShoulderPosition", "rightShoulder", "right_shoulder"],
  leftElbow: ["leftElbowX", "leftElbowPosition", "leftElbow", "left_elbow"],
  rightElbow: ["rightElbowX", "rightElbowPosition", "rightElbow", "right_elbow"],
  leftWrist: ["leftWristX", "leftWristPosition", "leftWrist", "left_wrist"],
  rightWrist: ["rightWristX", "rightWristPosition", "rightWrist", "right_wrist"],
  leftHip: ["leftHipX", "leftHipPosition", "leftHip", "left_hip"],
  rightHip: ["rightHipX", "rightHipPosition", "rightHip", "right_hip"],
  leftKnee: ["leftKneeX", "leftKneePosition", "leftKnee", "left_knee"],
  rightKnee: ["rightKneeX", "rightKneePosition", "rightKnee", "right_knee"],
  leftAnkle: ["leftAnkleX", "leftAnklePosition", "leftAnkle", "left_ankle"],
  rightAnkle: ["rightAnkleX", "rightAnklePosition", "rightAnkle", "right_ankle"],
  nose: ["noseX", "nosePosition", "nose"],
};

const INDEX_TO_NAME = {
  0: "nose",
  11: "leftShoulder",
  12: "rightShoulder",
  13: "leftElbow",
  14: "rightElbow",
  15: "leftWrist",
  16: "rightWrist",
  23: "leftHip",
  24: "rightHip",
  25: "leftKnee",
  26: "rightKnee",
  27: "leftAnkle",
  28: "rightAnkle",
};

function readPoint(entry) {
  if (!entry || typeof entry !== "object") return null;
  const x = Number(entry.x ?? entry.X ?? entry.left);
  const y = Number(entry.y ?? entry.Y ?? entry.top);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, score: entry.score ?? entry.confidence };
}

function readNamedPoint(raw, names) {
  for (const key of names) {
    const p = readPoint(raw[key]);
    if (p) return p;
  }
  return null;
}

export function flattenRawPose(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.error) return null;
  if (raw.keypoints && typeof raw.keypoints === "object") return raw;
  if (raw.pose && typeof raw.pose === "object") {
    if (raw.pose.keypoints && typeof raw.pose.keypoints === "object") return raw;
    return raw.pose;
  }
  if (Array.isArray(raw)) return raw[0] || null;
  if (raw.poses?.[0]) return raw.poses[0];
  if (raw.landmarks && typeof raw.landmarks === "object") return raw.landmarks;
  if (raw.result && typeof raw.result === "object") return raw.result;
  return raw;
}

function isLikelyNormalized(p) {
  return p.x >= 0 && p.x <= 1.5 && p.y >= 0 && p.y <= 1.5;
}

function measurePixelExtents(flat) {
  let maxX = 0;
  let maxY = 0;
  let anyPixel = false;
  for (const aliases of Object.values(LANDMARK_KEY_ALIASES)) {
    const p = readNamedPoint(flat, aliases);
    if (!p || isLikelyNormalized(p)) continue;
    anyPixel = true;
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { maxX, maxY, anyPixel };
}

export function resolvePoseImageSize(flat, fallbackW = 720, fallbackH = 1280) {
  let w = Number(flat?.imageWidth) || fallbackW;
  let h = Number(flat?.imageHeight) || fallbackH;
  const ext = measurePixelExtents(flat);
  if (ext.anyPixel) {
    if (ext.maxX > w * 1.08 && ext.maxX <= h * 1.2 && ext.maxY > h * 1.05) {
      return { width: h, height: w };
    }
    if (ext.maxY > h * 1.08 && ext.maxY <= w * 1.2 && ext.maxX > w * 1.05) {
      return { width: h, height: w };
    }
    if (ext.maxX > w) w = Math.ceil(ext.maxX);
    if (ext.maxY > h) h = Math.ceil(ext.maxY);
  }
  return { width: w, height: h };
}

function toNormalized(p, imgW, imgH) {
  let nx;
  let ny;
  if (isLikelyNormalized(p)) {
    nx = p.x;
    ny = p.y;
  } else {
    nx = p.x / imgW;
    ny = p.y / imgH;
  }
  return {
    x: Math.max(0, Math.min(1, nx)),
    y: Math.max(0, Math.min(1, ny)),
    score: p.score,
  };
}

function buildLandmarksRaw(flat, imgW, imgH) {
  const out = {};

  const nativeKeypoints =
    flat?.keypoints && typeof flat.keypoints === "object"
      ? flat.keypoints
      : flat?.pose?.keypoints && typeof flat.pose.keypoints === "object"
        ? flat.pose.keypoints
        : null;

  if (nativeKeypoints) {
    for (const [name, point] of Object.entries(nativeKeypoints)) {
      if (!point || typeof point !== "object") continue;
      const x = Number(point.x ?? 0);
      const y = Number(point.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const normalized = isLikelyNormalized({ x, y, score: point.score ?? 1 })
        ? { x, y, score: point.score ?? 1 }
        : toNormalized({ x, y, score: point.score ?? 1 }, imgW, imgH);

      const idx = Number(name);
      let targetName = null;
      if (Object.prototype.hasOwnProperty.call(MOVENET_KEY_INDEX, name)) {
        targetName = name;
      } else if (Number.isInteger(idx) && idx >= 0 && idx < 17) {
        targetName = Object.keys(MOVENET_KEY_INDEX).find((k) => MOVENET_KEY_INDEX[k] === idx) || null;
      }
      if (targetName) out[targetName] = normalized;
    }
  }

  for (const [name, aliases] of Object.entries(LANDMARK_KEY_ALIASES)) {
    const p = readNamedPoint(flat, aliases);
    if (p) out[name] = toNormalized(p, imgW, imgH);
  }

  for (const [idx, name] of Object.entries(INDEX_TO_NAME)) {
    if (out[name]) continue;
    const p = readPoint(flat[idx]);
    if (p) out[name] = toNormalized(p, imgW, imgH);
  }

  const ls = out.leftShoulder;
  const rs = out.rightShoulder;
  if (ls && rs && Math.abs(ls.x - rs.x) < 1e-4 && Math.abs(ls.y - rs.y) < 1e-4) {
    const w = 0.12;
    out.leftShoulder = { ...ls, x: Math.max(0, ls.x - w / 2) };
    out.rightShoulder = { ...rs, x: Math.min(1, rs.x + w / 2) };
  }

  const hasUpper = out.leftShoulder && out.rightShoulder;
  const hasFace = out.nose && (out.leftShoulder || out.rightShoulder);
  if (!hasUpper && !hasFace) return null;

  return out;
}

export const WEB_POSE_INDEX_MAP = {
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

export function poseKeypointsToWebArray(lm, imageWidth = 720, imageHeight = 1280) {
  if (!lm) return Array(17).fill(null);

  const out = Array(17).fill(null);
  const setPoint = (index, point) => {
    if (index < 0 || index >= out.length || !point) return;
    const x = Number(point.x ?? point.X ?? 0);
    const y = Number(point.y ?? point.Y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const isNormalized = x >= 0 && x <= 1.5 && y >= 0 && y <= 1.5;
    out[index] = {
      x: isNormalized ? x * imageWidth : x,
      y: isNormalized ? y * imageHeight : y,
      score: Number(point.score ?? point.confidence ?? 1),
    };
  };

  Object.entries(WEB_POSE_INDEX_MAP).forEach(([index, name]) => {
    const point = lm[name] || lm[Number(index)];
    setPoint(Number(index), point);
  });

  return out;
}

/**
 * Measurements + overlay source. Landmarks are portrait-up, not mirrored.
 * Mirror for display via toDisplayLandmarks().
 */
function buildLandmarksFromPreMapped(preMapped) {
  const names = [
    "nose",
    "leftShoulder",
    "rightShoulder",
    "leftHip",
    "rightHip",
    "leftKnee",
    "rightKnee",
    "leftAnkle",
    "rightAnkle",
  ];
  const out = {};
  for (const name of names) {
    const p = preMapped?.[name];
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
    out[name] = {
      x: Math.max(0, Math.min(1, p.x)),
      y: Math.max(0, Math.min(1, p.y)),
      score: p.score ?? 1,
    };
  }
  if (!out.leftShoulder || !out.rightShoulder) return null;
  return out;
}

export function parsePosePayload(payload, { fallbackW = 720, fallbackH = 1280 } = {}) {
  if (!payload || payload.error) return null;
  const flat = flattenRawPose(payload);
  if (!flat || !hasPosePluginData(payload)) return null;

  const { width: imgW, height: imgH } = resolvePoseImageSize(flat, fallbackW, fallbackH);
  const preMapped = flat?.pose?.leftShoulder ? flat.pose : null;
  const rawLm = preMapped ? buildLandmarksFromPreMapped(preMapped) : buildLandmarksRaw(flat, imgW, imgH);
  if (!rawLm) return null;

  const { landmarks, imageWidth, imageHeight } = canonicalizePoseLandmarks(rawLm, imgW, imgH);

  return { landmarks, imageWidth, imageHeight };
}

export function posePluginToLandmarks(raw, videoW, videoH) {
  return parsePosePayload(raw, { fallbackW: videoW, fallbackH: videoH })?.landmarks ?? null;
}

export function hasPosePluginData(raw) {
  if (!raw || raw.error) return false;
  const flat = flattenRawPose(raw);
  if (!flat) return false;

  if (flat.keypoints && typeof flat.keypoints === "object") return true;
  if (flat.pose?.keypoints && typeof flat.pose.keypoints === "object") return true;
  if (flat.pose?.leftShoulder && flat.pose?.rightShoulder) return true;

  return Boolean(
    flat.leftShoulderPosition ||
      flat.rightShoulderPosition ||
      flat.nosePosition ||
      flat.leftShoulderX ||
      flat.noseX
  );
}
