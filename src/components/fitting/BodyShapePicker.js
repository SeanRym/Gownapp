import { Pressable, StyleSheet, Text, View } from "react-native";
import { BODY_SHAPES } from "../../constants/styleOptions";
import { brand } from "../../theme/brand";

export function BodyShapePicker({ selected, onChange }) {
  return (
    <View style={styles.grid}>
      {BODY_SHAPES.map((s) => (
        <Pressable
          key={s.id}
          style={[styles.card, selected === s.id ? styles.cardSel : null]}
          onPress={() => onChange(s.id)}
        >
          <Text style={[styles.label, selected === s.id ? styles.labelSel : null]}>{s.label}</Text>
          <Text style={styles.desc} numberOfLines={2}>{s.desc}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    width: "48%",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: brand.white,
  },
  cardSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  label: { fontWeight: "700", fontSize: 12, color: brand.dark },
  labelSel: { color: brand.buttonAlt },
  desc: { fontSize: 10, color: brand.textLight, marginTop: 4, lineHeight: 14 },
});
