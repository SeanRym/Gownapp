import { Modal, Pressable, Image, StyleSheet, Text, View, Share } from "react-native";
import { brand } from "../../theme/brand";

export function ScanSnapshotModal({ visible, snapshot, onClose }) {
  if (!snapshot) return null;

  const shareSnapshot = async () => {
    try {
      await Share.share({
        message: `Scan snapshot — ${snapshot.confidence}% confidence`,
        url: snapshot.uri,
      });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Best scan — {snapshot.confidence}% confidence</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          {snapshot.uri ? <Image source={{ uri: snapshot.uri }} style={styles.img} resizeMode="contain" /> : null}
          <View style={styles.stats}>
            {[
              ["Bust", snapshot.est?.bust],
              ["Waist", snapshot.est?.waist],
              ["Hips", snapshot.est?.hips],
            ].map(([l, v]) => (
              <View key={l} style={styles.stat}>
                <Text style={styles.statLabel}>{l}</Text>
                <Text style={styles.statVal}>{v} cm</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.btn} onPress={shareSnapshot}>
            <Text style={styles.btnText}>Share snapshot</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: brand.white, borderRadius: 12, overflow: "hidden", maxHeight: "85%" },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: brand.border },
  title: { fontWeight: "700", fontSize: 13, color: brand.dark, flex: 1 },
  close: { fontSize: 18, color: brand.textLight, paddingLeft: 8 },
  img: { width: "100%", height: 280, backgroundColor: "#111" },
  stats: { flexDirection: "row", justifyContent: "space-around", padding: 14 },
  stat: { alignItems: "center" },
  statLabel: { fontSize: 10, color: brand.textLight, textTransform: "uppercase" },
  statVal: { fontSize: 16, fontWeight: "800", color: brand.dark, marginTop: 4 },
  btn: { margin: 14, marginTop: 0, backgroundColor: brand.button, paddingVertical: 12, borderRadius: 8 },
  btnText: { textAlign: "center", color: brand.white, fontWeight: "700" },
});
