import {
  canonicalizePoseLandmarks,
  mirrorLandmarksX,
  pickDisplayLandmarks,
  rotateLandmarksCCW,
  rotateLandmarksCW,
} from "../utils/poseCoordinateTransform";
import { mapLandmarkToPreview } from "../utils/posePreviewMap";
import { landmarksToPixelKps } from "./gownLayout";
import { mapMoveNetPoseToAppLandmarks } from "./movenetPose";
import { parsePosePayload } from "./posePluginToLandmarks";

const BODY_NAMES = [
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

function cloneNamedLandmarks(lm) {
  if (!lm) return null;
  const out = {};
  for (const name of BODY_NAMES) {
    const p = lm[name];
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
    out[name] = { x: p.x, y: p.y, score: p.score ?? 1 };
  }
  return out.leftShoulder && out.rightShoulder ? out : null;
}

function collectNormalizedSources(payload, imageW, imageH) {
  const out = [];

  const fromPose = cloneNamedLandmarks(payload?.pose);
  if (fromPose) out.push(fromPose);

  const parsed = parsePosePayload(payload, { fallbackW: imageW, fallbackH: imageH });
  if (parsed?.landmarks) out.push(parsed.landmarks);

  if (payload?.keypoints) {
    const mapped = mapMoveNetPoseToAppLandmarks({ keypoints: payload.keypoints }, imageW, imageH);
    const fromKps = cloneNamedLandmarks(mapped);
    if (fromKps) out.push(fromKps);
  }

  return out;
}

function scorePixelKps(kps, previewW, previewH) {
  const ls = kps?.leftShoulder;
  const rs = kps?.rightShoulder;
  const lh = kps?.leftHip;
  const rh = kps?.rightHip;
  if (!ls || !rs) return -1;

  const smY = (ls.y + rs.y) / 2;
  const shoulderSpan = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  if (shoulderSpan < previewW * 0.06) return -1;
  if (ls.x < 0 || rs.x > previewW || smY < 0 || smY > previewH) return -1;

  let score = shoulderSpan * 2.5;
  if (lh && rh) {
    const hmY = (lh.y + rh.y) / 2;
    if (smY >= hmY) return -1;
    score += (hmY - smY) * 2;
    const hipSpan = Math.hypot(rh.x - lh.x, rh.y - lh.y);
    score += hipSpan;
  }

  return score;
}

function mapLandmarksCandidate(measureLm, previewW, previewH, imageW, imageH, facing, resizeMode) {
  const displayLm =
    facing === "front"
      ? pickDisplayLandmarks(measureLm, previewW, previewH, imageW, imageH, facing, resizeMode)
      : measureLm;
  if (!displayLm) return null;

  const mappedLm = mapLandmarkToPreview(
    displayLm,
    previewW,
    previewH,
    imageW,
    imageH,
    resizeMode
  );
  if (!mappedLm) return null;

  return landmarksToPixelKps(mappedLm, previewW, previewH);
}

/**
 * MoveNet / TensorFlow / vision-camera pose → preview pixel keypoints.
 * Prefer direct normalized shoulder/hip mapping in the active preview space; keep the
 * alternative rotation/resize search only as a fallback.
 */
export function tryonPayloadToPixelKps(payload, previewW, previewH) {
  if (!payload || payload.error || previewW <= 0 || previewH <= 0) return null;

  const rawImageW = Number(payload?.imageWidth) || 720;
  const rawImageH = Number(payload?.imageHeight) || 1280;
  const orientation = String(payload?.orientation || "").toLowerCase();
  const previewIsPortrait = previewH >= previewW;
  const rotateLandscapePhoto = rawImageW > rawImageH && previewIsPortrait;
  const rotateToPortrait = rotateLandscapePhoto;
  const imageW = rotateToPortrait ? rawImageH : rawImageW;
  const imageH = rotateToPortrait ? rawImageW : rawImageH;
  const previewAspect = previewW / previewH;
  const imageAspect = imageW / imageH;

  let renderW;
  let renderH;
  let offsetX;
  let offsetY;

  if (imageAspect > previewAspect) {
    renderW = previewW;
    renderH = previewW / imageAspect;
    offsetX = 0;
    offsetY = (previewH - renderH) / 2;
  } else {
    renderW = previewH * imageAspect;
    renderH = previewH;
    offsetX = (previewW - renderW) / 2;
    offsetY = 0;
  }

  const toPreviewPoint = (point) => {
    if (!point) return null;

    const rawX = Number(point.x);
    const rawY = Number(point.y);
    const score = Number(point.score ?? 0);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

    let x = rawX;
    let y = rawY;
    if (rotateToPortrait && orientation === "portrait-upside-down") {
      x = rawY;
      y = 1 - rawX;
    } else if (rotateToPortrait) {
      x = 1 - rawY;
      y = rawX;
    }

    return {
      x: offsetX + x * renderW,
      y: offsetY + y * renderH,
      score,
    };
  };

  const directPose = payload?.pose || payload?.landmarks;
  const keypoints = payload?.keypoints;
  const source = directPose || (Array.isArray(keypoints)
    ? {
        nose: keypoints[0],
        leftShoulder: keypoints[5],
        rightShoulder: keypoints[6],
        leftHip: keypoints[11],
        rightHip: keypoints[12],
        leftKnee: keypoints[13],
        rightKnee: keypoints[14],
        leftAnkle: keypoints[15],
        rightAnkle: keypoints[16],
      }
    : keypoints);

  if (!source) return null;

  const mapped = {};
  BODY_NAMES.forEach((name) => {
    const point = toPreviewPoint(source[name]);
    if (point) mapped[name] = point;
  });

  return mapped.leftShoulder && mapped.rightShoulder ? mapped : null;
}
