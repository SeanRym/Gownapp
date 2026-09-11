import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFitting } from "../../context/FittingContext";
import { saveTryonSnapshot } from "../../services/fitting";
import { getCatalogKindLabel } from "../../utils/gownSegmentFilter";
import { brand } from "../../theme/brand";
import { idsEqual } from "../../utils/id";

export function FittingTryOnPanel({ initialGownId }) {
  const navigation = useNavigation();
  const { gowns, user, profile } = useFitting();
  const [selectedGown, setSelectedGown] = useState(null);
  const catalogLabel = getCatalogKindLabel(profile);

  useEffect(() => {
    if (!gowns.length) return;
    const chosen =
      (initialGownId ? gowns.find((g) => idsEqual(g.id, initialGownId)) : null) || gowns[0];
    setSelectedGown(chosen);
  }, [gowns, initialGownId]);

  const openTryOn = () => {
    if (!selectedGown) return;
    navigation.navigate("AR Try-On", {
      id: selectedGown.id,
      saveToProfile: Boolean(user?.id),
      gownName: selectedGown.name,
      segment: profile.segment,
      childGender: profile.childGender || null,
    });
  };

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.title}>Virtual Try-On</Text>
        <Text style={styles.hint}>
          Pick a gown, open the AR camera, and see how it fits. Same experience as the web fitting room.
        </Text>

        {selectedGown ? (
          <View style={styles.previewCard}>
            <Image source={{ uri: selectedGown.image }} style={styles.previewImg} />
            <Text style={styles.previewName}>{selectedGown.name}</Text>
            <Text style={styles.previewPrice}>{selectedGown.price}</Text>
          </View>
        ) : null}

        <Pressable style={styles.primaryBtn} onPress={openTryOn}>
          <Text style={styles.primaryText}>→ Open AR Camera</Text>
        </Pressable>

        <Text style={styles.label}>Choose a {catalogLabel}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
          {gowns.map((g) => (
            <Pressable
              key={g.id}
              style={[styles.stripItem, idsEqual(g.id, selectedGown?.id) ? styles.stripItemSel : null]}
              onPress={() => setSelectedGown(g)}
            >
              <Image source={{ uri: g.image }} style={styles.stripThumb} />
              <Text style={styles.stripName} numberOfLines={2}>
                {g.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  panel: { flex: 1 },
  panelContent: { padding: 16, paddingBottom: 28 },
  title: { fontSize: 20, fontWeight: "700", color: brand.dark, marginBottom: 6 },
  hint: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  previewCard: { alignItems: "center", marginBottom: 14 },
  previewImg: { width: 120, height: 160, borderRadius: 8, backgroundColor: "#f3edf0" },
  previewName: { marginTop: 8, fontWeight: "700", color: brand.dark },
  previewPrice: { color: brand.textLight, fontSize: 12 },
  primaryBtn: { backgroundColor: brand.button, paddingVertical: 13, borderRadius: 8, marginBottom: 16 },
  primaryText: { textAlign: "center", color: brand.white, fontWeight: "700", fontSize: 12 },
  label: { fontSize: 11, fontWeight: "700", color: brand.textLight, textTransform: "uppercase", marginBottom: 8 },
  strip: { flexGrow: 0 },
  stripItem: { width: 88, marginRight: 10, padding: 4, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  stripItemSel: { borderColor: brand.buttonAlt, backgroundColor: "#f5eadc" },
  stripThumb: { width: 80, height: 100, borderRadius: 6, backgroundColor: "#f3edf0" },
  stripName: { fontSize: 10, color: brand.dark, marginTop: 4, fontWeight: "600" },
});
