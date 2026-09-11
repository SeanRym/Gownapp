import { TensorFlowLiteMoveNetCamera } from "./TensorFlowLiteMoveNetCamera";
import { forwardRef } from "react";

/**
 * MoveNet + TensorFlow Lite only.
 */
export const MoveNetPoseCamera = forwardRef(function MoveNetPoseCamera({
  facing,
  isActive,
  onPoseMap,
  onVideoDimensions,
  onModelStatus,
  targetFps = 15,
  resizeMode = "cover",
}, ref) {
  if (!isActive) return null;

  return (
    <TensorFlowLiteMoveNetCamera
      facing={facing}
      isActive={isActive}
      onPoseMap={onPoseMap}
      onVideoDimensions={onVideoDimensions}
      onModelStatus={onModelStatus}
      targetFps={targetFps}
      resizeMode={resizeMode}
      enablePinchZoom={false}
      ref={ref}
    />
  );
});
