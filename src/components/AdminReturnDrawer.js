import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import {
  ACTION_META,
  STATUS_META,
  TYPE_META,
  VALID_ACTIONS,
  fmtPhp,
  isVideo,
} from "../utils/adminReturnsUi";

function StatusBadge({ status, type }) {
  const meta =
    type === "type"
      ? TYPE_META[status] || { label: status, bg: "#f0e6d3", color: "#6b3f2a", icon: "" }
      : STATUS_META[status] || { label: status, bg: "#f0e6d3", color: "#6b3f2a" };
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>
        {type === "type" && meta.icon ? `${meta.icon} ` : ""}
        {meta.label}
      </Text>
    </View>
  );
}

function EvidenceGallery({ evidenceUrls }) {
  if (!Array.isArray(evidenceUrls) || !evidenceUrls.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        EVIDENCE ({evidenceUrls.length} file{evidenceUrls.length !== 1 ? "s" : ""})
      </Text>
      <View style={styles.evidenceGrid}>
        {evidenceUrls.map((f, i) => (
          <Pressable
            key={`ev-${i}`}
            style={styles.evidenceThumb}
            onPress={() => Linking.openURL(String(f.url))}
          >
            {isVideo(f.type) ? (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoLabel}>VIDEO</Text>
              </View>
            ) : (
              <Image source={{ uri: String(f.url) }} style={styles.evidenceImage} resizeMode="cover" />
            )}
            <Text style={styles.evidenceOpen}>↗</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.evidenceHint}>Tap any file to open full size.</Text>
    </View>
  );
}

function ConfirmModal({ visible, title, message, confirmLabel, danger, onConfirm, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.confirmBackdrop} onPress={onClose}>
        <Pressable style={styles.confirmBox} onPress={() => {}}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMsg}>{message}</Text>
          {children}
          <View style={styles.confirmActions}>
            <Pressable style={styles.ghostBtn} onPress={onClose}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, danger && styles.dangerBtn]}
              onPress={onConfirm}
            >
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AdminReturnDrawer({ ret, visible, onClose, onAction, onRefresh }) {
  const [confirm, setConfirm] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && ret) {
      setAdminNote(String(ret.adminNote || ""));
      setRefundAmount(ret.refundAmount != null ? String(ret.refundAmount) : "");
    }
  }, [visible, ret?.id, ret?.adminNote, ret?.refundAmount]);

  if (!ret) return null;

  const allowedActions = VALID_ACTIONS[ret.status] || [];
  const needsAmtOnComplete = ["return", "refund"].includes(ret.type);

  const requestAction = (action) => {
    const meta = ACTION_META[action];
    const needsAmt = action === "complete" && needsAmtOnComplete;
    setConfirm({ action, meta, needsAmt });
  };

  const doAction = async () => {
    if (!confirm) return;
    setSaving(true);
    const { action, needsAmt } = confirm;
    setConfirm(null);
    try {
      await onAction(ret.id, action, {
        adminNote: String(adminNote || "").trim() || undefined,
        refundAmount:
          needsAmt && String(refundAmount || "").trim() !== ""
            ? Number(refundAmount)
            : undefined,
      });
      await onRefresh?.();
    } catch (e) {
      Alert.alert("Action failed", e?.message || "Could not update return.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.drawer}>
        <View style={styles.drawerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>RETURN REQUEST</Text>
            <Text style={styles.drawerTitle}>{ret.orderNumber}</Text>
            <Text style={styles.drawerMeta}>{formatDateTimePH(ret.createdAt)}</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.drawerBody}>
          <View style={styles.badgeRow}>
            <StatusBadge status={ret.type} type="type" />
            <StatusBadge status={ret.status} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CUSTOMER</Text>
            <View style={styles.row}>
              <Text style={styles.rowKey}>Name</Text>
              <Text style={styles.rowVal}>{ret.customerName || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowKey}>Email</Text>
              <Pressable onPress={() => ret.customerEmail && Linking.openURL(`mailto:${ret.customerEmail}`)}>
                <Text style={styles.link}>{ret.customerEmail || "—"}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ORDER</Text>
            <View style={styles.row}>
              <Text style={styles.rowKey}>Order number</Text>
              <Text style={styles.rowVal}>{ret.orderNumber || "—"}</Text>
            </View>
            {ret.orderTotal != null ? (
              <View style={styles.row}>
                <Text style={styles.rowKey}>Order total</Text>
                <Text style={styles.rowVal}>{fmtPhp(ret.orderTotal)}</Text>
              </View>
            ) : null}
            {ret.paymentMethod ? (
              <View style={styles.row}>
                <Text style={styles.rowKey}>Payment</Text>
                <Text style={[styles.rowVal, { textTransform: "capitalize" }]}>{ret.paymentMethod}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ITEMS REQUESTED ({(ret.items || []).length})</Text>
            {(ret.items || []).map((item, i) => (
              <View key={`item-${i}`} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {item.gownName}
                  {item.sizeLabel ? ` — ${item.sizeLabel}` : ""}
                </Text>
                <Text style={styles.itemQty}>×{item.quantity || 1}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>REASON</Text>
            <Text style={styles.reasonText}>{ret.reason || "—"}</Text>
            {ret.details ? <Text style={styles.detailsText}>{ret.details}</Text> : null}
          </View>

          <EvidenceGallery evidenceUrls={ret.evidenceUrls} />

          {ret.adminNote || ret.refundAmount != null ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>RESOLUTION</Text>
              {ret.refundAmount != null ? (
                <View style={styles.row}>
                  <Text style={styles.rowKey}>Refund issued</Text>
                  <Text style={[styles.rowVal, { color: "#155724", fontWeight: "700" }]}>
                    {fmtPhp(ret.refundAmount)}
                  </Text>
                </View>
              ) : null}
              {ret.adminNote ? <Text style={styles.detailsText}>{ret.adminNote}</Text> : null}
              {ret.resolvedAt ? (
                <Text style={styles.resolvedAt}>Resolved {formatDateTimePH(ret.resolvedAt)}</Text>
              ) : null}
            </View>
          ) : null}

          {allowedActions.length > 0 ? (
            <View style={[styles.section, styles.actionSection]}>
              <Text style={styles.sectionTitle}>ACTIONS</Text>
              <Text style={styles.actionHint}>Customer receives an email on every change.</Text>

              <Text style={styles.inputLabel}>Admin note for customer (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Admin note for customer (optional)"
                value={adminNote}
                onChangeText={setAdminNote}
                multiline
              />

              {ret.status === "approved" && needsAmtOnComplete ? (
                <>
                  <Text style={[styles.inputLabel, { marginTop: 10 }]}>
                    Refund amount P (optional, e.g. {ret.orderTotal ?? ""})
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`Refund amount P (optional, e.g. ${ret.orderTotal ?? ""})`}
                    value={refundAmount}
                    onChangeText={setRefundAmount}
                    keyboardType="numeric"
                  />
                </>
              ) : null}

              {allowedActions
                .filter((a) => !ACTION_META[a].danger)
                .map((action) => (
                  <Pressable
                    key={action}
                    style={[styles.actionPrimary, saving && { opacity: 0.6 }]}
                    disabled={saving}
                    onPress={() => requestAction(action)}
                  >
                    <Text style={styles.actionPrimaryText}>{ACTION_META[action].label} →</Text>
                  </Pressable>
                ))}

              {allowedActions.filter((a) => ACTION_META[a].danger).length > 0 ? (
                <View style={styles.dangerRow}>
                  {allowedActions
                    .filter((a) => ACTION_META[a].danger)
                    .map((action) => (
                      <Pressable
                        key={action}
                        style={[styles.actionDanger, saving && { opacity: 0.6 }]}
                        disabled={saving}
                        onPress={() => requestAction(action)}
                      >
                        <Text style={styles.actionDangerText}>{ACTION_META[action].label}</Text>
                      </Pressable>
                    ))}
                </View>
              ) : null}

              {saving ? <Text style={styles.savingText}>Saving…</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      </View>

      <ConfirmModal
        visible={Boolean(confirm)}
        title={confirm ? `${confirm.meta.label} this request?` : ""}
        message={
          confirm?.action === "approve"
            ? `This will approve the ${ret.type} request and notify the customer to return their item(s).`
            : confirm?.action === "complete"
              ? `This will mark the request as completed.${
                  needsAmtOnComplete ? " The parent order will be marked as Refunded." : ""
                }`
              : confirm?.action === "reject"
                ? "This will reject the request and notify the customer."
                : confirm
                  ? "This will cancel the request."
                  : ""
        }
        confirmLabel={confirm?.meta?.label || "Confirm"}
        danger={Boolean(confirm?.meta?.danger)}
        onConfirm={doAction}
        onClose={() => setConfirm(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: brand.bg },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    backgroundColor: brand.white,
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: brand.textLight, fontWeight: "700" },
  drawerTitle: { fontSize: 22, fontWeight: "700", color: brand.dark, fontStyle: "italic", marginTop: 2 },
  drawerMeta: { fontSize: 12, color: brand.textLight, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.white,
  },
  closeText: { fontSize: 16, color: brand.textLight },
  drawerBody: { padding: 16, paddingBottom: 40, gap: 4 },
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  section: {
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 9, letterSpacing: 2, color: brand.textLight, fontWeight: "700", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  rowKey: { fontSize: 12, color: brand.textLight },
  rowVal: { fontSize: 13, color: brand.dark, textAlign: "right", flex: 1 },
  link: { fontSize: 13, color: brand.buttonAlt, fontWeight: "700", textAlign: "right" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  itemName: { flex: 1, fontSize: 13, color: brand.dark },
  itemQty: { fontSize: 12, color: brand.textLight },
  reasonText: { fontSize: 13, color: brand.dark, lineHeight: 20 },
  detailsText: { fontSize: 12, color: brand.textLight, fontStyle: "italic", marginTop: 6, lineHeight: 18 },
  resolvedAt: { fontSize: 11, color: brand.textLight, marginTop: 6 },
  evidenceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  evidenceThumb: {
    width: 90,
    height: 90,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: "#f5f5f5",
  },
  evidenceImage: { width: "100%", height: "100%" },
  videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#333" },
  videoLabel: { fontSize: 9, color: brand.white, fontWeight: "800" },
  evidenceOpen: {
    position: "absolute",
    top: 4,
    right: 4,
    fontSize: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    color: brand.white,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  evidenceHint: { fontSize: 11, color: brand.textLight, marginTop: 6 },
  actionSection: { borderColor: brand.gold },
  actionHint: { fontSize: 12, color: brand.textLight, marginBottom: 10 },
  inputLabel: { fontSize: 12, color: brand.textLight, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: brand.white,
    fontSize: 14,
    color: brand.dark,
    minHeight: 44,
  },
  actionPrimary: {
    backgroundColor: brand.dark,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  actionPrimaryText: { color: brand.white, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  dangerRow: { flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: brand.border },
  actionDanger: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e4a4b1",
    backgroundColor: "#fff5f7",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionDangerText: { color: "#721c24", fontWeight: "800", fontSize: 12 },
  savingText: { fontSize: 13, color: brand.textLight, marginTop: 8 },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 16,
  },
  confirmBox: { backgroundColor: brand.white, borderRadius: 12, padding: 16 },
  confirmTitle: { fontSize: 16, fontWeight: "900", color: brand.dark, marginBottom: 8 },
  confirmMsg: { fontSize: 13, color: brand.textLight, lineHeight: 20, marginBottom: 16 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryBtn: { backgroundColor: brand.dark, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  dangerBtn: { backgroundColor: "#721c24" },
  primaryText: { color: brand.white, fontWeight: "900" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: brand.white,
  },
  ghostText: { color: brand.textLight, fontWeight: "900" },
});
