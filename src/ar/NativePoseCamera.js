import { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { detectPose } from "@scottjgilroy/react-native-vision-camera-v4-pose-detection/lib/module/detectPose";
import { detectNativePersonSegmentation } from "vision-camera-native-segmentation";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useFrameProcessor,
  runAtTargetFps,
} from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";

const POSE_OPTIONS = { mode: "stream", performanceMode: "max" };

function brighterExposure(device) {
  if (device?.minExposure == null || device?.maxExposure == null) return undefined;
  const { minExposure, maxExposure } = device;
  return minExposure + (maxExposure - minExposure) * 0.4;
}

/**
 * VisionCamera + ML Kit pose. Matches package example: detectPose in worklet (no runAsync).
 */
export function NativePoseCamera({
  facing,
  isActive,
  onPoseMap,
  onVideoDimensions,
  targetFps = 15,
  segmentationEnabled = false,
  segmentationFps = 5,
  onSegmentationResult,
  torch = false,
  brightenPreview = true,
  resizeMode = "contain",
  enablePinchZoom = true,
}) {
  const device = useCameraDevice(facing === "front" ? "front" : "back");

  const format = useCameraFormat(device, [
    { fps: 30 },
    { videoResolution: { width: 720, height: 1280 } },
  ]);

  const exposure = useMemo(
    () => (brightenPreview ? brighterExposure(device) : undefined),
    [brightenPreview, device]
  );

  const zoom = useMemo(() => {
    if (!device) return 1;
    const min = device.minZoom ?? 1;
    const neutral = device.neutralZoom ?? 1;
    return Math.max(min, Math.min(neutral, min * 1.05));
  }, [device]);

  useEffect(() => {
    const w = format?.videoWidth;
    const h = format?.videoHeight;
    if (w && h) onVideoDimensions?.({ width: w, height: h });
  }, [format?.videoWidth, format?.videoHeight, onVideoDimensions]);

  const onPoseRef = useRef(onPoseMap);
  onPoseRef.current = onPoseMap;
  const onSegRef = useRef(onSegmentationResult);
  onSegRef.current = onSegmentationResult;

  const emitPose = useRunOnJS((payload) => {
    onPoseRef.current?.(payload);
  }, []);

  const emitSeg = useRunOnJS((result) => {
    onSegRef.current?.(result);
  }, []);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          const data = detectPose(frame, POSE_OPTIONS);
          emitPose({
            pose: data,
            imageWidth: frame.width,
            imageHeight: frame.height,
          });
        } catch (e) {
          emitPose({ error: String(e?.message || "pose_plugin_error") });
        }
      });
      if (segmentationEnabled) {
        runAtTargetFps(segmentationFps, () => {
          "worklet";
          try {
            const seg = detectNativePersonSegmentation(frame, {});
            emitSeg(seg);
          } catch {
            emitSeg({ error: "segmentation_failed" });
          }
        });
      }
    },
    [emitPose, emitSeg, segmentationEnabled, segmentationFps, targetFps]
  );

  const torchOn = Boolean(torch && device?.hasTorch);

  if (!device) return null;

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={Boolean(isActive)}
      format={format}
      frameProcessor={frameProcessor}
      enableFpsGraph={false}
      torch={torchOn ? "on" : "off"}
      exposure={exposure}
      zoom={zoom}
      enableZoomGesture={enablePinchZoom}
      resizeMode={resizeMode}
      fps={30}
    />
  );
}
