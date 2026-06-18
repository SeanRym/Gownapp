import { useCallback, useState } from "react";
import { Alert, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { confirmOrderReceipt, getCustomerOrderById } from "../services/orders";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import { idsEqual } from "../utils/id";

function formatPrice(num) {
  return `P${Number(num || 0).toLocaleString("en-PH")}`;
}

function statusLabel(status) {
  return String(status || "placed").replace("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function OrderDetailScreen({ route, navigation }) {
  const { orderId, orderNumber } = route.params || {};
  const lookupKey = orderId || orderNumber;
  const { gowns, user } = useShop();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = user?.email && lookupKey
      ? await getCustomerOrderById(lookupKey, user.email, user.id)
      : null;
    setOrder(data || null);
    setLoading(false);
  }, [lookupKey, user?.email, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = user?.email && lookupKey
        ? await getCustomerOrderById(lookupKey, user.email, user.id)
        : null;
      setOrder(data || null);
    } finally {
      setRefreshing(false);
    }
  }, [lookupKey, user?.email, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Loading order details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Order not found.</Text>
      </View>
    );
  }

  const timeline = Array.isArray(order.statusTimeline) ? [...order.statusTimeline].reverse() : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const status = String(order?.status || "").toLowerCase();
  const allowReturn = status === "completed";
  const isShipped = status === "shipped";
  const allowConfirmReceipt = status === "ready" || status === "shipped";

  return (
    <ScrollView 
      style={styles.screen} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Order #{order.id}</Text>
      <Text style={styles.meta}>{formatDateTimePH(order.createdAt)}</Text>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>{statusLabel(order.status)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.line}>{order?.contact?.firstName || "-"} {order?.contact?.lastName || ""}</Text>
        <Text style={styles.line}>{order?.contact?.email || "-"}</Text>
        <Text style={styles.line}>{order?.contact?.phone || "-"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Delivery Address</Text>
        <Text style={styles.line}>{order?.delivery?.address || "-"}</Text>
        <Text style={styles.line}>
          {[order?.delivery?.city, order?.delivery?.province, order?.delivery?.zip].filter(Boolean).join(", ") || "-"}
        </Text>
        <Text style={styles.line}>Shipping: {order?.shipping?.zoneLabel || "-"}</Text>
        <Text style={styles.line}>ETA: {order?.shipping?.etaLabel || "-"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {items.map((it, idx) => {
          const gown = gowns.find((g) => idsEqual(g?.id, it?.id));
          return (
            <View key={`${order.id}-${idx}`} style={styles.itemRow}>
              {gown?.image ? <Image source={{ uri: gown.image }} style={styles.itemImage} /> : <View style={styles.itemImagePlaceholder} />}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.itemMeta}>Qty: {it.qty}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatPrice(it.subtotal)}</Text>
            </View>
          );
        })}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order Total</Text>
          <Text style={styles.totalValue}>{formatPrice(order.total || order.subtotal)}</Text>
        </View>
      </View>

      {isShipped && (order.lalamoveTrackingUrl || order.lalamoveEta || order.shipmentPhotoUrl) ? (
        <View style={[styles.card, styles.shippingCard]}>
          <Text style={[styles.cardTitle, { color: "#0c5460" }]}>Your order is on its way</Text>
          {order.lalamoveEta ? (
            <Text style={[styles.line, { color: "#0c5460" }]}>
              <Text style={{ fontWeight: "700" }}>Estimated arrival: </Text>
              {order.lalamoveEta}
            </Text>
          ) : null}
          {order.lalamoveTrackingUrl ? (
            <Pressable onPress={() => Linking.openURL(order.lalamoveTrackingUrl)} style={styles.trackBtn}>
              <Text style={styles.trackBtnText}>Track your Lalamove delivery →</Text>
            </Pressable>
          ) : null}
          {order.shipmentPhotoUrl ? (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.line, { fontWeight: "700", color: "#0a5276", marginBottom: 6 }]}>
                Photo of your packed gown:
              </Text>
              <Pressable onPress={() => Linking.openURL(order.shipmentPhotoUrl)}>
                <Image source={{ uri: order.shipmentPhotoUrl }} style={styles.shipmentPhoto} resizeMode="cover" />
                <Text style={[styles.line, { fontSize: 10, color: "#0a5276", opacity: 0.7, marginTop: 2 }]}>
                  Tap to view full image
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {allowConfirmReceipt ? (
        <View style={[styles.card, { borderColor: brand.buttonAlt }]}>
          <Text style={styles.cardTitle}>Received your order?</Text>
          <Text style={styles.meta}>Confirm once you have your gown in hand.</Text>
          <Pressable
            disabled={confirming}
            style={[styles.returnBtn, { marginTop: 10, backgroundColor: brand.buttonAlt, opacity: confirming ? 0.7 : 1 }]}
            onPress={() => {
              Alert.alert("Confirm Receipt", "Are you sure you've received your order?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, I've received it",
                  onPress: async () => {
                    if (!user?.id) {
                      Alert.alert("Sign in required", "Please sign in first.");
                      return;
                    }
                    setConfirming(true);
                    try {
                      const res = await confirmOrderReceipt(order.id, user.id);
                      if (!res?.ok) {
                        Alert.alert("Confirm failed", res?.error || "Could not confirm receipt.");
                        return;
                      }
                      setOrder(res.order || { ...order, status: "completed" });
                    } finally {
                      setConfirming(false);
                    }
                  },
                },
              ]);
            }}
          >
            <Text style={styles.returnBtnText}>{confirming ? "Confirming..." : "Yes, I've received my order"}</Text>
          </Pressable>
        </View>
      ) : null}

      {allowReturn ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Returns</Text>
          <Text style={styles.meta}>
            Need a return/refund/exchange? Submit a request and track the status.
          </Text>
          <Pressable
            style={styles.returnBtn}
            onPress={() => {
              if (!user?.id) {
                Alert.alert("Sign in required", "Please sign in to request a return.");
                return;
              }
              navigation.navigate("ReturnRequest", { order });
            }}
          >
            <Text style={styles.returnBtnText}>Request return</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Shipment Tracking Timeline</Text>
        {timeline.length ? (
          timeline.map((step, idx) => (
            <View key={`${order.id}-step-${idx}`} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <View style={styles.dot} />
                {idx < timeline.length - 1 ? <View style={styles.lineVertical} /> : null}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{statusLabel(step.status)}</Text>
                <Text style={styles.timelineMeta}>{formatDateTimePH(step.at)}</Text>
                {step.note ? <Text style={styles.timelineNote}>{step.note}</Text> : null}
                {step.location ? <Text style={styles.timelineNote}>Location: {step.location}</Text> : null}
                {step.riderName ? <Text style={styles.timelineNote}>Rider: {step.riderName}</Text> : null}
                {step.riderPhone ? <Text style={styles.timelineNote}>Mobile: {step.riderPhone}</Text> : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>No shipment updates yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: brand.bg, padding: 16 },
  title: { fontSize: 28, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  meta: { color: brand.textLight, marginTop: 4 },
  badge: { alignSelf: "flex-start", marginTop: 10, backgroundColor: brand.dark, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  badgeText: { color: brand.white, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },

  card: { marginTop: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  cardTitle: { color: brand.dark, fontWeight: "900", marginBottom: 8 },
  line: { color: brand.text, marginBottom: 4, fontSize: 13 },

  itemRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: brand.border, paddingBottom: 8 },
  itemImage: { width: 46, height: 46, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#eee" },
  itemImagePlaceholder: { width: 46, height: 46, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#f1f1f1" },
  itemInfo: { flex: 1, marginLeft: 10, minWidth: 0 },
  itemName: { color: brand.dark, fontWeight: "700", fontSize: 13 },
  itemMeta: { color: brand.textLight, marginTop: 2, fontSize: 12 },
  itemPrice: { color: brand.dark, fontWeight: "800", fontSize: 12, marginLeft: 8 },

  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  totalLabel: { color: brand.textLight, fontWeight: "800", fontSize: 14 },
  totalValue: { color: "#c5482f", fontWeight: "900", fontSize: 26 },

  timelineRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  timelineLeft: { width: 20, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: brand.buttonAlt, marginTop: 4 },
  lineVertical: { width: 2, height: 36, backgroundColor: brand.border, marginTop: 2 },
  timelineContent: { flex: 1, paddingBottom: 6 },
  timelineTitle: { color: brand.dark, fontWeight: "800", fontSize: 13 },
  timelineMeta: { color: brand.textLight, fontSize: 12, marginTop: 1 },
  timelineNote: { color: brand.textLight, fontSize: 12, marginTop: 2, fontStyle: "italic" },

  returnBtn: { marginTop: 10, backgroundColor: brand.button, borderRadius: 10, paddingVertical: 12 },
  returnBtnText: { textAlign: "center", color: brand.white, fontWeight: "900" },

  shippingCard: { backgroundColor: "#f0f7ff", borderColor: "#bdd7f5" },
  trackBtn: { marginTop: 6, alignSelf: "flex-start" },
  trackBtnText: { color: "#0c5460", textDecorationLine: "underline", fontSize: 12, fontWeight: "500" },
  shipmentPhoto: { width: "100%", height: 180, borderRadius: 6, borderWidth: 1, borderColor: "#bdd7f5" },
});

