import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { useCameraPermissions } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { captureRef } from "react-native-view-shot";
import { MoveNetPoseCamera } from "../ar/MoveNetPoseCamera";
import { GownFittedOverlay } from "../components/ar/GownFittedOverlay";
import {
  analyzeTryonPose,
  getGownLayout,
  getGownLayoutTryon,
  parseTryonCalibration,
  resolveTryonImageUri,
  smoothGownLayout,
} from "../ar/gownLayout";
import { tryonPayloadToPixelKps } from "../ar/tryonPoseMap";
import { useShop } from "../context/ShopContext";
import { saveTryonSnapshot } from "../services/fitting";
import { brand } from "../theme/brand";
import { filterGownsForProfile } from "../utils/gownSegmentFilter";
import { idsEqual } from "../utils/id";

const canUseNativePose = Platform.OS !== "web";

// Pose lock: require N consecutive good frames before enabling capture.
// This keeps the gown visible and stable, matching web deployed behavior.
const LOCK_THRESHOLD = 8;  // ~0.27s at 30fps

// Facing back direction smoothing: require N consecutive frames before switching.
const FACING_THRESHOLD = 8; // ~0.27s at 30fps

/**
 * AR Try-On Screen — Exact web logic port
 * 
 * Pose lock mechanism: gown stays visible once locked, doesn't disappear on tracking glitches.
 * Facing back smoothing: sustained detection required before switching images.
 */
export function ARTryOnScreen({ route }) {
  const navigation = useNavigation();
  const { gowns, user } = useShop();
  const saveToProfile = Boolean(route?.params?.saveToProfile && user?.id);
  const catalogGowns = useMemo(
    () =>
      filterGownsForProfile(gowns, {
        segment: route?.params?.segment || "women",
        childGender: route?.params?.childGender || null,
      }),
    [gowns, route?.params?.segment, route?.params?.childGender]
  );
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState("front");
  const initialId = route?.params?.id || null;
  const [selectedId, setSelectedId] = useState(initialId);
  const [saving, setSaving] = useState(false);
  const [previewLayout, setPreviewLayout] = useState({ width: 320, height: 430 });
  const [liveGownLayout, setLiveGownLayout] = useState(null);
  const [poseLocked, setPoseLocked] = useState(false);    // replaces poseOk for stable capture gate
  const [poseFound, setPoseFound] = useState(false);      // visual indicator
  const [modelReady, setModelReady] = useState(false);
  const [shouldersFound, setShouldersFound] = useState(false);
  const [hipsFound, setHipsFound] = useState(false);
  const [tryonPoseIssues, setTryonPoseIssues] = useState([]);
  const [facingBack, setFacingBack] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [capturePhotoUri, setCapturePhotoUri] = useState(null);
  const countdownRef = useRef(null);
  const previewRef = useRef(null);
  const cameraRef = useRef(null);
  const videoDimsRef = useRef({ width: 720, height: 1280 });
  const previewLayoutRef = useRef({ width: 320, height: 430 });
  const gownLayoutSmoothRef = useRef(null);
  const lastGoodLayoutRef = useRef(null);
  const selectedGownRef = useRef(null);
  const prevKpsRef = useRef(null);
  const staleLayoutFramesRef = useRef(0);

  // Pose lock tracking
  const goodFramesRef = useRef(0);
  
  // Facing back smoothing
  const facingBackFramesRef = useRef(0);

  const selectedGown = useMemo(() => {
    const fallback = catalogGowns[0] || null;
    if (!catalogGowns.length) return null;
    if (!selectedId) return fallback;
    return catalogGowns.find((g) => idsEqual(g.id, selectedId)) || fallback;
  }, [catalogGowns, selectedId]);

  useEffect(() => {
    selectedGownRef.current = selectedGown;
    if (selectedGown?.id) {
      console.log("[AR] Gown selected:", {
        id: selectedGown.id,
        name: selectedGown.name,
        hasImage: Boolean(selectedGown.image),
        hasTryonImage: Boolean(selectedGown.tryonImage),
        hasTryonImageBack: Boolean(selectedGown.tryonImageBack),
      });
    }
  }, [selectedGown]);

  // When gown selection changes, reset pose lock
  useEffect(() => {
    goodFramesRef.current = 0;
    setPoseLocked(false);
    setPoseFound(false);
    setShouldersFound(false);
    setHipsFound(false);
    setTryonPoseIssues([]);
    facingBackFramesRef.current = 0;
    setFacingBack(false);
    prevKpsRef.current = null;
    gownLayoutSmoothRef.current = null;
    lastGoodLayoutRef.current = null;
    staleLayoutFramesRef.current = 0;
    setLiveGownLayout(null);
  }, [selectedGown?.id]);

  const tryonUri = useMemo(() => resolveTryonImageUri(selectedGown, facingBack), [selectedGown, facingBack]);
  const displayUri = tryonUri || selectedGown?.image || selectedGown?.tryonImage || "";

  useEffect(() => {
    if (selectedGown?.id && displayUri) {
      console.log("[AR] Gown " + selectedGown.id + " loaded with image");
    }
  }, [selectedGown?.id, displayUri]);

  useEffect(() => {
    console.log("[AR] Selected gown:", selectedGown);
    console.log("[AR] Try-on URL:", displayUri);
  }, [selectedGown, displayUri]);

  // Do not use a fixed centered fallback. The gown must follow the body by using the live
  // shoulder/hip geometry. If that layout is missing, the overlay should not be rendered.
  const overlayLayout = liveGownLayout ?? lastGoodLayoutRef.current ?? null;
  const canCaptureGown = canUseNativePose && poseFound && Boolean(overlayLayout) && Boolean(displayUri);
  const showGownOverlay = Boolean(displayUri) && !!overlayLayout && poseFound;

  const onVideoDimensions = useCallback((dims) => {
    if (dims?.width && dims?.height) videoDimsRef.current = dims;
  }, []);

  const onPoseMap = useCallback(
    (payload) => {
      if (!canUseNativePose) return;

      if (payload?.error) {
        console.warn("[AR] MoveNet error:", payload.error);
        return;
      }

      const { width: vw, height: vh } = previewLayoutRef.current;
      const kps = tryonPayloadToPixelKps(payload, vw, vh);
      if (!kps?.leftShoulder || !kps?.rightShoulder) {
        setShouldersFound(false);
        setHipsFound(false);
        return;
      }

      const shoulderCenterX = (kps.leftShoulder.x + kps.rightShoulder.x) / 2;
      const shoulderCenterY = (kps.leftShoulder.y + kps.rightShoulder.y) / 2;
      const previewCenterX = vw / 2;
      console.log("[AR] Keypoints after transform:", {
        shoulderCenter: { x: Math.round(shoulderCenterX), y: Math.round(shoulderCenterY) },
        previewCenter: Math.round(previewCenterX),
        distanceFromCenter: Math.round(Math.abs(shoulderCenterX - previewCenterX)),
        ls: { x: Math.round(kps.leftShoulder.x), y: Math.round(kps.leftShoulder.y) },
        rs: { x: Math.round(kps.rightShoulder.x), y: Math.round(kps.rightShoulder.y) },
        lh: kps.leftHip
          ? { x: Math.round(kps.leftHip.x), y: Math.round(kps.leftHip.y) }
          : null,
        rh: kps.rightHip
          ? { x: Math.round(kps.rightHip.x), y: Math.round(kps.rightHip.y) }
          : null,
        previewDims: { vw, vh },
        facing: cameraFacing,
      });

      // Smooth keypoints matching web version (lerp 0.35)
      let smoothedKps = kps;
      if (prevKpsRef.current) {
        const t = 0.35;
        const lerp = (a, b) => a + (b - a) * t;
        const lerpKp = (curr, prev) => {
          if (!curr || !prev) return curr;
          return {
            x: lerp(prev.x, curr.x),
            y: lerp(prev.y, curr.y),
            score: curr.score ?? 1,
          };
        };
        smoothedKps = {
          nose: lerpKp(kps.nose, prevKpsRef.current.nose),
          leftShoulder: lerpKp(kps.leftShoulder, prevKpsRef.current.leftShoulder),
          rightShoulder: lerpKp(kps.rightShoulder, prevKpsRef.current.rightShoulder),
          leftHip: lerpKp(kps.leftHip, prevKpsRef.current.leftHip),
          rightHip: lerpKp(kps.rightHip, prevKpsRef.current.rightHip),
          leftKnee: lerpKp(kps.leftKnee, prevKpsRef.current.leftKnee),
          rightKnee: lerpKp(kps.rightKnee, prevKpsRef.current.rightKnee),
          leftAnkle: lerpKp(kps.leftAnkle, prevKpsRef.current.leftAnkle),
          rightAnkle: lerpKp(kps.rightAnkle, prevKpsRef.current.rightAnkle),
        };
      }
      prevKpsRef.current = smoothedKps;

      const analysis = analyzeTryonPose(smoothedKps, vw, vh);
      setTryonPoseIssues(analysis.issues || []);
      setShouldersFound(Boolean(analysis.shouldersOk));
      setHipsFound(Boolean(analysis.hipsOk));

      // Smooth back-facing transitions — require 8 consecutive frames (web logic)
      const tooCloseFrame = analysis.issues.includes("too_close") && !analysis.facingBack;
      if (tooCloseFrame) {
        facingBackFramesRef.current = 0;
      } else if (analysis.facingBack) {
        facingBackFramesRef.current = Math.min(facingBackFramesRef.current + 1, 8);
      } else {
        facingBackFramesRef.current = Math.max(facingBackFramesRef.current - 1, 0);
      }
      const isBackFacing = facingBackFramesRef.current >= 8;
      setFacingBack(isBackFacing);

      const cal = parseTryonCalibration(selectedGownRef.current?.tryonCalibration);
      const gownSilhouette = selectedGownRef.current?.silhouette || selectedGownRef.current?.type || "";
      const strictLayout = getGownLayout(smoothedKps, { ...cal, silhouette: gownSilhouette }, vw, vh);
      const layout = getGownLayoutTryon(smoothedKps, { ...cal, silhouette: gownSilhouette }, vw, vh);

      const renderShouldersOk =
        smoothedKps.leftShoulder?.score > 0.2 && smoothedKps.rightShoulder?.score > 0.2;
      const hasBodyAnchors = Boolean(layout && renderShouldersOk);
      const strictBodyLayout = Boolean(strictLayout && analysis.shouldersOk && analysis.hipsOk);
      const isPrimaryGood = strictBodyLayout && analysis.issues.length === 0;
      console.log(
        "[AR] Pose analysis " +
          JSON.stringify({
            shouldersOk: analysis.shouldersOk,
            hipsOk: analysis.hipsOk,
            issues: analysis.issues,
            layoutReady: Boolean(layout),
            scores: {
              leftShoulder: kps.leftShoulder?.score,
              rightShoulder: kps.rightShoulder?.score,
              leftHip: kps.leftHip?.score,
              rightHip: kps.rightHip?.score,
            },
          })
      );

      if (hasBodyAnchors) {
        setPoseFound(true);
        setTryonPoseIssues(analysis.issues || []);
        staleLayoutFramesRef.current = 0;

        if (isPrimaryGood) {
          goodFramesRef.current = Math.min(goodFramesRef.current + 1, 8);
          if (goodFramesRef.current >= 8) {
            setPoseLocked(true);
          }
        } else {
          goodFramesRef.current = Math.max(0, goodFramesRef.current - 1);
        }

        gownLayoutSmoothRef.current = smoothGownLayout(gownLayoutSmoothRef.current, layout, 0.92);
        lastGoodLayoutRef.current = gownLayoutSmoothRef.current;
        setLiveGownLayout({ ...gownLayoutSmoothRef.current });
      } else {
        setPoseFound(false);
        setTryonPoseIssues(analysis.issues || []);
        // Web version decrements by 2, not 1 — faster rejection of weak frames
        goodFramesRef.current = Math.max(0, goodFramesRef.current - 2);
        if (goodFramesRef.current === 0) {
          setPoseLocked(false);
        }

        staleLayoutFramesRef.current += 1;
        // Keep the last known position visible for a short grace period so the gown does
        // not vanish during normal pose jitter (web also does this)
        if (staleLayoutFramesRef.current >= 30) {
          gownLayoutSmoothRef.current = null;
          lastGoodLayoutRef.current = null;
          setLiveGownLayout(null);
        }
      }
    },
    [cameraFacing, canUseNativePose]
  );

  useEffect(() => {
    previewLayoutRef.current = previewLayout;
  }, [previewLayout]);

  // Log gown overlay visibility state for debugging
  useEffect(() => {
    console.log("[AR] Overlay state:", {
      showGownOverlay,
      hasLayout: !!overlayLayout,
      displayUri: Boolean(displayUri),
      poseLocked,
      poseFound,
      canCaptureGown,
      previewDims: previewLayout,
    });
  }, [showGownOverlay, overlayLayout, displayUri, poseLocked, poseFound, canCaptureGown, previewLayout]);

  useEffect(() => {
    gownLayoutSmoothRef.current = null;
    lastGoodLayoutRef.current = null;
    setLiveGownLayout(null);
    setPoseLocked(false);
    setPoseFound(false);
    setShouldersFound(false);
    setHipsFound(false);
    setTryonPoseIssues([]);
    setFacingBack(false);
    goodFramesRef.current = 0;
    facingBackFramesRef.current = 0;
    staleLayoutFramesRef.current = 0;
    prevKpsRef.current = null;
  }, [cameraFacing, selectedGown?.id]);

  // Timer countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      onCaptureAndSave();
      return;
    }
    countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(countdownRef.current);
  }, [countdown]);

  const startTimedCapture = useCallback(() => {
    if (timerSecs === 0) {
      onCaptureAndSave();
    } else {
      setCountdown(timerSecs);
    }
  }, [timerSecs]);

  const cancelCountdown = useCallback(() => {
    clearTimeout(countdownRef.current);
    setCountdown(null);
  }, []);

  const onCaptureAndSave = async () => {
    let capturedPhotoPath = null;
    let profileSaved = false;
    try {
      setSaving(true);
      const cameraPhoto = await cameraRef.current?.takePhoto?.();
      if (cameraPhoto?.path) {
        capturedPhotoPath = cameraPhoto.path;
        const photoUri = cameraPhoto.path.startsWith("file://")
          ? cameraPhoto.path
          : `file://${cameraPhoto.path}`;
        setCapturePhotoUri(photoUri);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const base64 = await captureRef(previewRef, {
        format: "jpg",
        quality: 0.9,
        result: "base64",
      });
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      if (saveToProfile) {
        try {
          await saveTryonSnapshot(user.id, {
            image: dataUrl,
            gownId: selectedGown?.id,
            gownName: route?.params?.gownName || selectedGown?.name || "",
          });
          profileSaved = true;
          navigation.navigate("FittingStudio", {
            panel: "tryon",
            gownId: selectedGown?.id,
            tryonSaveMsg: "✓ Saved to your profile",
          });
        } catch (e) {
          console.warn("Profile snapshot was not saved:", e?.message || e);
        }
      }

      const uri = await captureRef(previewRef, {
        format: "jpg",
        quality: 0.9,
        result: "tmpfile",
      });

      try {
        const permissionResult = await MediaLibrary.requestPermissionsAsync(true);
        if (!permissionResult.granted) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(uri, { dialogTitle: "Save or share your AR preview" });
            Alert.alert(
              "Preview ready",
              profileSaved
                ? "Saved to your profile. Opened share options for your device gallery."
                : "Opened share options so you can save the AR image."
            );
          } else {
            Alert.alert("Permission needed", "Please allow media library access to save your AR preview.");
          }
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert(
          "Saved",
          profileSaved
            ? "Try-on saved to your profile and device gallery."
            : "Your AR try-on preview has been saved to your gallery."
        );
      } catch {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { dialogTitle: "Save or share your AR preview" });
          Alert.alert(
            "Preview ready",
            profileSaved
              ? "Saved to your profile. Opened share options for your device."
              : "Opened share options so you can save the AR image."
          );
        } else if (profileSaved) {
          Alert.alert("Saved to profile", "Try-on image saved to your account.");
        } else {
          Alert.alert("Preview captured", "The preview was captured, but could not be saved to the gallery.");
        }
      }
    } catch (err) {
      Alert.alert("Save failed", "Could not save preview. Please try again.");
    } finally {
      setCapturePhotoUri(null);
      setSaving(false);
      if (capturedPhotoPath) {
        try {
          const FileSystem = require("react-native-fs");
          await FileSystem.unlink(capturedPhotoPath);
        } catch {
          // The temporary camera photo may already have been removed by the camera.
        }
      }
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>AR Try-On</Text>
        <Text style={styles.subtitle}>
          To use AR try-on, allow camera access. We only use your camera for live preview.
        </Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  if (!selectedGown) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>
          {catalogGowns.length === 0 && route?.params?.segment
            ? "No items match this segment in the catalogue yet."
            : "No gowns available yet."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <View style={styles.header}>
        <Text style={styles.title}>Try On</Text>
        <Text style={styles.subtitle}>{selectedGown.name}</Text>
        <Pressable style={styles.flipBtn} onPress={() => setCameraFacing((v) => (v === "front" ? "back" : "front"))}>
          <Text style={styles.flipBtnText}>🔄 Flip Camera</Text>
        </Pressable>
      </View>

      <View
        ref={previewRef}
        collapsable={false}
        style={styles.cameraWrap}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setPreviewLayout({ width, height });
        }}
      >
        <MoveNetPoseCamera
          facing={cameraFacing}
          ref={cameraRef}
          isActive={Boolean(permission?.granted && isFocused)}
          onPoseMap={onPoseMap}
          onVideoDimensions={onVideoDimensions}
          onModelStatus={setModelReady}
          targetFps={12}
          resizeMode="contain"
        />

        {capturePhotoUri && (
          <Image
            source={{ uri: capturePhotoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            pointerEvents="none"
          />
        )}

        {showGownOverlay && overlayLayout && (
          <GownFittedOverlay
            width={previewLayout.width}
            height={previewLayout.height}
            uri={displayUri}
            layout={overlayLayout}
            opacity={0.88}
          />
        )}

        {canCaptureGown && countdown === null && (
          <View style={styles.poseBadge}>
            <Text style={styles.poseBadgeText}>🔒 Locked</Text>
          </View>
        )}

        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
      </View>

      <Pressable
        style={styles.btn}
        onPress={countdown !== null ? cancelCountdown : startTimedCapture}
        disabled={saving || !canCaptureGown}
      >
        {countdown !== null ? (
          <Text style={styles.btnText}>Cancel ({countdown}s)</Text>
        ) : saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={brand.white} />
            <Text style={styles.btnText}>Saving…</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>📷 Capture</Text>
        )}
      </Pressable>

      {canCaptureGown && countdown === null && (
        <View style={styles.timerGroup}>
          <Text style={styles.timerCaption}>Self-timer</Text>
          <View style={styles.timerRow}>
            {[0, 3, 5, 10].map((s) => (
              <Pressable
                key={s}
                style={[styles.timerBtn, timerSecs === s ? styles.timerBtnActive : null]}
                onPress={() => setTimerSecs(s)}
                disabled={countdown !== null}
              >
                <Text style={[styles.timerBtnText, timerSecs === s ? styles.timerBtnTextActive : null]}>
                  {s === 0 ? "No timer" : `${s}s`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.label}>Choose a gown</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} nestedScrollEnabled>
        {catalogGowns.map((g) => (
          <Pressable
            key={g.id}
            style={[styles.stripItem, idsEqual(g.id, selectedGown?.id) ? styles.stripItemSel : null]}
            onPress={() => setSelectedId(g.id)}
          >
            <Image source={{ uri: g.image }} style={styles.stripThumb} />
            <Text style={styles.stripName} numberOfLines={2}>
              {g.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  screenContent: { padding: 16, paddingBottom: 28 },
  center: { flex: 1, backgroundColor: brand.bg, alignItems: "center", justifyContent: "center", padding: 16 },
  header: { marginBottom: 12 },
  title: { fontSize: 28, color: brand.dark, fontWeight: "900", marginBottom: 4, fontStyle: "italic" },
  subtitle: { color: brand.textLight, lineHeight: 18, fontSize: 12, marginBottom: 8 },
  flipBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: brand.white, borderRadius: 8, borderWidth: 1, borderColor: brand.border, alignSelf: "flex-start" },
  flipBtnText: { color: brand.dark, fontSize: 11, fontWeight: "700" },

  cameraWrap: { height: 430, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, marginBottom: 12, position: "relative" },
  camera: { flex: 1 },

  overlayLabel: { position: "absolute", top: 10, left: 10, right: 10, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: brand.border },
  overlayLabelText: { color: brand.dark, fontWeight: "800", fontSize: 12, textAlign: "center" },

  poseBadge: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(29,158,117,0.85)", borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  poseBadgeText: { color: brand.white, fontWeight: "700", fontSize: 11 },

  countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  countdownText: { fontSize: 100, fontWeight: "200", color: brand.white },

  btn: { backgroundColor: brand.button, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginBottom: 8 },
  savingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  btnText: { color: brand.white, fontWeight: "800", letterSpacing: 1, fontSize: 12 },

  timerGroup: { marginBottom: 12, gap: 6 },
  timerCaption: { color: brand.textLight, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  timerRow: { flexDirection: "row", gap: 6, backgroundColor: brand.white, borderRadius: 8, padding: 4, borderWidth: 1, borderColor: brand.border },
  timerBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, backgroundColor: "transparent" },
  timerBtnActive: { backgroundColor: brand.dark },
  timerBtnText: { color: brand.dark, fontSize: 10, fontWeight: "700", textAlign: "center" },
  timerBtnTextActive: { color: brand.white },

  label: { fontSize: 11, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginBottom: 8 },
  strip: { flexGrow: 0 },
  stripItem: { width: 88, marginRight: 10, padding: 4, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  stripItemSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  stripThumb: { width: 80, height: 100, borderRadius: 6, backgroundColor: "#f3edf0" },
  stripName: { fontSize: 10, color: brand.dark, marginTop: 4, fontWeight: "600" },
});
