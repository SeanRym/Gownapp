import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAllOrdersAdmin } from "../services/orders";
import { getAllGownsAdmin } from "../services/gowns";
import { deleteUserAdmin, listUsersAdmin } from "../services/authLocal";
import { brand } from "../theme/brand";
import { loadStoredAdminSecret, pingAdminApi, saveAdminSecret } from "../utils/adminCredentials";

export function AdminPanelScreen({ navigation }) {
  const { user, logout } = useShop();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [gowns, setGowns] = useState([]);
  const [users, setUsers] = useState([]);
  const [adminLive, setAdminLive] = useState(null);
  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [secretDraft, setSecretDraft] = useState("");

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
    const ping = await pingAdminApi();
    setAdminLive(ping.ok);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      // Match web dashboard snapshot logic:
      // - Revenue excludes cancelled/refunded
      // - Awaiting payment includes placed + pending_payment
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
      key: "catalogue",
      title: "Catalogue",
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
      key: "content",
      title: "Content",
      desc: "Edit homepage slides, copy, and theme.",
      route: null,
      allowed: true,
    },
  ];

  const onResetUsers = () => {
    Alert.alert("Reset all users", "Delete all user accounts and log everyone out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset users",
        style: "destructive",
        onPress: async () => {
          try {
            const allUsers = await listUsersAdmin();
            for (const u of allUsers) {
              await deleteUserAdmin({ email: u?.email });
            }
            await logout();
            Alert.alert("Done", "All user accounts were removed.");
          } catch (e) {
            Alert.alert("Reset failed", e.message || "Could not reset users.");
          }
        },
      },
    ]);
  };

  const kpis = [
    { label: "Total revenue", value: `P${Number(snapshot.totalRevenue).toLocaleString("en-PH")}` },
    { label: "Total orders", value: String(snapshot.totalOrders) },
    { label: "In progress", value: String(snapshot.inProgress) },
    { label: "Completed", value: String(snapshot.completed) },
    { label: "Awaiting payment", value: String(snapshot.awaitingPayment) },
    { label: "Products listed", value: String(snapshot.productsListed) },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Signed in as {user?.email || "-"}</Text>

      {adminLive === false ? (
        <Pressable
          style={styles.syncBanner}
          onPress={() => {
            setSecretDraft("");
            setSecretModalOpen(true);
          }}
        >
          <Text style={styles.syncBannerTitle}>Live data not loading</Text>
          <Text style={styles.syncBannerText}>
            The admin secret on this device must match the one your deployed site uses (same as when you sign into the
            web admin). Tap to enter it — no need to run npm run dev.
          </Text>
        </Pressable>
      ) : null}

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

      <Text style={styles.dangerLabel}>DANGER ZONE</Text>
      <View style={styles.dangerCard}>
        <View style={styles.dangerLeft}>
          <Text style={styles.dangerTitle}>Reset all users</Text>
          <Text style={styles.dangerText}>Deletes all device-stored accounts and logs everyone out.</Text>
        </View>
        <Pressable style={styles.resetBtn} onPress={onResetUsers}>
          <Text style={styles.resetBtnText}>Reset users</Text>
        </Pressable>
      </View>

      {!adminCards.some((x) => x.allowed) ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No admin tools available for your role.</Text>
        </View>
      ) : null}

      <Modal visible={secretModalOpen} animationType="fade" transparent onRequestClose={() => setSecretModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Admin secret</Text>
            <Text style={styles.modalHint}>
              Use the exact same secret as your live site (DigitalOcean app env{" "}
              <Text style={{ fontWeight: "700" }}>ADMIN_SECRET</Text>). You can also copy it from what you typed in the
              browser admin login.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Paste admin secret"
              placeholderTextColor="#aaa"
              value={secretDraft}
              onChangeText={setSecretDraft}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setSecretModalOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSave}
                onPress={async () => {
                  await saveAdminSecret(secretDraft);
                  await loadStoredAdminSecret();
                  setSecretModalOpen(false);
                  await loadData();
                }}
              >
                <Text style={styles.modalSaveText}>Save & reload</Text>
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
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 36, fontWeight: "700", color: "#202020", fontStyle: "italic" },
  subtitle: { color: "#8a8a8a", fontSize: 12, marginTop: 4, marginBottom: 12 },

  syncBanner: {
    borderWidth: 1,
    borderColor: "#e8d4a8",
    backgroundColor: "#fffbf0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  syncBannerTitle: { color: "#7a5200", fontWeight: "800", fontSize: 14, marginBottom: 4 },
  syncBannerText: { color: "#6a5a40", fontSize: 12, lineHeight: 17 },

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
  dangerLabel: { color: "#9b7b4a", fontSize: 10, letterSpacing: 1, marginTop: 20, marginBottom: 8, fontWeight: "700" },
  dangerCard: {
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 10,
    backgroundColor: brand.white,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dangerLeft: { flex: 1 },
  dangerTitle: { color: "#202020", fontSize: 13, fontWeight: "700", marginBottom: 2 },
  dangerText: { color: "#8b8b8b", fontSize: 11 },
  resetBtn: { backgroundColor: "#ffecef", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  resetBtnText: { color: "#a33d54", fontWeight: "700", fontSize: 11 },

  emptyWrap: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white },
  emptyText: { color: brand.textLight, textAlign: "center", fontWeight: "800", fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: brand.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e2e2",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#202020", marginBottom: 8 },
  modalHint: { fontSize: 12, color: "#666", lineHeight: 17, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#202020",
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { color: "#666", fontWeight: "700", fontSize: 14 },
  modalSave: { backgroundColor: "#4a2c82", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalSaveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

