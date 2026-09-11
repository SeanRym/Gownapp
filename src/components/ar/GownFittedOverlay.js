import { View } from "react-native";
import Svg, { Defs, ClipPath, Image, Polygon } from "react-native-svg";

/**
 * Body-fit gown overlay — port of web TryOnCamera drawGown logic.
 * Renders the gown as a trapezoid clipped around the body shoulders/hips.
 */
export function GownFittedOverlay({
  width,
  height,
  uri,
  layout,
  opacity = 0.88,
}) {
  if (!width || !height || !uri || !layout) return null;

  const { topY, bottomY, cx, topW, botW } = layout;
  const fitScale = Number(layout.fitScale ?? 1);
  const safeScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  const scaledTopW = Number(topW) * safeScale;
  const scaledBotW = Number(botW) * safeScale;
  const renderTopY = Math.max(0, Math.min(Number(topY) || 0, height * 0.4));
  const requestedHeight = (Number(bottomY) - Number(topY)) * safeScale;
  const availableHeight = Math.max(4, height - renderTopY);
  const h = Math.min(
    Math.max(Number.isFinite(requestedHeight) ? requestedHeight : height * 0.8, height * 0.35),
    availableHeight
  );
  const scaledBottomY = renderTopY + h;

  if (h <= 4 || scaledTopW <= 4 || scaledBotW <= 4) return null;

  const x1 = cx - scaledTopW / 2;
  const y1 = renderTopY;
  const x2 = cx + scaledTopW / 2;
  const y2 = renderTopY;
  const x3 = cx + scaledBotW / 2;
  const y3 = scaledBottomY;
  const x4 = cx - scaledBotW / 2;
  const y4 = scaledBottomY;

  const clipId = `gown-clip-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        overflow: "hidden",
        zIndex: 2,
        elevation: 2,
      }}
    >
      <Svg width={width} height={height} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id={clipId}>
            <Polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`} />
          </ClipPath>
        </Defs>
        <Image
          x={cx - scaledBotW / 2}
          y={renderTopY}
          width={scaledBotW}
          height={h}
          href={{ uri }}
          clipPath={`url(#${clipId})`}
          opacity={opacity}
        />
      </Svg>
    </View>
  );
}
