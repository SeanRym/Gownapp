import { detectBodyShapeFromLandmarks } from "./fittingPose";
import {
  LOCK_THRESHOLD,
  MAX_SCAN_CONFIDENCE,
  getMults,
  getTorsoAnchor,
  HIGH_SEVERITY_ISSUES,
} from "./fittingScanConstants";

const CONF = 0.45;

function dist(a, b) {
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

function bodySpanY(lm) {
  const ys = [];
  for (const k of ["nose", "leftShoulder", "rightShoulder", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"]) {
    if (lm[k]) ys.push(lm[k].y);
  }
  if (ys.length < 2) return 0;
  return Math.max(...ys) - Math.min(...ys);
}

/** Partial % when shoulders/hips not ready yet */
function partialVisibilityPct(lm) {
  if (!lm) return 0;
  let v = 0;
  if (lm.nose) v += 8;
  if (lm.leftShoulder && lm.rightShoulder) v += 28;
  else if (lm.leftShoulder || lm.rightShoulder) v += 12;
  if (lm.leftHip && lm.rightHip) v += 28;
  else if (lm.leftHip || lm.rightHip) v += 12;
  if (lm.leftKnee || lm.rightKnee) v += 10;
  if (lm.leftAnkle || lm.rightAnkle) v += 10;
  const span = bodySpanY(lm);
  if (span >= 0.55) v += 12;
  else if (span >= 0.42) v += 6;
  return Math.min(52, Math.round(v));
}

/**
 * Scan % — same idea as gownweb, tuned so phones can reach 65% without perfect ankles.
 */
export function computeScanConfidence({ goodFrames, hasFullHeight, hasTorsoSpan, analysis, swHistLen }) {
  let conf = 0;
  conf += Math.min((goodFrames / 30) * 48, 48);
  conf += hasFullHeight ? 15 : hasTorsoSpan ? 10 : 0;
  conf += analysis.kneesOk ? 10 : analysis.kneesPartial ? 6 : 0;
  conf += analysis.anklesOk ? 8 : analysis.anklesPartial ? 5 : 0;
  const clean = !analysis.scoringIssues?.length;
  conf += clean ? 12 : 0;
  conf += swHistLen >= 10 ? 7 : Math.min(swHistLen, 7);
  if (analysis.bodySpan >= 0.62) conf += 5;
  return Math.min(Math.round(conf), MAX_SCAN_CONFIDENCE);
}

/** Normalized landmarks (0–1). scoringIssues excludes soft hints like no_legs. */
export function analyzePoseLandmarksFull(lm, vw = 1, vh = 1) {
  if (!lm?.leftShoulder || !lm?.rightShoulder) {
    return {
      ok: false,
      issues: ["no_pose"],
      scoringIssues: ["no_pose"],
      shouldersOk: false,
      hipsOk: false,
      kneesOk: false,
      kneesPartial: false,
      anklesOk: false,
      anklesPartial: false,
      bodySpan: 0,
    };
  }

  const ls = { x: lm.leftShoulder.x * vw, y: lm.leftShoulder.y * vh };
  const rs = { x: lm.rightShoulder.x * vw, y: lm.rightShoulder.y * vh };
  const lh = lm.leftHip ? { x: lm.leftHip.x * vw, y: lm.leftHip.y * vh } : null;
  const rh = lm.rightHip ? { x: lm.rightHip.x * vw, y: lm.rightHip.y * vh } : null;
  const lk = lm.leftKnee ? { x: lm.leftKnee.x * vw, y: lm.leftKnee.y * vh } : null;
  const rk = lm.rightKnee ? { x: lm.rightKnee.x * vw, y: lm.rightKnee.y * vh } : null;
  const la = lm.leftAnkle ? { x: lm.leftAnkle.x * vw, y: lm.leftAnkle.y * vh } : null;
  const ra = lm.rightAnkle ? { x: lm.rightAnkle.x * vw, y: lm.rightAnkle.y * vh } : null;
  const nose = lm.nose ? { x: lm.nose.x * vw, y: lm.nose.y * vh, score: lm.nose.score ?? 0.5 } : null;

  const issues = [];
  const shouldersOk = Boolean(ls && rs);
  const hipsOk = Boolean(lh && rh);
  const kneesOk = Boolean(lk && rk);
  const kneesPartial = Boolean(lk || rk);
  const anklesOk = Boolean(la && ra);
  const anklesPartial = Boolean(la || ra);
  const bodySpan = bodySpanY(lm);

  const margin = vw * 0.03;
  const shoulderSpan = shouldersOk ? dist(ls, rs) : 0;
  const shoulderTilt = shouldersOk ? Math.abs(ls.y - rs.y) : 0;
  const hipTilt = hipsOk ? Math.abs(lh.y - rh.y) : 0;
  const torsoOffset = shouldersOk && hipsOk ? Math.abs(mid(ls, rs).x - mid(lh, rh).x) : 0;

  if (shoulderTilt > vh * 0.05 || hipTilt > vh * 0.055) issues.push("tilted");
  if (torsoOffset > vw * 0.08) issues.push("rotated");

  if (!shouldersOk) {
    return { ok: false, issues: ["no_shoulders"], scoringIssues: ["no_shoulders"], shouldersOk, hipsOk, kneesOk, kneesPartial, anklesOk, anklesPartial, bodySpan, nose };
  }
  if (!hipsOk) {
    return { ok: false, issues: ["no_hips"], scoringIssues: ["no_hips"], shouldersOk, hipsOk, kneesOk, kneesPartial, anklesOk, anklesPartial, bodySpan, nose };
  }

  if (!kneesOk) issues.push("no_legs");
  // Keep "too close" conservative; avoid false positives on normal framing.
  const tooCloseFrame =
    shouldersOk &&
    (ls.x < margin || rs.x > vw - margin || shoulderSpan > vw * 0.5 || bodySpan > 0.98);
  if (tooCloseFrame) issues.push("too_close");
  if (nose && nose.y < vh * 0.04) issues.push("head_cut");

  const scoringIssues = issues.filter((i) => i !== "no_legs");
  const ok = shouldersOk && hipsOk && scoringIssues.length === 0;

  return {
    ok,
    issues,
    scoringIssues,
    shouldersOk,
    hipsOk,
    kneesOk,
    kneesPartial,
    anklesOk,
    anklesPartial,
    bodySpan,
    nose,
  };
}

export function createFittingScanSession() {
  const swHist = [];
  const hipHist = [];
  const pxPerCmHist = [];
  let goodFrames = 0;
  const shapeVotes = {};
  let torsoHPx = null;
  let detectedShape = null;

  function reset() {
    swHist.length = 0;
    hipHist.length = 0;
    pxPerCmHist.length = 0;
    goodFrames = 0;
    Object.keys(shapeVotes).forEach((k) => delete shapeVotes[k]);
    torsoHPx = null;
    detectedShape = null;
  }

  function processFrame(lm, { videoW, videoH, profile }) {
    const vw = videoW || 720;
    const vh = videoH || 1280;
    const analysis = analyzePoseLandmarksFull(lm, 1, 1);
    const hasHighSeverity = analysis.scoringIssues?.some((i) => HIGH_SEVERITY_ISSUES.has(i));

    if (!analysis.shouldersOk || !analysis.hipsOk) {
      goodFrames = Math.max(0, goodFrames - 2);
      return {
        poseFound: false,
        poseIssues: analysis.issues.length ? analysis.issues : ["no_pose"],
        confidence: partialVisibilityPct(lm),
        liveEst: null,
        detectedShape,
        cleanFrameCount: swHist.length,
        canLock: false,
      };
    }

    if (hasHighSeverity) goodFrames = Math.max(0, goodFrames - 3);
    else goodFrames = Math.min(goodFrames + 2, 60);

    const ls = { x: lm.leftShoulder.x * vw, y: lm.leftShoulder.y * vh };
    const rs = { x: lm.rightShoulder.x * vw, y: lm.rightShoulder.y * vh };
    const lh = { x: lm.leftHip.x * vw, y: lm.leftHip.y * vh };
    const rh = { x: lm.rightHip.x * vw, y: lm.rightHip.y * vh };
    const nose = analysis.nose;
    const la = lm.leftAnkle ? { x: lm.leftAnkle.x * vw, y: lm.leftAnkle.y * vh, score: 0.5 } : null;
    const ra = lm.rightAnkle ? { x: lm.rightAnkle.x * vw, y: lm.rightAnkle.y * vh, score: 0.5 } : null;
    const lk = lm.leftKnee ? { x: lm.leftKnee.x * vw, y: lm.leftKnee.y * vh } : null;
    const rk = lm.rightKnee ? { x: lm.rightKnee.x * vw, y: lm.rightKnee.y * vh } : null;

    const ankleMid = la && ra ? mid(la, ra) : lk && rk ? mid(lk, rk) : null;
    const hasFullHeight = Boolean(profile.height && nose && ankleMid && nose.y < ankleMid.y);
    const hasTorsoSpan = Boolean(nose && analysis.bodySpan >= 0.5);

    const torsoH = mid(lh, rh).y - mid(ls, rs).y;
    let pxPerCm;
    if (hasFullHeight) {
      pxPerCm = (ankleMid.y - nose.y) / profile.height;
    } else {
      const torsoAnchor = getTorsoAnchor(profile.segment, profile.height, detectedShape);
      pxPerCm = torsoH / torsoAnchor;
    }

    if (torsoH <= 0.02 || pxPerCm <= 0) {
      return {
        poseFound: true,
        poseIssues: analysis.issues,
        confidence: partialVisibilityPct(lm),
        liveEst: null,
        detectedShape,
        cleanFrameCount: swHist.length,
        canLock: false,
      };
    }

    torsoHPx = torsoH;
    const prevMean =
      pxPerCmHist.length > 0
        ? pxPerCmHist.reduce((a, b) => a + b, 0) / pxPerCmHist.length
        : pxPerCm;
    const scaleOk = Math.abs(pxPerCm - prevMean) / Math.max(prevMean, 1e-6) < 0.15;
    pxPerCmHist.push(pxPerCm);
    if (pxPerCmHist.length > 30) pxPerCmHist.shift();

    const swPx = dist(ls, rs);
    const hwPx = dist(lh, rh);

    if (!hasHighSeverity && scaleOk) {
      swHist.push(swPx);
      if (swHist.length > 60) swHist.shift();
      hipHist.push(hwPx);
      if (hipHist.length > 60) hipHist.shift();
    }

    const conf = computeScanConfidence({
      goodFrames,
      hasFullHeight,
      hasTorsoSpan,
      analysis,
      swHistLen: swHist.length,
    });

    const estSwPx = iqm(swHist) || swPx;
    const estHipPx = iqm(hipHist) || hwPx;
    const mults = getMults(profile.segment, detectedShape);
    const estBust = Math.round((estSwPx / pxPerCm) * mults.bust);
    const estWaist = Math.round((estSwPx / pxPerCm) * mults.waist);
    const estHips = Math.round((estHipPx / pxPerCm) * mults.hip);

    if (conf >= 55) {
      const shape = detectBodyShapeFromLandmarks(lm);
      if (shape) {
        shapeVotes[shape] = (shapeVotes[shape] || 0) + 1;
        const totalVotes = Object.values(shapeVotes).reduce((a, b) => a + b, 0);
        if (totalVotes >= 15) {
          const leading = Object.entries(shapeVotes).sort((a, b) => b[1] - a[1])[0];
          if (leading[1] / totalVotes > 0.5) detectedShape = leading[0];
        }
      }
    }

    return {
      poseFound: true,
      poseIssues: analysis.issues,
      confidence: conf,
      liveEst: swHist.length >= 6 ? { bust: estBust, waist: estWaist, hips: estHips, bodyShape: detectedShape } : null,
      detectedShape,
      cleanFrameCount: swHist.length,
      canLock: conf >= LOCK_THRESHOLD && swHist.length >= 6,
    };
  }

  function lockMeasurements(profile) {
    if (!swHist.length) return null;
    const estSwPx = iqm(swHist);
    const estHipPx = iqm(hipHist) || estSwPx * 1.05;
    const torsoAnchor = getTorsoAnchor(profile.segment, profile.height, detectedShape);
    const pxPerCm = torsoHPx > 0 ? torsoHPx / torsoAnchor : 1;
    const mults = getMults(profile.segment, detectedShape);
    return {
      bust: Math.round((estSwPx / pxPerCm) * mults.bust),
      waist: Math.round((estSwPx / pxPerCm) * mults.waist),
      hips: Math.round((estHipPx / pxPerCm) * mults.hip),
      bodyShape: detectedShape,
    };
  }

  return { reset, processFrame, lockMeasurements, getDetectedShape: () => detectedShape };
}
