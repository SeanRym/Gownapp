import jpeg from "jpeg-js";
import { detectSkinProfileFromRgba } from "./skinTone";

function base64ToUint8Array(base64) {
  const binary = atob(base64.replace(/^data:image\/\w+;base64,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode a JPEG base64 capture and sample skin tone at nose position (normalized 0–1).
 */
export function detectSkinFromSnapshotBase64(base64, noseNormX, noseNormY) {
  if (!base64 || noseNormX == null || noseNormY == null) return null;
  try {
    const raw = base64ToUint8Array(base64);
    const decoded = jpeg.decode(raw, { useTArray: true });
    const cx = noseNormX * decoded.width;
    const cy = noseNormY * decoded.height;
    return detectSkinProfileFromRgba(decoded.data, decoded.width, decoded.height, cx, cy);
  } catch {
    return null;
  }
}
