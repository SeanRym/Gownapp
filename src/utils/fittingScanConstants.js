export const GUIDANCE_MAP = {
  no_pose: "Stand in front of the camera — full body visible.",
  no_shoulders: "Step back until your shoulders appear.",
  no_hips: "Step back — your waist needs to be in view.",
  no_legs: "Step back so your legs are visible.",
  too_close: "Too close. Move back 1–2 metres.",
  head_cut: "Move down — your head is cut off.",
  tilted: "Stand straight — shoulders and hips should be level.",
  rotated: "Face the camera directly.",
};

// "too_close" is treated as guidance-only so confidence can still build.
export const HIGH_SEVERITY_ISSUES = new Set(["rotated", "tilted"]);

export const MEAS_VARIANCE = {
  bust: { withHeight: 2.5, withoutHeight: 4.0 },
  waist: { withHeight: 4.5, withoutHeight: 6.5 },
  hip: { withHeight: 3.5, withoutHeight: 5.5 },
};

export const MAX_SCAN_CONFIDENCE = 95;
export const LOCK_THRESHOLD = 65;
export const SNAPSHOT_CONF_THRESHOLD = 70;

export const BASE_MULTS = {
  women: {
    default: { bust: 2.28, waist: 1.85, hip: 2.8, torsoAnchorCm: 44 },
    hourglass: { bust: 2.25, waist: 1.72, hip: 2.9, torsoAnchorCm: 44 },
    pear: { bust: 2.18, waist: 1.78, hip: 3.0, torsoAnchorCm: 44 },
    apple: { bust: 2.32, waist: 2.0, hip: 2.7, torsoAnchorCm: 44 },
    rectangle: { bust: 2.23, waist: 1.9, hip: 2.75, torsoAnchorCm: 44 },
    invertedTriangle: { bust: 2.38, waist: 1.8, hip: 2.65, torsoAnchorCm: 44 },
    petite: { bust: 2.2, waist: 1.76, hip: 2.78, torsoAnchorCm: 38 },
    tall: { bust: 2.3, waist: 1.83, hip: 2.82, torsoAnchorCm: 50 },
  },
  men: {
    default: { bust: 2.08, waist: 1.88, hip: 2.52, torsoAnchorCm: 48 },
  },
  children: {
    default: { bust: 2.15, waist: 1.82, hip: 2.6, torsoAnchorCm: 30 },
  },
};

const TORSO_HEIGHT_RATIO = {
  women: 0.29,
  men: 0.3,
  children: 0.285,
};

export function getMults(segment = "women", bodyShape = null) {
  const segMults = BASE_MULTS[segment] ?? BASE_MULTS.women;
  return (bodyShape && segMults[bodyShape]) ?? segMults.default;
}

export function getTorsoAnchor(segment = "women", heightCm = null, bodyShape = null) {
  if (heightCm) {
    const ratio = TORSO_HEIGHT_RATIO[segment] ?? 0.29;
    return heightCm * ratio;
  }
  return getMults(segment, bodyShape).torsoAnchorCm;
}
