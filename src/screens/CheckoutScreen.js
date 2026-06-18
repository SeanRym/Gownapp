import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { useShop } from "../context/ShopContext";
import { submitOrder } from "../services/orders";
import { calculateShipping } from "../services/shipping";
import { DEFAULT_LALAMOVE_VEHICLE, estimateLalamoveFeeFromAddress, LALAMOVE_VEHICLES } from "../services/lalamoveEstimate";
import { loadCheckoutProfiles, saveCheckoutProfiles } from "../utils/storage";
import { brand } from "../theme/brand";

function formatPrice(n) {
  return `P${Number(n).toLocaleString("en-PH")}`;
}

export function CheckoutScreen({ navigation, route }) {
  const { cartDetailed, subtotal, clearCart, removePurchasedLines, user, reloadGowns } = useShop();
  const lineKeys = route?.params?.lineKeys;
  const fittingNote = String(route?.params?.fittingNote || "").trim();

  const checkoutItems = useMemo(() => {
    if (!Array.isArray(lineKeys) || lineKeys.length === 0) return cartDetailed;
    const set = new Set(lineKeys);
    return cartDetailed.filter((i) => set.has(i.lineKey));
  }, [cartDetailed, lineKeys]);

  const checkoutSubtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.subtotal, 0),
    [checkoutItems]
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("pickup");
  const [lalamoveVehicle, setLalamoveVehicle] = useState(DEFAULT_LALAMOVE_VEHICLE);
  const [lalamoveFee, setLalamoveFee] = useState(0);
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [lalamoveError, setLalamoveError] = useState("");
  const [payment, setPayment] = useState("gcash");
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [form, setForm] = useState({
    email: user?.email || "",
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    zip: "",
  });
  const shipping = useMemo(
    () => calculateShipping({ province: form.province, subtotal: checkoutSubtotal }),
    [form.province, checkoutSubtotal]
  );
  const deliveryFee = deliveryMethod === "pickup" ? 0 : lalamoveFee;
  const grandTotal = checkoutSubtotal + deliveryFee;
  const steps = ["Review", "Delivery", "Payment", "Confirm"];

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const canGoBack = step > 0;

  useEffect(() => {
    if (user?.email) return;
    Alert.alert("Sign in required", "Please sign in first before placing an order.");
    navigation.replace("Login");
  }, [navigation, user?.email]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cleanEmail = String(user?.email || "").trim().toLowerCase();
      if (!cleanEmail) return;
      const profiles = await loadCheckoutProfiles();
      const saved = profiles?.[cleanEmail];
      if (!mounted || !saved) return;
      setForm((prev) => ({
        ...prev,
        email: cleanEmail,
        firstName: String(saved.firstName || prev.firstName || ""),
        lastName: String(saved.lastName || prev.lastName || ""),
        phone: String(saved.phone || prev.phone || ""),
        address: String(saved.address || prev.address || ""),
        city: String(saved.city || prev.city || ""),
        province: String(saved.province || prev.province || ""),
        zip: String(saved.zip || prev.zip || ""),
      }));
    })();
    return () => {
      mounted = false;
    };
  }, [user?.email]);

  const validateReviewStep = () => {
    if (checkoutItems.length === 0) {
      Alert.alert("Nothing to checkout", "Please add at least one gown to your fitting room.");
      return false;
    }
    return true;
  };

  const validateDeliveryStep = () => true;

  const validateConfirmStep = () => {
    if (!String(form.email || "").toLowerCase().endsWith("@gmail.com")) {
      Alert.alert("Invalid email", "Please update your account email to a valid Gmail address before checkout.");
      return false;
    }
    if (deliveryMethod === "delivery") {
      if (!String(form.address || "").trim()) {
        Alert.alert("Missing address", "Please complete your Lalamove delivery address in Step 2.");
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (deliveryMethod !== "delivery") return;
    const addr = String(form.address || "").trim();
    if (!addr) return;
    const t = setTimeout(async () => {
      setLalamoveLoading(true);
      setLalamoveError("");
      try {
        const res = await estimateLalamoveFeeFromAddress(addr, lalamoveVehicle);
        if (res?.ok) {
          setLalamoveFee(Number(res.fee || 0));
        } else {
          const flat = { motorcycle: 100, sedan: 250, suv: 300 };
          const fee = flat[lalamoveVehicle] ?? 250;
          setLalamoveFee(fee);
          setLalamoveError("Could not locate address — using flat estimate. Final fare set by Lalamove.");
        }
      } finally {
        setLalamoveLoading(false);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [deliveryMethod, form.address, lalamoveVehicle]);

  const nextStep = () => {
    if (step === 0 && !validateReviewStep()) return;
    if (step === 1 && !validateDeliveryStep()) return;
    setStep((prev) => Math.min(3, prev + 1));
  };

  const prevStep = () => {
    if (!canGoBack) return;
    setStep((prev) => Math.max(0, prev - 1));
  };

  const placeOrder = async () => {
    if (checkoutItems.length === 0) return;
    if (!validateConfirmStep()) return;
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please read and agree to the Terms & Conditions before placing your order.");
      return;
    }
    if (step < 3) {
      setStep(3);
      return;
    }
    setSubmitting(true);
    try {
      const cleanEmail = String(form.email || "").trim().toLowerCase();
      if (cleanEmail) {
        const profiles = await loadCheckoutProfiles();
        await saveCheckoutProfiles({
          ...(profiles || {}),
          [cleanEmail]: {
            firstName: String(form.firstName || "").trim(),
            lastName: String(form.lastName || "").trim(),
            phone: String(form.phone || "").trim(),
            address: String(form.address || "").trim(),
            city: String(form.city || "").trim(),
            province: String(form.province || "").trim(),
            zip: String(form.zip || "").trim(),
          },
        });
      }
      const response = await submitOrder({
        userId: user?.id,
        contact: {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
        },
        delivery: {
          address: form.address,
          city: form.city,
          province: form.province,
          zip: form.zip,
          method: deliveryMethod,
          lalamoveVehicle: deliveryMethod === "delivery" ? lalamoveVehicle : null,
        },
        payment,
        items: checkoutItems.map((i) => ({
          id: i.id,
          name: i.name,
          image: i.image,
          size: i.size,
          qty: i.qty,
          price: i.price,
          subtotal: i.subtotal,
        })),
        subtotal: checkoutSubtotal,
        notes: fittingNote,
        shipping: {
          ...shipping,
          shippingFee: deliveryFee,
          zoneLabel: deliveryMethod === "pickup" ? "Store Pickup" : shipping.zoneLabel,
        },
        total: grandTotal,
        createdAt: new Date().toISOString(),
      });
      const purchasedLineKeys = checkoutItems.map((item) => item.lineKey).filter(Boolean);
      if (purchasedLineKeys.length > 0) {
        const removeResult = await removePurchasedLines(purchasedLineKeys);
        if (!removeResult?.ok) {
          throw new Error(removeResult?.reason || "Order saved but failed to update cart.");
        }
      } else {
        await clearCart();
      }
      await reloadGowns();
      navigation.replace("OrderPlaced", {
        orderId: response?.order?.id || response?.order?.orderNumber,
        orderNumber: response?.order?.orderNumber,
        order: response?.order,
      });
    } catch (e) {
      Alert.alert("Order failed", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const StepPill = ({ label, index }) => {
    const active = index === step;
    const done = index < step;
    return (
      <View style={styles.stepWrap}>
        <View style={[styles.stepDot, active ? styles.stepDotActive : null, done ? styles.stepDotDone : null]}>
          <Text style={[styles.stepDotText, active || done ? styles.stepDotTextActive : null]}>{index + 1}</Text>
        </View>
        <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>{label}</Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Checkout</Text>
      <Text style={styles.subTitle}>Complete your order in 4 simple steps.</Text>

      <View style={styles.stepsRow}>
        {steps.map((item, index) => (
          <StepPill key={item} label={item} index={index} />
        ))}
      </View>

      <View style={styles.card}>
        {step === 0 ? (
          <>
            <Text style={styles.sectionTitle}>Review your order</Text>
            {checkoutItems.map((item) => (
              <View key={item.id} style={styles.lineItem}>
                <Image source={{ uri: item.image }} style={styles.lineThumb} />
                <View style={styles.lineMeta}>
                  <Text style={styles.lineName}>{item.name}</Text>
                  <Text style={styles.lineInfo}>Size: {item.size || "N/A"}  Qty: {item.qty}</Text>
                  <Text style={styles.linePrice}>{formatPrice(item.subtotal)}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.sectionTitle}>Delivery method</Text>
            <Pressable style={[styles.optionCard, deliveryMethod === "pickup" ? styles.optionCardActive : null]} onPress={() => setDeliveryMethod("pickup")}>
              <View style={styles.optionTopRow}>
                <Text style={styles.optionTitle}>Store Pickup</Text>
                <Text style={styles.optionMeta}>Free</Text>
              </View>
              <Text style={styles.optionDesc}>Collect at JCE Bridal Boutique</Text>
            </Pressable>
            <Pressable style={[styles.optionCard, deliveryMethod === "delivery" ? styles.optionCardActive : null]} onPress={() => setDeliveryMethod("delivery")}>
              <View style={styles.optionTopRow}>
                <Text style={styles.optionTitle}>Lalamove</Text>
                <Text style={styles.optionMeta}>{lalamoveFee > 0 ? `~${formatPrice(lalamoveFee)}` : "Estimate"}</Text>
              </View>
              <Text style={styles.optionDesc}>Same-day city dispatch (where available)</Text>
            </Pressable>
            {deliveryMethod === "pickup" ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}><Text style={styles.noticeStrong}>Store hours:</Text> Mon-Sat 9AM-6PM</Text>
                <Text style={styles.noticeText}><Text style={styles.noticeStrong}>Address:</Text> JCE Bridal Boutique - please contact us for exact address.</Text>
                <Text style={styles.noticeText}>Please wait for Ready for Pickup notification before visiting.</Text>
              </View>
            ) : null}
            {deliveryMethod === "delivery" ? (
              <>
                <Text style={styles.label}>Delivery address</Text>
                <TextInput
                  style={[styles.input, styles.addressInput]}
                  placeholder="Street, Barangay, City, Province"
                  value={form.address}
                  onChangeText={(v) => onChange("address", v)}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.label}>Vehicle</Text>
                <View style={styles.vehicleRow}>
                  {LALAMOVE_VEHICLES.filter((v) => v.id !== "motorcycle").map((v) => (
                    <Pressable
                      key={v.id}
                      style={[styles.vehiclePill, lalamoveVehicle === v.id ? styles.vehiclePillOn : null]}
                      onPress={() => setLalamoveVehicle(v.id)}
                    >
                      <Text style={[styles.vehicleText, lalamoveVehicle === v.id ? styles.vehicleTextOn : null]}>
                        {v.labelShort}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {lalamoveLoading ? <Text style={styles.deliveryHint}>Computing shipping estimate…</Text> : null}
                {!lalamoveLoading && lalamoveFee > 0 ? (
                  <Text style={styles.deliveryHint}>
                    {LALAMOVE_VEHICLES.find((v) => v.id === lalamoveVehicle)?.labelShort || "Sedan"} estimate:{" "}
                    <Text style={styles.deliveryStrong}>{formatPrice(lalamoveFee)}</Text>
                  </Text>
                ) : null}
                {lalamoveError ? <Text style={styles.deliveryWarn}>{lalamoveError}</Text> : null}
                <Text style={styles.deliveryHint}>
                  Estimate is based on straight-line distance from our store. The actual Lalamove fee may vary slightly and will be confirmed before dispatch.
                </Text>
              </>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.sectionTitle}>Payment method</Text>
            <Pressable style={[styles.optionCard, payment === "gcash" ? styles.optionCardActive : null]} onPress={() => setPayment("gcash")}>
              <View style={styles.optionTopRow}>
                <Text style={styles.optionTitle}>GCash</Text>
                <View style={[styles.radio, payment === "gcash" ? styles.radioActive : null]}>
                  {payment === "gcash" ? <View style={styles.radioInner} /> : null}
                </View>
              </View>
              {payment === "gcash" ? (
                <>
                  <Text style={styles.optionDesc}>GCash Number: 09XX-XXX-XXXX - Name: JCE Bridal Boutique</Text>
                </>
              ) : null}
            </Pressable>
            <Pressable style={[styles.optionCard, payment === "bdo" ? styles.optionCardActive : null]} onPress={() => setPayment("bdo")}>
              <View style={styles.optionTopRow}>
                <Text style={styles.optionTitle}>BDO Bank Transfer</Text>
                <View style={[styles.radio, payment === "bdo" ? styles.radioActive : null]}>
                  {payment === "bdo" ? <View style={styles.radioInner} /> : null}
                </View>
              </View>
              {payment === "bdo" ? (
                <>
                  <Text style={styles.optionDesc}>BDO Account: 0121-4567-3001</Text>
                  <Text style={styles.optionSubDesc}>Account Name: JCE Bridal Boutique</Text>
                </>
              ) : null}
            </Pressable>
            <Pressable style={[styles.optionCard, payment === "cash" ? styles.optionCardActive : null]} onPress={() => setPayment("cash")}>
              <View style={styles.optionTopRow}>
                <Text style={styles.optionTitle}>Cash on Pickup</Text>
                <View style={[styles.radio, payment === "cash" ? styles.radioActive : null]}>
                  {payment === "cash" ? <View style={styles.radioInner} /> : null}
                </View>
              </View>
              {payment === "cash" ? (
                <Text style={styles.optionDesc}>Pay in full when you collect your order at the boutique.</Text>
              ) : null}
            </Pressable>
            {payment !== "cash" ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}><Text style={styles.noticeStrong}>How to pay:</Text></Text>
                <Text style={styles.noticeText}>1. Send the exact amount to the account above.</Text>
                <Text style={styles.noticeText}>2. Screenshot your payment confirmation.</Text>
                <Text style={styles.noticeText}>3. Upload your proof on the next page after placing your order.</Text>
                <Text style={styles.noticeText}><Text style={styles.noticeStrong}>Orders without proof within 24 hours may be cancelled.</Text></Text>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.sectionTitle}>Review & place order</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(checkoutSubtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery</Text>
              <Text style={styles.summaryValue}>{deliveryMethod === "pickup" ? "Store pickup" : `${formatPrice(deliveryFee)} (${shipping.zoneLabel})`}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated arrival</Text>
              <Text style={styles.summaryValue}>{deliveryMethod === "pickup" ? "Ready for pickup notice" : shipping.etaLabel}</Text>
            </View>
            <View style={styles.summaryLine} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Grand total</Text>
              <Text style={styles.summaryTotal}>{formatPrice(grandTotal)}</Text>
            </View>

            <Pressable style={styles.termsRow} onPress={() => setShowTerms(true)}>
              <View style={[styles.checkbox, termsAccepted ? styles.checkboxChecked : null]}>
                {termsAccepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                I have read and agree to the{" "}
                <Text style={styles.termsLink}>Terms & Conditions</Text>
              </Text>
            </Pressable>
            {!termsAccepted ? (
              <Text style={styles.termsWarning}>You must agree to Terms & Conditions before placing your order.</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        {checkoutItems.map((item, index) => (
          <View key={`summary-${item.id}-${index}`} style={styles.summaryItemRow}>
            <Image source={{ uri: item.image }} style={styles.summaryThumb} />
            <View style={styles.summaryItemMeta}>
              <Text style={styles.summaryItemName}>{item.name}</Text>
              <Text style={styles.summaryItemSub}>Size: {item.size || "N/A"} x {item.qty}</Text>
            </View>
            <Text style={styles.summaryPrice}>{formatPrice(item.subtotal)}</Text>
          </View>
        ))}
        <View style={styles.summaryLine} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatPrice(checkoutSubtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery fee</Text>
          <Text style={styles.summaryValue}>{formatPrice(deliveryFee)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryTotal}>{formatPrice(grandTotal)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {step < 3 ? (
          <>
            <Pressable style={styles.primaryBtn} onPress={nextStep}>
              <Text style={styles.primaryBtnText}>
                {step === 0 ? "Continue to Delivery" : step === 1 ? "Continue to Payment" : "Review & Confirm"}
              </Text>
            </Pressable>
            {canGoBack ? (
              <Pressable style={styles.backBtn} onPress={prevStep}>
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Pressable style={styles.primaryBtn} onPress={placeOrder} disabled={submitting}>
              <Text style={styles.primaryBtnText}>{submitting ? "Placing order..." : "Place Order"}</Text>
            </Pressable>
            {canGoBack ? (
              <Pressable style={styles.backBtn} onPress={prevStep}>
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <Modal visible={showTerms} animationType="fade" transparent onRequestClose={() => setShowTerms(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTag}>Before you continue</Text>
            <Text style={styles.modalTitle}>Terms & Conditions</Text>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalText}>TERMS AND CONDITIONS - JCE BRIDAL BOUTIQUE</Text>
              <Text style={styles.modalText}>1. ORDER & PAYMENT</Text>
              <Text style={styles.modalText}>
                All orders are subject to availability. Full payment is required before your order is processed.
                For GCash and BDO transfers, please upload your proof of payment within 24 hours of placing your order.
                Orders without payment confirmation within 24 hours may be canceled.
              </Text>
              <Text style={styles.modalText}>2. PAYMENT PROOF</Text>
              <Text style={styles.modalText}>
                Upload a clear screenshot of your payment confirmation showing reference number, amount, and date.
                Tampered or fraudulent proof of payment will result in immediate order cancellation.
              </Text>
              <Text style={styles.modalText}>3. DELIVERY</Text>
              <Text style={styles.modalText}>
                Store pickup orders must be collected within 7 days of ready notification. For Lalamove delivery,
                delivery fee will be quoted based on your address and rider availability.
              </Text>
              <Text style={styles.modalText}>4. FITTING & ALTERATIONS</Text>
              <Text style={styles.modalText}>
                All gowns are ready-to-wear. Sizes are limited per item. Alteration services are available upon request
                and may have additional costs.
              </Text>
              <Text style={styles.modalText}>5. CANCELLATIONS</Text>
              <Text style={styles.modalText}>
                Orders may be canceled before payment is confirmed. Once payment is verified, cancellations are subject
                to our return and refund policy.
              </Text>
              <Text style={styles.modalText}>6. RETURNS & REFUNDS</Text>
              <Text style={styles.modalText}>
                Returns are accepted within 48 hours of receipt only if the item is defective or significantly different
                from what was ordered. Item must be unworn, unaltered, and in original condition with tags attached.
              </Text>
              <Text style={styles.modalText}>7. PRIVACY</Text>
              <Text style={styles.modalText}>
                Your personal information is used only to process and deliver your order.
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={() => {
                  setTermsAccepted(true);
                  setShowTerms(false);
                }}
              >
                <Text style={styles.modalPrimaryText}>I have read and agree</Text>
              </Pressable>
              <Pressable style={styles.modalSecondaryBtn} onPress={() => setShowTerms(false)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
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
  title: { fontSize: 34, fontWeight: "700", marginBottom: 2, color: brand.dark, fontStyle: "italic" },
  subTitle: { color: brand.textLight, marginBottom: 8 },
  hero: { backgroundColor: brand.dark, padding: 20, borderRadius: 14 },
  heroTitle: { color: brand.white, fontSize: 34, fontWeight: "700", fontStyle: "italic" },
  heroSub: { color: "#E3D4DB", marginTop: 6, marginBottom: 14 },
  orderCodeBox: { borderWidth: 1, borderColor: "#5A3D4B", padding: 10, borderRadius: 8 },
  orderCodeLabel: { color: "#CFBBC6", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  orderCodeValue: { color: brand.white, fontSize: 16, fontWeight: "800", marginTop: 4 },
  stepsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  stepWrap: { alignItems: "center", flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: brand.border, alignItems: "center", justifyContent: "center", backgroundColor: brand.white },
  stepDotActive: { borderColor: brand.buttonAlt, backgroundColor: "#F5EADC" },
  stepDotDone: { borderColor: brand.buttonAlt, backgroundColor: brand.buttonAlt },
  stepDotText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  stepDotTextActive: { color: brand.dark },
  stepLabel: { marginTop: 6, fontSize: 10, color: brand.textLight, fontWeight: "600" },
  stepLabelActive: { color: brand.dark },
  card: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: brand.dark, marginBottom: 8, fontStyle: "italic" },
  lineItem: { flexDirection: "row", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F0E8EB" },
  lineThumb: { width: 56, height: 74, borderRadius: 6, backgroundColor: "#F3EDF0" },
  lineMeta: { flex: 1 },
  lineName: { color: brand.dark, fontWeight: "600" },
  lineInfo: { color: brand.textLight, fontSize: 12, marginTop: 3 },
  linePrice: { color: brand.dark, fontWeight: "700", marginTop: 5 },
  optionCard: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, padding: 11, backgroundColor: brand.white },
  optionCardActive: { backgroundColor: "#F5EADC", borderColor: brand.buttonAlt },
  optionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  optionTitle: { color: brand.dark, fontWeight: "700", marginBottom: 2 },
  optionDesc: { color: brand.textLight, fontSize: 12 },
  optionSubDesc: { color: brand.textLight, fontSize: 11, marginTop: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: "#B7A8AF", alignItems: "center", justifyContent: "center", backgroundColor: brand.white },
  radioActive: { borderColor: brand.dark },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.dark },
  noticeBox: { marginTop: 8, backgroundColor: "#F5EADC", borderRadius: 8, padding: 10, gap: 3 },
  noticeText: { color: brand.text, fontSize: 12, lineHeight: 18 },
  noticeStrong: { fontWeight: "700", color: brand.dark },
  label: { color: brand.dark, fontWeight: "700", marginTop: 8, marginBottom: 3, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  vehicleRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 2 },
  vehiclePill: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  vehiclePillOn: { borderColor: "#0c5460", backgroundColor: "#f0f7ff" },
  vehicleText: { color: brand.dark, fontWeight: "800", fontSize: 12 },
  vehicleTextOn: { color: "#0c5460" },
  deliveryStrong: { fontWeight: "900", color: "#0c5460" },
  deliveryWarn: { color: "#856404", marginTop: 6, fontSize: 12 },
  input: { borderWidth: 1, borderColor: brand.border, padding: 11, marginBottom: 8, backgroundColor: brand.white, borderRadius: 8 },
  addressInput: { minHeight: 72 },
  deliveryHint: { color: brand.textLight, fontSize: 11, marginTop: -2, marginBottom: 4 },
  summaryCard: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 14, gap: 8 },
  summaryTitle: { color: brand.dark, fontWeight: "800", letterSpacing: 0.4, marginBottom: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  summaryItemRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  summaryThumb: { width: 42, height: 54, borderRadius: 6, backgroundColor: "#F3EDF0" },
  summaryItemMeta: { flex: 1 },
  summaryItemName: { color: brand.dark, fontSize: 12, fontWeight: "600" },
  summaryItemSub: { color: brand.textLight, fontSize: 11, marginTop: 2 },
  summaryLine: { borderTopWidth: 1, borderTopColor: brand.border, marginVertical: 4 },
  summaryLabel: { color: brand.textLight },
  summaryValue: { color: brand.dark, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  summaryTotal: { color: brand.dark, fontWeight: "800", fontSize: 16 },
  summaryName: { color: brand.dark, flex: 1, marginRight: 8 },
  summaryPrice: { color: brand.dark, fontWeight: "600" },
  listItem: { color: brand.text, marginBottom: 5, fontSize: 13 },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 2, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: brand.button, borderColor: brand.button },
  checkboxTick: { color: brand.white, fontSize: 12, fontWeight: "800" },
  termsText: { flex: 1, color: brand.text, fontSize: 12, lineHeight: 18 },
  termsLink: { color: brand.dark, textDecorationLine: "underline", fontWeight: "700" },
  termsWarning: { color: "#8A1D1D", fontSize: 11, marginTop: 4 },
  actions: { flexDirection: "row", gap: 10, alignItems: "center" },
  backBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: brand.white, minWidth: 92 },
  backBtnText: { color: brand.textLight, fontWeight: "700" },
  primaryBtn: { flex: 1, backgroundColor: brand.button, paddingVertical: 13, borderRadius: 10 },
  primaryBtnText: { textAlign: "center", color: brand.white, fontWeight: "700", letterSpacing: 0.7, fontSize: 12 },
  secondaryBtn: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, paddingVertical: 12, borderRadius: 10 },
  secondaryBtnText: { textAlign: "center", color: brand.textLight, fontWeight: "700", letterSpacing: 0.4, fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { width: "100%", maxWidth: 380, maxHeight: "86%", backgroundColor: brand.white, borderRadius: 8, borderWidth: 1, borderColor: brand.border, padding: 14 },
  modalTag: { color: brand.textLight, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 2 },
  modalTitle: { color: brand.dark, fontSize: 24, fontStyle: "italic", marginBottom: 8 },
  modalBody: { borderWidth: 1, borderColor: brand.border, padding: 10, maxHeight: 430 },
  modalText: { color: brand.text, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  modalPrimaryBtn: { flex: 1, backgroundColor: brand.button, paddingVertical: 11, borderRadius: 6 },
  modalPrimaryText: { textAlign: "center", color: brand.white, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  modalSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, paddingVertical: 11, borderRadius: 6 },
  modalSecondaryText: { textAlign: "center", color: brand.textLight, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
});
