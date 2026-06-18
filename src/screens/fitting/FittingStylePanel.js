import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  BUDGET_RANGES,
  COLOR_OPTIONS,
  FABRIC_OPTIONS,
  OCCASIONS,
} from "../../constants/styleOptions";
import { BodyShapePicker } from "../../components/fitting/BodyShapePicker";
import { SkinTonePicker } from "../../components/fitting/SkinTonePicker";
import { SegmentGate } from "../../components/fitting/SegmentGate";
import { useFitting } from "../../context/FittingContext";
import { getCatalogKindLabelPlural } from "../../utils/gownSegmentFilter";
import { brand } from "../../theme/brand";

export function FittingStylePanel() {
  const navigation = useNavigation();
  const { profile, updateProfile, styleResults } = useFitting();
  const [refineOpen, setRefineOpen] = useState(false);
  const catalogLabel = getCatalogKindLabelPlural(profile);

  const set = (key, val) => updateProfile({ [key]: val });
  const toggleMulti = (key, val, max = 4) => {
    const arr = profile[key] || [];
    if (arr.includes(val)) set(key, arr.filter((v) => v !== val));
    else if (arr.length < max) set(key, [...arr, val]);
  };

  return (
    <SegmentGate>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Body shape</Text>
          {profile.bodyShape ? (
            <Text style={styles.detectedNote}>Auto-detected from camera scan — adjust if needed</Text>
          ) : null}
          <BodyShapePicker selected={profile.bodyShape} onChange={(v) => set("bodyShape", v)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Skin tone & undertone</Text>
          {(profile.skinTone || profile.undertone) ? (
            <Text style={styles.detectedNote}>Auto-detected from camera scan — adjust if needed</Text>
          ) : null}
          <SkinTonePicker
            selectedTone={profile.skinTone}
            selectedUndertone={profile.undertone}
            onToneChange={(v) => set("skinTone", v)}
            onUndertoneChange={(v) => set("undertone", v)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Occasion</Text>
          <View style={styles.occasionRow}>
            {OCCASIONS.map((o) => (
              <Pressable
                key={o.id}
                style={[styles.occasionBtn, profile.occasion === o.id ? styles.occasionBtnSel : null]}
                onPress={() => set("occasion", o.id)}
              >
                <Text style={styles.occasionIcon}>{o.icon}</Text>
                <Text style={profile.occasion === o.id ? styles.occasionTextSel : styles.occasionText}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.refineToggle} onPress={() => setRefineOpen((v) => !v)}>
          <Text style={styles.refineLabel}>Refine preferences</Text>
          <Text style={styles.refineArrow}>{refineOpen ? "▴" : "▾"}</Text>
        </Pressable>

        {refineOpen ? (
          <View style={styles.refineContent}>
            <Text style={styles.sectionTitle}>Preferred colors</Text>
            <View style={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => {
                const on = (profile.colors || []).includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.colorBtn, on ? styles.colorBtnSel : null]}
                    onPress={() => toggleMulti("colors", c.id, 4)}
                  >
                    <View
                      style={[
                        styles.colorSwatch,
                        c.hex ? { backgroundColor: c.hex } : styles.colorPattern,
                      ]}
                    />
                    <Text style={styles.colorId}>{c.id}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Preferred fabrics</Text>
            <View style={styles.fabricRow}>
              {FABRIC_OPTIONS.map((f) => {
                const on = (profile.fabrics || []).includes(f);
                return (
                  <Pressable
                    key={f}
                    style={[styles.fabricBtn, on ? styles.fabricBtnSel : null]}
                    onPress={() => toggleMulti("fabrics", f, 6)}
                  >
                    <Text style={on ? styles.fabricTextSel : styles.fabricText}>{f}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Budget</Text>
            <View style={styles.budgetRow}>
              {BUDGET_RANGES.map((b) => (
                <Pressable
                  key={b.id}
                  style={[styles.budgetBtn, profile.budget === b.id ? styles.budgetBtnSel : null]}
                  onPress={() => set("budget", b.id)}
                >
                  <Text style={profile.budget === b.id ? styles.budgetTextSel : styles.budgetText}>{b.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!profile.bodyShape ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Select your body shape above to see {catalogLabel} recommendations.</Text>
          </View>
        ) : null}

        {profile.bodyShape && !styleResults?.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No matches found. Try relaxing your budget or occasion filter.</Text>
          </View>
        ) : null}

        {styleResults?.length > 0 ? (
          <View style={styles.results}>
            <Text style={styles.resultsLabel}>{styleResults.length} matches · updates as you refine</Text>
            {styleResults.map((g, i) => (
              <View key={g.id} style={styles.gownCard}>
                <View style={styles.gownImgWrap}>
                  <Image source={{ uri: g.image }} style={styles.gownImg} />
                  {i === 0 ? <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>Best match</Text></View> : null}
                  <Text style={styles.rank}>#{i + 1}</Text>
                </View>
                <View style={styles.gownInfo}>
                  <Text style={styles.gownName}>{g.name}</Text>
                  <Text style={styles.gownPrice}>{g.price}</Text>
                  {g.silhouette ? (
                    <Text style={styles.gownMeta}>
                      {g.silhouette}
                      {g.color ? ` · ${g.color}` : ""}
                    </Text>
                  ) : null}
                  {g._reasons?.slice(0, 2).map((r, j) => (
                    <Text key={j} style={styles.reason}>
                      · {r}
                    </Text>
                  ))}
                  <View style={styles.scoreRow}>
                    <View style={styles.scoreTrack}>
                      <View style={[styles.scoreFill, { width: `${g._pct}%` }]} />
                    </View>
                    <Text style={styles.scorePct}>{g._pct}%</Text>
                  </View>
                  <View style={styles.gownActions}>
                    <Pressable onPress={() => navigation.navigate("GownDetail", { id: g.id })}>
                      <Text style={styles.ghostBtn}>Details</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => navigation.navigate("FittingStudio", { gownId: g.id, panel: "tryon" })}
                    >
                      <Text style={styles.primaryBtn}>Try on</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SegmentGate>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: brand.dark, marginBottom: 8 },
  detectedNote: { fontSize: 11, color: "#7a5a1a", marginBottom: 8 },
  occasionRow: { gap: 8 },
  occasionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 10,
    borderRadius: 8,
    backgroundColor: brand.white,
    marginBottom: 6,
  },
  occasionBtnSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  occasionIcon: { fontSize: 16 },
  occasionText: { fontSize: 12, color: brand.text, flex: 1 },
  occasionTextSel: { fontSize: 12, color: brand.dark, fontWeight: "700", flex: 1 },
  refineToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: brand.border,
    marginBottom: 12,
  },
  refineLabel: { fontWeight: "700", color: brand.dark, fontSize: 13 },
  refineArrow: { color: brand.textLight },
  refineContent: { marginBottom: 12 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  colorBtn: { alignItems: "center", padding: 6, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  colorBtnSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  colorSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: brand.border },
  colorPattern: { backgroundColor: "#e8e3db" },
  colorId: { fontSize: 9, marginTop: 4, color: brand.text },
  fabricRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  fabricBtn: { borderWidth: 1, borderColor: brand.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: brand.white },
  fabricBtnSel: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  fabricText: { fontSize: 11, color: brand.text },
  fabricTextSel: { fontSize: 11, color: brand.white, fontWeight: "700" },
  budgetRow: { gap: 6 },
  budgetBtn: { borderWidth: 1, borderColor: brand.border, padding: 10, borderRadius: 8, backgroundColor: brand.white, marginBottom: 6 },
  budgetBtnSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  budgetText: { fontSize: 12, color: brand.text },
  budgetTextSel: { fontSize: 12, color: brand.dark, fontWeight: "700" },
  empty: { padding: 16, backgroundColor: "#f5f0eb", borderRadius: 8, marginTop: 8 },
  emptyText: { color: brand.textLight, fontSize: 12, textAlign: "center" },
  results: { marginTop: 8 },
  resultsLabel: { fontSize: 11, color: brand.textLight, marginBottom: 12 },
  gownCard: { flexDirection: "row", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: brand.border },
  gownImgWrap: { width: 100, position: "relative" },
  gownImg: { width: 100, height: 130, borderRadius: 8, backgroundColor: "#f3edf0" },
  bestBadge: { position: "absolute", top: 6, left: 6, backgroundColor: brand.buttonAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  bestBadgeText: { fontSize: 8, color: brand.white, fontWeight: "800" },
  rank: { position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: "800", color: brand.dark, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 4, borderRadius: 4 },
  gownInfo: { flex: 1 },
  gownName: { fontWeight: "800", fontSize: 14, color: brand.dark },
  gownPrice: { color: brand.textLight, fontSize: 12, marginTop: 2 },
  gownMeta: { fontSize: 11, color: brand.textLight, marginTop: 4 },
  reason: { fontSize: 10, color: brand.text, marginTop: 2 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  scoreTrack: { flex: 1, height: 4, backgroundColor: "#eee", borderRadius: 2, overflow: "hidden" },
  scoreFill: { height: "100%", backgroundColor: brand.buttonAlt, borderRadius: 2 },
  scorePct: { fontSize: 11, fontWeight: "800", color: brand.buttonAlt, width: 32 },
  gownActions: { flexDirection: "row", gap: 12, marginTop: 10 },
  ghostBtn: { fontSize: 12, fontWeight: "700", color: brand.textLight, textDecorationLine: "underline" },
  primaryBtn: { fontSize: 12, fontWeight: "800", color: brand.buttonAlt },
});
