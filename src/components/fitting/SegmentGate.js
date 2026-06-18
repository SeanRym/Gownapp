import { Pressable, StyleSheet, Text, View } from "react-native";
import { SEGMENTS } from "../../constants/sizeConstants";
import { useFitting } from "../../context/FittingContext";
import { brand } from "../../theme/brand";

export function SegmentGate({ children }) {
  const { profile, updateProfile } = useFitting();
  return (
    <View style={styles.container}>
      <View style={styles.wrap}>
        <Text style={styles.label}>Who is being measured?</Text>
        <View style={styles.row}>
          {SEGMENTS.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.btn, profile.segment === s.id ? styles.btnSel : null]}
              onPress={() => updateProfile({ segment: s.id })}
            >
              <Text style={profile.segment === s.id ? styles.btnTextSel : styles.btnText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.children}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  children: { flex: 1, minHeight: 0 },
  wrap: { marginBottom: 12, paddingHorizontal: 16, paddingTop: 4 },
  label: { fontSize: 11, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: { borderWidth: 1, borderColor: brand.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: brand.white },
  btnSel: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  btnText: { fontSize: 12, color: brand.text },
  btnTextSel: { fontSize: 12, color: brand.white, fontWeight: "700" },
});
