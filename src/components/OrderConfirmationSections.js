import { Image, StyleSheet, Text, View } from "react-native";
import { brand } from "../theme/brand";
import {
  deliveryMethodLabel,
  formatPaymentStatusLabel,
  getWhatHappensNextSteps,
  orderStatusLabel,
  paymentMethodLabel,
  proofStatusLabel,
  resolvePaymentStatus,
  resolveProofStatus,
} from "../utils/orderConfirmation";

function formatPrice(num) {
  return `P${Number(num || 0).toLocaleString("en-PH")}`;
}

function StatusPill({ label, tone = "neutral" }) {
  const toneMap = {
    order: { pill: styles.pillOrder, text: styles.pillTextOrder },
    proofPending: { pill: styles.pillProofPending, text: styles.pillTextProofPending },
    paymentPending: { pill: styles.pillPaymentPending, text: styles.pillTextPaymentPending },
    success: { pill: styles.pillSuccess, text: styles.pillTextSuccess },
    danger: { pill: styles.pillDanger, text: styles.pillTextDanger },
    neutral: { pill: styles.pillNeutral, text: styles.pillTextNeutral },
  };
  const toneStyle = toneMap[tone] || toneMap.neutral;
  return (
    <View style={[styles.pill, toneStyle.pill]}>
      <Text style={[styles.pillText, toneStyle.text]}>{label}</Text>
    </View>
  );
}

export function OrderConfirmationHero({ order, userFirstName }) {
  const name = userFirstName || order?.contact?.firstName || "friend";
  return (
    <View style={styles.hero}>
      <View style={styles.heroIconWrap}>
        <Text style={styles.heroIcon}>✓</Text>
      </View>
      <Text style={styles.heroTitle}>Order placed!</Text>
      <Text style={styles.heroSub}>Thank you, {name}. We've received your order.</Text>
      <View style={styles.orderCodeBox}>
        <Text style={styles.orderCodeLabel}>Order number</Text>
        <Text style={styles.orderCodeValue}>{order.orderNumber || `JCE-${order.id}`}</Text>
      </View>
    </View>
  );
}

export function WhatHappensNextCard({ order }) {
  const steps = getWhatHappensNextSteps(order);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>What happens next</Text>
      {steps.map((step, index) => (
        <Text key={`step-${index}`} style={styles.stepLine}>
          {index + 1}. {step}
        </Text>
      ))}
    </View>
  );
}

export function ProofStatusBanner({ order }) {
  const proofStatus = resolveProofStatus(order);
  const payment = String(order?.payment || order?.paymentMethod || "gcash").toLowerCase();
  if (payment === "cash") return null;

  if (proofStatus === "pending") {
    return (
      <View style={[styles.banner, styles.bannerReview]}>
        <Text style={[styles.bannerTitle, styles.bannerReviewTitle]}>🕐 Proof under review</Text>
        <Text style={styles.bannerBody}>
          Your payment screenshot has been received and is awaiting verification by our team. We'll notify you by
          email once confirmed — usually within 1–2 hours.
        </Text>
      </View>
    );
  }

  if (proofStatus === "verified") {
    return (
      <View style={[styles.banner, styles.bannerVerified]}>
        <Text style={[styles.bannerTitle, styles.bannerVerifiedTitle]}>✓ Payment verified</Text>
        <Text style={styles.bannerBody}>Your payment has been confirmed. Your order is now being processed.</Text>
      </View>
    );
  }

  if (proofStatus === "rejected") {
    return (
      <View style={[styles.banner, styles.bannerRejected]}>
        <Text style={[styles.bannerTitle, styles.bannerRejectedTitle]}>✕ Proof rejected — please re-upload</Text>
        <Text style={styles.bannerBody}>
          Your payment screenshot could not be verified. Please upload a clear screenshot of your{" "}
          {payment === "gcash" ? "GCash" : "BDO"} transaction success screen.
        </Text>
      </View>
    );
  }

  return null;
}

export function OrderSummaryCard({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const payment = String(order?.payment || order?.paymentMethod || "gcash").toLowerCase();
  const proofStatus = resolveProofStatus(order);
  const paymentStatus = resolvePaymentStatus(order);
  const shippingFee = Number(order?.shippingFee || 0);

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Order summary</Text>
      {items.map((item, index) => (
        <View key={`item-${item.id || index}`} style={styles.summaryItemRow}>
          <View style={styles.summaryItemLeft}>
            {item.image ? <Image source={{ uri: item.image }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
            <Text style={styles.summaryItemText} numberOfLines={2}>
              {item.name}
              {item.size ? ` (${item.size})` : ""} ×{item.qty || 1}
            </Text>
          </View>
          <Text style={styles.summaryItemPrice}>{formatPrice(item.subtotal)}</Text>
        </View>
      ))}
      <View style={styles.summaryDivider} />
      {shippingFee > 0 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.meta}>Shipping (est.)</Text>
          <Text style={styles.value}>{formatPrice(shippingFee)}</Text>
        </View>
      ) : null}
      <View style={styles.summaryRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatPrice(order.total || order.subtotal)}</Text>
      </View>
      <View style={styles.metaBlock}>
        <View style={styles.summaryRow}>
          <Text style={styles.meta}>Payment</Text>
          <Text style={styles.value}>{paymentMethodLabel(order.payment)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.meta}>Delivery</Text>
          <Text style={styles.value}>{deliveryMethodLabel(order)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.meta}>Order status</Text>
          <StatusPill label={orderStatusLabel(order)} tone="order" />
        </View>
        {payment !== "cash" ? (
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>Proof status</Text>
            <StatusPill
              label={proofStatusLabel(proofStatus)}
              tone={proofStatus === "verified" ? "success" : proofStatus === "rejected" ? "danger" : "proofPending"}
            />
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.meta}>Payment status</Text>
          <StatusPill label={formatPaymentStatusLabel(paymentStatus)} tone="paymentPending" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: brand.dark, padding: 16, borderRadius: 12, alignItems: "center" },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#c9a962",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroIcon: { color: "#c9a962", fontSize: 22, fontWeight: "700" },
  heroTitle: { color: brand.white, fontSize: 34, fontWeight: "700", fontStyle: "italic", textAlign: "center" },
  heroSub: { color: "#ddd2d8", marginTop: 6, marginBottom: 14, fontSize: 12, textAlign: "center" },
  orderCodeBox: {
    borderWidth: 1,
    borderColor: "#6f4a39",
    borderRadius: 8,
    padding: 12,
    width: "100%",
    alignItems: "center",
  },
  orderCodeLabel: { color: "#cfb39f", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10 },
  orderCodeValue: { color: brand.white, fontWeight: "800", marginTop: 4, fontSize: 15 },
  card: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  cardTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8, textTransform: "capitalize" },
  stepLine: { color: brand.text, fontSize: 12, lineHeight: 20, marginBottom: 4 },
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
  },
  bannerReview: { borderColor: "#b8d4e8", borderLeftColor: "#0a5276", backgroundColor: "#f0f8ff" },
  bannerReviewTitle: { color: "#0a5276" },
  bannerVerified: { borderColor: "#b8dfc4", borderLeftColor: "#155724", backgroundColor: "#f0faf3" },
  bannerVerifiedTitle: { color: "#155724" },
  bannerRejected: { borderColor: "#e8b8b8", borderLeftColor: "#721c24", backgroundColor: "#fff5f5" },
  bannerRejectedTitle: { color: "#721c24" },
  bannerTitle: { fontWeight: "800", fontSize: 13, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  bannerBody: { color: brand.text, fontSize: 12, lineHeight: 18 },
  summaryCard: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  summaryTitle: { color: brand.dark, fontWeight: "800", marginBottom: 10, textTransform: "capitalize" },
  summaryItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  summaryItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  summaryItemText: { flex: 1, color: brand.dark, fontSize: 12, lineHeight: 17 },
  summaryItemPrice: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  thumb: { width: 40, height: 52, borderRadius: 6, backgroundColor: "#eee" },
  thumbFallback: { width: 40, height: 52, borderRadius: 6, backgroundColor: "#eee" },
  summaryDivider: { borderTopWidth: 1, borderTopColor: brand.border, marginVertical: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 },
  metaBlock: { marginTop: 4 },
  meta: { color: brand.textLight, fontSize: 12 },
  value: { color: brand.dark, fontWeight: "600", fontSize: 12, textAlign: "right", flexShrink: 1 },
  totalLabel: { color: brand.dark, fontWeight: "800", fontSize: 14 },
  totalValue: { color: brand.dark, fontWeight: "800", fontSize: 16 },
  pill: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "62%" },
  pillText: { fontSize: 10, fontWeight: "700", textAlign: "right" },
  pillOrder: { backgroundColor: "#e8f0ff" },
  pillTextOrder: { color: "#1a4fa3" },
  pillProofPending: { backgroundColor: "#fff3cd" },
  pillTextProofPending: { color: "#856404" },
  pillPaymentPending: { backgroundColor: "#fff3cd" },
  pillTextPaymentPending: { color: "#856404" },
  pillSuccess: { backgroundColor: "#edf8ef" },
  pillTextSuccess: { color: "#155724" },
  pillDanger: { backgroundColor: "#fff5f5" },
  pillTextDanger: { color: "#721c24" },
  pillNeutral: { backgroundColor: "#eee5e8" },
  pillTextNeutral: { color: "#4d3c42" },
});
