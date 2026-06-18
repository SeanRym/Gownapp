import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useShop } from "./ShopContext";
import { SEGMENTS } from "../constants/sizeConstants";
import {
  clearMeasurements,
  computeSizeResult,
  computeStyleResults,
  fetchMeasurements,
  fetchSizeChart,
  fetchStylePrefs,
  saveMeasurements,
  saveStylePreferences,
} from "../services/fitting";
import { filterGownsForProfile } from "../utils/gownSegmentFilter";

const DEFAULT_PROFILE = {
  segment: "women",
  height: null,
  weight: null,
  bust: null,
  waist: null,
  hips: null,
  bodyShape: null,
  skinTone: null,
  undertone: null,
  occasion: null,
  colors: [],
  fabrics: [],
  budget: "any",
  source: null,
};

const FittingContext = createContext(null);

export function FittingProvider({ children }) {
  const { user, gowns } = useShop();
  const [profile, setProfile] = useState({ ...DEFAULT_PROFILE });
  const [sizeChart, setSizeChart] = useState([]);
  const [supplierName, setSupplierName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const updateProfile = useCallback((patch) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);

  const sizeResult = useMemo(
    () => computeSizeResult(profile, sizeChart),
    [profile.bust, profile.waist, profile.hips, sizeChart]
  );

  const segmentGowns = useMemo(
    () => filterGownsForProfile(gowns, profile),
    [gowns, profile.segment, profile.childGender]
  );

  const styleResults = useMemo(
    () => computeStyleResults(segmentGowns, profile),
    [
      segmentGowns,
      profile.bodyShape,
      profile.skinTone,
      profile.undertone,
      profile.occasion,
      profile.colors,
      profile.fabrics,
      profile.budget,
      profile.height,
    ]
  );

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoadingProfile(true);
    try {
      const seg = profile.segment || "women";
      const [m, chart, prefs] = await Promise.all([
        fetchMeasurements(user.id),
        fetchSizeChart(seg),
        fetchStylePrefs(user.id),
      ]);
      setSizeChart(chart.sizes);
      setSupplierName(chart.supplierName);
      setProfile((p) => ({
        ...p,
        ...(m
          ? {
              bust: m.bust_cm ?? p.bust,
              waist: m.waist_cm ?? p.waist,
              hips: m.hips_cm ?? p.hips,
              height: m.height_cm ?? p.height,
              weight: m.weight_kg ?? p.weight,
              source: m.source ?? p.source,
            }
          : {}),
        ...(prefs
          ? {
              bodyShape: prefs.bodyType || p.bodyShape,
              skinTone: prefs.skinTone || p.skinTone,
              occasion: prefs.styleTags?.[0] || p.occasion,
              colors: prefs.preferredColors || p.colors,
            }
          : {}),
      }));
    } catch (e) {
      console.warn("loadProfile", e?.message);
    } finally {
      setLoadingProfile(false);
    }
  }, [profile.segment, user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const seg = profile.segment || "women";
    fetchSizeChart(seg)
      .then((chart) => {
        setSizeChart(chart.sizes);
        setSupplierName(chart.supplierName);
      })
      .catch(() => {});
  }, [profile.segment]);

  const applyMeasurements = useCallback(
    (meas, source = "camera") => {
      if (!meas) return;
      updateProfile({
        bust: meas.bust ?? null,
        waist: meas.waist ?? null,
        hips: meas.hips ?? null,
        height: meas.height ?? profile.height,
        weight: meas.weight ?? profile.weight,
        bodyShape: meas.bodyShape ?? profile.bodyShape,
        skinTone: meas.skinTone ?? profile.skinTone,
        undertone: meas.undertone ?? profile.undertone,
        source,
      });
    },
    [profile.height, profile.skinTone, profile.undertone, profile.weight, updateProfile]
  );

  const saveProfile = useCallback(async () => {
    if (!user?.id) return { ok: false, error: "Sign in to save your fitting profile." };
    setSaving(true);
    setSaveMsg("");
    try {
      await Promise.all([
        saveMeasurements(user.id, {
          bust_cm: profile.bust,
          waist_cm: profile.waist,
          hips_cm: profile.hips,
          height_cm: profile.height,
          weight_kg: profile.weight,
          source: profile.source || "manual",
        }),
        saveStylePreferences(user.id, profile),
      ]);
      setSaveMsg("✓ Profile saved");
      return { ok: true };
    } catch (e) {
      const msg = e?.message || "Save failed";
      setSaveMsg(msg);
      return { ok: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [profile, user?.id]);

  const value = useMemo(
    () => ({
      profile,
      updateProfile,
      applyMeasurements,
      sizeResult,
      sizeChart,
      supplierName,
      styleResults,
      saveProfile,
      loadProfile,
      saving,
      saveMsg,
      clearProfile: async () => {
        if (!user?.id) return;
        await clearMeasurements(user.id);
        setProfile({ ...DEFAULT_PROFILE });
        setSaveMsg("");
      },
      loadingProfile,
      gowns: segmentGowns,
      user,
      segments: SEGMENTS,
    }),
    [applyMeasurements, loadProfile, loadingProfile, profile, saveMsg, saveProfile, saving, segmentGowns, sizeChart, sizeResult, styleResults, supplierName, user]
  );

  return <FittingContext.Provider value={value}>{children}</FittingContext.Provider>;
}

export function useFitting() {
  const ctx = useContext(FittingContext);
  if (!ctx) throw new Error("useFitting must be used inside FittingProvider");
  return ctx;
}
