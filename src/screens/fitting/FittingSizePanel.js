import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SEGMENTS } from "../../constants/sizeConstants";
import { useFitting } from "../../context/FittingContext";
import { sizeMatchConfidence } from "../../utils/fittingValidation";
import { brand } from "../../theme/brand";

export function FittingSizePanel() {
  const { profile, sizeResult, sizeChart, supplierName } = useFitting();
  const { pct, color } = sizeMatchConfidence(sizeResult?.score);
  const segLabel = SEGMENTS.find((s) => s.id === (profile.segment ?? "women"))?.label || "Women";

  if (!profile.bust && !profile.waist && !profile.hips) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No measurements yet</Text>
        <Text style={styles.emptySub}>
          Use the Scan panel to capture your measurements and we'll find your size instantly.
        </Text>
      </View>
    );
  }

  if (!sizeResult) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptySub}>Calculating your size…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroLabel}>Recommended size · {segLabel}</Text>
          <Text style={styles.heroValue}>{sizeResult.size?.label ?? "—"}</Text>
          <Text style={styles.heroSupplier}>{supplierName || "Philippine Standard"} size chart</Text>
        </View>
        <View>
          <Text style={styles.heroLabel}>Match confidence</Text>
          <Text style={[styles.confPct, { color }]}>{pct}%</Text>
        </View>
      </View>

      <View style={styles.confTrack}>
        <View style={[styles.confFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>

      <Text style={styles.sectionLabel}>Size range</Text>
      <View style={styles.pillRow}>
        {sizeResult.adjacent?.map((sz) => (
          <View
            key={sz.label}
            style={[styles.pill, sz.label === sizeResult.size?.label ? styles.pillMatch : null]}
          >
            <Text style={styles.pillText}>{sz.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Your measurements</Text>
      <View style={styles.measRow}>
        {[
          ["Bust", profile.bust, "cm"],
          ["Waist", profile.waist, "cm"],
          ["Hips", profile.hips, "cm"],
          ["Height", profile.height, "cm"],
          ["Weight", profile.weight, "kg"],
        ]
          .filter(([, v]) => v)
          .map(([l, v, u]) => (
            <View key={l} style={styles.measBox}>
              <Text style={styles.measLabel}>{l}</Text>
              <Text style={styles.measVal}>
                {v} {u}
              </Text>
              {profile.source ? <Text style={styles.measSrc}>{profile.source}</Text> : null}
            </View>
          ))}
      </View>

      {sizeResult.size ? (
        <View style={styles.chartRef}>
          <Text style={styles.sectionLabel}>
            {supplierName || "Standard"} chart for {sizeResult.size.label}
          </Text>
          <View style={styles.chartSpans}>
            {sizeResult.size.bust_min != null ? (
              <Text style={styles.span}>Bust {sizeResult.size.bust_min}–{sizeResult.size.bust_max} cm</Text>
            ) : null}
            {sizeResult.size.waist_min != null ? (
              <Text style={styles.span}>Waist {sizeResult.size.waist_min}–{sizeResult.size.waist_max} cm</Text>
            ) : null}
            {sizeResult.size.hip_min != null ? (
              <Text style={styles.span}>Hips {sizeResult.size.hip_min}–{sizeResult.size.hip_max} cm</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {sizeResult.score > 5 ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            You're near a size boundary. For bridal gowns, size up when in doubt — it's easier to take in than
            let out.
          </Text>
        </View>
      ) : null}

      {profile.source === "camera" ? (
        <Text style={styles.note}>
          Camera estimates carry ±2–6 cm variance depending on height input and body shape. Confirm with a tape
          measure for bridal orders.
        </Text>
      ) : null}

      {sizeChart.length ? (
        <>
          <Text style={styles.sectionLabel}>Full size chart — {segLabel}</Text>
          <View style={styles.fullChart}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartHeadCell}>Size</Text>
              <Text style={styles.chartHeadCell}>Bust</Text>
              <Text style={styles.chartHeadCell}>Waist</Text>
              <Text style={styles.chartHeadCell}>Hips</Text>
            </View>
            {sizeChart.map((sz) => (
              <View
                key={sz.label}
                style={[styles.chartRow, sz.label === sizeResult.size?.label ? styles.chartRowMatch : null]}
              >
                <Text style={[styles.chartCell, styles.chartSizeLabel]}>{sz.label}</Text>
                <Text style={styles.chartCell}>
                  {sz.bust_min}–{sz.bust_max}
                </Text>
                <Text style={styles.chartCell}>
                  {sz.waist_min}–{sz.waist_max}
                </Text>
                <Text style={styles.chartCell}>
                  {sz.hip_min}–{sz.hip_max}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 32 },
  emptyWrap: { flex: 1, padding: 24, justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: brand.dark, marginBottom: 8 },
  emptySub: { color: brand.textLight, fontSize: 13, lineHeight: 20 },
  hero: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  heroLeft: { flex: 1 },
  heroLabel: { fontSize: 10, textTransform: "uppercase", color: brand.textLight, letterSpacing: 0.5 },
  heroValue: { fontSize: 42, fontWeight: "800", color: brand.dark, marginTop: 4 },
  heroSupplier: { fontSize: 11, color: brand.textLight, marginTop: 4 },
  confPct: { fontSize: 28, fontWeight: "800", marginTop: 4 },
  confTrack: { height: 8, backgroundColor: "#eee", borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  confFill: { height: "100%", borderRadius: 4 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginTop: 12, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderColor: brand.border, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  pillMatch: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  pillText: { fontWeight: "700", fontSize: 13, color: brand.dark },
  measRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measBox: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, padding: 10, borderRadius: 8, minWidth: "45%" },
  measLabel: { fontSize: 10, color: brand.textLight, textTransform: "uppercase" },
  measVal: { fontSize: 16, fontWeight: "700", color: brand.dark, marginTop: 2 },
  measSrc: { fontSize: 9, color: brand.textLight, marginTop: 2 },
  chartRef: { marginTop: 8, padding: 12, backgroundColor: "#f5eadc", borderRadius: 8 },
  chartSpans: { gap: 4 },
  span: { fontSize: 12, color: brand.text },
  warn: { marginTop: 12, backgroundColor: "#fff8e6", borderWidth: 1, borderColor: "#EF9F27", padding: 12, borderRadius: 8 },
  warnText: { fontSize: 12, color: "#7a5a1a", lineHeight: 18 },
  note: { marginTop: 10, fontSize: 11, color: brand.textLight, lineHeight: 16 },
  fullChart: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, overflow: "hidden", backgroundColor: brand.white },
  chartHeader: { flexDirection: "row", backgroundColor: "#f5f0eb", paddingVertical: 8 },
  chartHeadCell: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: brand.textLight },
  chartRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#f0e8eb", paddingVertical: 8 },
  chartRowMatch: { backgroundColor: "#f5eadc" },
  chartCell: { flex: 1, textAlign: "center", fontSize: 10, color: brand.text },
  chartSizeLabel: { fontWeight: "800", color: brand.dark },
});
