import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { getCustomerOrderById } from "../services/orders";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import { orderMatchesKey } from "../utils/id";

function formatPrice(num) {
  return `P${Number(num || 0).toLocaleString("en-PH")}`;
}

function paymentLabel(payment) {
  const p = String(payment || "").toLowerCase();
  if (p === "bdo") return "BDO Bank Transfer";
  if (p === "cash") return "Cash on Pickup";
  return "GCash";
}

export function OrderProofSubmittedScreen({ route, navigation }) {
  const { user } = useShop();
  const { orderId, orderNumber, order: initialOrder } = route.params || {};
  const lookupKey = orderId || orderNumber;
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (initialOrder && (!lookupKey || orderMatchesKey(initialOrder, lookupKey))) {
          if (!active) return;
          setOrder(initialOrder);
          setLoading(false);
          return;
        }
        setLoading(true);
        const data = user?.email && lookupKey
          ? await getCustomerOrderById(lookupKey, user.email, user.id)
          : null;
        if (!active) return;
        setOrder(data || initialOrder || null);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [initialOrder, lookupKey, orderNumber, user?.email, user?.id])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Loading confirmation...</Text>
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

  const total = order.total || order.subtotal;
  const deliveryLabel = order?.delivery?.method === "delivery" ? "Lalamove" : "Store Pickup";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Order placed!</Text>
        <Text style={styles.heroSub}>Thank you, friend. We've received your order.</Text>
        <View style={styles.orderCodeBox}>
          <Text style={styles.orderCodeLabel}>Order number</Text>
          <Text style={styles.orderCodeValue}>{order.orderNumber || `JCE-${order.id}`}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What happens next</Text>
        <Text style={styles.line}>1. Upload your proof of payment below.</Text>
        <Text style={styles.line}>2. Our team verifies your payment (usually within 1-2 hours).</Text>
        <Text style={styles.line}>3. You'll receive updates via notification when approved.</Text>
        <Text style={styles.line}>4. We'll notify you when your order is ready for pickup.</Text>
      </View>

      <View style={styles.successCard}>
        <Text style={styles.successText}>Proof uploaded.</Text>
      </View>

      <View style={styles.proofDetailsCard}>
        <Text style={styles.proofLabel}>PAYMENT PROOF</Text>
        <Text style={styles.proofOrderNumber}>{order.orderNumber || `JCE-${order.id}`}</Text>
        <Text style={styles.proofMeta}>
          {order?.contact?.firstName} {order?.contact?.lastName} • {formatPrice(total)} • {paymentLabel(order.payment)}
        </Text>
        {order?.paymentProof?.referenceNumber ? (
          <View style={styles.proofRow}>
            <Text style={styles.meta}>Reference</Text>
            <Text style={styles.value}>{order.paymentProof.referenceNumber}</Text>
          </View>
        ) : null}
        {order?.paymentProof?.submittedAt ? (
          <View style={styles.proofRow}>
            <Text style={styles.meta}>Submitted</Text>
            <Text style={styles.value}>{formatDateTimePH(order.paymentProof.submittedAt)}</Text>
          </View>
        ) : null}
        <View style={styles.proofRow}>
          <Text style={styles.meta}>Status</Text>
          <Text style={styles.statusBadge}>Submitted - Pending Review</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.row}>
          <Text style={styles.meta}>Total</Text>
          <Text style={styles.valueStrong}>{formatPrice(total)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Payment</Text>
          <Text style={styles.value}>{paymentLabel(order.payment)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Delivery</Text>
          <Text style={styles.value}>{deliveryLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Order status</Text>
          <Text style={styles.badge}>Placed</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Payment status</Text>
          <Text style={styles.badge}>Pending</Text>
        </View>
      </View>

      <Pressable
        style={styles.linkBtn}
        onPress={() =>
          navigation.navigate("OrderDetail", {
            orderId: order.id || order.orderNumber,
            orderNumber: order.orderNumber,
          })
        }
      >
        <Text style={styles.linkText}>View full order details →</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("MyOrders")}>
        <Text style={styles.linkText}>View all orders →</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Main")}>
        <Text style={styles.linkText}>Continue browsing →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: brand.bg },
  hero: { backgroundColor: "#34180d", borderRadius: 12, padding: 16 },
  heroTitle: { color: brand.white, fontSize: 34, fontWeight: "700", fontStyle: "italic" },
  heroSub: { color: "#ddcfc5", marginTop: 4, marginBottom: 12, fontSize: 12 },
  orderCodeBox: { borderWidth: 1, borderColor: "#6f4a39", borderRadius: 8, padding: 10 },
  orderCodeLabel: { color: "#cfb39f", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10 },
  orderCodeValue: { color: brand.white, fontWeight: "800", marginTop: 3, fontSize: 14 },
  card: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  sectionTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8 },
  line: { color: brand.text, fontSize: 12, marginBottom: 5 },
  successCard: { borderWidth: 1, borderColor: "#c6d9ca", borderRadius: 8, backgroundColor: "#edf8ef", padding: 10 },
  successText: { color: "#2f7d53", fontWeight: "700", fontSize: 12 },
  proofDetailsCard: { borderWidth: 1, borderColor: "#e8d9df", borderRadius: 8, backgroundColor: "#fef8f9", padding: 12, marginBottom: 12 },
  proofLabel: { color: "#a89199", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  proofOrderNumber: { color: brand.dark, fontSize: 16, fontWeight: "800", marginTop: 3 },
  proofMeta: { color: brand.textLight, fontSize: 12, marginTop: 4, marginBottom: 8 },
  proofRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#f0e5eb" },
  statusBadge: { color: "#7b5c66", backgroundColor: "#f0e5eb", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: "700" },
  summaryCard: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  summaryTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  meta: { color: brand.textLight, fontSize: 12 },
  value: { color: brand.dark, fontWeight: "600", fontSize: 12 },
  valueStrong: { color: brand.dark, fontWeight: "800", fontSize: 16 },
  badge: { color: "#4d3c42", backgroundColor: "#eee5e8", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, fontWeight: "700" },
  linkBtn: { paddingVertical: 2 },
  linkText: { color: brand.dark, fontWeight: "600", fontSize: 13 },
});
