import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useShop } from "../context/ShopContext";
import { uploadReturnEvidence, submitReturnRequest } from "../services/returns";
import { brand } from "../theme/brand";

const REQUEST_TYPES = [
  { id: "return", label: "Return", desc: "Send item(s) back to the boutique." },
  { id: "refund", label: "Refund", desc: "Request your money back." },
  { id: "exchange", label: "Exchange", desc: "Swap for a different size or style." },
];

const REASONS = [
  "Item is defective or damaged",
  "Item differs significantly from description",
  "Wrong size received",
  "Wrong item received",
  "Other",
];

function pretty(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function ReturnRequestScreen({ route, navigation }) {
  const { user } = useShop();
  const { order } = route.params || {};
  const [type, setType] = useState("return");
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [evidence, setEvidence] = useState([]); // { url, name, type }

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order?.items]);
  const orderId = String(order?.id || order?.orderId || order?.orderNumber || "");

  const canSubmit = Boolean(user?.id && orderId && selected.size > 0 && !submitting && !uploading);

  // Default: select all items like web
  useMemo(() => {
    if (selected.size === 0 && items.length) {
      setSelected(new Set(items.map((_, i) => i)));
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const toggleItem = useCallback((idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const pickEvidence = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Please sign in first.");
      return;
    }
    if (evidence.length >= 5) {
      Alert.alert("Limit reached", "You can attach up to 5 files.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo library access to upload evidence.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: false,
      quality: 0.9,
      videoMaxDuration: 25,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      const uploaded = await uploadReturnEvidence(user.id, [
        {
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          type: asset.mimeType,
        },
      ]);
      setEvidence((prev) => [...prev, ...uploaded].slice(0, 5));
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Could not upload evidence.");
    } finally {
      setUploading(false);
    }
  }, [evidence.length, user?.id]);

  const removeEvidence = useCallback((idx) => {
    setEvidence((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Please sign in first.");
      return;
    }
    if (!orderId) {
      Alert.alert("Missing order", "Order not found.");
      return;
    }
    if (!selected.size) {
      Alert.alert("Select items", "Please select at least one item to return.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        orderId,
        type,
        reason,
        details,
        items: items
          .map((it, idx) => ({ it, idx }))
          .filter(({ idx }) => selected.has(idx))
          .map(({ it }) => ({
            gownId: it?.id || null,
            name: it?.name || "Item",
            qty: Number(it?.qty || 1),
            size: it?.size || "",
          })),
        evidenceUrls: evidence,
      };
      await submitReturnRequest(user.id, payload);
      setDone(true);
      setTimeout(() => navigation.replace("MyReturns"), 900);
    } catch (e) {
      Alert.alert("Submit failed", e?.message || "Could not submit return request.");
    } finally {
      setSubmitting(false);
    }
  }, [details, evidence, items, navigation, orderId, reason, selected, type, user?.id]);

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Order not found.</Text>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.center}>
        <View style={styles.doneBadge}>
          <Text style={styles.doneBadgeText}>✓</Text>
        </View>
        <Text style={styles.doneTitle}>Request submitted</Text>
        <Text style={styles.footerHint}>You can track it in Returns.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Request a return</Text>
      <Text style={styles.hint}>Order #{order?.orderNumber || order?.id}</Text>

      <View style={styles.policyBox}>
        <Text style={styles.policyText}>
          <Text style={{ fontWeight: "900" }}>Policy:</Text> Returns accepted within 48 hours of order completion for defective or significantly different items. Items must be unworn, unaltered, with tags attached.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Request type</Text>
        <View style={styles.pillRow}>
          {REQUEST_TYPES.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.pill, type === t.id ? styles.pillOn : null]}
              onPress={() => setType(t.id)}
            >
              <Text style={type === t.id ? styles.pillTextOn : styles.pillText}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.meta}>{REQUEST_TYPES.find((x) => x.id === type)?.desc}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reason</Text>
        <View style={styles.pillRow}>
          {REASONS.map((r) => (
            <Pressable
              key={r}
              style={[styles.pillSmall, reason === r ? styles.pillOn : null]}
              onPress={() => setReason(r)}
            >
              <Text style={reason === r ? styles.pillTextOn : styles.pillText}>{pretty(r)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.cardTitle, { marginTop: 12 }]}>Details (optional)</Text>
        <TextInput
          style={[styles.input, { height: 92 }]}
          value={details}
          onChangeText={setDetails}
          placeholder="Add extra context…"
          multiline
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Select items</Text>
        {items.map((it, idx) => {
          const on = selected.has(idx);
          return (
            <Pressable key={`${orderId}-it-${idx}`} style={styles.itemRow} onPress={() => toggleItem(idx)}>
              <View style={[styles.checkbox, on ? styles.checkboxOn : null]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it?.name || "Item"}</Text>
                <Text style={styles.meta}>Qty {it?.qty || 1}{it?.size ? ` • Size ${it.size}` : ""}</Text>
              </View>
            </Pressable>
          );
        })}
        {!items.length ? <Text style={styles.meta}>No items found.</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.evidenceHeader}>
          <Text style={styles.cardTitle}>Evidence (optional)</Text>
          <Text style={styles.meta}>Max 5</Text>
        </View>
        <Pressable style={[styles.secondaryBtn, uploading ? styles.btnDisabled : null]} onPress={pickEvidence} disabled={uploading}>
          <Text style={styles.secondaryText}>{uploading ? "Uploading..." : "Add photo/video"}</Text>
        </Pressable>

        {evidence.length ? (
          <View style={styles.evidenceGrid}>
            {evidence.map((f, i) => {
              const isVideo = String(f?.type || "").startsWith("video/");
              return (
                <Pressable
                  key={`${f.url}-${i}`}
                  style={styles.evidenceTile}
                  onPress={() => Linking.openURL(String(f.url))}
                >
                  {!isVideo ? (
                    <Image source={{ uri: String(f.url) }} style={styles.evidenceImg} />
                  ) : (
                    <View style={styles.evidenceVideo}>
                      <Text style={styles.videoLabel}>VIDEO</Text>
                    </View>
                  )}
                  <View style={styles.evidenceFooter}>
                    <Text style={styles.evidenceName} numberOfLines={1}>
                      {f.name || `File ${i + 1}`}
                    </Text>
                    <Pressable onPress={() => removeEvidence(i)} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.meta}>No evidence uploaded.</Text>
        )}
      </View>

      <Pressable style={[styles.primaryBtn, !canSubmit ? styles.btnDisabled : null]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.primaryText}>{submitting ? "Submitting..." : "Submit request"}</Text>
      </Pressable>

      <Text style={styles.footerHint}>
        Note: The server will only accept returns for completed orders within the allowed window.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  title: { fontSize: 28, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  hint: { color: brand.textLight, marginTop: 4 },
  footerHint: { color: brand.textLight, fontSize: 11, marginTop: 2, lineHeight: 16 },
  policyBox: { borderWidth: 1, borderColor: "#f0ddc0", backgroundColor: "#fff8f0", borderRadius: 10, padding: 12 },
  policyText: { color: "#7a5a2a", fontSize: 11, lineHeight: 16 },

  card: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  cardTitle: { color: brand.dark, fontWeight: "900", marginBottom: 8 },
  meta: { color: brand.textLight, fontSize: 12, marginTop: 4 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  pillSmall: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  pillOn: { backgroundColor: "#f5eadc", borderColor: "#d9bda9" },
  pillText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  pillTextOn: { color: brand.dark, fontWeight: "900", fontSize: 12 },

  input: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, padding: 10, color: brand.text, backgroundColor: brand.white },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: brand.border },
  itemName: { color: brand.dark, fontWeight: "800" },
  checkbox: { width: 18, height: 18, borderWidth: 2, borderColor: brand.border, borderRadius: 5, backgroundColor: "#fff" },
  checkboxOn: { backgroundColor: brand.buttonAlt, borderColor: brand.buttonAlt },

  primaryBtn: { backgroundColor: brand.button, paddingVertical: 12, borderRadius: 10 },
  primaryText: { textAlign: "center", color: brand.white, fontWeight: "800" },
  secondaryBtn: { borderWidth: 1, borderColor: brand.border, paddingVertical: 10, borderRadius: 10, backgroundColor: "#fff" },
  secondaryText: { textAlign: "center", color: brand.dark, fontWeight: "800" },
  btnDisabled: { opacity: 0.55 },

  evidenceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  remove: { color: "#a82949", fontWeight: "800" },
  evidenceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  evidenceTile: { width: "48%" },
  evidenceImg: { width: "100%", height: 110, borderRadius: 10, borderWidth: 1, borderColor: brand.border, backgroundColor: "#eee" },
  evidenceVideo: { width: "100%", height: 110, borderRadius: 10, borderWidth: 1, borderColor: brand.border, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  videoLabel: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  evidenceFooter: { marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  evidenceName: { flex: 1, color: brand.dark, fontWeight: "700", fontSize: 12 },

  doneBadge: { width: 56, height: 56, borderRadius: 999, backgroundColor: "#d4edda", alignItems: "center", justifyContent: "center" },
  doneBadgeText: { color: "#155724", fontWeight: "900", fontSize: 22 },
  doneTitle: { marginTop: 12, fontSize: 20, fontWeight: "900", color: brand.dark },
});

