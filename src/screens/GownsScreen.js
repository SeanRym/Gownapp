import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { useShop } from "../context/ShopContext";
import { brand } from "../theme/brand";
import { normalizeId } from "../utils/id";
import { handleToggleFavorite } from "../utils/favoritePress";

export function GownsScreen({ navigation, route }) {
  const { gowns, loading, favoritesSet, toggleFavorite } = useShop();
  const [type, setType] = useState("");
  const [color, setColor] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  const promoMode = route?.params?.promo === true;

  const types = useMemo(
    () => [...new Set(gowns.map((g) => g.type).filter(Boolean))].sort(),
    [gowns]
  );
  const colors = useMemo(
    () => [...new Set(gowns.map((g) => g.color).filter(Boolean))].sort(),
    [gowns]
  );

  const parsePrice = (value) => Number(String(value || "").replace(/[^\d]/g, "")) || 0;

  const filtered = useMemo(() => {
    let base = gowns;
    if (promoMode) {
      base = gowns.filter((g) => g.promo);
    }
    if (type) base = base.filter((g) => g.type === type);
    if (color) base = base.filter((g) => g.color === color);
    const q = String(query || "").trim().toLowerCase();
    if (q) {
      base = base.filter((g) =>
        [g.name, g.type, g.color, g.silhouette, g.description]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    const sorted = [...base];
    if (sortBy === "price_asc") sorted.sort((a, b) => parsePrice(a.promoPrice || a.price) - parsePrice(b.promoPrice || b.price));
    if (sortBy === "price_desc") sorted.sort((a, b) => parsePrice(b.promoPrice || b.price) - parsePrice(a.promoPrice || a.price));
    if (sortBy === "name_asc") sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return sorted;
  }, [gowns, type, color, promoMode, query, sortBy]);

  const recommendations = useMemo(() => {
    if (!filtered.length) return [];
    const targetType = type || filtered[0]?.type;
    const targetColor = color || filtered[0]?.color;
    return gowns
      .filter((g) => g.type === targetType || g.color === targetColor)
      .slice(0, 4);
  }, [filtered, gowns, type, color]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Bridal Gowns & Dresses</Text>
      {promoMode && (
        <Text style={styles.promoLabel}>Showing all gowns and suits on promo.</Text>
      )}
      <TextInput
        value={query}
        onChangeText={setQuery}
        style={styles.search}
        placeholder="Search gown name, color, silhouette..."
        placeholderTextColor={brand.textLight}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Pressable style={[styles.chip, !type && styles.chipActive]} onPress={() => setType("")}>
          <Text style={[styles.chipText, !type && styles.chipTextActive]}>All</Text>
        </Pressable>
        {types.map((t) => (
          <Pressable key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Pressable style={[styles.chip, !color && styles.chipActive]} onPress={() => setColor("")}>
          <Text style={[styles.chipText, !color && styles.chipTextActive]}>Any Color</Text>
        </Pressable>
        {colors.map((c) => (
          <Pressable key={c} style={[styles.chip, color === c && styles.chipActive]} onPress={() => setColor(c)}>
            <Text style={[styles.chipText, color === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        <Pressable style={[styles.chip, sortBy === "featured" && styles.chipActive]} onPress={() => setSortBy("featured")}>
          <Text style={[styles.chipText, sortBy === "featured" && styles.chipTextActive]}>Featured</Text>
        </Pressable>
        <Pressable style={[styles.chip, sortBy === "price_asc" && styles.chipActive]} onPress={() => setSortBy("price_asc")}>
          <Text style={[styles.chipText, sortBy === "price_asc" && styles.chipTextActive]}>Price Low-High</Text>
        </Pressable>
        <Pressable style={[styles.chip, sortBy === "price_desc" && styles.chipActive]} onPress={() => setSortBy("price_desc")}>
          <Text style={[styles.chipText, sortBy === "price_desc" && styles.chipTextActive]}>Price High-Low</Text>
        </Pressable>
        <Pressable style={[styles.chip, sortBy === "name_asc" && styles.chipActive]} onPress={() => setSortBy("name_asc")}>
          <Text style={[styles.chipText, sortBy === "name_asc" && styles.chipTextActive]}>Name A-Z</Text>
        </Pressable>
      </ScrollView>
      {!!recommendations.length && (
        <View style={styles.recoBox}>
          <Text style={styles.recoTitle}>Recommended For You</Text>
          <Text style={styles.recoText}>
            Based on your current filters, you may also like: {recommendations.map((x) => x.name).join(", ")}.
          </Text>
        </View>
      )}

      {loading ? (
        <Text style={styles.loading}>Loading gowns...</Text>
      ) : (
        filtered.map((item) => (
          <View style={styles.card} key={item.id}>
            <Pressable style={styles.favBtn} onPress={() => handleToggleFavorite(toggleFavorite, item.id, navigation)}>
              <Ionicons
                name={favoritesSet?.has(normalizeId(item.id)) ? "heart" : "heart-outline"}
                size={18}
                color={favoritesSet?.has(normalizeId(item.id)) ? brand.buttonAlt : brand.textLight}
              />
            </Pressable>
            <Image source={{ uri: item.image }} style={styles.cardImage} />
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>{item.type} • {item.color}</Text>
            {item.promo && item.promoPrice ? (
              <View style={styles.priceRow}>
                <Text style={styles.oldPrice}>{item.price}</Text>
                <Text style={styles.promoPrice}>{item.promoPrice}</Text>
              </View>
            ) : (
              <Text style={styles.cardPrice}>{item.price}</Text>
            )}
            <Pressable style={styles.btn} onPress={() => navigation.navigate("GownDetail", { id: item.id })}>
            <Text style={styles.btnText}>View Gown Details</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 34 },
  title: { fontSize: 32, fontStyle: "italic", fontWeight: "700", marginBottom: 12, color: brand.dark },
  promoLabel: { color: brand.textLight, fontSize: 12, marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: brand.text,
  },
  filters: { marginBottom: 14 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: brand.border, marginRight: 8, backgroundColor: brand.white, borderRadius: 999 },
  chipActive: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  chipText: { color: brand.text, fontWeight: "600", fontSize: 12, letterSpacing: 0.6 },
  chipTextActive: { color: brand.white },
  loading: { color: brand.textLight, textAlign: "center", marginTop: 30 },
  recoBox: {
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  recoTitle: { color: brand.dark, fontWeight: "800", marginBottom: 4 },
  recoText: { color: brand.textLight, fontSize: 12, lineHeight: 17 },
  card: { marginBottom: 18, backgroundColor: brand.white, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: brand.border, position: "relative" },
  cardImage: { width: "100%", height: 320, marginBottom: 10, borderRadius: 10 },
  cardTitle: { fontSize: 18, fontWeight: "600", color: brand.dark, textAlign: "center" },
  cardMeta: { marginTop: 4, color: brand.textLight, textAlign: "center", fontSize: 12 },
  cardPrice: { marginTop: 6, color: brand.text, textAlign: "center", fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
  priceRow: { marginTop: 6, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  oldPrice: { color: brand.textLight, fontSize: 12, textDecorationLine: "line-through", fontWeight: "700" },
  promoPrice: { color: brand.buttonAlt, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  btn: { marginTop: 10, backgroundColor: brand.button, paddingVertical: 11, borderRadius: 8 },
  btnText: { color: brand.white, textAlign: "center", fontWeight: "700", letterSpacing: 1.1, fontSize: 11 },
  favBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.border,
    zIndex: 2,
  },
});
