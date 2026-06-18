/**
 * Map normalized pose (0–1 in ML Kit image space) to on-screen preview coordinates.
 */
export function mapLandmarkToPreview(lm, layoutW, layoutH, imageW, imageH, resizeMode = "contain") {
  if (!lm || !layoutW || !layoutH || !imageW || !imageH) return null;

  const videoAspect = imageW / imageH;
  const viewAspect = layoutW / layoutH;
  let scale;
  let offsetX;
  let offsetY;

  if (resizeMode === "cover") {
    if (videoAspect > viewAspect) {
      scale = layoutH / imageH;
      offsetX = (layoutW - imageW * scale) / 2;
      offsetY = 0;
    } else {
      scale = layoutW / imageW;
      offsetX = 0;
      offsetY = (layoutH - imageH * scale) / 2;
    }
  } else if (videoAspect > viewAspect) {
    scale = layoutW / imageW;
    offsetX = 0;
    offsetY = (layoutH - imageH * scale) / 2;
  } else {
    scale = layoutH / imageH;
    offsetX = (layoutW - imageW * scale) / 2;
    offsetY = 0;
  }

  const mapPoint = (p) => ({
    x: offsetX + p.x * imageW * scale,
    y: offsetY + p.y * imageH * scale,
  });

  const out = {};
  for (const [name, p] of Object.entries(lm)) {
    if (p && typeof p.x === "number" && typeof p.y === "number") {
      out[name] = mapPoint(p);
    }
  }
  return out;
}
