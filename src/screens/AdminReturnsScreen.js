import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AdminReturnDrawer } from "../components/AdminReturnDrawer";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAllReturnsAdmin, updateReturnAdmin } from "../services/returns";
import { brand } from "../theme/brand";
import {
  STATUS_META,
  TYPE_META,
  computeReturnStats,
  filterReturns,
  fmtPhp,
  fmtRelative,
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

export function AdminReturnsScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_orders");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [query, setQuery] = useState("");
  const [drawerRet, setDrawerRet] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllReturnsAdmin("");
      setRows(data);
    } catch (e) {
      Alert.alert("Load failed", e?.message || "Could not load returns.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) load();
    }, [allowed, load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getAllReturnsAdmin("");
      setRows(data);
    } catch (e) {
      Alert.alert("Refresh failed", e?.message || "Could not refresh returns.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const stats = useMemo(() => computeReturnStats(rows), [rows]);

  const filtered = useMemo(
    () =>
      filterReturns(rows, { search: query, filterStatus, filterType }).sort(
        (a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
      ),
    [rows, query, filterStatus, filterType]
  );

  const pendingReturns = useMemo(
    () => rows.filter((r) => r.status === "pending"),
    [rows]
  );

  const handleAction = useCallback(
    async (returnId, action, payload = {}) => {
      const prevRows = rows;
      const prevDrawer = drawerRet;

      try {
        await updateReturnAdmin(returnId, {
          action,
          adminNote: payload.adminNote,
          refundAmount: payload.refundAmount,
        });

        const STATUS_MAP = {
          approve: "approved",
          reject: "rejected",
          complete: "completed",
          cancel: "cancelled",
        };
        const newStatus = STATUS_MAP[action];

        const patch = (r) =>
          r.id !== returnId
            ? r
            : {
                ...r,
                status: newStatus,
                adminNote: payload.adminNote || r.adminNote,
                refundAmount: payload.refundAmount != null ? payload.refundAmount : r.refundAmount,
                resolvedAt: new Date().toISOString(),
              };

        setRows((p) => p.map(patch));
        setDrawerRet((p) => (p?.id === returnId ? patch(p) : p));

        const labels = {
          approve: "approved",
          reject: "rejected",
          complete: "completed",
          cancel: "cancelled",
        };
        Alert.alert(
          "Updated",
          `Request ${labels[action]} — customer notified`,
          [{ text: "OK" }]
        );
      } catch (e) {
        setRows(prevRows);
        setDrawerRet(prevDrawer);
        throw e;
      }
    },
    [rows, drawerRet]
  );

  const refreshDrawer = useCallback(async () => {
    const data = await getAllReturnsAdmin("");
    setRows(data);
    setDrawerRet((prev) => (prev ? data.find((r) => r.id === prev.id) ?? prev : prev));
  }, []);

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.meta}>You don't have permission to manage returns.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Returns & Refunds</Text>
            <Text style={styles.meta}>Review and process return, refund, and exchange requests.</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={load}>
            <Text style={styles.refreshBtnText}>{loading ? "..." : "↻ Refresh"}</Text>
          </Pressable>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{stats.total}</Text>
            <Text style={styles.kpiLabel}>Total requests</Text>
          </View>
          <View style={[styles.kpiCard, stats.pending > 0 && styles.kpiWarn]}>
            <Text style={styles.kpiValue}>{stats.pending}</Text>
            <Text style={styles.kpiLabel}>Pending review</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{stats.approved}</Text>
            <Text style={styles.kpiLabel}>Approved</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{stats.completed}</Text>
            <Text style={styles.kpiLabel}>Completed</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{fmtPhp(stats.refunds)}</Text>
            <Text style={styles.kpiLabel}>Refunds issued</Text>
          </View>
        </View>

        {pendingReturns.length > 0 ? (
          <View style={styles.pendingWrap}>
            <Text style={styles.pendingTitle}>
              ⚠ {pendingReturns.length} request{pendingReturns.length > 1 ? "s" : ""} awaiting review
            </Text>
            {pendingReturns.slice(0, 4).map((r) => (
              <View key={String(r.id)} style={styles.pendingRow}>
                <Text style={styles.pendingName} numberOfLines={1}>
                  {r.orderNumber} · {r.customerName}
                </Text>
                <StatusBadge status={r.type} type="type" />
                <Pressable style={styles.pendingReviewBtn} onPress={() => setDrawerRet(r)}>
                  <Text style={styles.pendingReviewBtnText}>Review</Text>
                </Pressable>
              </View>
            ))}
            {pendingReturns.length > 4 ? (
              <Text style={styles.pendingMore}>+{pendingReturns.length - 4} more — use Pending filter</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.searchCard}>
          <TextInput
            style={styles.input}
            placeholder="Search by order no., name, or email…"
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              <Pressable
                style={[styles.filterPill, !filterStatus && styles.filterPillActive]}
                onPress={() => setFilterStatus("")}
              >
                <Text style={!filterStatus ? styles.filterPillTextActive : styles.filterPillText}>All</Text>
              </Pressable>
              {Object.entries(STATUS_META).map(([key, m]) => (
                <Pressable
                  key={key}
                  style={[styles.filterPill, filterStatus === key && styles.filterPillActive]}
                  onPress={() => setFilterStatus(filterStatus === key ? "" : key)}
                >
                  <Text style={filterStatus === key ? styles.filterPillTextActive : styles.filterPillText}>
                    {m.label}
                    {key === "pending" && stats.pending > 0 ? ` (${stats.pending})` : ""}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.filterDivider} />
              {Object.entries(TYPE_META).map(([key, m]) => (
                <Pressable
                  key={`type-${key}`}
                  style={[styles.filterPill, filterType === key && styles.filterPillActive]}
                  onPress={() => setFilterType(filterType === key ? "" : key)}
                >
                  <Text style={filterType === key ? styles.filterPillTextActive : styles.filterPillText}>
                    {m.icon} {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {loading ? <Text style={styles.meta}>Loading returns…</Text> : null}
        {!loading && !filtered.length ? <Text style={styles.meta}>No return requests found.</Text> : null}

        {!loading && filtered.length > 0 ? (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHead, styles.colOrder]}>ORDER</Text>
              <Text style={[styles.tableHead, styles.colCustomer]}>CUSTOMER</Text>
              <Text style={[styles.tableHead, styles.colType]}>TYPE</Text>
              <Text style={[styles.tableHead, styles.colStatus]}>STATUS</Text>
            </View>

            {filtered.map((r) => (
              <Pressable key={String(r.id)} style={styles.rowCard} onPress={() => setDrawerRet(r)}>
                <View style={styles.rowTop}>
                  <View style={styles.colOrder}>
                    <Text style={styles.orderNum} numberOfLines={1}>
                      {r.orderNumber}
                    </Text>
                    <View style={styles.rowBadges}>
                      {r.status === "pending" ? (
                        <Text style={styles.newBadge}>NEW</Text>
                      ) : null}
                      {Array.isArray(r.evidenceUrls) && r.evidenceUrls.length > 0 ? (
                        <Text style={styles.evidenceBadge}>📎 {r.evidenceUrls.length}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.colType}>
                    <StatusBadge status={r.type} type="type" />
                  </View>
                  <View style={styles.colStatus}>
                    <StatusBadge status={r.status} />
                  </View>
                </View>
                <Text style={styles.customerName} numberOfLines={1}>
                  {r.customerName || "Customer"}
                </Text>
                <Text style={styles.customerReason} numberOfLines={1}>
                  {r.reason}
                </Text>
                <View style={styles.rowBottom}>
                  <Text style={styles.itemsCount}>
                    {(r.items || []).length} item{(r.items || []).length !== 1 ? "s" : ""}
                  </Text>
                  <Text style={styles.submittedAt}>{fmtRelative(r.createdAt)}</Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      <AdminReturnDrawer
        ret={drawerRet}
        visible={Boolean(drawerRet)}
        onClose={() => setDrawerRet(null)}
        onAction={handleAction}
        onRefresh={refreshDrawer}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  title: { fontSize: 28, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  meta: { color: brand.textLight, marginTop: 4 },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  refreshBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: brand.white,
  },
  refreshBtnText: { color: brand.dark, fontWeight: "800", fontSize: 12 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    width: "31%",
    minWidth: 100,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: brand.white,
  },
  kpiWarn: { borderColor: "#ffe08a", backgroundColor: "#fffdf5" },
  kpiValue: { fontSize: 22, fontWeight: "900", color: brand.dark },
  kpiLabel: { fontSize: 10, color: brand.textLight, marginTop: 4, letterSpacing: 0.5 },

  pendingWrap: {
    borderWidth: 1,
    borderColor: "#ffe08a",
    backgroundColor: "#fffdf5",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  pendingTitle: { color: "#856404", fontWeight: "900", fontSize: 13 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pendingName: { flex: 1, fontSize: 12, color: brand.dark },
  pendingReviewBtn: {
    backgroundColor: "#856404",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  pendingReviewBtnText: { color: brand.white, fontWeight: "800", fontSize: 11 },
  pendingMore: { fontSize: 12, color: brand.textLight },

  searchCard: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: brand.white,
  },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: brand.white,
    fontSize: 14,
  },
  filterScroll: { marginTop: 10 },
  filterRow: { flexDirection: "row", gap: 8, paddingRight: 8 },
  filterDivider: { width: 1, height: 20, backgroundColor: brand.border, alignSelf: "center" },
  filterPill: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  filterPillActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  filterPillText: { color: brand.textLight, fontWeight: "700", fontSize: 11 },
  filterPillTextActive: { color: brand.white, fontWeight: "900", fontSize: 11 },

  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  tableHead: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: brand.textLight },
  colOrder: { flex: 1.2 },
  colCustomer: { flex: 1.5 },
  colType: { width: 90 },
  colStatus: { width: 90 },

  rowCard: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: brand.white,
    marginBottom: 8,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  orderNum: { fontSize: 13, fontWeight: "800", color: brand.dark },
  rowBadges: { flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap" },
  newBadge: {
    fontSize: 9,
    backgroundColor: "#fff3cd",
    color: "#856404",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "800",
    overflow: "hidden",
  },
  evidenceBadge: {
    fontSize: 9,
    backgroundColor: "#e8f0ff",
    color: "#2d5be3",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "700",
  },
  customerName: { fontSize: 14, fontWeight: "700", color: brand.dark },
  customerReason: { fontSize: 12, color: brand.textLight, marginTop: 2 },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  itemsCount: { fontSize: 11, color: brand.textLight },
  submittedAt: { fontSize: 11, color: brand.textLight },

  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
});
