import { useCallback, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useShop } from "../context/ShopContext";
import { getCustomerOrderById, submitOrderPaymentProof } from "../services/orders";
import { brand } from "../theme/brand";
import { formatDateTimePH } from "../utils/datetime";
import { normalizeId, orderMatchesKey } from "../utils/id";

function formatPrice(num) {
  return `P${Number(num || 0).toLocaleString("en-PH")}`;
}

function paymentLabel(payment) {
  const p = String(payment || "").toLowerCase();
  if (p === "bdo") return "BDO Bank Transfer";
  if (p === "cash") return "Cash on Pickup";
  return "GCash";
}

export function OrderPlacedScreen({ route, navigation }) {
  const { user } = useShop();
  const { orderId, orderNumber, order: initialOrder } = route.params || {};
  const lookupKey = orderId || orderNumber;
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [proofImageUri, setProofImageUri] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [submittingProof, setSubmittingProof] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (initialOrder && (!lookupKey || orderMatchesKey(initialOrder, lookupKey))) {
          if (!active) return;
          setOrder(initialOrder);
          setProofImageUri(String(initialOrder?.paymentProof?.imageUri || ""));
          setReferenceNumber(String(initialOrder?.paymentProof?.referenceNumber || ""));
          setLoading(false);
          return;
        }
        setLoading(true);
        const data = user?.email && lookupKey
          ? await getCustomerOrderById(lookupKey, user.email, user.id)
          : null;
        if (!active) return;
        setOrder(data || null);
        setProofImageUri(String(data?.paymentProof?.imageUri || ""));
        setReferenceNumber(String(data?.paymentProof?.referenceNumber || ""));
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [initialOrder, lookupKey, user?.email, user?.id])
  );

  const pickProofImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo library access to upload payment proof.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    const dataUri = asset?.base64
      ? `data:image/${asset?.mimeType?.includes("png") ? "png" : "jpeg"};base64,${asset.base64}`
      : String(asset?.uri || "");
    if (!dataUri) return;
    setProofImageUri(dataUri);
  }, []);

  const submitProof = useCallback(async () => {
    if (!proofImageUri) {
      Alert.alert("Missing image", "Please select a screenshot before submitting.");
      return;
    }
    setSubmittingProof(true);
    try {
      const orderKey = normalizeId(order?.id) || normalizeId(order?.orderNumber);
      const result = await submitOrderPaymentProof(
        orderKey,
        {
          email: user?.email || order?.contact?.email,
          orderNumber: order?.orderNumber,
          imageUri: proofImageUri,
          referenceNumber,
          fallbackOrder: order,
        },
        user?.id
      );
      if (!result?.ok) {
        Alert.alert("Submit failed", result?.error || "Could not submit payment proof.");
        return;
      }
      const confirmed = result.order || order;
      setOrder(confirmed);
      navigation.replace("OrderProofSubmitted", {
        orderId: normalizeId(confirmed?.id) || orderKey,
        orderNumber: confirmed?.orderNumber || order?.orderNumber,
        order: confirmed,
      });
    } catch (e) {
      Alert.alert("Submit failed", e?.message || "Could not submit payment proof.");
    } finally {
      setSubmittingProof(false);
    }
  }, [navigation, order?.contact?.email, order?.id, proofImageUri, referenceNumber, user?.email, user?.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Preparing your order confirmation...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Order not found.</Text>
        <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate("MyOrders")}>
          <Text style={styles.primaryBtnText}>Go to My Orders</Text>
        </Pressable>
      </View>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0];
  const deliveryLabel = order?.delivery?.method === "delivery" ? "Lalamove" : "Store Pickup";
  const hasSubmittedProof = Boolean(order?.paymentProof?.imageUri);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Order placed!</Text>
        <Text style={styles.heroSub}>Thank you, friend. We've received your order.</Text>
        <View style={styles.orderCodeBox}>
          <Text style={styles.orderCodeLabel}>Order number</Text>
          <Text style={styles.orderCodeValue}>{order.orderNumber || `JCE-${order.id}`}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What happens next</Text>
        <Text style={styles.line}>1. Upload your proof of payment below.</Text>
        <Text style={styles.line}>2. Our team verifies your payment (usually within 1-2 hours).</Text>
        <Text style={styles.line}>3. You'll receive updates when your order is confirmed.</Text>
        <Text style={styles.line}>4. We'll notify you when your order is ready for pickup.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upload proof of payment</Text>
        <Text style={styles.helpText}>
          Send your payment to the account shown at checkout, then upload a clear screenshot here.
          Orders without proof within 24 hours may be canceled.
        </Text>
        <Pressable style={styles.uploadBox} onPress={pickProofImage}>
          {proofImageUri ? (
            <>
              <Image source={{ uri: proofImageUri }} style={styles.uploadPreview} />
              <Text style={styles.uploadText}>Tap to change screenshot</Text>
            </>
          ) : (
            <>
              <Text style={styles.uploadIcon}>↑</Text>
              <Text style={styles.uploadText}>Tap to upload screenshot</Text>
              <Text style={styles.uploadHint}>JPG or PNG, max 5 MB</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.refLabel}>Reference / Transaction Number (optional)</Text>
        <TextInput
          style={styles.refInput}
          placeholder="e.g. GCash ref 123456789"
          placeholderTextColor="#8f8088"
          value={referenceNumber}
          onChangeText={setReferenceNumber}
        />
        <Pressable style={styles.submitProofBtn} onPress={submitProof} disabled={submittingProof}>
          <Text style={styles.submitProofText}>{submittingProof ? "Submitting..." : "Submit Proof of Payment"}</Text>
        </Pressable>
        {hasSubmittedProof ? <Text style={styles.submittedText}>Payment proof submitted.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment Proof Details</Text>
        <View style={styles.proofDetailBox}>
          <Text style={styles.proofLabel}>PAYMENT PROOF</Text>
          <Text style={styles.proofOrderNumber}>{order.orderNumber || `JCE-${order.id}`}</Text>
          <Text style={styles.proofMeta}>
            {order?.contact?.firstName} {order?.contact?.lastName} • {formatPrice(order.total || order.subtotal)} • {paymentLabel(order.payment)}
          </Text>
        </View>
        {order?.paymentProof?.referenceNumber ? (
          <View style={styles.row}>
            <Text style={styles.meta}>Reference Number</Text>
            <Text style={styles.value}>{order.paymentProof.referenceNumber}</Text>
          </View>
        ) : null}
        {order?.paymentProof?.submittedAt ? (
          <View style={styles.row}>
            <Text style={styles.meta}>Submitted</Text>
            <Text style={styles.value}>{formatDateTimePH(order.paymentProof.submittedAt)}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.meta}>Status</Text>
          <Text style={styles.statusBadge}>{hasSubmittedProof ? "Submitted - Pending Review" : "Not Submitted"}</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        {firstItem ? (
          <View style={styles.itemRow}>
            {firstItem.image ? <Image source={{ uri: firstItem.image }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
            <View style={styles.itemMeta}>
              <Text style={styles.itemName}>{firstItem.name}</Text>
              <Text style={styles.itemSub}>Size: {firstItem.size || "N/A"} x {firstItem.qty}</Text>
              <Text style={styles.itemPrice}>{formatPrice(firstItem.subtotal)}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.summaryLine} />
        <View style={styles.row}>
          <Text style={styles.meta}>Total</Text>
          <Text style={styles.total}>{formatPrice(order.total || order.subtotal)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Payment</Text>
          <Text style={styles.value}>{paymentLabel(order.payment)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Delivery</Text>
          <Text style={styles.value}>{deliveryLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Order status</Text>
          <Text style={styles.badge}>Placed</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.meta}>Payment proof</Text>
          <Text style={styles.value}>{hasSubmittedProof ? "Submitted" : "Unpaid"}</Text>
        </View>
      </View>

      <Pressable
        style={styles.linkBtn}
        onPress={() =>
          navigation.navigate("OrderDetail", {
            orderId: order.id || order.orderNumber,
            orderNumber: order.orderNumber,
          })
        }
      >
        <Text style={styles.linkText}>View full order details →</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("MyOrders")}>
        <Text style={styles.linkText}>View all orders →</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Main")}>
        <Text style={styles.linkText}>Continue browsing →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 28, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: brand.bg, padding: 16 },
  hero: { backgroundColor: brand.dark, padding: 16, borderRadius: 12 },
  heroTitle: { color: brand.white, fontSize: 34, fontWeight: "700", fontStyle: "italic" },
  heroSub: { color: "#ddd2d8", marginTop: 4, marginBottom: 12, fontSize: 12 },
  orderCodeBox: { borderWidth: 1, borderColor: "#5b3d4a", borderRadius: 8, padding: 10 },
  orderCodeLabel: { color: "#cfbbc6", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 10 },
  orderCodeValue: { color: brand.white, marginTop: 3, fontWeight: "800", fontSize: 15 },
  card: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  cardTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8 },
  line: { color: brand.text, marginBottom: 5, fontSize: 12 },
  helpText: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  uploadBox: {
    borderWidth: 1,
    borderColor: "#d7c7cd",
    borderStyle: "dashed",
    backgroundColor: "#fbf7f8",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    marginBottom: 8,
  },
  uploadIcon: { color: "#aa969f", fontSize: 16, marginBottom: 4 },
  uploadText: { color: brand.textLight, fontSize: 12 },
  uploadHint: { color: "#a39199", fontSize: 11, marginTop: 2 },
  uploadPreview: { width: "100%", height: 170, borderRadius: 6, marginBottom: 8 },
  refLabel: { color: brand.textLight, fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  refInput: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: brand.white, marginBottom: 8 },
  submitProofBtn: { backgroundColor: "#9e9395", borderRadius: 6, paddingVertical: 11 },
  submitProofText: { textAlign: "center", color: brand.white, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 11 },
  submittedText: { marginTop: 8, color: "#2c6e3f", fontSize: 12, fontWeight: "700" },
  summaryCard: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 12 },
  summaryTitle: { color: brand.dark, fontWeight: "800", marginBottom: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  thumb: { width: 48, height: 62, borderRadius: 6, backgroundColor: "#eee" },
  thumbFallback: { width: 48, height: 62, borderRadius: 6, backgroundColor: "#eee" },
  itemMeta: { marginLeft: 8, flex: 1 },
  itemName: { color: brand.dark, fontWeight: "600", fontSize: 13 },
  itemSub: { color: brand.textLight, marginTop: 2, fontSize: 11 },
  itemPrice: { color: brand.dark, marginTop: 3, fontWeight: "700", fontSize: 13 },
  summaryLine: { borderTopWidth: 1, borderTopColor: brand.border, marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, alignItems: "center" },
  meta: { color: brand.textLight, fontSize: 12 },
  value: { color: brand.dark, fontWeight: "600", fontSize: 12 },
  total: { color: brand.dark, fontWeight: "800", fontSize: 16 },
  badge: { color: "#4d3c42", backgroundColor: "#eee5e8", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontSize: 11, fontWeight: "700" },
  proofDetailBox: { backgroundColor: "#fef8f9", borderWidth: 1, borderColor: "#e8d9df", borderRadius: 8, padding: 10, marginBottom: 8 },
  proofLabel: { color: "#a89199", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  proofOrderNumber: { color: brand.dark, fontSize: 16, fontWeight: "800", marginTop: 3 },
  proofMeta: { color: brand.textLight, fontSize: 12, marginTop: 4 },
  statusBadge: { color: "#7b5c66", backgroundColor: "#f0e5eb", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: "700" },
  primaryBtn: { marginTop: 10, backgroundColor: brand.button, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  primaryBtnText: { color: brand.white, fontWeight: "700" },
  linkBtn: { paddingVertical: 2 },
  linkText: { color: brand.dark, fontWeight: "600", fontSize: 13 },
});
