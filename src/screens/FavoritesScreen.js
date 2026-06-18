import { useCallback } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { brand } from "../theme/brand";
import { normalizeId } from "../utils/id";
import { handleToggleFavorite } from "../utils/favoritePress";

export function FavoritesScreen({ navigation }) {
  const { user, favoritesDetailed, favoritesSet, favoritesLoading, toggleFavorite, reloadFavorites } = useShop();
  const fallbackImage = "https://via.placeholder.com/800x1000/F5EFE7/5C4A42?text=JCE+Bridal";

  useFocusEffect(
    useCallback(() => {
      if (user?.id) reloadFavorites(user.id);
    }, [user?.id, reloadFavorites])
  );

  if (!user?.id) {
    return (
      <View style={styles.center}>
        <Ionicons name="heart-outline" size={44} color={brand.textLight} />
        <Text style={styles.heroTitle}>Saved Gowns</Text>
        <Text style={styles.centerText}>Please sign in to view and sync your saved favorites.</Text>
        <Pressable style={styles.loginBtn} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.loginBtnText}>Log in</Text>
        </Pressable>
      </View>
    );
  }

  const count = favoritesDetailed.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
        <Text style={styles.heroTitle}>Saved Gowns</Text>
        <Text style={styles.heroSub}>
          {count === 0 ? "Heart any gown to save it here." : `${count} piece${count !== 1 ? "s" : ""} saved`}
        </Text>
      </View>

      {favoritesLoading ? <Text style={styles.loadingText}>Loading…</Text> : null}

      {!favoritesLoading && count === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={48} color="#ddd" />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyText}>Browse our catalogue and tap the heart on any gown you love.</Text>
          <Pressable style={styles.browseBtn} onPress={() => navigation.navigate("Gowns")}>
            <Text style={styles.browseBtnText}>Browse collection →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.grid}>
          {favoritesDetailed.map((g) => {
            const liked = favoritesSet?.has(normalizeId(g.id));
            return (
              <View key={g.id} style={styles.card}>
                <Pressable
                  style={styles.cardBody}
                  onPress={() => navigation.navigate("GownDetail", { id: g.id })}
                >
                  <Image source={{ uri: g.image || fallbackImage }} style={styles.cardImage} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {g.price} • {g.silhouette}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.heartBtn}
                  onPress={() => handleToggleFavorite(toggleFavorite, g.id, navigation)}
                >
                  <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? "#E24B4A" : brand.textLight} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf7f4" },
  content: { paddingBottom: 30 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#faf7f4",
    gap: 10,
  },
  centerText: { color: brand.textLight, textAlign: "center", lineHeight: 20, fontSize: 14 },
  hero: {
    backgroundColor: "#1a0f0a",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(201,169,110,0.12)",
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 3,
    color: "#c9a96e",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    color: brand.white,
    fontWeight: "300",
    fontStyle: "italic",
    marginBottom: 8,
  },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 18 },
  loadingText: { textAlign: "center", color: brand.textLight, marginBottom: 12 },
  emptyWrap: {
    marginHorizontal: 16,
    paddingVertical: 40,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
  },
  emptyTitle: { color: brand.dark, fontWeight: "700", fontSize: 16, marginTop: 12 },
  emptyText: { color: brand.textLight, textAlign: "center", marginTop: 8, lineHeight: 20, fontSize: 13, paddingHorizontal: 24 },
  browseBtn: {
    marginTop: 16,
    backgroundColor: brand.dark,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  browseBtnText: { color: brand.white, fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  loginBtn: {
    marginTop: 8,
    backgroundColor: brand.dark,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  loginBtnText: { color: brand.white, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
  card: {
    width: "48%",
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    padding: 10,
    position: "relative",
  },
  cardBody: { flex: 1 },
  cardImage: { width: "100%", height: 160, borderRadius: 10, marginBottom: 8 },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: brand.dark, fontWeight: "900", fontSize: 14, marginBottom: 3 },
  cardMeta: { color: brand.textLight, fontSize: 12, fontWeight: "700" },
});
