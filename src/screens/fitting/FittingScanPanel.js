import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useCameraPermissions } from "expo-camera";
import { captureRef } from "react-native-view-shot";
import ViewShot from "react-native-view-shot";
import { MoveNetPoseCamera } from "../../ar/MoveNetPoseCamera";
import { posePluginToLandmarks } from "../../ar/posePluginToLandmarks";
import { FittingPoseOverlay } from "../../components/fitting/FittingPoseOverlay";
import { ScanSnapshotModal } from "../../components/fitting/ScanSnapshotModal";
import { SegmentGate } from "../../components/fitting/SegmentGate";
import { useFitting } from "../../context/FittingContext";
import { SKIN_TONES } from "../../constants/styleOptions";
import { SEGMENTS } from "../../constants/sizeConstants";
import { createFittingScanSession } from "../../utils/fittingScanEngine";
import {
  GUIDANCE_MAP,
  HIGH_SEVERITY_ISSUES,
  LOCK_THRESHOLD,
  MEAS_VARIANCE,
  SNAPSHOT_CONF_THRESHOLD,
  getMults,
} from "../../utils/fittingScanConstants";
import { validateMeasurementField } from "../../utils/fittingValidation";
import { detectSkinFromSnapshotBase64 } from "../../utils/snapshotSkinDetect";
import { brand } from "../../theme/brand";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canUseNativePose = Platform.OS !== "web" && !isExpoGo;
const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;

function toDisplayUnit(value, field, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const converted = unit === "in"
    ? number / (field === "weight" ? KG_PER_POUND : CM_PER_INCH)
    : number;
  return converted.toFixed(1);
}

function toMetric(value, field, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return unit === "in" ? number * (field === "weight" ? KG_PER_POUND : CM_PER_INCH) : number;
}

export function FittingScanPanel() {
  const { profile, updateProfile, applyMeasurements, saveProfile } = useFitting();
  const scanSession = useRef(createFittingScanSession()).current;
  const viewShotRef = useRef(null);
  const videoDims = useRef({ width: 720, height: 1280 });
  const skinDebounceRef = useRef(null);
  const lastLandmarksRef = useRef(null);

  const [activeTab, setActiveTab] = useState("camera");
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [liveEst, setLiveEst] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [poseIssues, setPoseIssues] = useState([]);
  const [poseFound, setPoseFound] = useState(false);
  const [detectedTone, setDetectedTone] = useState(null);
  const [detectedShape, setDetectedShape] = useState(null);
  const [cleanFrames, setCleanFrames] = useState(0);
  const [landmarks, setLandmarks] = useState(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 320, height: 400 });

  const [locked, setLocked] = useState(false);
  const [scanConf, setScanConf] = useState(0);
  const [adjBust, setAdjBust] = useState("");
  const [adjWaist, setAdjWaist] = useState("");
  const [adjHips, setAdjHips] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const [heightInput, setHeightInput] = useState(profile.height != null ? String(profile.height) : "");
  const [mBust, setMBust] = useState("");
  const [mWaist, setMWaist] = useState("");
  const [mHips, setMHips] = useState("");
  const [mHeight, setMHeight] = useState("");
  const [mWeight, setMWeight] = useState("");
  const [mErrors, setMErrors] = useState({});
  const [scanUnit, setScanUnit] = useState("cm");

  const segLabel = SEGMENTS.find((s) => s.id === profile.segment)?.label || "Women";
  const hasHeight = profile.height != null && profile.height > 0;
  const confColor = confidence >= 70 ? "#1D9E75" : confidence >= 50 ? "#EF9F27" : "#E24B4A";
  const canLock = confidence >= LOCK_THRESHOLD && cleanFrames > 0;
  const remainingConfidence = Math.max(0, LOCK_THRESHOLD - (Number.isFinite(confidence) ? confidence : 0));
  const toneHex = detectedTone ? SKIN_TONES.find((t) => t.id === detectedTone.skinTone)?.hex : null;
  const variantKey = hasHeight ? "withHeight" : "withoutHeight";
  const measVariance = {
    bust: MEAS_VARIANCE.bust[variantKey],
    waist: MEAS_VARIANCE.waist[variantKey],
    hip: MEAS_VARIANCE.hip[variantKey],
  };

  const toggleScanUnit = () => {
    const nextUnit = scanUnit === "cm" ? "in" : "cm";
    const convert = (value, field) => toDisplayUnit(toMetric(value, field, scanUnit), field, nextUnit);
    setAdjBust((value) => convert(value, "bust"));
    setAdjWaist((value) => convert(value, "waist"));
    setAdjHips((value) => convert(value, "hips"));
    setMBust((value) => convert(value, "bust"));
    setMWaist((value) => convert(value, "waist"));
    setMHips((value) => convert(value, "hips"));
    setMHeight((value) => convert(value, "height"));
    setMWeight((value) => convert(value, "weight"));
    setHeightInput((value) => convert(value, "height"));
    setScanUnit(nextUnit);
  };

  const hudText = (() => {
    if (!poseFound) {
      const issue = poseIssues[0];
      return issue ? GUIDANCE_MAP[issue] || GUIDANCE_MAP.no_pose : GUIDANCE_MAP.no_pose;
    }
    const high = poseIssues.find((i) => HIGH_SEVERITY_ISSUES.has(i));
    if (high) return GUIDANCE_MAP[high];
    if (confidence > 0 && confidence < LOCK_THRESHOLD) return "Hold still — building confidence…";
    if (confidence >= LOCK_THRESHOLD) return "Good — ready to lock";
    return "Detecting pose…";
  })();

  const trySkinCapture = useCallback(async () => {
    const lm = lastLandmarksRef.current;
    if (!lm?.nose || !viewShotRef.current) return;
    try {
      const base64 = await captureRef(viewShotRef, { format: "jpg", quality: 0.55, result: "base64" });
      const sp = detectSkinFromSnapshotBase64(base64, lm.nose.x, lm.nose.y);
      if (sp) setDetectedTone(sp);
    } catch {
      /* non-fatal */
    }
  }, []);

  const tryBestSnapshot = useCallback(async () => {
    if (!viewShotRef.current || confidence < SNAPSHOT_CONF_THRESHOLD) return;
    if (snapshot && snapshot.confidence >= confidence) return;
    try {
      const uri = await captureRef(viewShotRef, { format: "jpg", quality: 0.82, result: "tmpfile" });
      setSnapshot({
        uri,
        confidence,
        est: liveEst ? { bust: liveEst.bust, waist: liveEst.waist, hips: liveEst.hips } : null,
      });
    } catch {
      /* ignore */
    }
  }, [confidence, liveEst, snapshot]);

  const onPoseMap = useCallback(
    (raw) => {
      if (!scanning || locked) return;
      const lm = posePluginToLandmarks(raw, videoDims.current.width, videoDims.current.height, true);
      if (!lm) {
        setPoseFound(false);
        setPoseIssues(["no_pose"]);
        setConfidence(0);
        setLiveEst(null);
        setLandmarks(null);
        return;
      }
      lastLandmarksRef.current = lm;
      setLandmarks(lm);

      const result = scanSession.processFrame(lm, {
        videoW: videoDims.current.width,
        videoH: videoDims.current.height,
        profile,
      });
      const safeConfidence = Math.max(
        0,
        Math.min(100, Number.isFinite(Number(result?.confidence)) ? Number(result.confidence) : 0)
      );
      const safeCleanFrames = Math.max(
        0,
        Number.isFinite(Number(result?.cleanFrameCount)) ? Number(result.cleanFrameCount) : 0
      );

      setPoseFound(result.poseFound);
      setPoseIssues(result.poseIssues || []);
      setConfidence(safeConfidence);
      setLiveEst(result.liveEst);
      setCleanFrames(safeCleanFrames);
      if (result.detectedShape) setDetectedShape(result.detectedShape);

      if (safeConfidence >= 65 && lm.nose) {
        clearTimeout(skinDebounceRef.current);
        skinDebounceRef.current = setTimeout(trySkinCapture, 2000);
      }

      if (safeConfidence >= SNAPSHOT_CONF_THRESHOLD) {
        tryBestSnapshot();
      }
    },
    [locked, profile, scanSession, scanning, tryBestSnapshot, trySkinCapture]
  );

  useEffect(() => () => clearTimeout(skinDebounceRef.current), []);

  const startScan = async () => {
    if (heightInput.trim()) {
      const h = toMetric(heightInput, "height", scanUnit);
      if (h >= 100 && h <= 250) updateProfile({ height: h });
    }
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan measurements.");
        return;
      }
    }
    scanSession.reset();
    setDetectedTone(null);
    setDetectedShape(null);
    setSnapshot(null);
    setScanning(true);
    setLocked(false);
    setLiveEst(null);
    setConfidence(0);
  };

  const stopScan = () => {
    setScanning(false);
    clearTimeout(skinDebounceRef.current);
  };

  const lockMeasurement = () => {
    if (!canLock) return;
    const lockedMeas = scanSession.lockMeasurements(profile);
    if (!lockedMeas) return;
    setAdjBust(toDisplayUnit(lockedMeas.bust, "bust", scanUnit));
    setAdjWaist(toDisplayUnit(lockedMeas.waist, "waist", scanUnit));
    setAdjHips(toDisplayUnit(lockedMeas.hips, "hips", scanUnit));
    setScanConf(confidence);
    setLocked(true);
    stopScan();

    const patch = {};
    if (detectedTone) {
      patch.skinTone = detectedTone.skinTone;
      patch.undertone = detectedTone.undertone;
    }
    if (detectedShape || lockedMeas.bodyShape) {
      patch.bodyShape = detectedShape || lockedMeas.bodyShape;
    }
    if (Object.keys(patch).length) updateProfile(patch);
  };

  const retake = () => {
    scanSession.reset();
    setLocked(false);
    setConfidence(0);
    setSnapshot(null);
    setDetectedTone(null);
    setDetectedShape(null);
    setAdjBust("");
    setAdjWaist("");
    setAdjHips("");
  };

  const confirmMeasurements = async () => {
    const patch = {
      bust: toMetric(adjBust, "bust", scanUnit),
      waist: toMetric(adjWaist, "waist", scanUnit),
      hips: toMetric(adjHips, "hips", scanUnit),
      bodyShape: detectedShape || profile.bodyShape,
      skinTone: detectedTone?.skinTone || profile.skinTone,
      undertone: detectedTone?.undertone || profile.undertone,
      source: "camera",
    };
    const nextProfile = { ...profile, ...patch };
    applyMeasurements(patch, "camera");
    const result = await saveProfile(nextProfile);
    if (result?.ok) Alert.alert("Saved", "Measurements saved to your fitting profile.");
    else Alert.alert("Save failed", result?.error || "Unable to save your measurements.");
  };

  const confirmManual = async () => {
    const fields = { bust: mBust, waist: mWaist, hips: mHips, height: mHeight, weight: mWeight };
    const errors = {};
    for (const [k, v] of Object.entries(fields)) {
      const err = validateMeasurementField(k, toMetric(v, k, scanUnit));
      if (err) errors[k] = err;
    }
    if (!mBust && !mWaist && !mHips) {
      setMErrors({ _form: "Enter at least one of bust, waist, or hips." });
      return;
    }
    if (Object.keys(errors).length) {
      setMErrors(errors);
      return;
    }
    setMErrors({});
    const patch = {
      bust: toMetric(mBust, "bust", scanUnit),
      waist: toMetric(mWaist, "waist", scanUnit),
      hips: toMetric(mHips, "hips", scanUnit),
      height: toMetric(mHeight, "height", scanUnit),
      weight: toMetric(mWeight, "weight", scanUnit),
      source: "manual",
    };
    const nextProfile = { ...profile, ...patch };
    applyMeasurements(patch, "manual");
    updateProfile({ height: patch.height, weight: patch.weight });
    const result = await saveProfile(nextProfile);
    if (result?.ok) Alert.alert("Saved", "Measurements saved to your fitting profile.");
    else Alert.alert("Save failed", result?.error || "Unable to save your measurements.");
  };

  const renderManualTab = () => (
    <View>
      <View style={styles.tipCard}>
        <View style={styles.unitHeaderRow}>
          <Text style={styles.tipHeading}>Manual entry for {segLabel}</Text>
          <Pressable style={styles.unitToggle} onPress={toggleScanUnit}>
            <Text style={scanUnit === "cm" ? styles.unitActive : styles.unitText}>CM</Text>
            <Text style={styles.unitDivider}>/</Text>
            <Text style={scanUnit === "in" ? styles.unitActive : styles.unitText}>IN</Text>
          </Pressable>
        </View>
        <Text style={styles.tipBody}>
          Enter measurements in {scanUnit === "cm" ? "centimetres" : "inches"}. Values convert automatically.
        </Text>
      </View>
      {mErrors._form ? <Text style={styles.errBanner}>{mErrors._form}</Text> : null}
      {[
        [`Bust (${scanUnit})`, mBust, setMBust, "bust", scanUnit === "cm" ? "e.g. 88" : "e.g. 35"],
        [`Waist (${scanUnit})`, mWaist, setMWaist, "waist", scanUnit === "cm" ? "e.g. 70" : "e.g. 28"],
        [`Hips (${scanUnit})`, mHips, setMHips, "hips", scanUnit === "cm" ? "e.g. 95" : "e.g. 37"],
        [`Height (${scanUnit})`, mHeight, setMHeight, "height", scanUnit === "cm" ? "e.g. 162" : "e.g. 64"],
        [`Weight (${scanUnit === "cm" ? "kg" : "lb"})`, mWeight, setMWeight, "weight", scanUnit === "cm" ? "e.g. 58" : "e.g. 128"],
      ].map(([label, val, setter, key, ph]) => (
        <View key={key} style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={val}
            onChangeText={(v) => {
              setter(v);
              setMErrors((p) => ({ ...p, [key]: undefined, _form: undefined }));
            }}
            placeholder={ph}
          />
          {mErrors[key] ? <Text style={styles.fieldErr}>{mErrors[key]}</Text> : null}
        </View>
      ))}
      <Pressable style={styles.primaryBtn} onPress={confirmManual}>
        <Text style={styles.primaryText}>Apply measurements</Text>
      </Pressable>
    </View>
  );

  const renderCameraArea = () => (
    <ViewShot ref={viewShotRef} style={styles.cameraBox} options={{ format: "jpg", quality: 0.85 }}>
      <View
        style={styles.cameraInner}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width && height) setCameraLayout({ width, height });
        }}
      >
        {permission?.granted ? (
          <MoveNetPoseCamera
            facing="front"
            isActive={scanning && !locked}
            onPoseMap={onPoseMap}
            onVideoDimensions={(d) => {
              videoDims.current = d;
            }}
            targetFps={10}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.placeholderText}>Camera preview</Text>
          </View>
        )}
        {scanning && landmarks ? (
          <FittingPoseOverlay
            landmarks={landmarks}
            width={cameraLayout.width}
            height={cameraLayout.height}
            confidence={confidence}
          />
        ) : null}
        {scanning && !locked ? (
          <View style={styles.confRing}>
            <Text style={[styles.confRingText, { color: confColor }]}>{confidence}%</Text>
          </View>
        ) : null}
        {scanning ? (
          <View style={styles.hud}>
            <View style={[styles.hudDot, { backgroundColor: confColor }]} />
            <Text style={styles.hudText}>{hudText}</Text>
          </View>
        ) : null}
        {scanning && poseFound && (detectedShape || detectedTone) ? (
          <View style={styles.camBadges}>
            {detectedShape ? <Text style={styles.camBadge}>{detectedShape}</Text> : null}
            {detectedTone ? (
              <View style={styles.camBadgeRow}>
                <View style={[styles.toneDot, { backgroundColor: toneHex }]} />
                <Text style={styles.camBadge}>{detectedTone.skinTone}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {!scanning && !locked ? (
          <View style={styles.camOff}>
            <Text style={styles.camOffText}>Camera off</Text>
          </View>
        ) : null}
      </View>
    </ViewShot>
  );

  const renderExpoGo = () => (
    <SegmentGate>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.panelTitle}>Body scan</Text>
        <Text style={styles.hint}>
          Camera scan needs a development or production build (not Expo Go). Use Manual entry below.
        </Text>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, styles.tabBtnOn]}>
            <Text style={styles.tabTextOn}>Manual entry</Text>
          </Pressable>
        </View>
        {renderManualTab()}
      </ScrollView>
    </SegmentGate>
  );

  if (!canUseNativePose) return renderExpoGo();

  const cameraBlock = (
    <>
      {renderCameraArea()}
      {!locked ? (
        <View style={styles.controls}>
          {!scanning ? (
            <>
              <View style={styles.heightPrompt}>
                <View style={styles.heightLabelRow}>
                  <Text style={styles.heightLabel}>Your height</Text>
                  <Text style={styles.heightBadge}>+30% accuracy</Text>
                </View>
                <View style={styles.heightInputRow}>
                  <TextInput
                    style={[styles.input, styles.heightInput]}
                    keyboardType="numeric"
                    value={heightInput}
                    placeholder="e.g. 162"
                    onChangeText={setHeightInput}
                  />
                  <Text style={styles.heightUnit}>{scanUnit}</Text>
                  <Pressable style={styles.unitToggle} onPress={toggleScanUnit}>
                    <Text style={scanUnit === "cm" ? styles.unitActive : styles.unitText}>CM</Text>
                    <Text style={styles.unitDivider}>/</Text>
                    <Text style={scanUnit === "in" ? styles.unitActive : styles.unitText}>IN</Text>
                  </Pressable>
                </View>
                <Text style={styles.heightHint}>
                  Enter before scanning for significantly better accuracy. You can skip this.
                </Text>
              </View>
              <Pressable style={styles.primaryBtn} onPress={startScan}>
                <Text style={styles.primaryText}>Start scan</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.btnPair}>
              <Pressable
                style={[styles.primaryBtn, styles.btnFlex, !canLock ? styles.btnDisabled : null]}
                onPress={lockMeasurement}
                disabled={!canLock}
              >
                <Text style={styles.primaryText}>
                  {canLock ? `Lock measurements (${confidence}%)` : `Need ${remainingConfidence}% more…`}
                </Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={stopScan}>
                <Text style={styles.ghostText}>Stop</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.lockedPanel}>
          <View style={styles.lockedHeader}>
            <Text style={[styles.capturedBadge, scanConf >= 75 ? styles.badgeOk : styles.badgeWarn]}>
              {scanConf >= 75 ? "Captured" : `Captured · low confidence (${scanConf}%)`}
            </Text>
            <View style={styles.detectionTags}>
              {detectedTone ? (
                <View style={styles.detectionTag}>
                  <View style={[styles.toneDot, { backgroundColor: toneHex }]} />
                  <Text style={styles.detectionTagText}>
                    {detectedTone.skinTone} · {detectedTone.undertone}
                  </Text>
                </View>
              ) : null}
              {detectedShape ? <Text style={styles.detectionTagText}>{detectedShape}</Text> : null}
              {detectedShape &&
              JSON.stringify(getMults(profile.segment, detectedShape)) !==
                JSON.stringify(getMults(profile.segment, null)) ? (
                <Text style={styles.detectionTagMuted}>shape-tuned</Text>
              ) : null}
            </View>
          </View>
          {snapshot ? (
            <Pressable style={styles.snapshotBtn} onPress={() => setShowSnapshot(true)}>
              <Text style={styles.snapshotBtnText}>Best snapshot ({snapshot.confidence}% confidence)</Text>
            </Pressable>
          ) : null}
          {[
            [`Bust (${scanUnit})`, adjBust, setAdjBust, measVariance.bust],
            [`Waist (${scanUnit})`, adjWaist, setAdjWaist, measVariance.waist],
            [`Hips (${scanUnit})`, adjHips, setAdjHips, measVariance.hip],
          ].map(([label, val, setter, variance]) => (
            <View key={label} style={styles.field}>
              <Text style={styles.label}>
                {label} <Text style={styles.variance}>±{scanUnit === "cm" ? variance : (variance / CM_PER_INCH).toFixed(1)} {scanUnit}</Text>
              </Text>
              <TextInput style={styles.input} keyboardType="numeric" value={val} onChangeText={setter} />
            </View>
          ))}
          <Text style={styles.varianceNote}>
            {hasHeight
              ? "Height-anchored scan. Waist has highest variance — confirm with tape for bridal orders."
              : "No height entered — estimates carry higher variance. Enter height before your next scan."}
          </Text>
          <View style={styles.btnPair}>
            <Pressable style={styles.ghostBtn} onPress={retake}>
              <Text style={styles.ghostText}>Retake</Text>
            </Pressable>
            <Pressable style={[styles.primaryBtn, styles.btnFlex]} onPress={confirmMeasurements}>
              <Text style={styles.primaryText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.tipCard}>
        <Text style={styles.tipHeading}>Scanning for {segLabel}</Text>
        <Text style={styles.tipBody}>Stand 1.5–2 m away, arms slightly out, full body visible.</Text>
        {!hasHeight && !scanning ? (
          <Text style={styles.heightWarn}>↑ Enter height above before scanning for best results.</Text>
        ) : null}
        {detectedShape ? (
          <Text style={styles.shapeNote}>Using {detectedShape} shape-tuned multipliers.</Text>
        ) : null}
      </View>

      {liveEst && scanning && !locked ? (
        <View style={styles.liveBox}>
          <Text style={styles.liveHeading}>Live estimate</Text>
          <View style={styles.liveGrid}>
            <Text style={styles.liveItem}>Bust {toDisplayUnit(liveEst.bust, "bust", scanUnit)} {scanUnit}</Text>
            <Text style={styles.liveItem}>Waist {toDisplayUnit(liveEst.waist, "waist", scanUnit)} {scanUnit}</Text>
            <Text style={styles.liveItem}>Hips {toDisplayUnit(liveEst.hips, "hips", scanUnit)} {scanUnit}</Text>
          </View>
          <View style={styles.confTrack}>
            <View style={[styles.confFill, { width: `${confidence}%`, backgroundColor: confColor }]} />
            <View style={[styles.confThreshold, { left: `${LOCK_THRESHOLD}%` }]} />
          </View>
          <Text style={[styles.confLabel, { color: confColor }]}>{confidence}%</Text>
          <Text style={styles.confHint}>Lock available at {LOCK_THRESHOLD}%</Text>
        </View>
      ) : null}

      {scanning ? (
        <View style={styles.bufferBox}>
          <Text style={styles.bufferLabel}>Clean frames</Text>
          <View style={styles.confTrack}>
            <View
              style={[
                styles.confFill,
                {
                  width: `${Math.min((cleanFrames / 40) * 100, 100)}%`,
                  backgroundColor: cleanFrames >= 40 ? "#1D9E75" : "#EF9F27",
                },
              ]}
            />
          </View>
          <Text style={styles.bufferCount}>{cleanFrames}/40</Text>
          {cleanFrames < 40 ? (
            <Text style={styles.confHint}>Tilted/rotated frames are excluded</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.detectTitle}>This scan detects</Text>
      {["Measurements (bust · waist · hips)", "Body shape — tunes multipliers", "Skin tone & undertone"].map(
        (item) => (
          <Text key={item} style={styles.detectItem}>
            · {item}
          </Text>
        )
      )}
    </>
  );

  return (
    <SegmentGate>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, activeTab === "camera" ? styles.tabBtnOn : null]}
            onPress={() => setActiveTab("camera")}
          >
            <Text style={activeTab === "camera" ? styles.tabTextOn : styles.tabText}>Camera scan</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === "manual" ? styles.tabBtnOn : null]}
            onPress={() => setActiveTab("manual")}
          >
            <Text style={activeTab === "manual" ? styles.tabTextOn : styles.tabText}>Manual entry</Text>
          </Pressable>
        </View>

        {activeTab === "manual" ? renderManualTab() : null}
        {activeTab === "camera" ? cameraBlock : null}

        <Pressable style={styles.fsBtn} onPress={() => setFullscreen(true)} disabled={activeTab !== "camera"}>
          <Text style={styles.fsBtnText}>Fullscreen scan</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsScreen}>
          <Pressable style={styles.fsClose} onPress={() => setFullscreen(false)}>
            <Text style={styles.fsCloseText}>✕ Exit</Text>
          </Pressable>
          {cameraBlock}
        </View>
      </Modal>

      <ScanSnapshotModal visible={showSnapshot} snapshot={snapshot} onClose={() => setShowSnapshot(false)} />
    </SegmentGate>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 36 },
  panelTitle: { fontSize: 20, fontWeight: "700", color: brand.dark, marginBottom: 6 },
  hint: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  tabRow: { flexDirection: "row", marginBottom: 12, borderWidth: 1, borderColor: brand.border, borderRadius: 8, overflow: "hidden" },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: brand.white },
  tabBtnOn: { backgroundColor: "#f5eadc" },
  tabText: { fontSize: 12, color: brand.textLight, fontWeight: "600" },
  tabTextOn: { fontSize: 12, color: brand.dark, fontWeight: "800" },
  cameraBox: { height: 300, borderRadius: 10, overflow: "hidden", backgroundColor: "#111", marginBottom: 10 },
  cameraInner: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "#888" },
  camOff: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  camOffText: { color: "#ccc", fontSize: 12 },
  confRing: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  confRingText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  hud: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 6,
  },
  hudDot: { width: 8, height: 8, borderRadius: 4 },
  hudText: { color: "#fff", fontSize: 11, flex: 1 },
  camBadges: { position: "absolute", top: 8, left: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  camBadge: { backgroundColor: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: "hidden" },
  camBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  toneDot: { width: 8, height: 8, borderRadius: 4 },
  controls: { marginBottom: 10 },
  heightPrompt: { marginBottom: 12, padding: 12, backgroundColor: "#f5f0eb", borderRadius: 8 },
  heightLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heightLabel: { fontWeight: "700", color: brand.dark, fontSize: 13 },
  heightBadge: { fontSize: 10, color: "#1D9E75", fontWeight: "700" },
  heightInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heightInput: { flex: 1 },
  heightUnit: { color: brand.textLight, fontSize: 12 },
  heightHint: { fontSize: 11, color: brand.textLight, marginTop: 8, lineHeight: 16 },
  btnPair: { flexDirection: "row", gap: 8, marginTop: 8 },
  btnFlex: { flex: 1 },
  primaryBtn: { backgroundColor: brand.button, paddingVertical: 12, borderRadius: 8 },
  primaryText: { textAlign: "center", color: brand.white, fontWeight: "700", fontSize: 12 },
  ghostBtn: { borderWidth: 1, borderColor: brand.border, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 8, backgroundColor: brand.white },
  ghostText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  btnDisabled: { opacity: 0.5 },
  lockedPanel: { marginBottom: 12 },
  lockedHeader: { marginBottom: 10 },
  capturedBadge: { fontSize: 12, fontWeight: "800", marginBottom: 8 },
  badgeOk: { color: "#1D9E75" },
  badgeWarn: { color: "#EF9F27" },
  detectionTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detectionTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  detectionTagText: { fontSize: 11, color: brand.dark, fontWeight: "600" },
  detectionTagMuted: { fontSize: 11, color: brand.textLight },
  snapshotBtn: { marginBottom: 12, padding: 10, borderWidth: 1, borderColor: brand.border, borderRadius: 8 },
  snapshotBtnText: { color: brand.dark, fontWeight: "600", fontSize: 12 },
  variance: { color: brand.textLight, fontWeight: "400", fontSize: 10 },
  varianceNote: { fontSize: 11, color: brand.textLight, lineHeight: 16, marginBottom: 8 },
  tipCard: { backgroundColor: "#f5f0eb", padding: 12, borderRadius: 8, marginBottom: 10 },
  unitHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  unitToggle: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: brand.border, borderRadius: 7, backgroundColor: brand.white, paddingHorizontal: 8, paddingVertical: 5 },
  unitText: { color: brand.textLight, fontSize: 10, fontWeight: "700" },
  unitActive: { color: brand.dark, fontSize: 10, fontWeight: "800" },
  unitDivider: { color: brand.border, fontSize: 10, marginHorizontal: 4 },
  tipHeading: { fontWeight: "700", color: brand.dark, fontSize: 13 },
  tipBody: { color: brand.textLight, fontSize: 11, marginTop: 4, lineHeight: 16 },
  heightWarn: { color: "#7a5a1a", fontSize: 11, marginTop: 6 },
  shapeNote: { color: "#7a5a1a", fontSize: 11, marginTop: 4 },
  liveBox: { backgroundColor: "#f5eadc", padding: 12, borderRadius: 8, marginBottom: 10 },
  liveHeading: { fontWeight: "700", color: brand.dark, marginBottom: 8 },
  liveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  liveItem: { fontSize: 12, color: brand.text, fontWeight: "600" },
  confTrack: { height: 6, backgroundColor: "#ddd", borderRadius: 3, marginTop: 8, overflow: "hidden", position: "relative" },
  confFill: { height: "100%", borderRadius: 3 },
  confThreshold: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: brand.dark, opacity: 0.4 },
  confLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  confHint: { fontSize: 10, color: brand.textLight, marginTop: 2 },
  bufferBox: { marginBottom: 10 },
  bufferLabel: { fontSize: 10, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginBottom: 6 },
  bufferCount: { fontSize: 11, fontWeight: "700", color: brand.dark, marginTop: 4 },
  detectTitle: { fontSize: 11, fontWeight: "700", color: brand.dark, marginTop: 8 },
  detectItem: { fontSize: 11, color: brand.text, marginTop: 4 },
  label: { fontSize: 11, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, padding: 10, borderRadius: 8 },
  field: { marginBottom: 8 },
  fieldErr: { color: "#E24B4A", fontSize: 11, marginTop: 4 },
  errBanner: { color: "#E24B4A", fontSize: 12, marginBottom: 8 },
  fsBtn: { marginTop: 8, padding: 10, alignItems: "center" },
  fsBtnText: { color: brand.textLight, fontSize: 12, fontWeight: "600" },
  fsScreen: { flex: 1, backgroundColor: "#000", paddingTop: 48, paddingHorizontal: 12 },
  fsClose: { alignSelf: "flex-end", marginBottom: 8 },
  fsCloseText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
