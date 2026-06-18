import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { brand } from "../theme/brand";
import { normalizeId } from "../utils/id";

export function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { gowns, reloadGowns, cartDetailed, favoritesSet, toggleFavorite } = useShop();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const fallbackImage = "https://via.placeholder.com/800x1000/F5EFE7/5C4A42?text=JCE+Bridal";
  const arImage = gowns[0]?.image || fallbackImage;

  useFocusEffect(() => {
    reloadGowns?.();
  });

  const cartCount = useMemo(
    () => cartDetailed.reduce((sum, item) => sum + (item.qty || 0), 0),
    [cartDetailed]
  );

  const categories = useMemo(() => {
    const set = new Set();
    for (const g of gowns) if (g?.type) set.add(g.type);
    return ["All", ...Array.from(set)];
  }, [gowns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gowns.filter((g) => {
      if (!g) return false;
      const catOk = activeCategory === "All" ? true : String(g.type) === activeCategory;
      const qOk = !q
        ? true
        : `${g.name || ""} ${g.type || ""} ${g.color || ""} ${g.silhouette || ""}`
            .toLowerCase()
            .includes(q);
      return catOk && qOk;
    });
  }, [gowns, query, activeCategory]);

  const featuredGowns = useMemo(() => filtered.slice(0, 4), [filtered]);

  const promoItems = useMemo(() => {
    return gowns.filter((g) => g?.promo && g?.promoPrice);
  }, [gowns]);

  const recommended = useMemo(() => {
    const prefType = cartDetailed?.[0]?.type || null;
    const pool = prefType ? filtered.filter((g) => g.type === prefType) : filtered;
    return pool.slice(0, 4);
  }, [filtered, cartDetailed]);

  const newArrivals = useMemo(() => {
    const list = [...filtered];
    return list.slice(-4).reverse();
  }, [filtered]);

  const searchSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const preferredOrder = ["Gowns", "Dresses", "Suit"];
      const sampleByType = preferredOrder
        .map((type) => gowns.find((g) => String(g?.type) === type))
        .filter(Boolean);
      const extras = gowns.filter((g) => !sampleByType.some((x) => x.id === g.id)).slice(0, 3);
      return [...sampleByType, ...extras].slice(0, 6);
    }
    if (activeCategory === "All") {
      const byQuery = gowns.filter((g) =>
        `${g.name || ""} ${g.type || ""} ${g.color || ""} ${g.silhouette || ""}`
          .toLowerCase()
          .includes(q)
      );
      return byQuery.slice(0, 6);
    }
    return filtered.slice(0, 6);
  }, [activeCategory, filtered, gowns, query]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={() => setSearchFocused(false)}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.searchWrap}
          onPress={() => {
            setSearchFocused(true);
            searchInputRef.current?.focus();
          }}
        >
          <Ionicons name="search" size={16} color={brand.textLight} />
          <TextInput
            ref={searchInputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Find your gown…"
            placeholderTextColor={brand.textLight}
            style={styles.searchInput}
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => setSearchFocused(false), 120);
            }}
          />
        </Pressable>

        <Pressable style={styles.cartBtn} onPress={() => navigation.navigate("SavedGowns")}>
          <Ionicons name="cart" size={20} color={brand.dark} />
          {cartCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {searchFocused ? (
        <View style={styles.searchSuggestWrap}>
          <Text style={styles.searchListTitle}>Suggestions</Text>
          {searchSuggestions.length ? (
            searchSuggestions.map((item) => (
              <Pressable
                key={`focus-suggest-${item.id}`}
                style={styles.searchListItem}
                onPress={() => {
                  setQuery(item.name);
                  setSearchFocused(false);
                  navigation.navigate("GownDetail", { id: item.id });
                }}
              >
                <View style={styles.searchListThumb}>
                  <Image source={{ uri: item.image || fallbackImage }} style={styles.searchListThumbImage} />
                </View>
                <View style={styles.searchListMeta}>
                  <Text style={styles.searchListName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.searchListType} numberOfLines={1}>
                    {item.type} • {item.color}
                  </Text>
                </View>
                <Text style={styles.searchListPrice}>{item.promo && item.promoPrice ? item.promoPrice : item.price}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.searchListEmpty}>No matching styles yet.</Text>
          )}
        </View>
      ) : null}

      <Pressable
        style={styles.arCta}
        onPress={() => navigation.navigate("Main", { screen: "FittingRoom" })}
      >
        <View style={styles.arCtaHeader}>
          <View style={styles.arIconCircle}>
            <Ionicons name="scan-outline" size={22} color={brand.dark} />
          </View>
          <Text style={styles.arCtaBadge}>MY FITTING ROOM</Text>
        </View>
        <Image source={{ uri: arImage }} style={styles.arImage} />
        <Text style={styles.arCtaTitle}>Scan, size, style & try-on</Text>
        <Text style={styles.arCtaText}>Same fitting studio as our website — measure, match sizes, find gowns, and AR preview.</Text>
        <View style={styles.arButtonRow}>
          <View style={styles.arPrimaryBtn}>
            <Text style={styles.arPrimaryText}>OPEN FITTING STUDIO</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.promoBanner}>
        <View style={styles.promoLeft}>
          <Text style={styles.promoTitle}>Promos</Text>
          <Text style={styles.promoText}>
            {promoItems.length ? `${promoItems.length} discounted styles available today.` : "No discounted styles yet."}
          </Text>
        </View>
        <Pressable
          style={styles.promoBtn}
          onPress={() => navigation.navigate("Gowns", { promo: true })}
        >
          <Text style={styles.promoBtnText}>Browse</Text>
        </Pressable>
      </View>

      {promoItems.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promoStrip}
        >
          {promoItems.slice(0, 10).map((g) => (
            <Pressable
              key={`promo-${g.id}`}
              style={styles.promoCard}
              onPress={() => navigation.navigate("GownDetail", { id: g.id })}
            >
              <Image source={{ uri: g.image || fallbackImage }} style={styles.promoCardImage} />
              <Text style={styles.promoCardName} numberOfLines={1}>
                {g.name}
              </Text>
              <View style={styles.promoPriceRow}>
                <Text style={styles.promoOldPrice}>{g.price}</Text>
                <Text style={styles.promoNewPrice}>{g.promoPrice}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Featured collection</Text>
        <Text style={styles.sectionHeading}>Handpicked Elegance</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesRow}>
        {categories.map((c) => {
          const active = c === activeCategory;
          return (
            <Pressable
              key={c}
              style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
              onPress={() => setActiveCategory(c)}
            >
              <Text style={[styles.categoryChipText, active ? styles.categoryChipTextActive : null]}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.gridSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.gridTitle}>Featured gowns</Text>
          <Pressable onPress={() => navigation.navigate("Gowns")}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {featuredGowns.map((g) => (
            <View key={g.id} style={styles.gridCard}>
              <Pressable style={styles.gridCardBody} onPress={() => navigation.navigate("GownDetail", { id: g.id })}>
                <Image source={{ uri: g.image || fallbackImage }} style={styles.gridImage} />
                <Text style={styles.gridName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.gridMeta} numberOfLines={1}>
                  {g.promo && g.promoPrice ? `${g.promoPrice} • Promo` : g.price} • {g.silhouette}
                </Text>
              </Pressable>
              <Pressable style={styles.favBtn} onPress={() => toggleFavorite(g.id)}>
                <Ionicons
                  name={favoritesSet?.has(normalizeId(g.id)) ? "heart" : "heart-outline"}
                  size={18}
                  color={favoritesSet?.has(normalizeId(g.id)) ? brand.buttonAlt : brand.textLight}
                />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.gridSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.gridTitle}>You might also like</Text>
        </View>
        <View style={styles.grid}>
          {recommended.map((g) => (
            <View key={`rec-${g.id}`} style={styles.gridCard}>
              <Pressable style={styles.gridCardBody} onPress={() => navigation.navigate("GownDetail", { id: g.id })}>
                <Image source={{ uri: g.image || fallbackImage }} style={styles.gridImage} />
                <Text style={styles.gridName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.gridMeta} numberOfLines={1}>
                  {g.color} • {g.type}
                </Text>
              </Pressable>
              <Pressable style={styles.favBtn} onPress={() => toggleFavorite(g.id)}>
                <Ionicons
                  name={favoritesSet?.has(normalizeId(g.id)) ? "heart" : "heart-outline"}
                  size={18}
                  color={favoritesSet?.has(normalizeId(g.id)) ? brand.buttonAlt : brand.textLight}
                />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.gridSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.gridTitle}>New arrivals</Text>
        </View>
        <View style={styles.grid}>
          {newArrivals.map((g) => (
            <View key={`new-${g.id}`} style={styles.gridCard}>
              <Pressable style={styles.gridCardBody} onPress={() => navigation.navigate("GownDetail", { id: g.id })}>
                <Image source={{ uri: g.image || fallbackImage }} style={styles.gridImage} />
                <Text style={styles.gridName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.gridMeta} numberOfLines={1}>
                  {g.promo && g.promoPrice ? `${g.promoPrice} • Promo` : g.price}
                </Text>
              </Pressable>
              <Pressable style={styles.favBtn} onPress={() => toggleFavorite(g.id)}>
                <Ionicons
                  name={favoritesSet?.has(normalizeId(g.id)) ? "heart" : "heart-outline"}
                  size={18}
                  color={favoritesSet?.has(normalizeId(g.id)) ? brand.buttonAlt : brand.textLight}
                />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { paddingBottom: 40 },

  topBar: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, alignItems: "center" },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: brand.dark, fontWeight: "600" },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: brand.button,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { color: brand.white, fontSize: 10, fontWeight: "800" },
  searchSuggestWrap: {
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    gap: 8,
  },

  promoBanner: {
    marginTop: 14,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  promoLeft: { flex: 1 },
  promoTitle: { color: brand.dark, fontWeight: "900", fontSize: 14, marginBottom: 3 },
  promoText: { color: brand.textLight, fontSize: 12 },
  promoBtn: { backgroundColor: brand.accentSoft, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  promoBtnText: { color: brand.dark, fontWeight: "900", fontSize: 12 },

  promoStrip: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 10 },
  promoCard: {
    width: 150,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 14,
    padding: 10,
  },
  promoCardImage: { width: "100%", height: 110, borderRadius: 10, marginBottom: 8, backgroundColor: "#eee" },
  promoCardName: { color: brand.dark, fontWeight: "800", fontSize: 12, marginBottom: 6 },
  promoPriceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  promoOldPrice: { color: brand.textLight, fontSize: 11, fontWeight: "800", textDecorationLine: "line-through" },
  promoNewPrice: { color: brand.buttonAlt, fontSize: 12, fontWeight: "900" },

  arCta: {
    marginTop: 8,
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: brand.accentSoft,
    borderWidth: 1,
    borderColor: brand.border,
  },
  arCtaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  arIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 24,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: brand.border,
  },
  arCtaBadge: { color: brand.dark, fontWeight: "800", fontSize: 11, letterSpacing: 1.4 },
  arImage: { width: "100%", height: 150, borderRadius: 14, marginBottom: 10, marginTop: 8 },
  arCtaTitle: { color: brand.dark, fontWeight: "900", fontSize: 18, marginBottom: 6 },
  arCtaText: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  arButtonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arPrimaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: brand.dark,
  },
  arPrimaryText: { color: brand.white, fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },

  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionLabel: { color: brand.textLight, fontSize: 10, letterSpacing: 1.6, marginBottom: 6, textTransform: "uppercase" },
  sectionHeading: { color: brand.dark, fontSize: 22, fontWeight: "900" },

  categoriesRow: { paddingHorizontal: 16, gap: 10, paddingTop: 12, paddingBottom: 2 },
  categoryChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border },
  categoryChipActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  categoryChipText: { color: brand.dark, fontWeight: "800", fontSize: 12 },
  categoryChipTextActive: { color: brand.white },

  searchListTitle: { color: brand.dark, fontWeight: "800", fontSize: 12 },
  searchListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  searchListThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: brand.border,
  },
  searchListThumbImage: { width: "100%", height: "100%" },
  searchListMeta: { flex: 1, minWidth: 0 },
  searchListName: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  searchListType: { color: brand.textLight, fontSize: 11, marginTop: 2 },
  searchListPrice: { color: brand.dark, fontSize: 11, fontWeight: "800" },
  searchListEmpty: { color: brand.textLight, fontSize: 12 },

  gridSection: { paddingHorizontal: 16, marginTop: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  gridTitle: { color: brand.dark, fontSize: 16, fontWeight: "900" },
  link: { color: brand.textLight, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridCard: { width: "48%", backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, borderRadius: 14, padding: 10, position: "relative" },
  gridCardBody: { flex: 1 },
  gridImage: { width: "100%", height: 150, borderRadius: 10, marginBottom: 8 },
  gridName: { color: brand.dark, fontWeight: "800", marginBottom: 2 },
  gridMeta: { color: brand.textLight, fontSize: 12 },
  favBtn: { position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: 999, backgroundColor: brand.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: brand.border },
});
