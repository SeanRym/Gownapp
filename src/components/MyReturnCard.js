import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import {
  RETURN_STATUS_META,
  RETURN_TYPE_LABEL,
  fmtPhp,
} from "../utils/myOrdersUi";

export function MyReturnCard({ ret }) {
  const [expanded, setExpanded] = useState(false);
  const meta = RETURN_STATUS_META[ret.status] || {
    bg: "#f0e6d3",
    color: "#6b3f2a",
    label: ret.status,
  };

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <Pressable style={[styles.header, expanded && styles.headerExpanded]} onPress={() => setExpanded((p) => !p)}>
        <View style={[styles.accentBar, { backgroundColor: meta.color }]} />
        <View style={styles.headerMain}>
          <View style={styles.titleRow}>
            <Text style={styles.orderNumber}>{ret.orderNumber}</Text>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {(RETURN_TYPE_LABEL[ret.type] || ret.type).toUpperCase()} · {formatDateTimePH(ret.createdAt)}
          </Text>
        </View>
        <Text style={[styles.chevron, expanded && styles.chevronUp]}>▼</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <View style={[styles.callout, { backgroundColor: meta.bg, borderColor: meta.color }]}>
            <Text style={[styles.calloutTitle, { color: meta.color }]}>{meta.label}</Text>
            <Text style={[styles.calloutBody, { color: meta.color }]}>
              {ret.status === "pending" && "Our team will review your request within 1–2 business days."}
              {ret.status === "approved" &&
                "Your request has been approved. Please bring the item(s) to our store in original condition."}
              {ret.status === "rejected" && "Unfortunately we could not process this request."}
              {ret.status === "completed" && "Your request has been fully processed."}
              {ret.status === "cancelled" && "This request was cancelled."}
            </Text>
            {ret.adminNote ? (
              <Text style={[styles.adminNote, { color: meta.color }]}>Note from team: {ret.adminNote}</Text>
            ) : null}
            {ret.refundAmount != null ? (
              <Text style={[styles.refundAmount, { color: meta.color }]}>
                Refund amount: {fmtPhp(ret.refundAmount)}
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>REQUEST DETAILS</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>TYPE</Text>
            <Text style={styles.detailVal}>{RETURN_TYPE_LABEL[ret.type] || ret.type}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>REASON</Text>
            <Text style={[styles.detailVal, { flex: 1, textAlign: "right" }]}>{ret.reason}</Text>
          </View>
          {ret.details ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>DETAILS</Text>
              <Text style={[styles.detailVal, { flex: 1, textAlign: "right" }]}>{ret.details}</Text>
            </View>
          ) : null}

          {(ret.items || []).length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ITEMS</Text>
              {(ret.items || []).map((item, i) => (
                <Text key={`${ret.id}-item-${i}`} style={styles.itemLine}>
                  {item.gownName}
                  {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                  <Text style={styles.itemQty}> ×{item.quantity || 1}</Text>
                </Text>
              ))}
            </>
          ) : null}

          {(ret.evidenceUrls || []).length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                EVIDENCE ({ret.evidenceUrls.length})
              </Text>
              {ret.evidenceUrls.map((f, i) => (
                <Pressable key={`${ret.id}-ev-${i}`} onPress={() => Linking.openURL(String(f.url))}>
                  <Text style={styles.evidenceLink}>{f.name || `File ${i + 1}`} ↗</Text>
                </Pressable>
              ))}
            </>
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  headerExpanded: { backgroundColor: "rgba(240,230,211,0.18)" },
  accentBar: { width: 3, height: 36, borderRadius: 2 },
  headerMain: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 },
  orderNumber: { fontSize: 17, color: brand.dark, fontStyle: "italic" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  meta: { fontSize: 10, letterSpacing: 1, color: brand.textLight, textTransform: "uppercase" },
  chevron: { fontSize: 10, color: brand.textLight },
  chevronUp: { transform: [{ rotate: "180deg" }] },
  body: { borderTopWidth: 1, borderTopColor: brand.border, padding: 16, gap: 8 },
  callout: { padding: 12, borderRadius: 4, borderWidth: 1, marginBottom: 8 },
  calloutTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  calloutBody: { fontSize: 11, lineHeight: 16, opacity: 0.9 },
  adminNote: { fontSize: 11, fontStyle: "italic", marginTop: 6 },
  refundAmount: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: brand.textLight, fontWeight: "700", marginBottom: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 6 },
  detailKey: { fontSize: 10, letterSpacing: 1.2, color: brand.textLight },
  detailVal: { fontSize: 12, color: brand.dark },
  itemLine: { fontSize: 12, color: brand.dark, marginBottom: 4 },
  itemQty: { color: brand.textLight },
  evidenceLink: { color: brand.buttonAlt, fontWeight: "800", fontSize: 12, marginTop: 4 },
});
