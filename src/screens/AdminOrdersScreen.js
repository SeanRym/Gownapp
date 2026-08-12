import { useCallback, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  addOrderTrackingEventAdmin,
  getAllOrdersAdmin,
  getOrderStatusOptions,
  getTrackingStatusOptions,
  reviewOrderPaymentProofAdmin,
  updateOrderStatusAdmin,
} from "../services/orders";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import { idsEqual } from "../utils/id";

const TRACKING_OPTIONS = getTrackingStatusOptions();
const ORDER_STATUS_OPTIONS = getOrderStatusOptions();

const EMPTY_TRACKING_FORM = {
  trackingStatus: "in_transit",
  title: "",
  note: "",
  location: "",
  riderName: "",
  riderPhone: "",
};

function money(n) {
  return `P${Number(n || 0).toLocaleString("en-PH")}`;
}

function prettyStatus(v) {
  return String(v || "").replace(/\b\w/g, (m) => m.toUpperCase());
}

function getBadgeTone(statusLike) {
  const s = String(statusLike || "").toLowerCase();
  if (s.includes("cancel") || s.includes("reject") || s.includes("refund")) return "red";
  if (s.includes("pending") || s === "placed" || s.includes("submitted")) return "yellow";
  if (s.includes("paid") || s.includes("complete") || s.includes("verified")) return "green";
  if (s.includes("processing") || s.includes("shipped") || s.includes("progress")) return "yellow";
  return "green";
}

function getConfirmDescription(action) {
  const a = String(action || "").toLowerCase();
  if (a === "paid") return "This will move the order back to \"Paid\". The customer will be notified.";
  if (a === "ready") return "This will mark the order as \"Ready\" and notify the customer.";
  if (a === "cancelled") return "This will cancel the order and notify the customer. Stock will be restored. This cannot be undone.";
  if (a === "refunded") return "This will refund the order and notify the customer. This cannot be undone.";
  return "This will change the order status and notify the customer.";
}

function getConfirmTone(action) {
  const a = String(action || "").toLowerCase();
  if (["paid", "ready"].includes(a)) return "primary";
  if (["cancelled", "refunded"].includes(a)) return "danger";
  return "default";
}

function getAdminOrderActions(currentStatus) {
  const status = String(currentStatus || "").toLowerCase();
  const actions = {
    placed: ["paid", "cancelled", "refunded"],
    paid: ["processing", "cancelled", "refunded"],
    processing: ["paid", "ready", "cancelled", "refunded"],
    ready: ["shipped", "cancelled", "refunded"],
    shipped: ["completed", "cancelled", "refunded"],
    completed: [],
    cancelled: [],
    refunded: [],
  };
  return actions[status] || [];
}

export function AdminOrdersScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_orders");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openTrackingFor, setOpenTrackingFor] = useState(null);
  const [openDetailsFor, setOpenDetailsFor] = useState(null);
  const [proofReferenceNo, setProofReferenceNo] = useState("");
  const [proofRejectReason, setProofRejectReason] = useState("");
  const [trackingForm, setTrackingForm] = useState(EMPTY_TRACKING_FORM);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmForce, setConfirmForce] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await getAllOrdersAdmin();
    setOrders(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) loadData();
    }, [loadData])
  );

  const onAddTracking = async (orderId) => {
    const result = await addOrderTrackingEventAdmin(orderId, trackingForm);
    if (!result.ok) {
      Alert.alert("Update failed", result.error || "Unable to add tracking update.");
      return;
    }
    setOpenTrackingFor(null);
    setTrackingForm(EMPTY_TRACKING_FORM);
    loadData();
  };

  const onUpdateStatus = async (orderId, nextStatus) => {
    const result = await updateOrderStatusAdmin(orderId, nextStatus);
    if (!result.ok) {
      Alert.alert("Status update failed", result.error || "Could not update order status.");
      return;
    }
    loadData();
  };

  const handleStatusSelection = async (status) => {
    setConfirmAction(status);
    setConfirmNote("");
    setConfirmForce(false);
    setConfirmOpen(true);
  };

  const onReviewProof = async (orderId, action) => {
    const result = await reviewOrderPaymentProofAdmin(orderId, {
      action,
      referenceNumber: proofReferenceNo,
      reason: proofRejectReason,
    });
    if (!result.ok) {
      Alert.alert("Proof review failed", result.error || "Could not review payment proof.");
      return;
    }
    setProofReferenceNo("");
    setProofRejectReason("");
    setReviewOpen(false);
    setReviewOrder(null);
    loadData();
  };

  const q = String(query || "").trim().toLowerCase();
  const filtered = orders
    .filter((o) => {
      const sf = String(statusFilter || "all");
      if (sf !== "all") {
        if (sf === "proof_pending") {
          const proof = String(o?.paymentProofStatus || o?.proofStatus || "").toLowerCase();
          if (proof !== "pending") return false;
        } else {
          if (String(o?.status || "").toLowerCase() !== sf) return false;
        }
      }
      if (!q) return true;
      const hay = [
        o?.id,
        o?.contact?.firstName,
        o?.contact?.lastName,
        o?.contact?.email,
        o?.delivery?.method,
        o?.payment,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    })
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());

  const kpis = filtered.reduce(
    (acc, o) => {
      const status = String(o?.status || "").toLowerCase();
      const proof = String(o?.paymentProofStatus || o?.proofStatus || "").toLowerCase();
      const paymentMethod = String(o?.payment || o?.paymentMethod || "").toLowerCase();
      const paymentStatus = String(o?.paymentStatus || "").toLowerCase();
      const total = Number(o?.total || o?.subtotal || 0);
      acc.total += 1;
      if (proof === "pending") acc.proofsPending += 1;
      if (["placed", "pending_payment"].includes(status) && paymentMethod !== "cash") acc.awaitingPayment += 1;
      if (["processing", "ready", "shipped"].includes(status)) acc.inProgress += 1;
      if (paymentStatus === "paid") acc.verifiedRevenue += total;
      return acc;
    },
    { total: 0, proofsPending: 0, awaitingPayment: 0, inProgress: 0, verifiedRevenue: 0 }
  );

  const pendingProofOrders = orders
    .filter((o) => String(o?.paymentProofStatus || o?.proofStatus || "").toLowerCase() === "pending")
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());

  if (!allowed) {
    return (
      <View style={styles.deniedWrap}>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.deniedText}>You don’t have permission to manage orders.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.meta}>Manage orders, payments, and tracking.</Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={loadData}>
          <Text style={styles.refreshBtnText}>{loading ? "..." : "Refresh"}</Text>
        </Pressable>
      </View>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{kpis.total}</Text>
          <Text style={styles.kpiLabel}>Total orders</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{kpis.proofsPending}</Text>
          <Text style={styles.kpiLabel}>Proofs to review</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{kpis.awaitingPayment}</Text>
          <Text style={styles.kpiLabel}>Awaiting payment</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{kpis.inProgress}</Text>
          <Text style={styles.kpiLabel}>In progress</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{money(kpis.verifiedRevenue)}</Text>
          <Text style={styles.kpiLabel}>Verified Revenue</Text>
        </View>
      </View>

      {pendingProofOrders.length ? (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingTitle}>⚠ {pendingProofOrders.length} orders awaiting proof review</Text>
          {pendingProofOrders.map((o) => (
            <View key={`pending-${o.id}`} style={styles.pendingRow}>
              <Text style={styles.pendingId}>
                {(o.orderNumber || `JCE-${o.id}`)} · {o?.contact?.firstName || o?.contact?.email?.split("@")[0] || ""}
              </Text>
              <Text style={styles.pendingAmount}>{money(o.total || o.subtotal)}</Text>
              <Pressable
                style={styles.pendingReviewBtn}
                onPress={() => {
                  setReviewOrder(o);
                  setProofReferenceNo(String(o?.paymentProof?.referenceNumber || ""));
                  setProofRejectReason("");
                  setReviewOpen(true);
                }}
              >
                <Text style={styles.pendingReviewBtnText}>Review</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.searchCard}>
        <TextInput
          style={styles.input}
          placeholder="Search by order no, name, or email..."
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.filterRow}>
          {(() => {
            const proofPendingCount = orders.filter((o) => String(o?.paymentProofStatus || o?.proofStatus || "").toLowerCase() === "pending").length;
            const filters = ["all", "proof_pending", "placed", "paid", "processing", "ready", "shipped", "completed", "cancelled"];
            return filters.map((s) => (
              <Pressable
                key={`filter-${s}`}
                style={[styles.filterPill, statusFilter === s ? styles.filterPillActive : null]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={statusFilter === s ? styles.filterPillTextActive : styles.filterPillText}>
                  {s === "all" ? "All" : s === "proof_pending" ? `Proof pending (${proofPendingCount})` : s === "placed" ? "Pending Payment" : prettyStatus(s)}
                </Text>
              </Pressable>
            ));
          })()}
        </View>
      </View>

      {loading ? <Text style={styles.meta}>Loading orders...</Text> : null}
      {!loading && !filtered.length ? <Text style={styles.meta}>No orders found.</Text> : null}

      {!!filtered.length ? (
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeadText, styles.colOrder]}>Order</Text>
          <Text style={[styles.tableHeadText, styles.colCustomer]}>Customer</Text>
          <Text style={[styles.tableHeadText, styles.colStatus]}>Status</Text>
          <Text style={[styles.tableHeadText, styles.colPayment]}>Payment</Text>
          <Text style={[styles.tableHeadText, styles.colTotal]}>Total</Text>
          <Text style={[styles.tableHeadText, styles.colAction]}>Action</Text>
        </View>
      ) : null}

      {filtered.map((o) => (
        <Pressable
          key={o.id}
          style={styles.card}
          onPress={() => {
            setSelectedOrder(o);
            setDetailOpen(true);
          }}
        >
          <View style={styles.orderRowTop}>
            <Text style={[styles.cardTitle, styles.colOrder]} numberOfLines={1}>{o.orderNumber || `JCE-${o.id}`}</Text>
            <Text style={[styles.meta, styles.colCustomer]} numberOfLines={1}>
              {o?.contact?.email || "-"}
            </Text>
            <View style={[styles.colStatus, styles.badgeWrap]}>
              <Text style={[styles.badgeBase, styles[`badge${getBadgeTone(o.status)[0].toUpperCase()}${getBadgeTone(o.status).slice(1)}`]]}>
                {prettyStatus(o.status)}
              </Text>
            </View>
            <View style={[styles.colPayment, styles.badgeWrap]}>
              <Text
                style={[
                  styles.badgeBase,
                  styles[
                    `badge${
                      getBadgeTone(o.paymentProofStatus || o.payment || "-")[0].toUpperCase() +
                      getBadgeTone(o.paymentProofStatus || o.payment || "-").slice(1)
                    }`
                  ],
                ]}
              >
                {prettyStatus(o.paymentProofStatus || o.payment || "-")}
              </Text>
            </View>
            <Text style={[styles.total, styles.colTotal]} numberOfLines={1}>{money(o.total || o.subtotal)}</Text>
            <View style={styles.colAction}>
              {String(o?.paymentProofStatus || o?.proofStatus || "").toLowerCase() === "pending" ? (
                <Pressable
                  style={styles.rowVerifyBtn}
                  onPress={() => {
                    setReviewOrder(o);
                    setProofReferenceNo(String(o?.paymentProof?.referenceNumber || ""));
                    setProofRejectReason("");
                    setReviewOpen(true);
                  }}
                >
                  <Text style={styles.rowVerifyBtnText}>Verify</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.meta}>{o?.contact?.firstName} {o?.contact?.lastName} • {formatDateTimePH(o.createdAt)}</Text>
        </Pressable>
      ))}

      <Modal visible={reviewOpen} transparent animationType="fade" onRequestClose={() => setReviewOpen(false)}>
        <Pressable style={styles.reviewBackdrop} onPress={() => setReviewOpen(false)}>
          <Pressable style={styles.reviewModal} onPress={() => {}}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.detailLabel}>PAYMENT PROOF</Text>
                <Text style={styles.detailTitle}>{reviewOrder?.orderNumber || `JCE-${reviewOrder?.id || "-"}`}</Text>
                <Text style={styles.meta}>{reviewOrder?.contact?.firstName} {reviewOrder?.contact?.lastName} • {money(reviewOrder?.total || reviewOrder?.subtotal)} • {prettyStatus(reviewOrder?.payment || "-")}</Text>
              </View>
              <Pressable style={styles.detailCloseTopBtn} onPress={() => setReviewOpen(false)}>
                <Text style={styles.detailClose}>X</Text>
              </Pressable>
            </View>

            {String(reviewOrder?.paymentProof?.imageUri || "").trim() ? (
              <Image source={{ uri: String(reviewOrder.paymentProof.imageUri) }} style={styles.reviewImage} />
            ) : (
              <View style={styles.reviewImageFallback}>
                <Text style={styles.meta}>No proof image uploaded.</Text>
              </View>
            )}

            <View style={styles.rowBetween}>
              <Text style={styles.meta}>Uploaded</Text>
              <Text style={styles.meta}>
                {reviewOrder?.paymentProof?.submittedAt ? formatDateTimePH(reviewOrder.paymentProof.submittedAt) : "-"}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>Proof status</Text>
              <Text
                style={[
                  styles.badgeBase,
                  styles[
                    `badge${
                      getBadgeTone(reviewOrder?.paymentProofStatus || reviewOrder?.proofStatus || "-")[0].toUpperCase() +
                      getBadgeTone(reviewOrder?.paymentProofStatus || reviewOrder?.proofStatus || "-").slice(1)
                    }`
                  ],
                ]}
              >
                {prettyStatus(reviewOrder?.paymentProofStatus || reviewOrder?.proofStatus || "-")}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>Customer ref no.</Text>
              <Text style={styles.meta}>{reviewOrder?.paymentProof?.referenceNumber || "--"}</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Confirm reference / transaction number (optional)"
              value={proofReferenceNo}
              onChangeText={setProofReferenceNo}
            />
            <TextInput
              style={[styles.input, styles.inputArea]}
              placeholder="Rejection reason (optional)"
              value={proofRejectReason}
              onChangeText={setProofRejectReason}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.verifyBtn} onPress={() => onReviewProof(reviewOrder?.id, "verify")}>
                <Text style={styles.verifyBtnText}>✓ Verify payment</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={() => onReviewProof(reviewOrder?.id, "reject")}>
                <Text style={styles.dangerBtnText}>✗ Reject proof</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <Pressable style={styles.detailBackdrop} onPress={() => setDetailOpen(false)}>
          <Pressable style={styles.detailPanel} onPress={() => {}}>
            <View style={styles.detailHeader}>
              <View>
                <Text style={styles.detailLabel}>ORDER</Text>
                <Text style={styles.detailTitle}>{selectedOrder?.orderNumber || `JCE-${selectedOrder?.id || "-"}`}</Text>
                <Text style={styles.meta}>{selectedOrder?.createdAt ? formatDateTimePH(selectedOrder.createdAt) : "-"}</Text>
              </View>
              <Pressable style={styles.detailCloseTopBtn} onPress={() => setDetailOpen(false)}>
                <Text style={styles.detailClose}>X</Text>
              </Pressable>
            </View>

            <View style={styles.detailBadgeRow}>
              <Text
                style={[
                  styles.badgeBase,
                  styles[
                    `badge${
                      getBadgeTone(selectedOrder?.status || "-")[0].toUpperCase() +
                      getBadgeTone(selectedOrder?.status || "-").slice(1)
                    }`
                  ],
                ]}
              >
                {prettyStatus(selectedOrder?.status || "-")}
              </Text>
              <Text
                style={[
                  styles.badgeBase,
                  styles[
                    `badge${
                      getBadgeTone(selectedOrder?.paymentProofStatus || selectedOrder?.payment || "-")[0].toUpperCase() +
                      getBadgeTone(selectedOrder?.paymentProofStatus || selectedOrder?.payment || "-").slice(1)
                    }`
                  ],
                ]}
              >
                {prettyStatus(selectedOrder?.paymentProofStatus || selectedOrder?.payment || "-")}
              </Text>
            </View>

            <Text style={styles.detailSection}>Customer</Text>
            <Text style={styles.meta}>Name: {selectedOrder?.contact?.firstName} {selectedOrder?.contact?.lastName}</Text>
            <Text style={styles.meta}>{selectedOrder?.contact?.email || "-"}</Text>

            <Text style={styles.detailSection}>Items ({(selectedOrder?.items || []).length})</Text>
            {(selectedOrder?.items || []).map((it, idx) => (
              <View key={`d-${idx}`} style={styles.rowBetween}>
                <Text style={styles.meta}>{it.name} x {it.qty}</Text>
                <Text style={styles.total}>{money(it.subtotal)}</Text>
              </View>
            ))}
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Total</Text>
              <Text style={styles.total}>{money(selectedOrder?.total || selectedOrder?.subtotal)}</Text>
            </View>

            <Text style={styles.detailSection}>Delivery</Text>
            <Text style={styles.meta}>Method: {selectedOrder?.delivery?.method || "-"}</Text>
            <Text style={styles.meta}>{selectedOrder?.delivery?.address || "-"}</Text>

            <Text style={styles.detailSection}>Payment</Text>
            <Text style={styles.meta}>Method: {selectedOrder?.payment || "-"}</Text>

            <Text style={styles.detailSection}>Update status</Text>
            {String(selectedOrder?.status || "").toLowerCase() === "completed" ? (
              <View style={styles.updateDisabledCard}>
                <Text style={styles.meta}>Customer receives an email on every change.</Text>
                <Text style={styles.updateDisabledNote}>This order is in a terminal state (Completed) and cannot be changed.</Text>
              </View>
            ) : (
              <>
                {String(selectedOrder?.status || "").toLowerCase() === "processing" ? (
                  <>
                    <Pressable
                      style={styles.statusActionLarge}
                      onPress={async () => {
                        await handleStatusSelection("paid");
                      }}
                    >
                      <Text style={styles.statusActionLargeText}>← Paid</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.statusActionLarge, styles.statusActionLargePrimary]}
                      onPress={async () => {
                        await handleStatusSelection("ready");
                      }}
                    >
                      <Text style={styles.statusActionLargePrimaryText}>Ready →</Text>
                    </Pressable>
                    <View style={styles.statusRowSmall}>
                      <Pressable
                        style={[styles.statusPill, styles.statusPillDanger, { flex: 1 }]}
                        onPress={async () => {
                          await handleStatusSelection("cancelled");
                        }}
                      >
                        <Text style={styles.statusPillDangerText}>Cancelled</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.statusPill, styles.statusPillDanger, { flex: 1 }]}
                        onPress={async () => {
                          await handleStatusSelection("refunded");
                        }}
                      >
                        <Text style={styles.statusPillDangerText}>Refunded</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.statusRow}>
                    {getAdminOrderActions(selectedOrder?.status).map((s) => {
                      const tone = getConfirmTone(s);
                      const label = s === "paid" ? "← Paid" : s === "ready" ? "Ready →" : prettyStatus(s);
                      return (
                        <Pressable
                          key={`d-status-${s}`}
                          style={[
                            styles.statusPill,
                            tone === "primary" ? styles.statusPillPrimary : null,
                            tone === "danger" ? styles.statusPillDanger : null,
                          ]}
                          onPress={async () => {
                            await handleStatusSelection(s);
                          }}
                        >
                          <Text style={tone === "danger" ? styles.statusPillDangerText : tone === "primary" ? styles.statusPillPrimaryText : styles.statusPillText}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
            <Pressable style={styles.detailCloseBtn} onPress={() => setDetailOpen(false)}>
              <Text style={styles.detailCloseBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={styles.reviewBackdrop} onPress={() => setConfirmOpen(false)}>
          <Pressable style={styles.reviewModal} onPress={() => {}}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.detailLabel}>Change to "{prettyStatus(confirmAction)}"?</Text>
                <Text style={styles.meta}>{getConfirmDescription(confirmAction)}</Text>
              </View>
              <Pressable style={styles.detailCloseTopBtn} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.detailClose}>X</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Internal note (optional)"
              value={confirmNote}
              onChangeText={setConfirmNote}
            />
            {String(selectedOrder?.status || "").toLowerCase() === "completed" ? (
              <Pressable
                onPress={() => setConfirmForce((p) => !p)}
                style={[styles.secondaryBtn, { marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
              >
                <Text style={styles.secondaryBtnText}>Force change (override server rules)</Text>
                <Text style={{ fontWeight: "800" }}>{confirmForce ? "ON" : "OFF"}</Text>
              </Pressable>
            ) : null}
            <View style={styles.row}>
              <Pressable style={styles.cancelButton} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  getConfirmTone(confirmAction) === "primary" ? styles.primaryAction : getConfirmTone(confirmAction) === "danger" ? styles.dangerBtn : styles.verifyBtn,
                  { flex: 1 },
                ]}
                onPress={async () => {
                  const res = await updateOrderStatusAdmin(selectedOrder?.id, confirmAction, { force: confirmForce, note: confirmNote });
                  if (!res.ok) {
                    Alert.alert("Status update failed", res.error || "Could not update order status.");
                  } else {
                    setSelectedOrder(res.order || (await getAllOrdersAdmin()).find((x) => idsEqual(x?.id, selectedOrder?.id)));
                  }
                  setConfirmOpen(false);
                  loadData();
                }}
              >
                <Text style={getConfirmTone(confirmAction) === "primary" ? styles.primaryActionText : getConfirmTone(confirmAction) === "danger" ? styles.dangerBtnText : styles.verifyBtnText}>Yes, {prettyStatus(confirmAction)}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 28 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  refreshBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    backgroundColor: brand.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshBtnText: { color: brand.text, fontWeight: "700", fontSize: 11 },
  searchCard: {
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterPill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: brand.white },
  filterPillActive: { backgroundColor: brand.button, borderColor: brand.button },
  filterPillText: { color: brand.dark, fontSize: 11, fontWeight: "700" },
  filterPillTextActive: { color: brand.white, fontSize: 11, fontWeight: "700" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  kpiCard: { flexGrow: 1, minWidth: 95, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 10 },
  kpiValue: { color: brand.dark, fontWeight: "900", fontSize: 16 },
  kpiLabel: { color: brand.textLight, fontSize: 11, marginTop: 3, fontWeight: "700" },
  title: { fontSize: 34, fontWeight: "800", color: brand.dark, marginBottom: 4, fontStyle: "italic" },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableHeadText: { color: brand.textLight, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  badgeWrap: { justifyContent: "center" },
  badgeBase: {
    alignSelf: "flex-start",
    borderWidth: 1,
    fontSize: 10,
    fontWeight: "700",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeGreen: { borderColor: "#bfe0cc", backgroundColor: "#eaf8ef", color: "#28784f" },
  badgeYellow: { borderColor: "#e7d7a7", backgroundColor: "#f8efcf", color: "#8a6b1e" },
  badgeRed: { borderColor: "#e2b6bc", backgroundColor: "#f9e8eb", color: "#a34757" },
  card: {
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  orderRowTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  colOrder: { flex: 1.1 },
  colCustomer: { flex: 1.8 },
  colStatus: { flex: 1.1 },
  colPayment: { flex: 1.1 },
  colTotal: { flex: 1.1, textAlign: "right" },
  colAction: { flex: 1, alignItems: "flex-end" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  cardTitle: { color: brand.dark, fontWeight: "800", fontSize: 14 },
  total: { color: brand.dark, fontWeight: "800", fontSize: 13 },
  meta: { color: brand.textLight, fontSize: 12, marginTop: 2 },
  itemsWrap: { marginTop: 8, gap: 3 },
  item: { color: brand.text, fontSize: 12 },
  dropdownTrigger: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: brand.accentSoft,
  },
  dropdownTriggerText: { color: brand.dark, fontSize: 12, fontWeight: "700" },
  formCard: { marginTop: 8, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 10 },
  formTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8, fontSize: 12 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  statusRowSmall: { flexDirection: "row", gap: 6, marginBottom: 8 },
  statusActionLarge: { borderWidth: 1, borderColor: brand.border, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 14, backgroundColor: brand.white, marginBottom: 8 },
  statusActionLargePrimary: { backgroundColor: "#5b31ff", borderColor: "#5b31ff" },
  statusActionLargeText: { color: brand.dark, fontSize: 14, fontWeight: "800", textAlign: "center" },
  statusActionLargePrimaryText: { color: brand.white, fontSize: 14, fontWeight: "800", textAlign: "center" },
  statusPill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: brand.white },
  statusPillPrimary: { backgroundColor: "#5b31ff", borderColor: "#5b31ff" },
  statusPillDanger: { backgroundColor: "#fdd0d3", borderColor: "#f7b6bd" },
  statusPillText: { color: brand.dark, fontSize: 12, fontWeight: "700" },
  statusPillPrimaryText: { color: brand.white, fontSize: 12, fontWeight: "700" },
  statusPillDangerText: { color: "#a82949", fontSize: 12, fontWeight: "700" },
  statusPillTextActive: { color: brand.white, fontSize: 11, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, padding: 9, marginBottom: 8, fontSize: 12 },
  inputArea: { minHeight: 56, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: brand.buttonAlt, borderRadius: 8, paddingVertical: 10 },
  primaryBtnText: { color: brand.white, textAlign: "center", fontWeight: "800", fontSize: 11, letterSpacing: 0.6 },
  proofCard: { marginTop: 8, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 10 },
  row: { flexDirection: "row", gap: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingVertical: 10, backgroundColor: brand.white },
  secondaryBtnText: { color: brand.dark, textAlign: "center", fontWeight: "800", fontSize: 11 },
  dangerBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, backgroundColor: "#a82949" },
  dangerBtnText: { color: brand.white, textAlign: "center", fontWeight: "800", fontSize: 11 },
  detailBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.22)", alignItems: "flex-end" },
  detailPanel: { width: "88%", maxWidth: 420, height: "100%", backgroundColor: "#f7f7f7", borderLeftWidth: 1, borderLeftColor: brand.border, padding: 14, paddingTop: 22 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  detailLabel: { color: brand.textLight, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 4 },
  detailTitle: { color: brand.dark, fontWeight: "900", fontSize: 16 },
  detailCloseTopBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: brand.white, paddingHorizontal: 10, paddingVertical: 6 },
  detailClose: { color: brand.textLight, fontWeight: "700" },
  detailBadgeRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 6 },
  detailSection: { color: brand.textLight, fontSize: 10, textTransform: "uppercase", fontWeight: "800", marginTop: 10, marginBottom: 4 },
  pendingWrap: {
    borderWidth: 1,
    borderColor: "#d9cfa0",
    backgroundColor: "#efe7be",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  pendingTitle: { color: "#6f5624", fontSize: 12, fontWeight: "800", marginBottom: 6 },
  pendingRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  pendingId: { flex: 1, color: "#6f5624", fontSize: 12, fontWeight: "700" },
  pendingAmount: { color: "#2a2a2a", fontSize: 12, fontWeight: "700", marginRight: 8 },
  pendingReviewBtn: { backgroundColor: "#8a5a16", borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  pendingReviewBtnText: { color: brand.white, fontWeight: "700", fontSize: 11 },
  rowVerifyBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 6, backgroundColor: brand.white, paddingVertical: 5, paddingHorizontal: 8 },
  rowVerifyBtnText: { color: brand.text, fontWeight: "700", fontSize: 10 },
  reviewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center", padding: 16 },
  reviewModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    backgroundColor: "#f8f8f8",
    padding: 12,
  },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  reviewImage: { width: "100%", height: 260, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#eee", marginBottom: 8 },
  reviewImageFallback: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  verifyBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, backgroundColor: "#111317" },
  verifyBtnText: { color: brand.white, textAlign: "center", fontWeight: "800", fontSize: 11 },
  cancelButton: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, paddingVertical: 12, borderRadius: 10 },
  cancelButtonText: { color: brand.dark, fontWeight: "900", fontSize: 11, textAlign: "center" },
  primaryAction: { flex: 1, borderRadius: 8, paddingVertical: 10, backgroundColor: "#5b31ff", marginLeft: 8 },
  primaryActionText: { color: brand.white, textAlign: "center", fontWeight: "800", fontSize: 11 },
  detailCloseBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    backgroundColor: brand.white,
    paddingVertical: 10,
    alignItems: "center",
  },
  detailCloseBtnText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },

  updateDisabledCard: { marginTop: 8, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: "#f5f5f5", padding: 12 },
  updateDisabledNote: { marginTop: 8, fontStyle: "italic", color: brand.textLight, fontSize: 12 },

  deniedWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 18, fontWeight: "900", color: brand.dark },
  deniedText: { marginTop: 6, color: brand.textLight, textAlign: "center" },
});
