import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { brand } from "../theme/brand";
import { idsEqual, normalizeId } from "../utils/id";
import { trackInteraction, getRecommendationsForGown } from "../services/recommendations";

export function GownDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const { gowns, addToCart, favoritesSet, toggleFavorite, user } = useShop();
  const [recommendations, setRecommendations] = useState([]);
  const [loadingReco, setLoadingReco] = useState(false);

  const gown = useMemo(
    () => gowns.find((g) => idsEqual(g.id, id)) || null,
    [gowns, id]
  );

  // Track view and load recommendations
  useEffect(() => {
    if (!gown || !user?.email) return;

    (async () => {
      try {
        // Track this view
        await trackInteraction(user.email, gown.id, "view");

        // Load recommendations
        setLoadingReco(true);
        const reco = await getRecommendationsForGown(user.email, gown.id, gowns);
        setRecommendations(Array.isArray(reco) ? reco : []);
      } catch (err) {
        console.warn("Failed to load recommendations:", err);
      } finally {
        setLoadingReco(false);
      }
    })();
  }, [gown?.id, user?.email, gowns]);

  if (!gown) {
    return (
      <View style={styles.center}>
        <Text>We could not find this gown.</Text>
      </View>
    );
  }

  const liked = favoritesSet?.has(normalizeId(gown.id));
  const stockQty = gown?.stockQty === undefined ? null : Number(gown.stockQty);
  const sizeOptions = Object.keys(gown?.sizeInventory || {}).filter(Boolean);
  const sizeAvailability = useMemo(
    () =>
      sizeOptions.map((sizeKey) => {
        const info = gown?.sizeInventory?.[sizeKey];
        if (typeof info === "number") {
          return { size: sizeKey, available: Math.max(0, Number(info) || 0) };
        }
        const availableRaw =
          info?.available ??
          (Number(info?.stock || 0) - Number(info?.reserved || 0));
        return { size: sizeKey, available: Math.max(0, Number(availableRaw) || 0) };
      }),
    [gown?.sizeInventory, sizeOptions]
  );
  const [selectedSize, setSelectedSize] = useState(sizeOptions[0] || "N/A");
  const [qty, setQtyLocal] = useState(1);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const selectedSizeAvailable = useMemo(() => {
    const found = sizeAvailability.find((x) => x.size === selectedSize);
    return found ? found.available : null;
  }, [selectedSize, sizeAvailability]);
  const effectiveStockQty = sizeAvailability.length
    ? selectedSizeAvailable
    : stockQty;
  const isOutOfStock =
    Number.isFinite(effectiveStockQty) && Number(effectiveStockQty) <= 0;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Image source={{ uri: gown.image }} style={styles.image} />
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Text style={styles.title}>{gown.name}</Text>
          <Pressable style={styles.favBtn} onPress={() => toggleFavorite(gown.id)}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? brand.buttonAlt : brand.textLight} />
          </Pressable>
        </View>
        {gown.promo && gown.promoPrice ? (
          <View style={styles.priceRow}>
            <Text style={styles.oldPrice}>{gown.price}</Text>
            <Text style={styles.promoPrice}>{gown.promoPrice}</Text>
          </View>
        ) : (
          <Text style={styles.price}>{gown.price}</Text>
        )}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Color</Text>
            <Text style={styles.metaValue}>{gown.color}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Fabric</Text>
            <Text style={styles.metaValue}>{gown.fabric || "N/A"}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={styles.metaValue}>{gown.type}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Silhouette</Text>
            <Text style={styles.metaValue}>{gown.silhouette}</Text>
          </View>
        </View>
        <Text style={styles.desc}>{gown.description}</Text>

        <View style={styles.sizeHeaderRow}>
          <Text style={styles.blockLabel}>Available sizes</Text>
          <Pressable onPress={() => setShowSizeGuide(true)}>
            <Text style={styles.sizeGuideLink}>Size guide ↗</Text>
          </Pressable>
        </View>

        {sizeOptions.length ? (
          <>
            <View style={styles.sizeRow}>
              {sizeAvailability.map((entry) => (
                <Pressable
                  key={`size-${entry.size}`}
                  style={[styles.sizeChip, selectedSize === entry.size ? styles.sizeChipActive : null]}
                  onPress={() => setSelectedSize(entry.size)}
                >
                  <Text style={selectedSize === entry.size ? styles.sizeChipTextActive : styles.sizeChipText}>{entry.size}</Text>
                  <Text style={selectedSize === entry.size ? styles.sizeChipSubTextActive : styles.sizeChipSubText}>
                    {entry.available <= 1 ? "Last piece" : `${entry.available} left`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sizeHint}>Alteration services available — between sizes? Size up and we'll tailor it to fit you perfectly.</Text>
          </>
        ) : (
          <Text style={styles.noSizesText}>No sizes listed for this item yet.</Text>
        )}

        <Text style={styles.blockLabel}>Quantity</Text>
        <View style={styles.qtyRow}>
          <Pressable style={styles.qtyBtn} onPress={() => setQtyLocal((prev) => Math.max(1, prev - 1))}>
            <Text style={styles.qtyBtnText}>-</Text>
          </Pressable>
          <Text style={styles.qtyValue}>{qty}</Text>
          <Pressable
            style={styles.qtyBtn}
            onPress={() => {
              const cap = Number.isFinite(effectiveStockQty)
                ? Number(effectiveStockQty)
                : qty + 1;
              setQtyLocal((prev) => Math.min(cap, prev + 1));
            }}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </Pressable>
        </View>

        {Number.isFinite(effectiveStockQty) ? (
          <Text style={isOutOfStock ? styles.stockOut : styles.stockOk}>
            {isOutOfStock ? "Out of stock" : `Only ${effectiveStockQty} left`}
          </Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.btn, isOutOfStock ? styles.btnDisabled : null]}
        disabled={isOutOfStock}
        onPress={async () => {
          try {
            const result = await addToCart(gown.id, qty, {
              size: sizeOptions.length ? selectedSize : null,
            });
            if (!result?.ok) {
              if (result?.requiresAuth) {
                Alert.alert("Sign in required", result?.reason || "Please sign in first.");
                navigation.navigate("Login");
                return;
              }
              Alert.alert("Cannot add", result?.reason || "Not available.");
              return;
            }
            navigation.navigate("SavedGowns");
          } catch (e) {
            Alert.alert("Cannot add", e?.message || "Please try again.");
          }
        }}
      >
        <Text style={styles.btnText}>
          {isOutOfStock ? "Out of Stock" : `Add ${qty} to Fitting Room`}
        </Text>
      </Pressable>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate("FittingStudio", { gownId: gown.id, panel: "tryon" })}
      >
        <Text style={styles.secondaryBtnText}>Open in fitting studio</Text>
      </Pressable>
      <Text style={styles.note}>Selected size: {selectedSize}</Text>

      <Modal visible={showSizeGuide} transparent animationType="fade" onRequestClose={() => setShowSizeGuide(false)}>
        <Pressable style={styles.guideBackdrop} onPress={() => setShowSizeGuide(false)}>
          <Pressable style={styles.guideModal} onPress={() => {}}>
            <View style={styles.guideHeader}>
              <Text style={styles.guideLabel}>Size chart</Text>
              <Pressable onPress={() => setShowSizeGuide(false)}>
                <Text style={styles.guideClose}>x</Text>
              </Pressable>
            </View>
            <Text style={styles.guideTitle}>General Size Guide</Text>
            <Text style={styles.guideSub}>
              Measurements in inches. Each gown is sourced from a different supplier — available sizes may vary per piece.
            </Text>
            <View style={styles.guideHintWrap}>
              <Text style={styles.guideHint}>Between sizes? About 1" seam is available — we recommend sizing up and having tailored to your measurements.</Text>
            </View>
            <View style={styles.guideTable}>
              <View style={styles.guideTableHead}>
                <Text style={[styles.guideHeadCell, styles.colSize]}>Size</Text>
                <Text style={styles.guideHeadCell}>Bust</Text>
                <Text style={styles.guideHeadCell}>Waist</Text>
                <Text style={styles.guideHeadCell}>Hips</Text>
                <Text style={styles.guideHeadCell}>PH Size</Text>
              </View>
              {[
                ["XS", '32"', '24"', '35"', "0-2"],
                ["S", '34"', '26"', '37"', "4-6"],
                ["M", '36"', '28"', '39"', "8-10"],
                ["L", '38"', '30"', '41"', "12-14"],
                ["XL", '40"', '32"', '43"', "16-18"],
                ["2XL", '42"', '34"', '45"', "20-22"],
              ].map((row) => (
                <View key={row[0]} style={styles.guideTableRow}>
                  <Text style={[styles.guideCell, styles.colSize]}>{row[0]}</Text>
                  <Text style={styles.guideCell}>{row[1]}</Text>
                  <Text style={styles.guideCell}>{row[2]}</Text>
                  <Text style={styles.guideCell}>{row[3]}</Text>
                  <Text style={styles.guideCell}>{row[4]}</Text>
                </View>
              ))}
            </View>
            <Pressable style={styles.guidePrimaryBtn}>
              <Text style={styles.guidePrimaryText}>Use fit matcher for a personalized recommendation →</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {recommendations.length > 0 && (
        <View style={styles.recoSection}>
          <Text style={styles.recoTitle}>You might also like</Text>
          <View style={styles.recoGrid}>
            {recommendations.map((recoGown) => (
              <Pressable
                key={recoGown.id}
                style={styles.recoCard}
                onPress={() => navigation.push("GownDetail", { id: recoGown.id })}
              >
                <Image source={{ uri: recoGown.image }} style={styles.recoImage} />
                <Text style={styles.recoName} numberOfLines={2}>
                  {recoGown.name}
                </Text>
                <Text style={styles.recoPrice}>{recoGown.price}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  image: { width: "100%", height: 420, marginBottom: 2, borderRadius: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  infoCard: { backgroundColor: brand.white, borderRadius: 14, borderWidth: 1, borderColor: brand.border, padding: 14 },
  infoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 },
  title: { fontSize: 32, fontWeight: "700", color: brand.dark, fontStyle: "italic" },
  favBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: brand.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: brand.border },
  price: { fontSize: 13, color: brand.textLight, fontWeight: "600", marginBottom: 10, letterSpacing: 1.2, textTransform: "uppercase" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  oldPrice: { fontSize: 13, color: brand.textLight, fontWeight: "700", letterSpacing: 1.2, textDecorationLine: "line-through" },
  promoPrice: { fontSize: 14, color: brand.buttonAlt, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  desc: { color: brand.textLight, lineHeight: 21, marginBottom: 10 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  metaCell: { width: "48%", borderWidth: 1, borderColor: brand.border, borderRadius: 8, padding: 8, backgroundColor: "#faf7f8" },
  metaLabel: { color: brand.textLight, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  metaValue: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  blockLabel: { color: brand.textLight, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: 4, fontWeight: "700" },
  sizeHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sizeGuideLink: { color: "#7a5522", fontSize: 11, fontWeight: "700", marginTop: 2 },
  sizeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  noSizesText: { color: brand.textLight, fontSize: 11, marginBottom: 10 },
  sizeChip: { width: 54, borderWidth: 1, borderColor: brand.border, borderRadius: 0, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: brand.white, alignItems: "center" },
  sizeChipActive: { borderColor: "#b9855c", backgroundColor: "#fffaf4" },
  sizeChipText: { color: brand.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", marginBottom: 2 },
  sizeChipTextActive: { color: "#6f4a14", fontSize: 13, fontWeight: "800", textTransform: "uppercase", marginBottom: 2 },
  sizeChipSubText: { color: "#b96f47", fontSize: 9, fontWeight: "600" },
  sizeChipSubTextActive: { color: "#a35f39", fontSize: 9, fontWeight: "700" },
  sizeHint: { color: brand.textLight, fontSize: 11, marginBottom: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  qtyBtn: { width: 32, height: 32, borderWidth: 1, borderColor: brand.border, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: brand.white },
  qtyBtnText: { color: brand.dark, fontWeight: "800" },
  qtyValue: { marginHorizontal: 12, fontWeight: "800", color: brand.dark },
  stockOk: { marginTop: 6, color: brand.textLight, fontSize: 12, fontWeight: "800" },
  stockOut: { marginTop: 6, color: "#b00020", fontSize: 12, fontWeight: "900" },
  btn: { marginTop: 6, backgroundColor: brand.button, paddingVertical: 12, borderRadius: 9 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: brand.white, textAlign: "center", fontWeight: "700", letterSpacing: 1.1, fontSize: 11 },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    paddingVertical: 11,
    borderRadius: 9,
  },
  secondaryBtnText: {
    textAlign: "center",
    color: brand.dark,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  note: { marginTop: 8, color: brand.textLight, fontSize: 11, textAlign: "center" },
  guideBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 16 },
  guideModal: { width: "100%", maxWidth: 380, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 12 },
  guideHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  guideLabel: { color: brand.textLight, textTransform: "uppercase", fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  guideClose: { color: brand.textLight, fontSize: 14, fontWeight: "700" },
  guideTitle: { color: brand.dark, fontSize: 28, fontWeight: "700", fontStyle: "italic", marginTop: 3 },
  guideSub: { color: brand.textLight, fontSize: 11, lineHeight: 16, marginTop: 4 },
  guideHintWrap: { marginTop: 8, marginBottom: 8, backgroundColor: "#f7f1e4", borderRadius: 8, padding: 8 },
  guideHint: { color: "#7a5a2d", fontSize: 10, lineHeight: 14 },
  guideTable: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, overflow: "hidden", marginBottom: 10 },
  guideTableHead: { flexDirection: "row", backgroundColor: "#1d120f", paddingVertical: 7 },
  guideHeadCell: { flex: 1, color: "#f0d3a6", fontSize: 10, textAlign: "center", fontWeight: "800" },
  guideTableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: brand.border, paddingVertical: 7 },
  guideCell: { flex: 1, color: brand.text, fontSize: 10, textAlign: "center" },
  colSize: { flex: 0.8 },
  guidePrimaryBtn: { backgroundColor: "#2a170f", borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10 },
  guidePrimaryText: { color: "#f0d3a6", fontSize: 10, textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.6, textAlign: "center" },
  recoSection: { marginTop: 20, paddingHorizontal: 0 },
  recoTitle: { fontSize: 14, fontWeight: "700", color: brand.dark, marginBottom: 12, paddingHorizontal: 16, textTransform: "uppercase", letterSpacing: 0.6 },
  recoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16 },
  recoCard: { width: "48%", backgroundColor: brand.white, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: brand.border },
  recoImage: { width: "100%", height: 180, backgroundColor: "#f0f0f0" },
  recoName: { fontSize: 11, fontWeight: "600", color: brand.dark, padding: 8, paddingBottom: 4 },
  recoPrice: { fontSize: 10, color: brand.buttonAlt, fontWeight: "700", paddingHorizontal: 8, paddingBottom: 8, letterSpacing: 0.5 },
});
