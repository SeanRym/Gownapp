import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SKIN_TONES } from "../../constants/styleOptions";
import { SEGMENTS } from "../../constants/sizeConstants";
import { useFitting } from "../../context/FittingContext";
import { sizeMatchConfidence } from "../../utils/fittingValidation";
import { brand } from "../../theme/brand";

export function FittingProfileSheet({ visible, onClose }) {
  const { profile, updateProfile, sizeResult, supplierName, saveProfile, saving, saveMsg, user } = useFitting();
  const { pct, color } = sizeMatchConfidence(sizeResult?.score);
  const tone = SKIN_TONES.find((t) => t.id === profile.skinTone);
  const hasProfile = profile.bust || profile.waist || profile.hips;
  const segLabel = SEGMENTS.find((s) => s.id === profile.segment)?.label || "Women";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Fitting profile</Text>
          {user ? <Text style={styles.user}>{user.name || user.email}</Text> : <Text style={styles.user}>Sign in to save to server</Text>}

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Segment</Text>
            <View style={styles.chipRow}>
              {SEGMENTS.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chip, profile.segment === s.id ? styles.chipOn : null]}
                  onPress={() => updateProfile({ segment: s.id })}
                >
                  <Text style={profile.segment === s.id ? styles.chipTextOn : styles.chipText}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Measurements</Text>
            {hasProfile ? (
              <View style={styles.measGrid}>
                {[
                  ["Bust", profile.bust, "cm"],
                  ["Waist", profile.waist, "cm"],
                  ["Hips", profile.hips, "cm"],
                  ["Height", profile.height, "cm"],
                  ["Weight", profile.weight, "kg"],
                ]
                  .filter(([, v]) => v)
                  .map(([l, v, u]) => (
                    <View key={l} style={styles.measChip}>
                      <Text style={styles.measKey}>{l}</Text>
                      <Text style={styles.measVal}>
                        {v} {u}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : (
              <Text style={styles.empty}>Use Scan to capture measurements</Text>
            )}

            {sizeResult?.size ? (
              <View style={styles.sizeBlock}>
                <Text style={styles.sectionLabel}>
                  {supplierName || segLabel} size
                </Text>
                <Text style={styles.sizeHero}>{sizeResult.size.label}</Text>
                <View style={styles.confRow}>
                  <View style={styles.confTrack}>
                    <View style={[styles.confFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.confPct, { color }]}>{pct}%</Text>
                </View>
                <View style={styles.chipRow}>
                  {sizeResult.adjacent?.map((sz) => (
                    <View
                      key={sz.label}
                      style={[styles.sizePill, sz.label === sizeResult.size.label ? styles.sizePillMatch : null]}
                    >
                      <Text style={styles.sizePillText}>{sz.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {(profile.bodyShape || profile.skinTone || profile.occasion) ? (
              <>
                <Text style={styles.sectionLabel}>Style profile</Text>
                <View style={styles.chipRow}>
                  {profile.bodyShape ? <View style={styles.chip}><Text style={styles.chipText}>{profile.bodyShape}</Text></View> : null}
                  {profile.skinTone ? (
                    <View style={[styles.chip, styles.toneChip]}>
                      <View style={[styles.miniSwatch, { backgroundColor: tone?.hex }]} />
                      <Text style={styles.chipText}>{profile.skinTone}</Text>
                    </View>
                  ) : null}
                  {profile.undertone ? <View style={styles.chip}><Text style={styles.chipText}>{profile.undertone}</Text></View> : null}
                  {profile.occasion ? <View style={styles.chip}><Text style={styles.chipText}>{profile.occasion}</Text></View> : null}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Override measurements</Text>
            {[
              ["Bust", "bust"],
              ["Waist", "waist"],
              ["Hips", "hips"],
              ["Height", "height"],
            ].map(([label, key]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={profile[key] != null ? String(profile[key]) : ""}
                  placeholder="—"
                  onChangeText={(v) => updateProfile({ [key]: v ? parseFloat(v) || null : null })}
                />
              </View>
            ))}

            {user && hasProfile ? (
              <Pressable style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save profile"}</Text>
              </Pressable>
            ) : null}
            {saveMsg ? (
              <Text style={[styles.saveMsg, saveMsg.startsWith("✓") ? styles.saveOk : styles.saveErr]}>{saveMsg}</Text>
            ) : null}
          </ScrollView>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: brand.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 24,
  },
  handle: { width: 40, height: 4, backgroundColor: brand.border, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: brand.dark },
  user: { fontSize: 12, color: brand.textLight, marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginTop: 12, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: brand.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: brand.white },
  chipOn: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  chipText: { fontSize: 11, color: brand.text },
  chipTextOn: { fontSize: 11, color: brand.white, fontWeight: "700" },
  toneChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniSwatch: { width: 12, height: 12, borderRadius: 6 },
  measGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measChip: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, padding: 8, borderRadius: 8, minWidth: "30%" },
  measKey: { fontSize: 9, color: brand.textLight, textTransform: "uppercase" },
  measVal: { fontSize: 13, fontWeight: "700", color: brand.dark, marginTop: 2 },
  empty: { fontSize: 12, color: brand.textLight },
  sizeBlock: { marginTop: 4 },
  sizeHero: { fontSize: 32, fontWeight: "800", color: brand.dark },
  confRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 },
  confTrack: { flex: 1, height: 6, backgroundColor: "#eee", borderRadius: 3, overflow: "hidden" },
  confFill: { height: "100%", borderRadius: 3 },
  confPct: { fontSize: 12, fontWeight: "700", width: 36 },
  sizePill: { borderWidth: 1, borderColor: brand.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  sizePillMatch: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  sizePillText: { fontSize: 11, fontWeight: "700", color: brand.dark },
  field: { marginBottom: 8 },
  fieldLabel: { fontSize: 11, color: brand.textLight, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, padding: 10, borderRadius: 8 },
  saveBtn: { marginTop: 16, backgroundColor: brand.dark, paddingVertical: 12, borderRadius: 8 },
  saveBtnText: { textAlign: "center", color: brand.white, fontWeight: "700" },
  saveMsg: { marginTop: 8, fontSize: 12 },
  saveOk: { color: "#1D9E75" },
  saveErr: { color: "#E24B4A" },
  closeBtn: { marginTop: 12, paddingVertical: 10 },
  closeText: { textAlign: "center", color: brand.textLight, fontWeight: "600" },
});
