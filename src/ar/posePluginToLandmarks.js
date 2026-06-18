/**
 * ML Kit pose plugin — pixel coords in rotated image space (imageWidth × imageHeight).
 */
import { canonicalizePoseLandmarks } from "../utils/poseCoordinateTransform";

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
  if (raw.pose && typeof raw.pose === "object") return raw.pose;
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

/**
 * Measurements + overlay source. Landmarks are portrait-up, not mirrored.
 * Mirror for display via toDisplayLandmarks().
 */
export function parsePosePayload(payload, { fallbackW = 720, fallbackH = 1280 } = {}) {
  if (!payload || payload.error) return null;
  const flat = flattenRawPose(payload);
  if (!flat || !hasPosePluginData(payload)) return null;

  const { width: imgW, height: imgH } = resolvePoseImageSize(flat, fallbackW, fallbackH);
  const rawLm = buildLandmarksRaw(flat, imgW, imgH);
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
  return Boolean(
    flat.leftShoulderPosition ||
      flat.rightShoulderPosition ||
      flat.nosePosition ||
      flat.leftShoulderX ||
      flat.noseX
  );
}
