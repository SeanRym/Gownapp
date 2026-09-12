import { NativeModules } from "react-native";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
} from "react-native-vision-camera";
import * as FileSystem from "react-native-fs";

const { MoveNetNativeModule } = NativeModules;

/**
 * Native pose camera. Android uses TFLite MoveNet; iOS uses Apple Vision.
 *
 * Captures each frame, writes it to disk, and runs MoveNet native inference on the Android side.
 * Returns real MoveNet landmarks in the app's normalized pose contract.
 */
export const TensorFlowLiteMoveNetCamera = forwardRef(function TensorFlowLiteMoveNetCamera({
  facing,
  isActive,
  onPoseMap,
  onVideoDimensions,
  onModelStatus,
  onDeviceUnavailable,
  targetFps = 15,
  resizeMode = "contain",
  enablePinchZoom = true,
  torch = false,
}, ref) {
  const device = useCameraDevice(facing === "front" ? "front" : "back");
  const cameraRef = useRef(null);
  const inferenceInFlightRef = useRef(false);
  const photoCaptureInFlightRef = useRef(false);

  useImperativeHandle(ref, () => ({
    takePhoto: () => cameraRef.current?.takePhoto({ enableShutterSound: false }),
  }), []);

  useEffect(() => {
    if (!device) {
      console.error(`[MoveNet] Camera device not available for facing: ${facing}`);
      console.warn("[MoveNet] This may indicate:");
      console.warn("  1. Camera permission not granted");
      console.warn("  2. Device doesn't have a " + facing + " camera");
      console.warn("  3. Vision camera plugin initialization failed");
      onDeviceUnavailable?.();
    } else {
      console.log(`[MoveNet] Camera device ready (${facing}):`, {
        id: device.id,
        position: device.position,
        hasMicrophone: device.hasMicrophone,
      });
    }
  }, [device, facing, onDeviceUnavailable]);

  const format = useCameraFormat(device, [
    { fps: 30, videoResolution: { width: 1280, height: 720 } },
    { fps: 30, videoResolution: { width: 720, height: 1280 } },
    { fps: 30, videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

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

  useEffect(() => {
    if (!MoveNetNativeModule) {
      console.warn("MoveNetNativeModule not available");
      onModelStatus?.(false);
      return;
    }

    (async () => {
      try {
        const result = await MoveNetNativeModule.initializeModel(
          "movenet_singlepose_lightning_float16.tflite"
        );
        console.log("MoveNet native model initialized:", result);
        onModelStatus?.(result === true || result?.success === true);
      } catch (err) {
        console.error("Failed to initialize MoveNet model:", err);
        onModelStatus?.(false);
      }
    })();
  }, [onModelStatus]);

  const onPoseRef = useRef(onPoseMap);
  onPoseRef.current = onPoseMap;

  const handleNativePose = useCallback(async (filePath, width, height, orientation) => {
    if (inferenceInFlightRef.current) {
      FileSystem.unlink(filePath).catch(() => {});
      return;
    }
    inferenceInFlightRef.current = true;

    if (!MoveNetNativeModule) {
      console.error("[MoveNet] Native module not available");
      onPoseRef.current?.({ imageWidth: width, imageHeight: height, error: "movenet_module_missing" });
      inferenceInFlightRef.current = false;
      return;
    }

    try {
      const result = await MoveNetNativeModule.getLandmarksFromBitmap(filePath, width, height);
      const isSuccess = result === true || result?.success === true;
      const payload = isSuccess ? (result?.landmarks ?? result?.keypoints ?? result ?? {}) : result ?? {};
      const keypoints = payload && typeof payload === "object" ? (payload.keypoints ?? payload.landmarks ?? payload) : null;
      const imageWidth = Number(result?.imageWidth ?? payload?.imageWidth ?? width) || width;
      const imageHeight = Number(result?.imageHeight ?? payload?.imageHeight ?? height) || height;

      if (!keypoints || Object.keys(keypoints).length === 0) {
        console.warn("[MoveNet] No keypoints returned from native inference");
        onPoseRef.current?.({ imageWidth, imageHeight, error: "movenet_no_landmarks" });
        return;
      }

      console.log("[MoveNet] Native inference success, keypoint count:", Object.keys(keypoints).length);
      onPoseRef.current?.({
        imageWidth,
        imageHeight,
        orientation,
        keypoints,
        source: "tensorflow-lite-movenet",
      });
    } catch (error) {
      console.error("[MoveNet] Inference error:", String(error?.message || error));
      onPoseRef.current?.({
        imageWidth: width,
        imageHeight: height,
        error: String(error?.message || error || "movenet_inference_failed"),
      });
    } finally {
      inferenceInFlightRef.current = false;
      FileSystem.unlink(filePath).catch(() => {});
    }
  }, []);

  const capturePhotoForPose = useCallback(async () => {
    if (photoCaptureInFlightRef.current || inferenceInFlightRef.current || !cameraRef.current) return;
    photoCaptureInFlightRef.current = true;

    try {
      console.log("[MoveNet] Capturing pose snapshot");
      const photo = await cameraRef.current.takeSnapshot({ quality: 35 });
      console.log("[MoveNet] Pose snapshot captured:", photo.path, photo.width, photo.height, photo.orientation);
      handleNativePose(
        photo.path,
        photo.width || format?.videoWidth || 720,
        photo.height || format?.videoHeight || 1280,
        photo.orientation
      );
    } catch (error) {
      console.warn("[MoveNet] Snapshot capture failed:", String(error));
    } finally {
      photoCaptureInFlightRef.current = false;
    }
  }, [handleNativePose, format?.videoWidth, format?.videoHeight]);

  useEffect(() => {
    if (!isActive || !device || !format) return undefined;
    const intervalMs = Math.max(250, Math.round(1000 / Math.max(1, targetFps)));
    const intervalId = setInterval(capturePhotoForPose, intervalMs);
    return () => clearInterval(intervalId);
  }, [capturePhotoForPose, device, format, isActive, targetFps]);

  const torchOn = Boolean(torch && device?.hasTorch);

  if (!device) {
    console.warn("[MoveNet] Camera device not available for facing:", facing);
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111", justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 20 }}>
          Camera unavailable for {facing} mode.
        </Text>
      </View>
    );
  }

  if (!format) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111", justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontSize: 16, color: "#fff", textAlign: "center", marginHorizontal: 20, fontWeight: "bold" }}>
          ⚠️ Camera format not supported
        </Text>
        <Text style={{ fontSize: 12, color: "#ddd", textAlign: "center", marginHorizontal: 20, marginTop: 8 }}>
          The device is present, but the camera stream is not compatible with this app.
        </Text>
      </View>
    );
  }

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={Boolean(isActive)}
      format={format}
      photo={true}
      enableFpsGraph={false}
      torch={torchOn ? "on" : "off"}
      zoom={zoom}
      enableZoomGesture={enablePinchZoom}
      resizeMode={resizeMode}
      fps={30}
    />
  );
});
