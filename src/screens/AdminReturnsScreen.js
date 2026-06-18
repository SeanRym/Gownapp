import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAllReturnsAdmin, updateReturnAdmin } from "../services/returns";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";

function pretty(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function money(n) {
  return `P${Number(n || 0).toLocaleString("en-PH")}`;
}

const STATUS_FILTERS = ["all", "pending", "approved", "rejected", "completed", "cancelled"];

export function AdminReturnsScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_orders"); // reuse orders perm
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [actionModal, setActionModal] = useState(null); // { row, action }
  const [adminNote, setAdminNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = statusFilter === "all" ? "" : statusFilter;
      const data = await getAllReturnsAdmin(status);
      setRows(data);
    } catch (e) {
      Alert.alert("Load failed", e?.message || "Could not load returns.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      if (allowed) load();
    }, [allowed, load])
  );

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => {
        if (!q) return true;
        const hay = [
          r?.orderNumber,
          r?.customerEmail,
          r?.customerName,
          r?.reason,
          r?.type,
          r?.status,
        ]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  }, [query, rows]);

  const openAction = (row, action) => {
    setActionModal({ row, action });
    setAdminNote(String(row?.adminNote || ""));
    setRefundAmount(row?.refundAmount != null ? String(row.refundAmount) : "");
  };

  const submitAction = async () => {
    const row = actionModal?.row;
    const action = actionModal?.action;
    if (!row?.id || !action) return;
    try {
      await updateReturnAdmin(row.id, {
        action,
        adminNote,
        refundAmount: refundAmount ? Number(refundAmount) : null,
      });
      setActionModal(null);
      setAdminNote("");
      setRefundAmount("");
      load();
    } catch (e) {
      Alert.alert("Update failed", e?.message || "Could not update return.");
    }
  };

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.meta}>You don’t have permission to manage returns.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Returns</Text>
          <Text style={styles.meta}>Approve, reject, complete, or cancel requests.</Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={load}>
          <Text style={styles.refreshBtnText}>{loading ? "..." : "Refresh"}</Text>
        </Pressable>
      </View>

      <View style={styles.searchCard}>
        <TextInput
          style={styles.input}
          placeholder="Search by order, customer, reason..."
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((s) => (
            <Pressable
              key={s}
              style={[styles.filterPill, statusFilter === s ? styles.filterPillActive : null]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={statusFilter === s ? styles.filterPillTextActive : styles.filterPillText}>
                {pretty(s)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? <Text style={styles.meta}>Loading returns...</Text> : null}
      {!loading && !filtered.length ? <Text style={styles.meta}>No return requests found.</Text> : null}

      {filtered.map((r) => {
        const actions =
          r.status === "pending"
            ? ["approve", "reject"]
            : r.status === "approved"
              ? ["complete", "reject", "cancel"]
              : [];
        return (
          <View key={String(r.id)} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {pretty(r.type)} • {r.orderNumber || r.orderId}
              </Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pretty(r.status)}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {r.customerName || r.customerEmail || "Customer"} • {formatDateTimePH(r.createdAt)}
            </Text>
            <Text style={styles.meta}>Reason: {r.reason}</Text>
            {r.details ? <Text style={styles.note}>“{r.details}”</Text> : null}
            {r.refundAmount != null ? <Text style={styles.note}>Refund: {money(r.refundAmount)}</Text> : null}
            {r.adminNote ? <Text style={styles.note}>Admin: {r.adminNote}</Text> : null}
            {Array.isArray(r.evidenceUrls) && r.evidenceUrls.length ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.note}>Evidence ({r.evidenceUrls.length})</Text>
                {r.evidenceUrls.slice(0, 5).map((f, idx) => (
                  <Pressable key={`${r.id}-ev-${idx}`} onPress={() => Linking.openURL(String(f.url))}>
                    <Text style={styles.link} numberOfLines={1}>
                      {f.name || `File ${idx + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {actions.length ? (
              <View style={styles.actionRow}>
                {actions.map((a) => (
                  <Pressable
                    key={`${r.id}-${a}`}
                    style={[styles.actionBtn, ["reject", "cancel"].includes(a) ? styles.actionDanger : null]}
                    onPress={() => openAction(r, a)}
                  >
                    <Text style={styles.actionText}>{pretty(a)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <Modal visible={Boolean(actionModal)} transparent animationType="fade" onRequestClose={() => setActionModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{pretty(actionModal?.action)} return</Text>
            <Text style={styles.meta}>
              Order {actionModal?.row?.orderNumber || actionModal?.row?.orderId}
            </Text>
            <Text style={[styles.meta, { marginTop: 10 }]}>Admin note (optional)</Text>
            <TextInput style={[styles.input, { marginTop: 6 }]} value={adminNote} onChangeText={setAdminNote} />
            {actionModal?.action === "complete" ? (
              <>
                <Text style={[styles.meta, { marginTop: 10 }]}>Refund amount (optional)</Text>
                <TextInput
                  style={[styles.input, { marginTop: 6 }]}
                  value={refundAmount}
                  onChangeText={setRefundAmount}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setActionModal(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={submitAction}>
                <Text style={styles.primaryText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  title: { fontSize: 28, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  meta: { color: brand.textLight, marginTop: 4 },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refreshBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: brand.white },
  refreshBtnText: { color: brand.dark, fontWeight: "800" },

  searchCard: { borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 12, backgroundColor: brand.white },
  input: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, padding: 10, backgroundColor: brand.white },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  filterPill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  filterPillActive: { backgroundColor: "#f5eadc", borderColor: "#d9bda9" },
  filterPillText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  filterPillTextActive: { color: brand.dark, fontWeight: "900", fontSize: 12 },

  card: { borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 12, backgroundColor: brand.white },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: brand.dark, fontWeight: "900", flex: 1 },
  note: { color: brand.text, marginTop: 6, fontSize: 12, fontStyle: "italic" },
  badge: { backgroundColor: "#eee5e8", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { color: "#4d3c42", fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },
  link: { color: brand.buttonAlt, fontWeight: "900", marginTop: 6 },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actionBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  actionDanger: { borderColor: "#e4a4b1", backgroundColor: "#fff5f7" },
  actionText: { color: brand.dark, fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: brand.white, borderRadius: 12, padding: 14 },
  modalTitle: { color: brand.dark, fontWeight: "900", fontSize: 16 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  primaryBtn: { backgroundColor: brand.button, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  primaryText: { color: brand.white, fontWeight: "900" },
  ghostBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: brand.white },
  ghostText: { color: brand.textLight, fontWeight: "900" },
});

