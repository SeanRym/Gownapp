import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { getMyReturns } from "../services/returns";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";

function pretty(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function badgeTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return { bg: "#fff3cd", fg: "#856404" };
  if (s === "approved") return { bg: "#d4edda", fg: "#155724" };
  if (s === "rejected") return { bg: "#f8d7da", fg: "#721c24" };
  if (s === "completed") return { bg: "#d4edda", fg: "#155724" };
  if (s === "cancelled") return { bg: "#e2e3e5", fg: "#383d41" };
  return { bg: "#eee5e8", fg: "#4d3c42" };
}

export function MyReturnsScreen({ navigation }) {
  const { user } = useShop();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await getMyReturns(user.id);
      setItems(data);
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load returns.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const data = await getMyReturns(user.id);
      setItems(data);
      setError("");
    } catch (e) {
      Alert.alert("Refresh failed", e?.message || "Unable to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  if (!user?.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Please sign in to view returns.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.btnText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Returns</Text>
          <Text style={styles.hint}>Track your return/refund/exchange requests.</Text>
        </View>
      </View>

      {loading ? <Text style={styles.hint}>Loading...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && !error && !items.length ? (
        <Text style={styles.hint}>No return requests yet.</Text>
      ) : null}

      {items.map((r) => {
        const tone = badgeTone(r.status);
        return (
          <View key={String(r.id)} style={styles.card}>
            <View style={styles.topRow}>
              <Text style={styles.cardTitle}>
                {pretty(r.type)} • Order #{r.orderNumber || r.orderId}
              </Text>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.badgeText, { color: tone.fg }]}>{pretty(r.status)}</Text>
              </View>
            </View>
            <Text style={styles.meta}>{formatDateTimePH(r.createdAt)}</Text>
            <Text style={styles.meta}>Reason: {r.reason}</Text>
            {r.adminNote ? <Text style={styles.note}>Admin: {r.adminNote}</Text> : null}
            {r.refundAmount != null ? (
              <Text style={styles.note}>Refund: P{Number(r.refundAmount).toLocaleString("en-PH")}</Text>
            ) : null}
            {Array.isArray(r.evidenceUrls) && r.evidenceUrls.length ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.meta}>Evidence</Text>
                {r.evidenceUrls.map((f, idx) => (
                  <Pressable key={`${String(r.id)}-ev-${idx}`} onPress={() => Linking.openURL(String(f.url))}>
                    <Text style={styles.link} numberOfLines={1}>
                      {f.name || `File ${idx + 1}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  title: { fontSize: 30, fontWeight: "700", color: brand.dark, fontStyle: "italic" },
  hint: { color: brand.textLight, marginTop: 4 },
  error: { color: "#a82949" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  card: { borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 12, backgroundColor: brand.white },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { color: brand.dark, fontWeight: "900", flex: 1 },
  meta: { color: brand.textLight, marginTop: 4, fontSize: 12 },
  note: { color: brand.text, marginTop: 6, fontSize: 12, fontStyle: "italic" },
  link: { color: brand.buttonAlt, fontWeight: "800", marginTop: 6 },
  badge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },
  btn: { marginTop: 8, backgroundColor: brand.button, paddingVertical: 12, paddingHorizontal: 20 },
  btnText: { color: brand.white, fontWeight: "700" },
});

