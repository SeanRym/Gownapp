import { useId } from "react";
import { ClipPath, Defs, G, Image as SvgImage, Mask, Polygon, Rect, Svg } from "react-native-svg";

/**
 * Draws try-on gown in a trapezoid clipped to shoulders → hem (same as gownweb drawGown).
 */
export function GownFittedOverlay({
  width,
  height,
  uri,
  layout,
  opacity = 0.88,
  landmarksNorm,
  limbHoles = false,
  holeRadius,
}) {
  const uid = useId().replace(/:/g, "");
  const clipId = `gownClip_${uid}`;
  const maskId = `gownMask_${uid}`;

  if (!width || !height || !uri || !layout) return null;

  const { topY, bottomY, cx, topW, botW } = layout;
  const h = bottomY - topY;
  if (h <= 4 || topW <= 4 || botW <= 4) return null;

  const left = cx - botW / 2;
  const imgW = botW;
  const imgH = h;

  const polyPoints = [
    cx - topW / 2,
    topY,
    cx + topW / 2,
    topY,
    cx + botW / 2,
    bottomY,
    cx - botW / 2,
    bottomY,
  ].join(" ");

  const r = holeRadius ?? Math.min(width, height) * 0.055;
  const holes = [];
  if (limbHoles && landmarksNorm) {
    for (const key of ["leftWrist", "rightWrist", "leftElbow", "rightElbow"]) {
      const p = landmarksNorm[key];
      if (p) holes.push({ cx: p.x * width, cy: p.y * height, key });
    }
  }

  return (
    <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Polygon points={polyPoints} />
        </ClipPath>
        {limbHoles && holes.length > 0 ? (
          <Mask id={maskId} x="0" y="0" width={width} height={height}>
            <Rect width={width} height={height} fill="#ffffff" />
            {holes.map((hole) => (
              <Rect
                key={hole.key}
                x={hole.cx - r}
                y={hole.cy - r}
                width={r * 2}
                height={r * 2}
                rx={r}
                fill="#000000"
              />
            ))}
          </Mask>
        ) : null}
      </Defs>
      <G clipPath={`url(#${clipId})`} mask={limbHoles && holes.length > 0 ? `url(#${maskId})` : undefined}>
        <SvgImage
          x={left}
          y={topY}
          width={imgW}
          height={imgH}
          href={{ uri }}
          preserveAspectRatio="xMidYMid meet"
          opacity={opacity}
        />
      </G>
    </Svg>
  );
}
