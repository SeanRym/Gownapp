import { useRef } from "react";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { mapLandmarkToPreview } from "../../utils/posePreviewMap";

function smoothPoint(prev, next, alpha = 0.4) {
  if (!next) return prev;
  if (!prev) return next;
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  };
}

function smoothMapped(prev, next, alpha = 0.4) {
  if (!next) return prev;
  if (!prev) return next;
  const out = {};
  for (const [k, p] of Object.entries(next)) {
    out[k] = smoothPoint(prev[k], p, alpha);
  }
  return out;
}

function bodyBounds(mapped) {
  const pts = Object.values(mapped).filter(Boolean);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const padX = Math.max(12, w * 0.14);
  const padY = Math.max(16, h * 0.08);
  return {
    left: Math.max(0, Math.min(...xs) - padX),
    right: Math.min(9999, Math.max(...xs) + padX),
    top: Math.max(0, Math.min(...ys) - padY),
    bottom: Math.max(...ys) + padY,
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
  };
}

/**
 * Full-body skeleton + tracking box aligned to camera preview.
 */
export function FittingPoseOverlay({
  landmarks,
  width,
  height,
  imageWidth,
  imageHeight,
  resizeMode = "contain",
  confidence = 0,
}) {
  const smoothRef = useRef(null);

  if (!landmarks || !width || !height) return null;

  const mappedRaw = mapLandmarkToPreview(
    landmarks,
    width,
    height,
    imageWidth || width,
    imageHeight || height,
    resizeMode
  );
  if (!mappedRaw) return null;

  smoothRef.current = smoothMapped(smoothRef.current, mappedRaw, 0.45);
  const mapped = smoothRef.current;

  const confColor = confidence >= 70 ? "#1D9E75" : confidence >= 50 ? "#EF9F27" : "#E24B4A";
  const strokeOpacity = confidence > 55 ? 0.9 : 0.5;

  const pt = (name) => mapped[name] || null;

  const nose = pt("nose");
  const ls = pt("leftShoulder");
  const rs = pt("rightShoulder");
  const le = pt("leftElbow");
  const re = pt("rightElbow");
  const lw = pt("leftWrist");
  const rw = pt("rightWrist");
  const lh = pt("leftHip");
  const rh = pt("rightHip");
  const lk = pt("leftKnee");
  const rk = pt("rightKnee");
  const la = pt("leftAnkle");
  const ra = pt("rightAnkle");

  const lines = [];
  if (ls && rs) lines.push([ls, rs]);
  if (ls && le) lines.push([ls, le]);
  if (le && lw) lines.push([le, lw]);
  if (rs && re) lines.push([rs, re]);
  if (re && rw) lines.push([re, rw]);
  if (ls && lh) lines.push([ls, lh]);
  if (rs && rh) lines.push([rs, rh]);
  if (lh && rh) lines.push([lh, rh]);
  if (lh && lk) lines.push([lh, lk]);
  if (rh && rk) lines.push([rh, rk]);
  if (lk && la) lines.push([lk, la]);
  if (rk && ra) lines.push([rk, ra]);
  if (nose && ls && rs) {
    const neck = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    lines.push([nose, neck]);
  }

  const dots = [nose, ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra].filter(Boolean);
  const sm = ls && rs ? { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 } : null;
  const hm = lh && rh ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 } : null;
  const feet =
    la && ra
      ? { x: (la.x + ra.x) / 2, y: Math.max(la.y, ra.y) }
      : lk && rk
        ? { x: (lk.x + rk.x) / 2, y: Math.max(lk.y, rk.y) }
        : null;

  const bounds = bodyBounds(mapped);
  const headY = nose?.y ?? sm?.y ?? bounds?.top;
  const footY = feet?.y ?? bounds?.bottom;

  return (
    <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
      {bounds ? (
        <>
          <Rect
            x={bounds.left}
            y={bounds.top}
            width={bounds.right - bounds.left}
            height={bounds.bottom - bounds.top}
            stroke="rgba(201,169,110,0.55)"
            strokeWidth={2}
            fill="rgba(201,169,110,0.06)"
            rx={10}
            ry={10}
          />
          {bounds.cx != null && headY != null && footY != null ? (
            <Line
              x1={bounds.cx}
              y1={headY - 8}
              x2={bounds.cx}
              y2={footY + 8}
              stroke="rgba(201,169,110,0.4)"
              strokeWidth={1}
              strokeDasharray="6,5"
            />
          ) : null}
        </>
      ) : null}
      {sm && hm ? (
        <>
          <Line x1={0} y1={sm.y} x2={width} y2={sm.y} stroke="rgba(201,169,110,0.35)" strokeWidth={1} strokeDasharray="4,4" />
          <Line x1={0} y1={hm.y} x2={width} y2={hm.y} stroke="rgba(201,169,110,0.35)" strokeWidth={1} strokeDasharray="4,4" />
          {feet ? (
            <Line x1={0} y1={feet.y} x2={width} y2={feet.y} stroke="rgba(201,169,110,0.25)" strokeWidth={1} strokeDasharray="4,4" />
          ) : null}
        </>
      ) : null}
      {lines.map(([a, b], i) => (
        <Line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={confColor}
          strokeOpacity={strokeOpacity}
          strokeWidth={2.5}
        />
      ))}
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={5} fill={confColor} />
      ))}
    </Svg>
  );
}
