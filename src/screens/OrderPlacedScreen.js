import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useShop } from "../context/ShopContext";
import {
  OrderConfirmationHero,
  OrderSummaryCard,
  ProofStatusBanner,
  WhatHappensNextCard,
} from "../components/OrderConfirmationSections";
import { getCustomerOrderById, submitOrderPaymentProof } from "../services/orders";
import { brand } from "../theme/brand";
import { normalizeId, orderMatchesKey } from "../utils/id";
import {
  validateReferenceNumber,
  verdictStyles,
  verifyPaymentImage,
} from "../utils/paymentProofVerify";

export function OrderPlacedScreen({ route, navigation }) {
  const { user } = useShop();
  const { orderId, orderNumber, order: initialOrder } = route.params || {};
  const lookupKey = orderId || orderNumber;
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [proofPreviewUri, setProofPreviewUri] = useState("");
  const [proofUploadUri, setProofUploadUri] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [refWarning, setRefWarning] = useState("");
  const [refValid, setRefValid] = useState(true);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [imgVerdict, setImgVerdict] = useState(null);
  const [imgMessage, setImgMessage] = useState("");
  const [canOverride, setCanOverride] = useState(false);
  const [overridden, setOverridden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (initialOrder && (!lookupKey || orderMatchesKey(initialOrder, lookupKey))) {
          if (!active) return;
          setOrder(initialOrder);
          setProofPreviewUri(String(initialOrder?.paymentProof?.imageUri || ""));
          setProofUploadUri(String(initialOrder?.paymentProof?.imageUri || ""));
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
        setProofPreviewUri(String(data?.paymentProof?.imageUri || ""));
        setProofUploadUri(String(data?.paymentProof?.imageUri || ""));
        setReferenceNumber(String(data?.paymentProof?.referenceNumber || ""));
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [initialOrder, lookupKey, user?.email, user?.id])
  );

  const paymentMethod = useMemo(
    () => String(order?.payment || order?.paymentMethod || "gcash").toLowerCase(),
    [order?.payment, order?.paymentMethod]
  );

  const handleReferenceChange = useCallback(
    (val) => {
      setReferenceNumber(val);
      if (!String(val || "").trim()) {
        setRefWarning("");
        setRefValid(true);
        return;
      }
      const { valid, warning } = validateReferenceNumber(val, paymentMethod);
      setRefValid(valid);
      setRefWarning(warning || "");
    },
    [paymentMethod]
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

    setProofPreviewUri(dataUri);
    setProofUploadUri("");
    setImgVerdict(null);
    setImgMessage("");
    setCanOverride(false);
    setOverridden(false);
    setVerifying(true);

    try {
      const verifyResult = await verifyPaymentImage(dataUri, paymentMethod, {
        width: asset?.width,
        height: asset?.height,
      });
      setImgVerdict(verifyResult.verdict);
      setImgMessage(verifyResult.message);
      setCanOverride(verifyResult.canOverride);
      if (verifyResult.verdict === "pass" || verifyResult.verdict === "warn") {
        setProofUploadUri(dataUri);
      }
    } finally {
      setVerifying(false);
    }
  }, [paymentMethod]);

  const handleOverride = useCallback(() => {
    setProofUploadUri(proofPreviewUri);
    setOverridden(true);
  }, [proofPreviewUri]);

  const submitProof = useCallback(async () => {
    const imageToSend = proofUploadUri || (overridden ? proofPreviewUri : "");
    if (!imageToSend && !String(referenceNumber || "").trim()) {
      Alert.alert("Missing proof", "Please provide a payment screenshot and/or a reference number.");
      return;
    }
    if (String(referenceNumber || "").trim() && !refValid) {
      Alert.alert("Invalid reference", "Please fix the reference number before submitting.");
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
          imageUri: imageToSend,
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
  }, [
    navigation,
    order,
    overridden,
    proofPreviewUri,
    proofUploadUri,
    referenceNumber,
    refValid,
    user?.email,
    user?.id,
  ]);

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

  const hasSubmittedProof = Boolean(order?.paymentProof?.imageUri || order?.paymentProofStatus === "pending");
  const methodLabel = paymentMethod === "bdo" ? "BDO" : paymentMethod === "qrph" ? "QR Ph" : "GCash";
  const verdictStyle = imgVerdict ? verdictStyles(imgVerdict) : null;
  const imageReady = Boolean(proofUploadUri) || overridden;
  const canSubmitProof =
    !submittingProof && !verifying && refValid && (imageReady || Boolean(String(referenceNumber || "").trim()));
  const isQrPhPaid = paymentMethod === "qrph" && String(order?.paymentStatus || "").toLowerCase() === "paid";
  const showProofUpload = paymentMethod !== "cash" && paymentMethod !== "qrph" && !hasSubmittedProof;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <OrderConfirmationHero order={order} userFirstName={user?.firstName || user?.name} />
      <WhatHappensNextCard order={order} />
      {isQrPhPaid ? (
        <View style={styles.qrPaidBanner}>
          <Text style={styles.qrPaidTitle}>✓ Payment verified via PayMongo</Text>
          <Text style={styles.qrPaidSub}>Your payment was confirmed automatically — no proof needed.</Text>
        </View>
      ) : null}
      {hasSubmittedProof ? <ProofStatusBanner order={order} /> : null}

      {showProofUpload ? (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upload Payment Proof</Text>
        <Text style={styles.helpText}>
          Please upload a clear screenshot or photo of your payment confirmation.
        </Text>
        <Pressable
          style={[
            styles.uploadBox,
            verdictStyle ? { borderColor: verdictStyle.border } : null,
          ]}
          onPress={() => !verifying && pickProofImage()}
          disabled={verifying}
        >
          {verifying ? (
            <View style={styles.verifyingBox}>
              <Text style={styles.verifyingTitle}>Analysing image…</Text>
              <Text style={styles.verifyingSub}>Checking for payment keywords and structure</Text>
            </View>
          ) : proofPreviewUri ? (
            <>
              <Image
                source={{ uri: proofPreviewUri }}
                style={[
                  styles.uploadPreview,
                  imgVerdict === "reject" && !overridden ? styles.uploadPreviewDim : null,
                ]}
              />
              <Text style={styles.uploadText}>Tap to change screenshot</Text>
            </>
          ) : (
            <>
              <Text style={styles.uploadIcon}>↑</Text>
              <Text style={styles.uploadText}>Click or drag your {methodLabel} screenshot here</Text>
              <Text style={styles.uploadHint}>JPG or PNG, max 5 MB</Text>
            </>
          )}
        </Pressable>

        {imgVerdict && !verifying && verdictStyle ? (
          <View
            style={[
              styles.verdictBox,
              { backgroundColor: verdictStyle.bg, borderColor: verdictStyle.border },
            ]}
          >
            <Text style={[styles.verdictText, { color: verdictStyle.color }]}>
              {imgVerdict === "pass" ? "✓ " : imgVerdict === "warn" ? "⚠ " : "✕ "}
              {imgMessage}
            </Text>
            {canOverride && !overridden ? (
              <Pressable
                style={[styles.overrideBtn, { borderColor: verdictStyle.border }]}
                onPress={handleOverride}
              >
                <Text style={[styles.overrideBtnText, { color: verdictStyle.color }]}>
                  Proceed anyway — my screenshot is correct
                </Text>
              </Pressable>
            ) : null}
            {overridden ? (
              <Text style={[styles.overrideAccepted, { color: verdictStyle.color }]}>
                ✓ Override accepted — staff will verify your screenshot manually.
              </Text>
            ) : null}
          </View>
        ) : null}

        {proofPreviewUri && imgVerdict ? (
          <Pressable onPress={pickProofImage}>
            <Text style={styles.changeImageLink}>Change image</Text>
          </Pressable>
        ) : null}

        <Text style={styles.refLabel}>
          {methodLabel} reference / transaction number
          {paymentMethod === "gcash" ? (
            <Text style={styles.refLabelNote}> — Copy code from your GCash app</Text>
          ) : null}
        </Text>
        <TextInput
          style={[styles.refInput, !refValid && referenceNumber.trim() ? styles.refInputError : null]}
          placeholder={paymentMethod === "gcash" ? "e.g. 1001543610110" : "e.g. FT-20240315-12345678"}
          placeholderTextColor="#8f8088"
          value={referenceNumber}
          onChangeText={handleReferenceChange}
        />
        {referenceNumber.trim() && refWarning ? (
          <Text style={[styles.refWarning, !refValid ? styles.refWarningError : null]}>{refWarning}</Text>
        ) : null}
        {referenceNumber.trim() && refValid && !refWarning ? (
          <Text style={styles.refOk}>Reference number format looks correct.</Text>
        ) : null}

        <Pressable
          style={[styles.submitProofBtn, !canSubmitProof ? styles.submitProofBtnDisabled : null]}
          onPress={submitProof}
          disabled={!canSubmitProof}
        >
          <Text style={styles.submitProofText}>
            {verifying ? "Checking image…" : submittingProof ? "Uploading…" : "SEND PROOF"}
          </Text>
        </Pressable>
        <Text style={styles.uploadFooterHint}>Upload a screenshot, enter a reference number, or both.</Text>
      </View>
      ) : null}

      <OrderSummaryCard order={order} />

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
  meta: { color: brand.textLight, textAlign: "center" },
  qrPaidBanner: {
    borderWidth: 1,
    borderColor: "#155724",
    borderLeftWidth: 3,
    backgroundColor: "#f0faf3",
    borderRadius: 10,
    padding: 12,
  },
  qrPaidTitle: { color: "#155724", fontWeight: "800", fontSize: 14, marginBottom: 4 },
  qrPaidSub: { color: "#2c6e3f", fontSize: 12, lineHeight: 18 },
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
  uploadPreviewDim: { opacity: 0.45 },
  verifyingBox: { alignItems: "center", paddingVertical: 18 },
  verifyingTitle: { color: brand.textLight, fontSize: 13, fontWeight: "600" },
  verifyingSub: { color: "#aaa", fontSize: 11, marginTop: 4, textAlign: "center" },
  verdictBox: {
    borderWidth: 1,
    borderRadius: 7,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  verdictText: { fontSize: 13, lineHeight: 19 },
  overrideBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overrideBtnText: { fontSize: 12, fontWeight: "600" },
  overrideAccepted: { fontSize: 12, opacity: 0.85, lineHeight: 18 },
  changeImageLink: {
    color: brand.dark,
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  refLabelNote: { textTransform: "none", letterSpacing: 0, fontWeight: "400", color: brand.textLight },
  refInputError: { borderColor: "#c0392b" },
  refWarning: { color: "#856404", fontSize: 11, marginBottom: 8, lineHeight: 16 },
  refWarningError: { color: "#791F1F" },
  refOk: { color: "#0F6E56", fontSize: 11, marginBottom: 8 },
  submitProofBtnDisabled: { opacity: 0.55 },
  uploadFooterHint: { color: "#999", fontSize: 12, marginTop: 8 },
  submittedBanner: { color: "#0F6E56", fontWeight: "700", fontSize: 13 },
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
