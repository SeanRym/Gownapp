import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AdminSecretGate } from "../components/AdminSecretGate";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAllOrdersAdmin } from "../services/orders";
import { getAllGownsAdmin } from "../services/gowns";
import { listUsersAdmin } from "../services/authLocal";
import { brand } from "../theme/brand";
import { loadStoredAdminSecret, saveAdminSecret, consumeAdminSecretChanged, isAdminSessionUnlocked, lockAdminSession, unlockAdminSession } from "../utils/adminCredentials";

export function AdminPanelScreen({ navigation }) {
  const { user } = useShop();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [gowns, setGowns] = useState([]);
  const [users, setUsers] = useState([]);
  const [secretReady, setSecretReady] = useState(() => isAdminSessionUnlocked());
  const loadDataRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersData, gownsData, usersData] = await Promise.all([
        getAllOrdersAdmin(),
        getAllGownsAdmin(),
        listUsersAdmin(),
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setGowns(Array.isArray(gownsData) ? gownsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (e) {
      console.warn("AdminPanel loadData", e?.message || e);
      setOrders([]);
      setGowns([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  loadDataRef.current = loadData;

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        if (!active) return;

        if (consumeAdminSecretChanged()) {
          unlockAdminSession();
          await loadStoredAdminSecret();
          setSecretReady(true);
          loadDataRef.current?.();
          return;
        }

        if (isAdminSessionUnlocked()) {
          await loadStoredAdminSecret();
          setSecretReady(true);
          loadDataRef.current?.();
          return;
        }

        setSecretReady(false);
        setLoading(false);
      })();

      return () => {
        active = false;
      };
    }, [])
  );

  const handleSecretSuccess = useCallback(() => {
    unlockAdminSession();
    setSecretReady(true);
    loadDataRef.current?.();
  }, []);

  const handleChangeSecret = useCallback(() => {
    navigation.navigate("AdminChangeSecret");
  }, [navigation]);

  const snapshot = useMemo(() => {
    const metrics = {
      totalRevenue: 0,
      totalOrders: 0,
      inProgress: 0,
      completed: 0,
      awaitingPayment: 0,
      productsListed: gowns.filter((g) => !Boolean(g?.archived)).length,
      staffCount: users.filter((u) => String(u?.role || "") !== "customer").length,
    };
    for (const o of orders) {
      const status = String(o?.status || "").toLowerCase();
      const total = Number(o?.total || o?.subtotal || 0);
      metrics.totalOrders += 1;
      if (!["cancelled", "refunded"].includes(status)) {
        metrics.totalRevenue += Number.isFinite(total) ? total : 0;
      }
      if (status === "placed" || status === "pending_payment") metrics.awaitingPayment += 1;
      if (status === "completed") metrics.completed += 1;
      if (status === "processing" || status === "shipped" || status === "paid") metrics.inProgress += 1;
    }
    return metrics;
  }, [gowns, orders, users]);

  const adminCards = [
    {
      key: "products",
      title: "Products",
      desc: "Add, edit, or remove listings.",
      route: "AdminGowns",
      allowed: canAccess(user, "admin_gowns"),
    },
    {
      key: "orders",
      title: "Orders",
      desc: "View and manage all orders.",
      route: "AdminOrders",
      allowed: canAccess(user, "admin_orders"),
    },
    {
      key: "returns",
      title: "Returns",
      desc: "Manage return requests.",
      route: "AdminReturns",
      allowed: canAccess(user, "admin_orders"),
    },
    {
      key: "sales",
      title: "Sales dashboard",
      desc: "Review charts and analytics.",
      route: "AdminStats",
      allowed: canAccess(user, "admin_stats"),
    },
    {
      key: "users",
      title: "Users",
      desc: "View registered accounts.",
      route: "AdminUsers",
      allowed: canAccess(user, "admin_users"),
    },
    {
      key: "audit",
      title: "Audit trail",
      desc: "Append-only log of admin mutations.",
      route: "AdminAudit",
      allowed: canAccess(user, "admin_audit"),
    },
    {
      key: "clear-secret",
      title: "Clear secret",
      desc: "Require the admin secret again on this device.",
      action: "clearSecret",
      allowed: true,
    },
  ];

  const onClearSecret = () => {
    Alert.alert(
      "Clear admin secret",
      "You will need to enter the admin secret again before using the dashboard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear secret",
          style: "destructive",
          onPress: async () => {
            await saveAdminSecret("");
            lockAdminSession();
            setSecretReady(false);
          },
        },
      ]
    );
  };

  const kpis = [
    { label: "Total revenue", value: `P${Number(snapshot.totalRevenue).toLocaleString("en-PH")}` },
    { label: "Total orders", value: String(snapshot.totalOrders) },
    { label: "In progress", value: String(snapshot.inProgress) },
    { label: "Completed", value: String(snapshot.completed) },
    { label: "Awaiting payment", value: String(snapshot.awaitingPayment) },
    { label: "Products listed", value: String(snapshot.productsListed) },
  ];

  if (!secretReady) {
    return (
      <AdminSecretGate
        onSuccess={handleSecretSuccess}
        onChangeSecret={handleChangeSecret}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Signed in as {user?.email || "-"}</Text>

      <View style={styles.snapshotCard}>
        <Text style={styles.snapshotLabel}>SNAPSHOT</Text>
        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.label} style={styles.kpiItem}>
              <Text style={styles.kpiValue}>{loading ? "..." : k.value}</Text>
              <Text style={styles.kpiText}>{k.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.quickGrid}>
        {adminCards
          .filter((card) => card.allowed)
          .map((card) => (
            <Pressable
              key={card.key}
              style={styles.quickCard}
              onPress={() => {
                if (card.action === "clearSecret") {
                  onClearSecret();
                  return;
                }
                if (!card.route) {
                  Alert.alert("Coming soon", "Content editor is not added yet.");
                  return;
                }
                navigation.navigate(card.route);
              }}
            >
              <Text style={styles.quickTitle}>{card.title}</Text>
              <Text style={styles.quickText}>{card.desc}</Text>
            </Pressable>
          ))}
      </View>

      {!adminCards.some((x) => x.allowed) ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No admin tools available for your role.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 36, fontWeight: "700", color: "#202020", fontStyle: "italic" },
  subtitle: { color: "#8a8a8a", fontSize: 12, marginTop: 4, marginBottom: 12 },
  snapshotCard: { borderWidth: 1, borderColor: "#e2e2e2", borderRadius: 10, backgroundColor: brand.white, padding: 12 },
  snapshotLabel: { color: "#9b9b9b", fontSize: 10, letterSpacing: 1.1, marginBottom: 8 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiItem: { minWidth: 82 },
  kpiValue: { color: "#1f1f1f", fontWeight: "800", fontSize: 24 },
  kpiText: { color: "#7f7f7f", fontSize: 11, marginTop: 2 },
  quickGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickCard: { width: 125, minHeight: 92, borderWidth: 1, borderColor: "#e2e2e2", borderRadius: 10, backgroundColor: brand.white, padding: 10 },
  quickTitle: { color: "#202020", fontWeight: "700", fontSize: 13, marginBottom: 4 },
  quickText: { color: "#848484", fontSize: 11, lineHeight: 15 },
  emptyWrap: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white },
  emptyText: { color: brand.textLight, textAlign: "center", fontWeight: "800", fontSize: 12 },
});
