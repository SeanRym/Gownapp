import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { MyOrderCard } from "../components/MyOrderCard";
import { MyReturnCard } from "../components/MyReturnCard";
import { useShop } from "../context/ShopContext";
import { confirmOrderReceipt, getOrdersByEmail } from "../services/orders";
import { getMyReturns } from "../services/returns";
import { brand } from "../theme/brand";
import { ONGOING_STATUSES, TERMINAL_STATUSES } from "../utils/myOrdersUi";

function TabBar({ tab, setTab, ongoingCount, completedCount, returnsCount }) {
  const tabs = [
    { key: "active", label: "ACTIVE", count: ongoingCount, alert: false },
    { key: "history", label: "HISTORY", count: completedCount, alert: false },
    { key: "returns", label: "RETURNS", count: returnsCount, alert: returnsCount > 0 },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map(({ key, label, count, alert }) => {
        const active = tab === key;
        return (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabPill, active && styles.tabPillActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {label}
              {count > 0 ? (
                <Text
                  style={[
                    styles.tabCount,
                    alert && styles.tabCountAlert,
                    active && !alert && styles.tabCountActive,
                  ]}
                >
                  {" "}({count})
                </Text>
              ) : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MyOrdersScreen({ navigation }) {
  const { user } = useShop();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("active");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const loadData = useCallback(async () => {
    if (!user?.email) {
      setOrders([]);
      setReturns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orderData, returnData] = await Promise.all([
        getOrdersByEmail(user.email, user.id),
        user?.id ? getMyReturns(user.id).catch(() => []) : Promise.resolve([]),
      ]);
      const list = orderData || [];
      setOrders(list);
      setReturns(returnData || []);
      setError("");
      const firstOngoing = list.find((o) => ONGOING_STATUSES.has(String(o?.status || "").toLowerCase()));
      setExpandedId((prev) => (prev != null ? prev : firstOngoing?.id ?? null));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id]);

  const onRefresh = useCallback(async () => {
    if (!user?.email) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const [orderData, returnData] = await Promise.all([
        getOrdersByEmail(user.email, user.id),
        user?.id ? getMyReturns(user.id).catch(() => []) : Promise.resolve([]),
      ]);
      setOrders(orderData || []);
      setReturns(returnData || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleConfirmReceipt = useCallback(
    async (order) => {
      if (!user?.id) {
        Alert.alert("Sign in required", "Please sign in first.");
        return;
      }
      Alert.alert("Confirm Receipt", "Are you sure you've received your order?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, I've received it",
          onPress: async () => {
            setConfirmingId(order.id);
            try {
              const res = await confirmOrderReceipt(order.id, user.id);
              if (!res?.ok) {
                Alert.alert("Confirm failed", res?.error || "Could not confirm receipt.");
                return;
              }
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === order.id ? { ...o, ...(res.order || {}), status: "completed" } : o
                )
              );
            } finally {
              setConfirmingId(null);
            }
          },
        },
      ]);
    },
    [user?.id]
  );

  const handleRequestReturn = useCallback(
    (order) => {
      if (!user?.id) {
        Alert.alert("Sign in required", "Please sign in to request a return.");
        return;
      }
      navigation.navigate("ReturnRequest", { order });
    },
    [navigation, user?.id]
  );

  if (!user?.email) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Please sign in to view your order history.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.btnText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  const ongoing = orders.filter((o) => ONGOING_STATUSES.has(String(o?.status || "").toLowerCase()));
  const completed = orders.filter((o) => TERMINAL_STATUSES.has(String(o?.status || "").toLowerCase()));
  const pendingPaymentCount = ongoing.filter(
    (o) => String(o?.status || "").toLowerCase() === "pending_payment"
  ).length;
  const pendingReturns = returns.filter((r) => r.status === "pending").length;
  const list = tab === "history" ? completed : tab === "active" ? ongoing : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>My Orders</Text>
      <Text style={styles.subtitle}>Track your orders and manage payment proofs.</Text>

      <TabBar
        tab={tab}
        setTab={setTab}
        ongoingCount={ongoing.length}
        completedCount={completed.length}
        returnsCount={pendingReturns}
      />

      {tab === "active" && pendingPaymentCount > 0 ? (
        <View style={styles.proofBanner}>
          <Text style={styles.proofBannerIcon}>⚠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.proofBannerTitle}>
              {pendingPaymentCount} order{pendingPaymentCount > 1 ? "s" : ""} awaiting payment proof
            </Text>
            <Text style={styles.proofBannerBody}>Upload within 24 hours to avoid cancellation.</Text>
          </View>
        </View>
      ) : null}

      {loading ? <Text style={styles.loadingText}>Loading your orders…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && tab === "returns" ? (
        returns.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No return requests</Text>
            <Text style={styles.emptySub}>
              Return and refund requests you submit will appear here.
            </Text>
          </View>
        ) : (
          returns.map((ret) => <MyReturnCard key={String(ret.id)} ret={ret} />)
        )
      ) : null}

      {!loading && !error && tab !== "returns" && list.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {tab === "active" ? "No active orders" : "No past orders yet"}
          </Text>
          <Text style={styles.emptySub}>
            {tab === "active"
              ? "Orders you place will appear here while in progress."
              : "Completed and cancelled orders will appear here."}
          </Text>
          {tab === "active" ? (
            <Pressable style={styles.btn} onPress={() => navigation.navigate("Gowns")}>
              <Text style={styles.btnText}>Browse collection</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {tab !== "returns"
        ? list.map((order) => (
            <MyOrderCard
              key={String(order.id)}
              order={order}
              expanded={expandedId === order.id}
              onToggle={() => setExpandedId((p) => (p === order.id ? null : order.id))}
              onConfirmReceipt={handleConfirmReceipt}
              onRequestReturn={handleRequestReturn}
              navigation={navigation}
              confirmingId={confirmingId}
            />
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  title: { fontSize: 30, fontWeight: "700", color: brand.dark, marginBottom: 4, fontStyle: "italic" },
  subtitle: { color: brand.textLight, marginBottom: 12, fontSize: 13 },
  hint: { color: brand.textLight, marginBottom: 12, textAlign: "center" },
  loadingText: { color: brand.textLight, letterSpacing: 1, marginBottom: 12 },
  error: { color: "#a82949", marginBottom: 8 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tabPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: brand.white,
  },
  tabPillActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  tabText: { textAlign: "center", fontWeight: "900", fontSize: 11, letterSpacing: 0.8, color: brand.dark },
  tabTextActive: { color: brand.white },
  tabCount: { fontWeight: "700" },
  tabCountActive: { color: brand.white },
  tabCountAlert: { color: "#856404" },
  proofBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#ffe08a",
    backgroundColor: "#fffdf5",
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
  },
  proofBannerIcon: { fontSize: 16, color: "#856404" },
  proofBannerTitle: { color: "#856404", fontWeight: "900", marginBottom: 2, fontSize: 13 },
  proofBannerBody: { color: "#856404", opacity: 0.85, fontSize: 12 },
  empty: { paddingVertical: 40, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: brand.dark },
  emptySub: { fontSize: 13, color: brand.textLight, textAlign: "center", lineHeight: 18 },
  btn: { marginTop: 12, backgroundColor: brand.button, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 4 },
  btnText: { color: brand.white, fontWeight: "700", textAlign: "center" },
});
