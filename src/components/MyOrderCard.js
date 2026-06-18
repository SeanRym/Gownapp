import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import {
  PROGRESS_STEPS,
  STATUS_COLOR_HEX,
  STATUS_DESC,
  STATUS_LABEL,
  STATUS_LABEL_SHORT,
  buildStatusTimelineRows,
  deliveryLabel,
  fmtPhp,
  getReturnWindowRemaining,
  isWithinReturnWindow,
  navigateToOrderConfirmation,
  orderNeedsProof,
  paymentLabel,
  resolveDeliveryMethod,
  resolveProofStatus,
} from "../utils/myOrdersUi";

const ONGOING = new Set(["placed", "pending_payment", "paid", "processing", "ready", "shipped"]);

function ProgressSteps({ status, deliveryMethod }) {
  const steps = PROGRESS_STEPS[deliveryMethod] || PROGRESS_STEPS.lalamove;
  const curIdx = steps.indexOf(status);
  const isBad = status === "cancelled" || status === "refunded";

  if (isBad) {
    return (
      <View style={[styles.badStatusBox, { backgroundColor: "#f8d7da" }]}>
        <Text style={[styles.badStatusText, { color: "#721c24" }]}>
          {STATUS_LABEL[status] || status}
        </Text>
      </View>
    );
  }

  const hex = STATUS_COLOR_HEX[status] || brand.gold;

  return (
    <View>
      <View style={styles.progressRow}>
        {steps.map((step, i) => {
          const done = i < curIdx;
          const current = i === curIdx;
          const dotHex = done || current ? hex : brand.border;
          const lineHex = i < curIdx ? hex : brand.border;
          return (
            <View key={step} style={[styles.progressSegment, i < steps.length - 1 && { flex: 1 }]}>
              <View
                style={[
                  styles.progressDot,
                  {
                    width: current ? 10 : 7,
                    height: current ? 10 : 7,
                    backgroundColor: done ? dotHex : current ? dotHex : "transparent",
                    borderColor: dotHex,
                  },
                ]}
              />
              {i < steps.length - 1 ? (
                <View style={[styles.progressLine, { backgroundColor: lineHex }]} />
              ) : null}
            </View>
          );
        })}
      </View>
      <Text style={[styles.progressLabel, { color: hex }]}>
        {(STATUS_LABEL[status] || status).toUpperCase()}
        {status === "pending_payment" ? " · UPLOAD PROOF TO CONTINUE" : ""}
        {status === "ready" && deliveryMethod === "pickup" ? " · VISIT OUR STORE" : ""}
      </Text>
    </View>
  );
}

function StatusTimeline({ history, status, deliveryMethod }) {
  const rows = buildStatusTimelineRows(history, status, deliveryMethod);
  const isBad = status === "cancelled" || status === "refunded";
  const hex = STATUS_COLOR_HEX[isBad ? status : status] || brand.gold;

  return (
    <View>
      {rows.map((entry, i) => {
        const isCurrent = !isBad && entry.state === "current";
        const isDone = !isBad && entry.state === "done";
        const isUpcoming = !isBad && entry.state === "upcoming";
        const isFirst = isBad && i === 0;
        const isLast = i === rows.length - 1;
        const dotHex = isDone || isCurrent || isFirst ? hex : brand.border;
        const desc = entry.note || STATUS_DESC[entry.status];

        return (
          <View key={`${entry.status}-${i}`} style={styles.timelineRow}>
            {!isLast ? (
              <View
                style={[
                  styles.timelineLine,
                  { backgroundColor: isDone ? dotHex : brand.border },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: isDone || isCurrent || isFirst ? dotHex : brand.white,
                  borderColor: isUpcoming ? brand.border : dotHex,
                  opacity: isUpcoming ? 0.45 : 1,
                },
              ]}
            >
              {(isDone || isFirst) && !isUpcoming ? (
                <Text style={styles.timelineCheck}>✓</Text>
              ) : null}
            </View>
            <View style={styles.timelineContent}>
              <View style={styles.timelineTitleRow}>
                <Text
                  style={[
                    styles.timelineTitle,
                    (isCurrent || isFirst) && { fontWeight: "700", color: brand.dark },
                    isUpcoming && { opacity: 0.55, color: brand.textLight },
                  ]}
                >
                  {STATUS_LABEL[entry.status] || entry.status}
                </Text>
                {isUpcoming ? (
                  <Text style={styles.timelineUpcoming}>UPCOMING</Text>
                ) : entry.changedAt ? (
                  <Text style={[styles.timelineDate, (isCurrent || isFirst) && { color: hex }]}>
                    {formatDateTimePH(entry.changedAt)}
                  </Text>
                ) : null}
              </View>
              {desc ? (
                <Text
                  style={[
                    styles.timelineDesc,
                    (isCurrent || isFirst) && { color: brand.text },
                    isUpcoming && { opacity: 0.45 },
                  ]}
                >
                  {desc}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StatusBadge({ status }) {
  const label = STATUS_LABEL_SHORT[status] || String(status || "").replace(/_/g, " ");
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusBadgeText}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function MyOrderCard({
  order,
  expanded,
  onToggle,
  onConfirmReceipt,
  onRequestReturn,
  navigation,
  confirmingId,
}) {
  const status = String(order?.status || "").toLowerCase();
  const isOngoing = ONGOING.has(status);
  const isCancelled = status === "cancelled" || status === "refunded";
  const deliveryMethod = resolveDeliveryMethod(order);
  const proofStatus = resolveProofStatus(order);
  const needsProof = orderNeedsProof(order);
  const canRequestReturn = status === "completed" && isWithinReturnWindow(order);
  const returnWindow = getReturnWindowRemaining(order);
  const itemCount = (order?.items || []).reduce((sum, it) => sum + (Number(it?.qty) || 0), 0);
  const accentColor = isCancelled
    ? STATUS_COLOR_HEX[status] || "#ccc"
    : isOngoing
      ? STATUS_COLOR_HEX[status] || brand.gold
      : brand.border;

  return (
    <View style={[styles.card, expanded && styles.cardExpanded, isCancelled && { opacity: 0.75 }]}>
      {needsProof ? (
        <View style={styles.proofWarnStrip}>
          <Text style={styles.proofWarnText}>⚠ Proof of payment required within 24 hours</Text>
          <Pressable onPress={() => navigateToOrderConfirmation(navigation, order)}>
            <Text style={styles.proofLink}>Upload now →</Text>
          </Pressable>
        </View>
      ) : null}

      {status === "pending_payment" && proofStatus === "pending" ? (
        <View style={styles.proofReviewStrip}>
          <Text style={styles.proofReviewText}>🕐 Proof uploaded — awaiting admin verification</Text>
        </View>
      ) : null}

      {status === "pending_payment" && proofStatus === "rejected" ? (
        <View style={styles.proofRejectedStrip}>
          <Text style={styles.proofRejectedText}>✕ Proof rejected — please re-upload a clear screenshot</Text>
          <Pressable onPress={() => navigateToOrderConfirmation(navigation, order)}>
            <Text style={styles.proofRejectedLink}>Re-upload →</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={[styles.header, expanded && styles.headerExpanded]} onPress={onToggle}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View style={styles.headerMain}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.orderNumber}>{order.orderNumber || order.id}</Text>
            <StatusBadge status={status} />
          </View>
          <Text style={styles.orderDate}>{formatDateTimePH(order.createdAt)}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.orderTotal}>{fmtPhp(order.total)}</Text>
          <Text style={styles.itemCount}>
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </Text>
        </View>
        <Text style={[styles.chevron, expanded && styles.chevronUp]}>▼</Text>
      </Pressable>

      {!expanded && isOngoing ? (
        <View style={styles.collapsedProgress}>
          <ProgressSteps status={status} deliveryMethod={deliveryMethod} />
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.body}>
          {!isCancelled ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ORDER PROGRESS</Text>
              <ProgressSteps status={status} deliveryMethod={deliveryMethod} />
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ITEMS</Text>
            {(order.items || []).map((item, i) => (
              <View key={`${order.id}-item-${i}`} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                  {item.size ? ` · ${item.size}` : ""}
                </Text>
                <Text style={styles.itemQty}>×{item.qty || 1}</Text>
                <Text style={styles.itemPrice}>{fmtPhp(item.subtotal || item.price)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              {Number(order.shippingFee) > 0 ? (
                <Text style={styles.shippingNote}>Shipping: {fmtPhp(order.shippingFee)}</Text>
              ) : null}
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>{fmtPhp(order.total)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DELIVERY & PAYMENT</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>METHOD</Text>
              <Text style={styles.detailVal}>{deliveryLabel(order)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>PAYMENT</Text>
              <Text style={styles.detailVal}>{paymentLabel(order)}</Text>
            </View>
            {order.deliveryAddress || order.delivery?.address ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailKey}>ADDRESS</Text>
                <Text style={[styles.detailVal, { flex: 1, textAlign: "right" }]}>
                  {order.deliveryAddress || order.delivery?.address}
                </Text>
              </View>
            ) : null}
          </View>

          {order.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTE</Text>
              <Text style={styles.noteText}>{order.notes}</Text>
            </View>
          ) : null}

          {status === "shipped" &&
          (order.lalamoveTrackingUrl || order.lalamoveEta || order.shipmentPhotoUrl) ? (
            <View style={styles.shippingCard}>
              <Text style={styles.shippingTitle}>🚚 Your order is on its way</Text>
              {order.lalamoveEta ? (
                <Text style={styles.shippingMeta}>
                  <Text style={{ fontWeight: "700" }}>Estimated arrival: </Text>
                  {order.lalamoveEta}
                </Text>
              ) : null}
              {order.lalamoveTrackingUrl ? (
                <Pressable onPress={() => Linking.openURL(order.lalamoveTrackingUrl)}>
                  <Text style={styles.trackLink}>Track your Lalamove delivery →</Text>
                </Pressable>
              ) : null}
              {order.shipmentPhotoUrl ? (
                <Pressable onPress={() => Linking.openURL(order.shipmentPhotoUrl)}>
                  <Image source={{ uri: order.shipmentPhotoUrl }} style={styles.shipmentPhoto} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STATUS HISTORY</Text>
            <StatusTimeline
              history={order.statusHistory || order.statusTimeline}
              status={status}
              deliveryMethod={deliveryMethod}
            />
          </View>

          {["ready", "shipped"].includes(status) ? (
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>Received your order?</Text>
              <Text style={styles.calloutBody}>Confirm once you have your gown in hand.</Text>
              <Pressable
                style={[styles.confirmBtn, confirmingId === order.id && { opacity: 0.7 }]}
                disabled={confirmingId === order.id}
                onPress={() => onConfirmReceipt(order)}
              >
                <Text style={styles.confirmBtnText}>
                  {confirmingId === order.id ? "Confirming..." : "Yes, I've received my order"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {status === "completed" ? (
            <View style={styles.completedBlock}>
              <Text style={styles.completedCheck}>✓ Order completed — thank you for choosing JCE Bridal!</Text>
              {returnWindow.withinWindow ? (
                <View style={styles.returnWindowOpen}>
                  <Text style={styles.returnWindowTitle}>
                    ↩ Return window open — {Math.floor(returnWindow.hoursLeft)}h {returnWindow.minsLeft}m remaining
                  </Text>
                  <Text style={styles.returnWindowBody}>
                    You may request a return, refund, or exchange for defective or incorrect items.
                  </Text>
                  {canRequestReturn ? (
                    <Pressable style={styles.returnBtn} onPress={() => onRequestReturn(order)}>
                      <Text style={styles.returnBtnText}>↩ Request Return / Refund</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.returnWindowClosed}>
                  <Text style={styles.returnWindowClosedTitle}>Return window closed</Text>
                  <Text style={styles.returnWindowClosedBody}>
                    The 48-hour return window has passed.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {status === "refunded" ? (
            <Text style={styles.refundedNotice}>↩ A refund has been issued for this order.</Text>
          ) : null}

          <Pressable
            style={styles.viewDetailsLink}
            onPress={() => navigateToOrderConfirmation(navigation, order)}
          >
            <Text style={styles.viewDetailsText}>View full order details →</Text>
          </Pressable>

          {needsProof ? (
            <View style={styles.proofCta}>
              <Text style={styles.proofCtaTitle}>Awaiting proof of payment</Text>
              <Text style={styles.proofCtaBody}>
                Upload your GCash / BDO screenshot to continue processing your order.
              </Text>
              <Pressable
                style={styles.uploadBtn}
                onPress={() => navigateToOrderConfirmation(navigation, order)}
              >
                <Text style={styles.uploadBtnText}>UPLOAD PROOF →</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 4,
    marginBottom: 10,
    backgroundColor: brand.white,
    overflow: "hidden",
  },
  cardExpanded: {
    shadowColor: "#2c1a10",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  proofWarnStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fffdf5",
    borderBottomWidth: 1,
    borderBottomColor: "#ffe08a",
  },
  proofWarnText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#856404" },
  proofLink: { fontSize: 11, fontWeight: "800", color: "#856404", textDecorationLine: "underline" },
  proofReviewStrip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#e8f4fd",
    borderBottomWidth: 1,
    borderBottomColor: "#bdd7f5",
  },
  proofReviewText: { fontSize: 12, fontWeight: "600", color: "#0a5276" },
  proofRejectedStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fdecea",
    borderBottomWidth: 1,
    borderBottomColor: "#f5c6c0",
  },
  proofRejectedText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#8a2c20" },
  proofRejectedLink: { fontSize: 11, fontWeight: "800", color: "#8a2c20", textDecorationLine: "underline" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerExpanded: { backgroundColor: "rgba(240,230,211,0.18)" },
  accentBar: { width: 3, height: 36, borderRadius: 2 },
  headerMain: { flex: 1, minWidth: 0 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 },
  orderNumber: { fontSize: 17, fontWeight: "400", color: brand.dark, fontStyle: "italic" },
  orderDate: { fontSize: 10, letterSpacing: 1, color: brand.textLight, textTransform: "uppercase" },
  headerRight: { alignItems: "flex-end" },
  orderTotal: { fontSize: 19, color: brand.gold, fontStyle: "italic" },
  itemCount: { fontSize: 10, color: brand.textLight, marginTop: 2 },
  chevron: { fontSize: 10, color: brand.textLight, marginLeft: 4 },
  chevronUp: { transform: [{ rotate: "180deg" }] },
  statusBadge: {
    borderWidth: 1,
    borderColor: brand.gold,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8, color: brand.gold },
  collapsedProgress: { paddingHorizontal: 16, paddingBottom: 14 },
  body: { borderTopWidth: 1, borderTopColor: brand.border },
  section: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: brand.border },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 2,
    color: brand.textLight,
    marginBottom: 12,
    fontWeight: "700",
  },
  itemRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8 },
  itemName: { flex: 1, fontSize: 13, color: brand.dark, lineHeight: 18 },
  itemQty: { fontSize: 10, color: brand.textLight },
  itemPrice: { fontSize: 15, color: brand.gold, fontStyle: "italic" },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    marginTop: 4,
  },
  shippingNote: { fontSize: 11, color: brand.textLight, marginRight: "auto" },
  totalLabel: { fontSize: 10, letterSpacing: 1.5, color: brand.textLight },
  totalValue: { fontSize: 20, color: brand.gold, fontStyle: "italic" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  detailKey: { fontSize: 10, letterSpacing: 1.2, color: brand.textLight },
  detailVal: { fontSize: 12, color: brand.dark, textAlign: "right" },
  noteText: { fontSize: 12, fontStyle: "italic", color: brand.textLight, lineHeight: 18 },
  shippingCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#f0f7ff",
    borderWidth: 1,
    borderColor: "#bdd7f5",
    borderRadius: 4,
    gap: 8,
  },
  shippingTitle: { fontSize: 12, fontWeight: "600", color: "#0c5460" },
  shippingMeta: { fontSize: 12, color: "#0c5460" },
  trackLink: {
    fontSize: 11,
    letterSpacing: 1,
    color: "#0c5460",
    textDecorationLine: "underline",
    textTransform: "uppercase",
  },
  shipmentPhoto: { width: "100%", height: 160, borderRadius: 4, marginTop: 6 },
  timelineRow: { flexDirection: "row", gap: 12, paddingBottom: 18, position: "relative" },
  timelineLine: { position: "absolute", left: 9, top: 22, bottom: 0, width: 1.5 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  timelineCheck: { fontSize: 9, color: brand.white, fontWeight: "800" },
  timelineContent: { flex: 1, minWidth: 0 },
  timelineTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "baseline" },
  timelineTitle: { fontSize: 12, color: brand.textLight, flex: 1 },
  timelineUpcoming: { fontSize: 9, color: brand.textLight, opacity: 0.5, letterSpacing: 1 },
  timelineDate: { fontSize: 10, color: brand.textLight },
  timelineDesc: { fontSize: 11, color: brand.textLight, fontStyle: "italic", marginTop: 3, lineHeight: 16 },
  callout: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 4,
    backgroundColor: brand.bg,
  },
  calloutTitle: { fontSize: 13, fontWeight: "700", color: brand.dark, marginBottom: 4 },
  calloutBody: { fontSize: 12, color: brand.textLight, marginBottom: 10 },
  confirmBtn: {
    backgroundColor: brand.buttonAlt,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnText: { color: brand.white, fontWeight: "800", fontSize: 12 },
  completedBlock: { marginHorizontal: 16, marginBottom: 16, gap: 10 },
  completedCheck: { fontSize: 12, color: "#155724", fontWeight: "600" },
  returnWindowOpen: {
    padding: 14,
    backgroundColor: "#fffdf5",
    borderWidth: 1,
    borderColor: "#ffe08a",
    borderRadius: 4,
    gap: 8,
  },
  returnWindowTitle: { fontSize: 12, fontWeight: "700", color: "#856404" },
  returnWindowBody: { fontSize: 11, color: "#856404", lineHeight: 16 },
  returnBtn: {
    backgroundColor: brand.dark,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  returnBtnText: { color: brand.white, fontWeight: "800", fontSize: 12 },
  returnWindowClosed: {
    padding: 14,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 4,
    gap: 4,
  },
  returnWindowClosedTitle: { fontSize: 12, fontWeight: "700", color: brand.textLight },
  returnWindowClosedBody: { fontSize: 11, color: brand.textLight },
  refundedNotice: { marginHorizontal: 16, marginBottom: 16, fontSize: 12, color: "#7a3608" },
  viewDetailsLink: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: brand.border,
  },
  viewDetailsText: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: brand.gold,
    fontWeight: "700",
    textDecorationLine: "underline",
    textTransform: "uppercase",
  },
  proofCta: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    backgroundColor: "#fffdf5",
    gap: 8,
  },
  proofCtaTitle: { fontSize: 12, fontWeight: "600", color: "#856404" },
  proofCtaBody: { fontSize: 11, color: "#856404", opacity: 0.85 },
  uploadBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#856404",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 2,
    marginTop: 4,
  },
  uploadBtnText: { color: brand.white, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  progressRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  progressSegment: { flexDirection: "row", alignItems: "center" },
  progressDot: { borderWidth: 2, borderRadius: 999 },
  progressLine: { flex: 1, height: 1.5, marginHorizontal: 1 },
  progressLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  badStatusBox: { padding: 10, borderRadius: 6 },
  badStatusText: { fontSize: 12, fontWeight: "600" },
});
