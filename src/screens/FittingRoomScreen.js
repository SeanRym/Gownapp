import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { fetchCmsSection } from "../services/cms";
import { loadCartNote, saveCartNote } from "../utils/storage";
import { brand } from "../theme/brand";
import { getGownSizeOptions } from "../utils/cartLine";

function formatPrice(n) {
  return `P${Number(n).toLocaleString("en-PH")}`;
}

function stockBadge(available) {
  if (available === null) return null;
  if (available === 0) return { text: "OUT OF STOCK", tone: "oos" };
  if (available <= 2) return { text: `ONLY ${available} LEFT`, tone: "low" };
  if (available <= 5) return { text: `${available} IN STOCK`, tone: "low" };
  return null;
}

export function FittingRoomScreen({ navigation }) {
  const { cartDetailed, user, setQty, changeCartLineSize, removeFromCart, syncCartFromServer, reloadGowns } =
    useShop();
  const [sizeChangingKey, setSizeChangingKey] = useState(null);
  const [content, setContent] = useState({
    heading: "Your Fitting Room",
    subtitle: "Review your chosen pieces before we begin the fitting process.",
    empty_title: "Your fitting room is empty",
    empty_body: "Browse our catalogue to add gowns to your fitting room.",
    checkout_label: "Proceed to Checkout",
    promo_banner: "",
  });
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [note, setNote] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchCmsSection("cart").then((data) => {
      if (!data || typeof data !== "object") return;
      setContent((prev) => ({
        ...prev,
        ...data,
        subtitle:
          data.subtitle ||
          data.subheading ||
          "Review your chosen pieces before we begin the fitting process.",
      }));
    });
  }, []);

  const refreshCartAndStock = useCallback(async () => {
    await reloadGowns?.();
    await syncCartFromServer?.();
  }, [reloadGowns, syncCartFromServer]);

  useFocusEffect(
    useCallback(() => {
      refreshCartAndStock();
      if (user?.email) loadCartNote(user.email).then(setNote);
    }, [refreshCartAndStock, user?.email])
  );

  useEffect(() => {
    setSelectedKeys((prev) => {
      const inStockKeys = cartDetailed
        .filter((i) => i.stockAvailable === null || i.stockAvailable > 0)
        .map((i) => i.lineKey);
      const next = new Set();
      for (const k of prev) {
        if (inStockKeys.includes(k)) next.add(k);
      }
      if (next.size === 0 && inStockKeys.length) return new Set(inStockKeys);
      return next;
    });
  }, [cartDetailed]);

  const outOfStockItems = useMemo(
    () => cartDetailed.filter((i) => i.stockAvailable === 0),
    [cartDetailed]
  );

  const selectedItems = useMemo(
    () => cartDetailed.filter((i) => selectedKeys.has(i.lineKey)),
    [cartDetailed, selectedKeys]
  );

  const checkoutSubtotal = useMemo(
    () => selectedItems.reduce((sum, i) => sum + i.subtotal, 0),
    [selectedItems]
  );

  const cartSubtotal = useMemo(
    () => cartDetailed.reduce((sum, i) => sum + i.subtotal, 0),
    [cartDetailed]
  );

  const checkoutItemCount = useMemo(
    () =>
      selectedItems
        .filter((i) => i.stockAvailable === null || i.stockAvailable > 0)
        .reduce((sum, i) => sum + i.qty, 0),
    [selectedItems]
  );

  const onSizeChange = async (item, newSize) => {
    const current = item.size == null ? null : String(item.size).trim();
    const next = newSize == null ? null : String(newSize).trim();
    if (current === next) return;

    setSizeChangingKey(item.lineKey);
    try {
      const wasSelected = selectedKeys.has(item.lineKey);
      const result = await changeCartLineSize(item.id, item.size, newSize);
      if (!result.ok) {
        Alert.alert("Size unavailable", result.reason || "That size is out of stock.");
        return;
      }
      if (wasSelected && result.newLineKey) {
        setSelectedKeys((prev) => {
          const nextKeys = new Set(prev);
          nextKeys.delete(item.lineKey);
          nextKeys.add(result.newLineKey);
          return nextKeys;
        });
      }
    } finally {
      setSizeChangingKey(null);
    }
  };

  const allSelected =
    cartDetailed.length > 0 &&
    cartDetailed.every((i) => i.stockAvailable === 0 || selectedKeys.has(i.lineKey));

  const checkoutBlocked = outOfStockItems.length > 0;
  const canCheckout = !checkoutBlocked && selectedItems.length > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(
      new Set(
        cartDetailed
          .filter((i) => i.stockAvailable === null || i.stockAvailable > 0)
          .map((i) => i.lineKey)
      )
    );
  };

  const toggleLine = (lineKey, disabled) => {
    if (disabled) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey);
      else next.add(lineKey);
      return next;
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCartAndStock();
    } finally {
      setRefreshing(false);
    }
  };

  const persistNote = async (value) => {
    setNote(value);
    if (user?.email) await saveCartNote(user.email, value);
  };

  const goCheckout = () => {
    if (!user?.email) {
      Alert.alert("Sign in required", "Please sign in to checkout your fitting room selection.");
      navigation.navigate("Login");
      return;
    }
    if (checkoutBlocked) {
      Alert.alert(
        "Items out of stock",
        "Remove out-of-stock items or wait for restocking before checkout."
      );
      return;
    }
    if (selectedItems.length === 0) {
      Alert.alert("Nothing selected", "Select at least one in-stock item to proceed.");
      return;
    }
    navigation.navigate("Checkout", {
      lineKeys: selectedItems.map((i) => i.lineKey),
      fittingNote: note.trim(),
    });
  };

  const oosBannerText =
    outOfStockItems.length > 0
      ? `${outOfStockItems.map((i) => `'${i.name}'`).join(", ")} ${
          outOfStockItems.length === 1 ? "is" : "are"
        } out of stock and ${
          outOfStockItems.length === 1 ? "has" : "have"
        } been deselected from checkout. Please remove out-of-stock items or wait for restocking.`
      : "";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{content.heading}</Text>
        <Text style={styles.heroSub}>{content.subtitle}</Text>
        <Text style={styles.breadcrumb}>HOME / COLLECTION / CART</Text>
      </View>

      {content.promo_banner ? <Text style={styles.promo}>{content.promo_banner}</Text> : null}

      {cartDetailed.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shirt-outline" size={48} color={brand.textLight} />
          <Text style={styles.emptyTitle}>{content.empty_title}</Text>
          <Text style={styles.emptyBody}>{content.empty_body}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate("Catalogue")}>
            <Text style={styles.primaryBtnText}>Browse Catalogue</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.selectBar}>
            <Pressable style={styles.selectAllRow} onPress={toggleAll}>
              <View style={[styles.checkbox, allSelected ? styles.checkboxOn : null]}>
                {allSelected ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.selectAllText}>Select all in-stock</Text>
            </Pressable>
            <Text style={styles.selectCount}>
              {selectedKeys.size} of {cartDetailed.length} selected
            </Text>
          </View>

          {cartDetailed.map((item) => {
            const oos = item.stockAvailable === 0;
            const selected = selectedKeys.has(item.lineKey);
            const badge = stockBadge(item.stockAvailable);
            return (
              <View
                key={item.lineKey}
                style={[styles.card, !selected ? styles.cardDim : null, oos ? styles.cardOos : null]}
              >
                <Pressable
                  style={styles.checkHit}
                  onPress={() => toggleLine(item.lineKey, oos)}
                  disabled={oos}
                >
                  <View style={[styles.checkbox, selected && !oos ? styles.checkboxOn : null]}>
                    {selected && !oos ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                </Pressable>

                <View style={styles.thumbWrap}>
                  <Image source={{ uri: item.image }} style={styles.thumb} />
                  {oos ? (
                    <View style={styles.thumbOverlay}>
                      <Text style={styles.thumbOverlayText}>OUT OF STOCK</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.name}>{item.name}</Text>
                  {(() => {
                    const sizeOptions = getGownSizeOptions(item);
                    if (!sizeOptions.length && !item.size) return null;
                    const options =
                      sizeOptions.length > 0
                        ? sizeOptions
                        : [{ size: item.size, available: item.stockAvailable }];
                    return (
                      <View style={styles.sizePillRow}>
                        {options.map(({ size, available }) => {
                          const isCurrent =
                            String(size || "").trim().toLowerCase() ===
                            String(item.size || "").trim().toLowerCase();
                          const canSelect = isCurrent || (available !== null && available > 0);
                          const changing = sizeChangingKey === item.lineKey;
                          return (
                            <Pressable
                              key={size}
                              style={[
                                styles.sizePill,
                                isCurrent ? styles.sizePillActive : null,
                                !canSelect ? styles.sizePillDisabled : null,
                                changing ? styles.sizePillBusy : null,
                              ]}
                              disabled={!canSelect || changing}
                              onPress={() => onSizeChange(item, size)}
                            >
                              <Text
                                style={[
                                  styles.sizePillText,
                                  isCurrent ? styles.sizePillTextActive : null,
                                  !canSelect && !isCurrent ? styles.sizePillTextDisabled : null,
                                ]}
                              >
                                {size}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })()}
                  <Text style={styles.unitPrice}>{item.price} per gown</Text>

                  {badge ? (
                    <View style={[styles.badge, badge.tone === "oos" ? styles.badgeOos : styles.badgeLow]}>
                      <Text style={badge.tone === "oos" ? styles.badgeOosText : styles.badgeLowText}>
                        {badge.text}
                      </Text>
                    </View>
                  ) : null}

                  {oos ? (
                    <View style={styles.oosBox}>
                      <Text style={styles.oosBoxText}>
                        This item is currently out of stock and cannot be checked out. Please remove
                        it or wait for restocking.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.qtyRow}>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() => setQty(item.id, Math.max(1, item.qty - 1), item.size)}
                        >
                          <Text>−</Text>
                        </Pressable>
                        <Text style={styles.qty}>{item.qty}</Text>
                        <Pressable
                          style={[
                            styles.qtyBtn,
                            item.stockAvailable !== null && item.qty >= item.stockAvailable
                              ? styles.qtyBtnDisabled
                              : null,
                          ]}
                          disabled={item.stockAvailable !== null && item.qty >= item.stockAvailable}
                          onPress={async () => {
                            if (item.stockAvailable !== null && item.qty >= item.stockAvailable) {
                              Alert.alert("Stock limit", `Only ${item.stockAvailable} available.`);
                              return;
                            }
                            await setQty(item.id, item.qty + 1, item.size);
                          }}
                        >
                          <Text>+</Text>
                        </Pressable>
                      </View>
                      {item.stockAvailable !== null ? (
                        <Text style={styles.maxHint}>Max available: {item.stockAvailable}</Text>
                      ) : null}
                    </>
                  )}

                  <Pressable onPress={() => removeFromCart(item.id, item.size)}>
                    <Text style={styles.removeAction}>REMOVE</Text>
                  </Pressable>
                </View>

                <Text style={[styles.lineSubtotal, oos ? styles.lineSubtotalOos : null]}>
                  {formatPrice(item.subtotal)}
                </Text>
              </View>
            );
          })}

          {oosBannerText ? (
            <View style={styles.globalAlert}>
              <Text style={styles.globalAlertText}>{oosBannerText}</Text>
            </View>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Order Summary</Text>
            {cartDetailed.map((item) => {
              const oos = item.stockAvailable === 0;
              return (
                <View key={`sum-${item.lineKey}`} style={styles.summaryLine}>
                  <View style={styles.summaryLineMeta}>
                    <Text style={[styles.summaryLineName, oos ? styles.summaryLineOos : null]}>
                      {item.name}
                      {item.size ? ` · ${item.size}` : ""}
                    </Text>
                    {oos ? <Text style={styles.summaryOosTag}>Out of stock</Text> : null}
                  </View>
                  <Text style={[styles.summaryLinePrice, oos ? styles.summaryLineOos : null]}>
                    {formatPrice(item.subtotal)}
                  </Text>
                </View>
              );
            })}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>ITEMS</Text>
              <Text style={styles.summaryValue}>{checkoutItemCount || cartDetailed.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>SUBTOTAL</Text>
              <Text style={styles.summaryValue}>{formatPrice(cartSubtotal)}</Text>
            </View>
            {selectedItems.length > 0 && selectedItems.length !== cartDetailed.length ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>CHECKOUT TOTAL</Text>
                <Text style={styles.summaryTotal}>{formatPrice(checkoutSubtotal)}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.noteLabel}>Order notes (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Special requests, delivery notes, or fitting preferences..."
            value={note}
            onChangeText={persistNote}
            multiline
          />

          <Pressable
            style={[styles.checkoutBtn, !canCheckout ? styles.checkoutDisabled : null]}
            onPress={goCheckout}
            disabled={!canCheckout}
          >
            <Text style={styles.checkoutText}>
              {checkoutBlocked ? "CANNOT CHECKOUT — ITEMS OUT OF STOCK" : content.checkout_label}
            </Text>
          </Pressable>
          {!canCheckout ? (
            <Text style={styles.checkoutHint}>
              {checkoutBlocked
                ? "Remove or deselect out-of-stock items to continue."
                : "Select at least one in-stock item to checkout."}
            </Text>
          ) : null}

          <Pressable style={styles.continueBtn} onPress={() => navigation.navigate("Catalogue")}>
            <Text style={styles.continueBtnText}>CONTINUE SHOPPING</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { paddingBottom: 32 },
  hero: {
    backgroundColor: brand.dark,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: brand.white,
    fontStyle: "italic",
  },
  heroSub: {
    color: "#E3D4DB",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  breadcrumb: {
    color: "#CFBBC6",
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 10,
    textTransform: "uppercase",
  },
  promo: { color: brand.text, fontSize: 12, marginHorizontal: 16, marginBottom: 12, lineHeight: 18 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: brand.dark, marginTop: 8 },
  emptyBody: { color: brand.textLight, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },
  primaryBtn: { marginTop: 16, backgroundColor: brand.buttonAlt, paddingVertical: 12, paddingHorizontal: 24 },
  primaryBtnText: { color: brand.white, fontWeight: "700", letterSpacing: 0.8, fontSize: 11 },
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  selectAllRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectAllText: { fontWeight: "600", color: brand.dark, fontSize: 12 },
  selectCount: { color: brand.textLight, fontSize: 11 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.white,
  },
  checkboxOn: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },
  checkMark: { color: brand.white, fontSize: 12, fontWeight: "800" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: brand.white,
  },
  cardDim: { opacity: 0.85 },
  cardOos: { opacity: 0.72 },
  checkHit: { paddingTop: 4 },
  thumbWrap: { position: "relative" },
  thumb: { width: 88, height: 112, borderRadius: 6, backgroundColor: "#F3EDF0" },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  thumbOverlayText: {
    color: brand.white,
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.6,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "700", color: brand.dark },
  sizePillRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  sizePill: {
    borderWidth: 1,
    borderColor: brand.dark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 32,
    alignItems: "center",
    backgroundColor: brand.white,
  },
  sizePillActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  sizePillDisabled: { borderColor: brand.border, opacity: 0.45 },
  sizePillBusy: { opacity: 0.6 },
  sizePillText: { fontSize: 11, fontWeight: "700", color: brand.dark },
  sizePillTextActive: { color: brand.white },
  sizePillTextDisabled: { color: brand.textLight },
  unitPrice: { color: brand.textLight, fontSize: 11, marginTop: 6 },
  badge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeOos: { backgroundColor: "#fde8ea" },
  badgeLow: { backgroundColor: "#fff8e6" },
  badgeOosText: { color: "#b00020", fontWeight: "800", fontSize: 10, letterSpacing: 0.4 },
  badgeLowText: { color: "#8a5a00", fontWeight: "700", fontSize: 10, letterSpacing: 0.4 },
  oosBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#f5c2c7",
    backgroundColor: "#fff5f5",
    padding: 8,
    borderRadius: 6,
  },
  oosBoxText: { color: "#842029", fontSize: 11, lineHeight: 16 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.white,
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qty: { marginHorizontal: 10, fontWeight: "700" },
  maxHint: { color: brand.textLight, fontSize: 10, marginTop: 4 },
  removeAction: { color: brand.textLight, fontWeight: "700", fontSize: 11, marginTop: 10, letterSpacing: 0.6 },
  lineSubtotal: { fontWeight: "800", color: brand.dark, fontSize: 13, marginTop: 4 },
  lineSubtotalOos: { color: brand.textLight, textDecorationLine: "line-through" },
  globalAlert: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#f5c2c7",
    backgroundColor: "#fff5f5",
    padding: 12,
    borderRadius: 8,
  },
  globalAlertText: { color: "#842029", fontSize: 12, lineHeight: 18 },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 10,
    padding: 14,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: brand.textLight,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  summaryLineMeta: { flex: 1 },
  summaryLineName: { fontSize: 12, color: brand.dark, fontWeight: "600" },
  summaryLineOos: { color: brand.textLight, textDecorationLine: "line-through" },
  summaryOosTag: { color: "#b00020", fontSize: 10, fontWeight: "700", marginTop: 2 },
  summaryLinePrice: { fontSize: 12, fontWeight: "700", color: brand.dark },
  summaryDivider: { borderTopWidth: 1, borderTopColor: brand.border, marginVertical: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  summaryLabel: { color: brand.textLight, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  summaryValue: { color: brand.dark, fontWeight: "700", fontSize: 13 },
  summaryTotal: { color: brand.dark, fontWeight: "800", fontSize: 16 },
  noteLabel: {
    marginTop: 16,
    marginHorizontal: 16,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: brand.textLight,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    borderRadius: 8,
    padding: 10,
    minHeight: 72,
    marginTop: 6,
    marginHorizontal: 16,
    textAlignVertical: "top",
  },
  checkoutBtn: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: brand.buttonAlt,
    paddingVertical: 14,
  },
  checkoutDisabled: { backgroundColor: "#9a9a9a", opacity: 0.85 },
  checkoutText: {
    textAlign: "center",
    color: brand.white,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  checkoutHint: {
    marginTop: 8,
    marginHorizontal: 16,
    textAlign: "center",
    color: brand.textLight,
    fontSize: 11,
    lineHeight: 16,
  },
  continueBtn: {
    marginTop: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    paddingVertical: 13,
  },
  continueBtnText: {
    textAlign: "center",
    color: brand.dark,
    fontWeight: "700",
    letterSpacing: 0.8,
    fontSize: 11,
  },
});
