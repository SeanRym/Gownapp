export const MOVENET_KEY_INDEX = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
};

export function toNormalizedPoint(point) {
  if (!point) return null;

  const x = Number(point.x);
  const y = Number(point.y);
  const score = Number(point.score ?? 0);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    score,
  };
}

function getMoveNetKeypointsArray(result) {
  const raw = result?.[0] ?? result?.pose ?? result;
  if (!raw) return [];

  if (Array.isArray(raw.keypoints)) {
    return raw.keypoints.length >= 17 ? raw.keypoints : [];
  }

  if (!raw.keypoints || typeof raw.keypoints !== "object") {
    return [];
  }

  const arr = Array(17).fill(null);
  let found = 0;

  for (const [name, index] of Object.entries(MOVENET_KEY_INDEX)) {
    const point = raw.keypoints[name];
    if (!point || typeof point !== "object") continue;
    arr[index] = {
      x: Number(point.x),
      y: Number(point.y),
      score: Number(point.score ?? point.confidence ?? 1),
    };
    found += 1;
  }

  if (found < 4) {
    for (const [key, point] of Object.entries(raw.keypoints)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= 17 || !point || typeof point !== "object") continue;
      if (arr[idx]) continue;
      arr[idx] = {
        x: Number(point.x),
        y: Number(point.y),
        score: Number(point.score ?? point.confidence ?? 1),
      };
      found += 1;
    }
  }

  return found >= 4 ? arr : [];
}

export function normalizeMoveNetPose(result, imageWidth = 640, imageHeight = 480) {
  const keypoints = getMoveNetKeypointsArray(result);
  const found = keypoints.filter(Boolean).length;
  if (found < 4) return null;

  const landmarks = {};
  for (const [name, index] of Object.entries(MOVENET_KEY_INDEX)) {
    const point = keypoints[index];
    const normalized = toNormalizedPoint(point, imageWidth, imageHeight);
    if (normalized) {
      landmarks[name] = normalized;
    }
  }

  return {
    pose: landmarks,
    imageWidth,
    imageHeight,
  };
}

export function mapMoveNetPoseToAppLandmarks(result, imageWidth = 640, imageHeight = 480) {
  const normalized = normalizeMoveNetPose(result, imageWidth, imageHeight);
  if (!normalized?.pose) return null;

  return {
    nose: normalized.pose.nose,
    leftShoulder: normalized.pose.leftShoulder,
    rightShoulder: normalized.pose.rightShoulder,
    leftHip: normalized.pose.leftHip,
    rightHip: normalized.pose.rightHip,
    leftKnee: normalized.pose.leftKnee,
    rightKnee: normalized.pose.rightKnee,
    leftAnkle: normalized.pose.leftAnkle,
    rightAnkle: normalized.pose.rightAnkle,
    imageWidth: normalized.imageWidth,
    imageHeight: normalized.imageHeight,
  };
}

export function createMoveNetAdapter() {
  return {
    normalizeMoveNetPose,
    mapMoveNetPoseToAppLandmarks,
  };
}
