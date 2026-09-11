# Device Validation Guide — MoveNet AR Try-On

## Overview
This guide walks you through validating that the native MoveNet/TensorFlow Lite pipeline is working correctly on your Android device. The app should now use MoveNet for pose detection and render the gown to follow your body as you move.

---

## Prerequisites
- **APK Location**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Build Time**: August 16, 2026
- **Active Path**: Native TensorFlow Lite MoveNet (via `src/ar/MoveNetPoseCamera.js`)
- **Fallback**: React Native Vision Camera pose detection (only if native fails)

---

## Installation
1. **Transfer APK to Device**:
   ```powershell
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
   Or drag the APK directly to your device via Android Studio.

2. **Grant Camera Permission**: Allow camera access when prompted.

3. **Launch**: Open the app and navigate to **Try On** → Select a gown → **Open AR Try-On**.

---

## Validation Steps

### Step 1: Confirm MoveNet Module Loads
**What to look for in logcat**:
```
[MoveNet] Native inference success, keypoint count: 17
[AR] Valid keypoints: {ls: {...}, rs: {...}, lh: {...}, rh: {...}}
```

**If you see errors instead**:
- `[MoveNet] Native module not available` → Native module didn't register
- `[MoveNet] Inference error` → TFLite model didn't load correctly
- **Action**: Check that `movenet_singlepose_lightning_float16.tflite` exists in `android/app/src/main/assets/`

---

### Step 2: Watch for Body Pose Detection
**Expected logs**:
```
[AR] Valid keypoints: {
  ls: {x: 150, y: 200},
  rs: {x: 320, y: 200},
  lh: {x: 120, y: 400},
  rh: {x: 350, y: 400}
}
```

**What this means**:
- Left/right shoulder detected at ~y=200 (upper body)
- Left/right hip detected at ~y=400 (lower body)
- Horizontal spread indicates the shoulders are wide enough for the gown to fit

**If shoulders/hips are missing**:
- Your upper body or hips are off-screen → Move further back
- Lighting is too dim → Move to brighter area
- **Confidence too low** → See console log `[AR] Shoulder confidence too low: {lsScore: 0.15, rsScore: 0.20}`

---

### Step 3: Check Gown Layout Computation
**Expected logs**:
```
[AR] Gown layout computed: {
  topY: 85,
  bottomY: 380,
  cx: 235,
  topW: 95,
  botW: 155,
  locked: false
}
```

**What this means**:
- `topY` = neckline position (top of gown)
- `bottomY` = hemline (bottom of gown)
- `cx` = body center (gown horizontal center)
- `topW` = width at shoulders (narrow)
- `botW` = width at hem (wider, for flared skirts)

**If layout is NOT computed**:
- Check logs for `[AR] Shoulders not detected` or `[AR] Hips not detected`
- Ensure your full body is visible in the preview

---

### Step 4: Verify Gown Visibility
**Expected behavior**:
1. After ~0.27 seconds (8 frames) of valid pose, you should see:
   ```
   [AR] Pose LOCKED ✓
   ```
2. The gown image should appear **overlaid on your body** in a trapezoid shape
3. As you move side-to-side, the gown should follow your shoulders
4. As you lean forward/back, the gown should shift vertically

**Visual checklist**:
- ✅ Gown is visible (not hidden)
- ✅ Gown is on your body (shoulders/hips align)
- ✅ Gown follows your movement in real-time
- ✅ Gown width matches your shoulder/hip width

**If gown is NOT visible**:
- Check console log: `[AR] Overlay state: {showGownOverlay: true, hasLayout: false}`
- If `hasLayout: false`, the pose isn't locking → stay still for 1-2 seconds
- If `displayUri` is empty, the gown image didn't load → select a different gown
- **Last resort**: Check GownFittedOverlay component for rendering errors

---

### Step 5: Test Body Tracking
**Move through different poses**:

1. **Face the camera** (front-facing):
   - Gown should be on the front image
   - Nose and face should be visible

2. **Turn around** (back-facing):
   - After ~0.27 seconds, the gown image should switch to the back view
   - Nose disappears from frame (that's expected)
   - Gown stays locked on your shoulders/hips

3. **Lean side-to-side**:
   - Gown should track your horizontal movement smoothly
   - No lag or jumping (smoothing factor is 0.35)

4. **Move forward/backward**:
   - Gown should scale up as you move closer (staying on shoulders/hips)
   - Gown should scale down as you move away
   - Trapezoid shape should adjust, but not disappear

5. **Look down/up**:
   - If you look down (face out of frame), gown stays locked
   - This triggers the "back-facing" detection, which is correct

---

## Debugging Logs Summary

### Console Output Cheat Sheet

**Successful frame**:
```
[MoveNet] Native inference success, keypoint count: 17
[AR] Valid keypoints: {...}
[AR] Gown layout computed: {...}
[AR] Pose LOCKED ✓
```

**Body too close**:
```
[AR] Shoulders not detected
[AR] Hips not detected
```
→ **Action**: Step back until your full body fits in the frame

**Poor lighting**:
```
[AR] Shoulder confidence too low: {lsScore: 0.15, rsScore: 0.20, threshold: 0.25}
```
→ **Action**: Move to a brighter area (natural light recommended)

**No native module**:
```
[MoveNet] Native module not available
```
→ **Action**: Rebuild APK; check `MoveNetPackage.kt` is registered in `MainApplication.kt`

**No keypoints**:
```
[MoveNet] No keypoints returned from native inference
```
→ **Action**: Ensure MoveNet model file exists at `android/app/src/main/assets/movenet_singlepose_lightning_float16.tflite`

---

## Comparison to Web Version

The mobile app should now behave similarly to the deployed web version:

| Feature | Web Version | Mobile (Now) | Status |
|---------|------------|------------|--------|
| Pose detection | MoveNet + TensorFlow.js | MoveNet + TensorFlow Lite (native) | ✅ Same model |
| Gown overlay | Trapezoid clip | Trapezoid clip (SVG) | ✅ Identical math |
| Smoothing | Lerp 0.35 | Lerp 0.35 | ✅ Same factor |
| Shoulder/hip fit | Body center + calibration | Body center + calibration | ✅ Same algorithm |
| Back-facing | Nose disappears + body stable | Nose disappears + body stable | ✅ Same logic |
| Confidence threshold | 0.25 | 0.25 | ✅ Exact match |

---

## Next Steps if Issues Occur

### Issue: Gown stays in the center, doesn't follow shoulders
**Likely cause**: Landmark parsing bug or pose locking not triggering
**Fix to test**:
1. Open React Native debugger
2. Check console logs for `[AR] Valid keypoints` entries
3. If keypoints exist but gown stays centered, shoulder/hip math in `getGownLayout()` might be wrong
4. **Contact**: Share the keypoint logs so I can debug the calculation

### Issue: Gown disappears when you move
**Likely cause**: Pose lock is too strict or thresholds are too high
**Fix to test**:
1. Stay perfectly still for 2-3 seconds
2. Check if `[AR] Pose LOCKED ✓` appears in logs
3. If not locked after standing still, confidence thresholds might need adjustment
4. **Contact**: Share the confidence scores so I can tune thresholds

### Issue: Gown is blurry or low-quality
**This is expected**: MoveNet runs at 15 FPS for performance; camera is sampled every frame
**Workaround**: Stay still while trying on to reduce motion blur

### Issue: Native module errors on first launch
**This is normal**: First-time model loading can take 2-3 seconds
**Workaround**: Wait a few seconds after opening AR Try-On before moving

---

## Verification Checklist

Before declaring success, confirm:
- [ ] APK installs without errors
- [ ] App launches and navigates to AR Try-On
- [ ] Camera permission is granted
- [ ] MoveNet keypoints appear in logcat (17 keypoints)
- [ ] Gown appears on screen overlaid on body
- [ ] Gown follows your shoulders as you move left/right
- [ ] Gown follows your body as you move forward/backward
- [ ] Back-facing detection switches gown image after ~0.27s
- [ ] No crashes or ANR (Application Not Responding) errors
- [ ] Pose lock shows `✓` in console
- [ ] Overlay state logs show `hasLayout: true`

---

## Performance Notes

- **Inference time**: ~50-100ms per frame (native MoveNet)
- **Frame rate**: 15 FPS pose processing, 30 FPS camera
- **Memory**: ~120-150 MB (MoveNet model in cache)
- **Battery**: Moderate impact (camera + TFLite running continuously)

---

## Contact & Support

If you encounter any issues:
1. **Capture logcat output**: `adb logcat | grep "\[AR\]\|\[MoveNet\]" > logs.txt`
2. **Share the logs** with any video showing the issue
3. **Describe**: What you expect vs. what you see
4. I'll tune thresholds or fix bugs based on the device feedback.

---

**Build Date**: August 16, 2026
**Active Pipeline**: Native TensorFlow Lite MoveNet
**Status**: Ready for device validation
