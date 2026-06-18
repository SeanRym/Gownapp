import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import { GownNativeSegmentationOverlay } from "../ar/GownNativeSegmentationOverlay";
import { NativePoseCamera } from "../ar/NativePoseCamera";
import { isNativeSegmentationAvailable } from "vision-camera-native-segmentation";
import { GownFittedOverlay } from "../components/ar/GownFittedOverlay";
import {
  analyzeTryonPose,
  getGownLayout,
  landmarksToPixelKps,
  parseTryonCalibration,
  resolveTryonImageUri,
  smoothGownLayout,
} from "../ar/gownLayout";
import { parsePosePayload } from "../ar/posePluginToLandmarks";
import { pickDisplayLandmarks } from "../utils/poseCoordinateTransform";
import { useShop } from "../context/ShopContext";
import { saveTryonSnapshot } from "../services/fitting";
import { brand } from "../theme/brand";
import { filterGownsForProfile } from "../utils/gownSegmentFilter";
import { idsEqual } from "../utils/id";
import { loadArFitProfiles, saveArFitProfiles } from "../utils/storage";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canUseNativePose = Platform.OS !== "web" && !isExpoGo;
const segmentationNativeLinked = isNativeSegmentationAvailable();

const DEFAULT_FIT_MODEL = {
  centerX: 0.5,
  centerY: 0.48,
  shoulderWidth: 0.24,
  torsoHeight: 0.28,
};

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
  const [overlayScale, setOverlayScale] = useState(1);
  const [overlayOpacity, setOverlayOpacity] = useState(0.72);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);
  const [poseDetected, setPoseDetected] = useState(false);
  const [limbOcclusionEnabled, setLimbOcclusionEnabled] = useState(true);
  const [nativeSegmentationEnabled, setNativeSegmentationEnabled] = useState(true);
  const [nativeMaskUri, setNativeMaskUri] = useState(null);
  const [fitModel, setFitModel] = useState(DEFAULT_FIT_MODEL);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [fitProfiles, setFitProfiles] = useState({});
  const [saving, setSaving] = useState(false);
  const [previewLayout, setPreviewLayout] = useState({ width: 320, height: 430 });
  const [overlayLayout, setOverlayLayout] = useState({ width: 0, height: 0 });
  const [liveGownLayout, setLiveGownLayout] = useState(null);
  const [tryonPoseOk, setTryonPoseOk] = useState(false);
  const [tryonPoseIssues, setTryonPoseIssues] = useState([]);
  const [landmarksForMask, setLandmarksForMask] = useState(null);
  const overlayPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const previewRef = useRef(null);
  const videoDimsRef = useRef({ width: 720, height: 1280 });
  const previewLayoutRef = useRef({ width: 320, height: 430 });
  const gownLayoutSmoothRef = useRef(null);
  const selectedGownRef = useRef(null);
  const lastPoseAtRef = useRef(0);

  const selectedGown = useMemo(() => {
    const fallback = catalogGowns[0] || null;
    if (!catalogGowns.length) return null;
    if (!selectedId) return fallback;
    return catalogGowns.find((g) => idsEqual(g.id, selectedId)) || fallback;
  }, [catalogGowns, selectedId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const profiles = await loadArFitProfiles();
      if (!mounted) return;
      setFitProfiles(profiles || {});
      setProfilesLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profilesLoaded || !selectedGown) return;
    const profile = fitProfiles?.[String(selectedGown.id)];
    if (!profile) {
      setFitModel(DEFAULT_FIT_MODEL);
      return;
    }
    setFitModel({
      centerX: Number(profile.centerX) || DEFAULT_FIT_MODEL.centerX,
      centerY: Number(profile.centerY) || DEFAULT_FIT_MODEL.centerY,
      shoulderWidth: Number(profile.shoulderWidth) || DEFAULT_FIT_MODEL.shoulderWidth,
      torsoHeight: Number(profile.torsoHeight) || DEFAULT_FIT_MODEL.torsoHeight,
    });
  }, [profilesLoaded, selectedGown, fitProfiles]);

  const onScaleDown = () => setOverlayScale((v) => Math.max(0.7, Number((v - 0.05).toFixed(2))));
  const onScaleUp = () => setOverlayScale((v) => Math.min(1.4, Number((v + 0.05).toFixed(2))));
  const onOpacityDown = () => setOverlayOpacity((v) => Math.max(0.35, Number((v - 0.05).toFixed(2))));
  const onOpacityUp = () => setOverlayOpacity((v) => Math.min(0.95, Number((v + 0.05).toFixed(2))));

  const adjustFit = (key, delta, min, max) => {
    setFitModel((prev) => ({
      ...prev,
      [key]: Math.max(min, Math.min(max, Number((prev[key] + delta).toFixed(3)))),
    }));
  };

  useEffect(() => {
    selectedGownRef.current = selectedGown;
  }, [selectedGown]);

  const tryonUri = useMemo(() => resolveTryonImageUri(selectedGown), [selectedGown]);

  const useWebBodyFit =
    autoFitEnabled && canUseNativePose && tryonPoseOk && liveGownLayout && Boolean(tryonUri);

  const showNativePersonMask =
    !useWebBodyFit &&
    segmentationNativeLinked &&
    nativeSegmentationEnabled &&
    nativeMaskUri &&
    overlayLayout.width > 40 &&
    overlayLayout.height > 40;

  const onVideoDimensions = useCallback((dims) => {
    if (dims?.width && dims?.height) videoDimsRef.current = dims;
  }, []);

  const onSegmentationResult = useCallback((r) => {
    if (!r || typeof r !== "object" || r.error) return;
    if (r.maskBase64 && typeof r.maskBase64 === "string") {
      setNativeMaskUri(`data:image/png;base64,${r.maskBase64}`);
    }
  }, []);

  useEffect(() => {
    if (!nativeSegmentationEnabled) setNativeMaskUri(null);
  }, [nativeSegmentationEnabled]);

  const onPoseMap = useCallback(
    (payload) => {
      if (!autoFitEnabled || !canUseNativePose) return;
      if (payload?.error) return;
      const parsed = parsePosePayload(payload, {
        fallbackW: videoDimsRef.current.width,
        fallbackH: videoDimsRef.current.height,
      });
      const pl = previewLayoutRef.current;
      const landmarks =
        parsed?.landmarks && pl.width > 0 && pl.height > 0
          ? pickDisplayLandmarks(
              parsed.landmarks,
              pl.width,
              pl.height,
              parsed.imageWidth,
              parsed.imageHeight,
              cameraFacing,
              "cover"
            )
          : null;
      if (!landmarks) {
        return;
      }
      lastPoseAtRef.current = Date.now();
      setPoseDetected(true);
      const vw = pl.width || 320;
      const vh = pl.height || 430;
      const kps = landmarksToPixelKps(landmarks, vw, vh);
      const analysis = analyzeTryonPose(kps, vw, vh);
      setTryonPoseIssues(analysis.issues || []);

      const cal = parseTryonCalibration(selectedGownRef.current?.tryonCalibration);
      const layout = kps ? getGownLayout(kps, cal, vw, vh) : null;

      if (layout && analysis.shouldersOk && analysis.hipsOk) {
        gownLayoutSmoothRef.current = smoothGownLayout(gownLayoutSmoothRef.current, layout, 0.38);
        setLiveGownLayout({ ...gownLayoutSmoothRef.current });
        setTryonPoseOk(true);
      } else {
        setTryonPoseOk(false);
        if (!analysis.shouldersOk || !analysis.hipsOk) {
          gownLayoutSmoothRef.current = null;
          setLiveGownLayout(null);
        }
      }

      const maskLm = {};
      for (const k of ["leftWrist", "rightWrist", "leftElbow", "rightElbow"]) {
        const p = landmarks[k];
        if (p) maskLm[k] = { x: p.x, y: p.y };
      }
      setLandmarksForMask(Object.keys(maskLm).length ? maskLm : null);
    },
    [autoFitEnabled, cameraFacing, canUseNativePose]
  );

  useEffect(() => {
    if (!canUseNativePose || !autoFitEnabled) return undefined;
    const id = setInterval(() => {
      if (Date.now() - lastPoseAtRef.current > 900) {
        setPoseDetected(false);
      }
    }, 350);
    return () => clearInterval(id);
  }, [autoFitEnabled, canUseNativePose]);

  useEffect(() => {
    previewLayoutRef.current = previewLayout;
  }, [previewLayout]);

  useEffect(() => {
    gownLayoutSmoothRef.current = null;
    setLiveGownLayout(null);
    setLandmarksForMask(null);
    setTryonPoseOk(false);
    setTryonPoseIssues([]);
    lastPoseAtRef.current = 0;
    setPoseDetected(false);
    setNativeMaskUri(null);
  }, [cameraFacing, selectedGown?.id]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: Animated.event([null, { dx: overlayPan.x, dy: overlayPan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          overlayPan.extractOffset();
          overlayPan.setValue({ x: 0, y: 0 });
        },
      }),
    [overlayPan]
  );

  const onCaptureAndSave = async () => {
    try {
      setSaving(true);
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
          navigation.navigate("FittingStudio", {
            panel: "tryon",
            gownId: selectedGown?.id,
            tryonSaveMsg: "✓ Saved to your profile",
          });
        } catch (e) {
          Alert.alert("Profile save failed", e?.message || "Could not save to your account.");
        }
      }

      const uri = await captureRef(previewRef, {
        format: "jpg",
        quality: 0.9,
        result: "tmpfile",
      });

      try {
        const permissionResult = await MediaLibrary.requestPermissionsAsync();
        if (!permissionResult.granted) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(uri, {
              dialogTitle: "Save or share your AR preview",
            });
            Alert.alert(
              "Preview ready",
              saveToProfile
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
          saveToProfile
            ? "Try-on saved to your profile and device gallery."
            : "Your AR try-on preview has been saved to your gallery."
        );
      } catch {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            dialogTitle: "Save or share your AR preview",
          });
          Alert.alert(
            "Preview ready",
            saveToProfile
              ? "Saved to your profile. Opened share options for your device."
              : "Opened share options so you can save the AR image."
          );
        } else if (saveToProfile) {
          Alert.alert("Saved to profile", "Try-on image saved to your account.");
        } else {
          Alert.alert(
            "Save not available here",
            "Preview capture works, but gallery save needs a development build/rebuild with media permission enabled."
          );
        }
      }
    } catch (err) {
      Alert.alert("Save failed", "Could not save preview. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onResetFit = () => {
    overlayPan.setOffset({ x: 0, y: 0 });
    overlayPan.setValue({ x: 0, y: 0 });
    setOverlayScale(1);
    setOverlayOpacity(0.72);
    setFitModel(DEFAULT_FIT_MODEL);
    setAutoFitEnabled(true);
    gownLayoutSmoothRef.current = null;
    setLiveGownLayout(null);
    setLandmarksForMask(null);
    setTryonPoseOk(false);
    lastPoseAtRef.current = 0;
    setPoseDetected(false);
    setNativeMaskUri(null);
  };

  const onSaveFitProfile = async () => {
    if (!selectedGown) return;
    const next = {
      ...fitProfiles,
      [String(selectedGown.id)]: fitModel,
    };
    setFitProfiles(next);
    await saveArFitProfiles(next);
    Alert.alert("Fit saved", `${selectedGown.name} fit profile saved.`);
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
        <Text style={styles.title}>Try AR Dress</Text>
        <Text style={styles.subtitle}>
          To start AR try-on, allow camera access. We only use your camera for live preview.
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
        <Text style={styles.title}>AR Try-On</Text>
        <Text style={styles.subtitle}>
          Pick a gown — it auto-fits to your shoulders and waist like the website try-on.
        </Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerBtn} onPress={() => setCameraFacing((v) => (v === "front" ? "back" : "front"))}>
            <Text style={styles.headerBtnText}>Flip Camera</Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={onResetFit}>
            <Text style={styles.headerBtnText}>Reset Fit</Text>
          </Pressable>
        </View>
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
        {canUseNativePose ? (
          <NativePoseCamera
            facing={cameraFacing}
            isActive={Boolean(permission?.granted && isFocused)}
            onPoseMap={onPoseMap}
            onVideoDimensions={onVideoDimensions}
            targetFps={12}
            segmentationEnabled={segmentationNativeLinked && nativeSegmentationEnabled}
            segmentationFps={5}
            onSegmentationResult={onSegmentationResult}
            brightenPreview
            resizeMode="cover"
            enablePinchZoom
          />
        ) : (
          <CameraView style={styles.camera} facing={cameraFacing} />
        )}
        {useWebBodyFit ? (
          <GownFittedOverlay
            width={previewLayout.width}
            height={previewLayout.height}
            uri={tryonUri}
            layout={liveGownLayout}
            opacity={overlayOpacity}
            landmarksNorm={landmarksForMask}
            limbHoles={limbOcclusionEnabled && !showNativePersonMask}
          />
        ) : showNativePersonMask ? (
          <View
            style={styles.fullOverlay}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setOverlayLayout({ width, height });
            }}
          >
            <GownNativeSegmentationOverlay
              width={overlayLayout.width || previewLayout.width}
              height={overlayLayout.height || previewLayout.height}
              gownUri={tryonUri || selectedGown.image}
              maskDataUri={nativeMaskUri}
              opacity={overlayOpacity}
            />
          </View>
        ) : (
          <Animated.View
            style={[
              styles.overlayMover,
              {
                transform: [
                  { translateX: overlayPan.x },
                  { translateY: overlayPan.y },
                  { scale: overlayScale },
                ],
              },
            ]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setOverlayLayout({ width, height });
            }}
            {...panResponder.panHandlers}
          >
            <Image
              source={{ uri: tryonUri || selectedGown.image }}
              style={[styles.overlayImage, { opacity: overlayOpacity }]}
            />
          </Animated.View>
        )}
        <View style={styles.overlayLabel}>
          <Text style={styles.overlayLabelText}>
            {selectedGown.name} •{" "}
            {useWebBodyFit
              ? "Fitted to your body"
              : autoFitEnabled && canUseNativePose
                ? tryonPoseIssues[0]
                  ? "Step back — show full body"
                  : "Finding your pose…"
                : "Drag to position"}
          </Text>
        </View>
      </View>

      <View style={styles.controlsCard}>
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Auto-fit to body</Text>
          <Pressable
            style={[styles.toggleBtn, autoFitEnabled ? styles.toggleBtnActive : null]}
            onPress={() => {
              const next = !autoFitEnabled;
              setAutoFitEnabled(next);
              if (!next) {
                setPoseDetected(false);
                setLiveGownLayout(null);
                setLandmarksForMask(null);
                setTryonPoseOk(false);
                gownLayoutSmoothRef.current = null;
              }
            }}
          >
            <Text style={[styles.toggleText, autoFitEnabled ? styles.toggleTextActive : null]}>
              {autoFitEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </View>
        {canUseNativePose && segmentationNativeLinked ? (
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Native person mask</Text>
            <Pressable
              style={[styles.toggleBtn, nativeSegmentationEnabled ? styles.toggleBtnActive : null]}
              onPress={() => setNativeSegmentationEnabled((v) => !v)}
            >
              <Text style={[styles.toggleText, nativeSegmentationEnabled ? styles.toggleTextActive : null]}>
                {nativeSegmentationEnabled ? "ON" : "OFF"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {canUseNativePose ? (
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Limb holes (pose)</Text>
            <Pressable
              style={[styles.toggleBtn, limbOcclusionEnabled ? styles.toggleBtnActive : null]}
              onPress={() => setLimbOcclusionEnabled((v) => !v)}
            >
              <Text style={[styles.toggleText, limbOcclusionEnabled ? styles.toggleTextActive : null]}>
                {limbOcclusionEnabled ? "ON" : "OFF"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.hintText}>
          {!canUseNativePose
            ? Platform.OS === "web"
              ? "Web preview uses manual fit. Use iOS/Android dev build for live pose."
              : "Expo Go cannot run frame processors. Use a dev build (expo run:android) for live pose + limb masking."
            : useWebBodyFit
              ? "Gown follows your shoulders, waist, and legs — same as the website fitting room."
              : poseDetected
                ? "Tracking pose…"
                : autoFitEnabled
                  ? "Stand 1.5–2 m back, full body in frame, face the camera (not a mirror)."
                  : "Auto-fit off — drag the gown and use size/opacity."}
        </Text>

        {autoFitEnabled && !useWebBodyFit && (
          <>
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Body Center X</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("centerX", -0.015, 0.32, 0.68)}>
                  <Ionicons name="remove" size={16} color={brand.dark} />
                </Pressable>
                <Text style={styles.stepValue}>{Math.round(fitModel.centerX * 100)}%</Text>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("centerX", 0.015, 0.32, 0.68)}>
                  <Ionicons name="add" size={16} color={brand.dark} />
                </Pressable>
              </View>
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Body Center Y</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("centerY", -0.015, 0.36, 0.62)}>
                  <Ionicons name="remove" size={16} color={brand.dark} />
                </Pressable>
                <Text style={styles.stepValue}>{Math.round(fitModel.centerY * 100)}%</Text>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("centerY", 0.015, 0.36, 0.62)}>
                  <Ionicons name="add" size={16} color={brand.dark} />
                </Pressable>
              </View>
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Shoulder Width</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("shoulderWidth", -0.012, 0.16, 0.42)}>
                  <Ionicons name="remove" size={16} color={brand.dark} />
                </Pressable>
                <Text style={styles.stepValue}>{Math.round(fitModel.shoulderWidth * 100)}%</Text>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("shoulderWidth", 0.012, 0.16, 0.42)}>
                  <Ionicons name="add" size={16} color={brand.dark} />
                </Pressable>
              </View>
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Torso Height</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("torsoHeight", -0.012, 0.18, 0.48)}>
                  <Ionicons name="remove" size={16} color={brand.dark} />
                </Pressable>
                <Text style={styles.stepValue}>{Math.round(fitModel.torsoHeight * 100)}%</Text>
                <Pressable style={styles.stepBtn} onPress={() => adjustFit("torsoHeight", 0.012, 0.18, 0.48)}>
                  <Ionicons name="add" size={16} color={brand.dark} />
                </Pressable>
              </View>
            </View>
          </>
        )}

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Size</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={onScaleDown}>
              <Ionicons name="remove" size={16} color={brand.dark} />
            </Pressable>
            <Text style={styles.stepValue}>{Math.round(overlayScale * 100)}%</Text>
            <Pressable style={styles.stepBtn} onPress={onScaleUp}>
              <Ionicons name="add" size={16} color={brand.dark} />
            </Pressable>
          </View>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Opacity</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={onOpacityDown}>
              <Ionicons name="remove" size={16} color={brand.dark} />
            </Pressable>
            <Text style={styles.stepValue}>{Math.round(overlayOpacity * 100)}%</Text>
            <Pressable style={styles.stepBtn} onPress={onOpacityUp}>
              <Ionicons name="add" size={16} color={brand.dark} />
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={styles.pickerTitle}>Choose item</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow} nestedScrollEnabled>
        {catalogGowns.map((g) => {
          const active = selectedGown && idsEqual(g.id, selectedGown.id);
          return (
            <Pressable
              key={g.id}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => setSelectedId(g.id)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                {g.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable style={styles.btn} onPress={onCaptureAndSave} disabled={saving}>
        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={brand.white} />
            <Text style={styles.btnText}>Saving…</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>Capture & Save Preview</Text>
        )}
      </Pressable>

      <Pressable style={styles.secondaryBtn} onPress={onSaveFitProfile}>
        <Text style={styles.secondaryBtnText}>Save Fit for This Gown</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  screenContent: { padding: 16, paddingBottom: 28 },
  center: { flex: 1, backgroundColor: brand.bg, alignItems: "center", justifyContent: "center", padding: 16 },
  header: { marginBottom: 10 },
  title: { fontSize: 30, color: brand.dark, fontWeight: "900", marginBottom: 4, fontStyle: "italic" },
  subtitle: { color: brand.textLight, lineHeight: 19, fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  headerBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerBtnText: { color: brand.dark, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },

  cameraWrap: {
    height: 430,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
  },
  camera: { flex: 1 },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayMover: {
    position: "absolute",
    bottom: 0,
    left: "12%",
    right: "12%",
    height: "78%",
  },
  overlayImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  overlayLabel: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: brand.border,
  },
  overlayLabelText: { color: brand.dark, fontWeight: "800", fontSize: 12, textAlign: "center" },

  controlsCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    padding: 12,
    gap: 10,
  },
  controlRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  controlLabel: { color: brand.dark, fontWeight: "800", fontSize: 13 },
  toggleBtn: {
    minWidth: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    backgroundColor: brand.white,
  },
  toggleBtnActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  toggleText: { color: brand.dark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  toggleTextActive: { color: brand.white },
  hintText: { color: brand.textLight, fontSize: 11, marginTop: -3, marginBottom: 2, lineHeight: 16 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.accentSoft,
  },
  stepValue: { minWidth: 45, textAlign: "center", color: brand.dark, fontWeight: "800", fontSize: 12 },

  pickerTitle: { marginTop: 12, color: brand.dark, fontWeight: "900", fontSize: 14 },
  pickerRow: { paddingTop: 8, paddingBottom: 4, gap: 8 },
  chip: {
    maxWidth: 170,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
  },
  chipActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  chipText: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: brand.white },

  btn: { marginTop: 10, backgroundColor: brand.button, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  savingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  btnText: { color: brand.white, fontWeight: "800", letterSpacing: 1.1, fontSize: 12 },
  secondaryBtn: { marginTop: 8, backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryBtnText: { color: brand.dark, fontWeight: "800", letterSpacing: 0.9, fontSize: 12 },
});

