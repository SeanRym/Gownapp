import { Pressable, StyleSheet, Text, View } from "react-native";
import { SKIN_TONES, UNDERTONES } from "../../constants/styleOptions";
import { brand } from "../../theme/brand";

export function SkinTonePicker({ selectedTone, selectedUndertone, onToneChange, onUndertoneChange }) {
  return (
    <View>
      <View style={styles.toneRow}>
        {SKIN_TONES.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.toneBtn, selectedTone === t.id ? styles.toneBtnSel : null]}
            onPress={() => onToneChange(t.id)}
          >
            <View style={[styles.swatch, { backgroundColor: t.hex }]} />
            <Text style={styles.toneLabel}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.subLabel}>Undertone</Text>
      <View style={styles.underRow}>
        {UNDERTONES.map((u) => (
          <Pressable
            key={u.id}
            style={[styles.underBtn, selectedUndertone === u.id ? styles.underBtnSel : null]}
            onPress={() => onUndertoneChange(u.id)}
          >
            <View style={[styles.underDot, { backgroundColor: u.hex }]} />
            <Text style={selectedUndertone === u.id ? styles.underTextSel : styles.underText}>{u.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toneRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toneBtn: { alignItems: "center", padding: 6, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  toneBtnSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: brand.border },
  toneLabel: { fontSize: 9, color: brand.text, marginTop: 4, fontWeight: "600" },
  subLabel: { fontSize: 11, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginTop: 14, marginBottom: 8 },
  underRow: { flexDirection: "row", gap: 8 },
  underBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 8,
    borderRadius: 8,
    backgroundColor: brand.white,
  },
  underBtnSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  underDot: { width: 12, height: 12, borderRadius: 6 },
  underText: { fontSize: 11, color: brand.text },
  underTextSel: { fontSize: 11, color: brand.dark, fontWeight: "700" },
});
