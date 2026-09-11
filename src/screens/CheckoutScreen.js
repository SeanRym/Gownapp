import { Alert, ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { updateUserProfile } from "../services/authLocal";
import { submitOrder } from "../services/orders";
import { createPaymongoQr, pollPaymongoPayment, switchOrderPaymentMethod } from "../services/payments";
import { calculateShipping } from "../services/shipping";
import {
  calculateBusinessTax,
  DEFAULT_LALAMOVE_VEHICLE,
  estimateAllLalamoveFeesFromAddress,
  getLalamoveVehicleHint,
  getLalamoveVehicleTag,
  LALAMOVE_VEHICLES,
  MOTORCYCLE_DELIVERY_WARNING,
  pickDefaultLalamoveVehicle,
} from "../services/lalamoveEstimate";
import { loadCheckoutProfiles, saveCheckoutProfiles } from "../utils/storage";
import { brand } from "../theme/brand";

function formatPrice(n) {
  return `P${Number(n).toLocaleString("en-PH")}`;
}

const PAYMENT_METHODS = [
  {
    id: "qrph",
    label: "GCash / Maya / Bank (QR Ph)",
    icon: "📱",
    detail: "Scan a QR code to pay instantly — automatically verified.",
  },
  {
    id: "gcash",
    label: "GCash",
    icon: "📱",
    detail: "GCash Number: 09XX-XXX-XXXX · Name: JCE Bridal Boutique",
  },
  {
    id: "bdo",
    label: "BDO Bank Transfer",
    icon: "🏦",
    detail: "BDO Account: 0123-4567-8901 · Account Name: JCE Bridal Boutique",
  },
  {
    id: "cash",
    label: "Cash on Pickup",
    icon: "💵",
    detail: "Pay in full when you collect your order at the boutique.",
    onlyWith: "pickup",
  },
];

const STEPS = ["Review", "Delivery", "Payment", "Confirm", "Pay"];

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
  const [vehicleFees, setVehicleFees] = useState({});
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [lalamoveError, setLalamoveError] = useState("");
  const [payment, setPayment] = useState("qrph");
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState(null);
  const [placedOrderNumber, setPlacedOrderNumber] = useState(null);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [switchingPayment, setSwitchingPayment] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [showOtherPayment, setShowOtherPayment] = useState(false);
  const [orderSnapshot, setOrderSnapshot] = useState(null);
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
  const checkoutLineCount = checkoutItems.length;
  const vehicleHint = useMemo(() => getLalamoveVehicleHint(checkoutLineCount), [checkoutLineCount]);
  const deliveryAddressQuery = useMemo(
    () => [form.address, form.city, form.province, form.zip].map((x) => String(x || "").trim()).filter(Boolean).join(", "),
    [form.address, form.city, form.province, form.zip]
  );
  const shipping = useMemo(
    () => calculateShipping({ province: form.province, subtotal: checkoutSubtotal }),
    [form.province, checkoutSubtotal]
  );
  const lalamoveFee =
    deliveryMethod === "delivery" ? Number(vehicleFees[lalamoveVehicle] || 0) : 0;
  const deliveryFee = deliveryMethod === "pickup" ? 0 : lalamoveFee;
  const businessTax = useMemo(
    () => calculateBusinessTax(checkoutSubtotal, deliveryFee),
    [checkoutSubtotal, deliveryFee]
  );
  const grandTotal = checkoutSubtotal + deliveryFee + businessTax;
  const hasShippingEstimate = deliveryMethod !== "delivery" || lalamoveFee > 0;
  const selectedVehicleMeta = LALAMOVE_VEHICLES.find((v) => v.id === lalamoveVehicle);
  const deliveryKey = deliveryMethod === "pickup" ? "pickup" : "lalamove";
  const availablePaymentMethods = PAYMENT_METHODS.filter(
    (m) => !m.onlyWith || m.onlyWith === deliveryKey
  );
  const deliveryLabel = deliveryMethod === "pickup" ? "Store Pickup" : "Lalamove";
  const deliveryAddressDisplay = [form.address, form.city, form.province, form.zip]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");

  const summaryItems = orderSnapshot?.items ?? checkoutItems;
  const summarySubtotal = orderSnapshot?.subtotal ?? checkoutSubtotal;
  const summaryDeliveryFee = orderSnapshot?.deliveryFee ?? deliveryFee;
  const summaryBusinessTax = orderSnapshot?.businessTax ?? businessTax;
  const summaryGrandTotal = orderSnapshot?.grandTotal ?? grandTotal;
  const summaryDeliveryMethod = orderSnapshot?.deliveryMethod ?? deliveryMethod;
  const summaryHasShippingEstimate =
    orderSnapshot?.hasShippingEstimate ?? hasShippingEstimate;

  useEffect(() => {
    if (!availablePaymentMethods.some((m) => m.id === payment)) {
      setPayment(availablePaymentMethods[0]?.id || "qrph");
    }
  }, [availablePaymentMethods, payment]);

  useEffect(() => {
    if (step !== 4 || !placedOrderId || !user?.id || payment !== "qrph") return;
    let cancelled = false;
    let intervalId = null;

    async function bootQr() {
      setQrLoading(true);
      setQrError("");
      try {
        const data = await createPaymongoQr(placedOrderId, user.id);
        if (cancelled) return;
        if (data?.qrImageUrl) setQrImageUrl(String(data.qrImageUrl));
        else setQrError("Could not generate a QR code right now. You can pay another way below.");
      } catch (e) {
        if (!cancelled) setQrError(e?.message || "Could not connect. You can pay another way below.");
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    }

    bootQr();

    intervalId = setInterval(async () => {
      try {
        const data = await pollPaymongoPayment(placedOrderId, user.id);
        if (cancelled || !data?.ok) return;
        if (data.qrImageUrl) setQrImageUrl(String(data.qrImageUrl));
        if (data.paymentStatus === "paid") {
          clearInterval(intervalId);
          navigation.replace("OrderPlaced", {
            orderId: placedOrderId,
            orderNumber: placedOrderNumber,
          });
        }
        if (data.expired) {
          clearInterval(intervalId);
          setShowOtherPayment(true);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, placedOrderId, placedOrderNumber, payment, user?.id, navigation]);

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const canGoBack = step > 0;

  useEffect(() => {
    if (user?.email) return;
    Alert.alert("Sign in required", "Please sign in first before placing an order.");
    navigation.replace("Login");
  }, [navigation, user?.email]);

  useEffect(() => {
    setLalamoveVehicle(pickDefaultLalamoveVehicle(checkoutLineCount));
  }, [checkoutLineCount]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cleanEmail = String(user?.email || "").trim().toLowerCase();
      if (!cleanEmail) return;
      const profiles = await loadCheckoutProfiles();
      const saved = profiles?.[cleanEmail];
      const splitName = (name) => {
        const raw = String(name || "").trim();
        if (!raw) return { firstName: "", lastName: "" };
        const parts = raw.split(/\s+/).filter(Boolean);
        return {
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
        };
      };
      const fallbackName = splitName(user?.name || saved?.firstName ? `${saved?.firstName || ""} ${saved?.lastName || ""}`.trim() : "");
      const next = {
        email: cleanEmail,
        firstName: String(saved?.firstName || user?.firstName || fallbackName.firstName || ""),
        lastName: String(saved?.lastName || user?.lastName || fallbackName.lastName || ""),
        phone: String(saved?.phone || user?.phone || user?.phoneNumber || ""),
        address: String(saved?.address || user?.address || ""),
        city: String(saved?.city || user?.city || ""),
        province: String(saved?.province || user?.province || ""),
        zip: String(saved?.zip || user?.zip || ""),
      };
      if (!mounted) return;
      setForm((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      mounted = false;
    };
  }, [user?.email, user?.name, user?.firstName, user?.lastName, user?.phone, user?.phoneNumber, user?.address, user?.city, user?.province, user?.zip]);

  const validateReviewStep = () => {
    if (checkoutItems.length === 0) {
      Alert.alert("Nothing to checkout", "Please add at least one gown to your fitting room.");
      return false;
    }
    return true;
  };

  const validateDeliveryStep = () => {
    if (deliveryMethod !== "delivery") return true;
    if (!String(form.address || "").trim()) {
      Alert.alert("Missing address", "Please enter your street / barangay.");
      return false;
    }
    if (!String(form.city || "").trim()) {
      Alert.alert("Missing city", "Please enter your city.");
      return false;
    }
    if (!String(form.province || "").trim()) {
      Alert.alert("Missing province", "Please enter your province.");
      return false;
    }
    if (!String(form.zip || "").trim()) {
      Alert.alert("Missing zip code", "Please enter your zip / postal code.");
      return false;
    }
    return true;
  };

  const validateConfirmStep = () => {
    const email = String(form.email || "").trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      Alert.alert("Invalid email", "Please update your account email to a valid email address before checkout.");
      return false;
    }
    if (deliveryMethod === "delivery") {
      if (!String(form.address || "").trim() || !String(form.city || "").trim()) {
        Alert.alert("Missing address", "Please complete your Lalamove delivery address.");
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    if (deliveryMethod !== "delivery") {
      setVehicleFees({});
      setLalamoveError("");
      return;
    }
    const addr = deliveryAddressQuery;
    if (!String(form.address || "").trim() || !String(form.city || "").trim()) {
      setVehicleFees({});
      return;
    }
    const t = setTimeout(async () => {
      setLalamoveLoading(true);
      setLalamoveError("");
      try {
        const res = await estimateAllLalamoveFeesFromAddress(addr);
        setVehicleFees(res?.fees || {});
        if (res?.usedFallback) {
          setLalamoveError("Could not locate address — using flat estimate. Final fare set by Lalamove.");
        }
      } finally {
        setLalamoveLoading(false);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [deliveryMethod, deliveryAddressQuery, form.address, form.city]);

  const nextStep = () => {
    if (step === 0 && !validateReviewStep()) return;
    if (step === 1 && !validateDeliveryStep()) return;
    if (step === 2 && !payment) {
      Alert.alert("Payment required", "Please select a payment method.");
      return;
    }
    setStep((prev) => Math.min(3, prev + 1));
  };

  const prevStep = () => {
    if (!canGoBack || step >= 4) return;
    setStep((prev) => Math.max(0, prev - 1));
  };

  const goToOrderConfirmation = (order, orderId, orderNumber) => {
    navigation.replace("OrderPlaced", {
      orderId: orderId || order?.id,
      orderNumber: orderNumber || order?.orderNumber,
      order,
    });
  };

  const handleSwitchPayment = async (methodId) => {
    if (!placedOrderId || !user?.id) return;
    if (methodId === "cash" && deliveryMethod !== "pickup") {
      Alert.alert("Not available", "Cash on pickup is only available for store pickup orders.");
      return;
    }
    setSwitchingPayment(true);
    try {
      await switchOrderPaymentMethod(placedOrderId, methodId, user.id);
      const nextOrder = {
        ...(placedOrder || {}),
        id: placedOrderId,
        orderNumber: placedOrderNumber,
        payment: methodId,
        paymentMethod: methodId,
      };
      goToOrderConfirmation(nextOrder, placedOrderId, placedOrderNumber);
    } catch (e) {
      Alert.alert("Could not switch payment", e?.message || "Please try again.");
    } finally {
      setSwitchingPayment(false);
    }
  };

  const placeOrder = async () => {
    if (checkoutItems.length === 0) return;
    if (!validateConfirmStep()) return;
    if (!termsAccepted) {
      setShowTerms(true);
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
        const profileUpdate = await updateUserProfile({
          id: user?.id,
          email: cleanEmail,
          name: `${String(form.firstName || "").trim()} ${String(form.lastName || "").trim()}`.trim() || user?.name,
          phone: String(form.phone || "").trim(),
          address: String(form.address || "").trim(),
          city: String(form.city || "").trim(),
          province: String(form.province || "").trim(),
          zip: String(form.zip || "").trim(),
        });
        if (!profileUpdate?.ok) {
          throw new Error(profileUpdate?.error || "Unable to sync delivery address to your profile.");
        }
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
        businessTax,
        total: grandTotal,
        createdAt: new Date().toISOString(),
      });

      setOrderSnapshot({
        items: checkoutItems.map((i) => ({
          id: i.id,
          name: i.name,
          image: i.image,
          size: i.size,
          qty: i.qty,
          subtotal: i.subtotal,
        })),
        subtotal: checkoutSubtotal,
        deliveryFee,
        businessTax,
        grandTotal,
        deliveryMethod,
        hasShippingEstimate,
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

      const oid = response?.orderId || response?.order?.id;
      const onum = response?.orderNumber || response?.order?.orderNumber;

      if (payment === "qrph") {
        setPlacedOrder(response?.order || null);
        setPlacedOrderId(oid);
        setPlacedOrderNumber(onum);
        setShowOtherPayment(false);
        setQrImageUrl("");
        setStep(4);
        return;
      }

      goToOrderConfirmation(response?.order, oid, onum);
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
          <Text style={[styles.stepDotText, active || done ? styles.stepDotTextActive : null]}>
            {done ? "✓" : index + 1}
          </Text>
        </View>
        <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Checkout</Text>
      <Text style={styles.subTitle}>Complete your order in 5 simple steps.</Text>

      <View style={styles.stepsRow}>
        {STEPS.map((item, index) => (
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
                <Text style={styles.optionMeta}>
                  {deliveryMethod === "delivery" && lalamoveFee > 0
                    ? formatPrice(lalamoveFee)
                    : "Calculated from address"}
                </Text>
              </View>
              <Text style={styles.optionDesc}>Same day or scheduled delivery</Text>
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
                <Text style={styles.fieldLabel}>Street / Barangay *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 123 Rizal St, Brgy. San Antonio"
                  value={form.address}
                  onChangeText={(v) => onChange("address", v)}
                />
                <Text style={styles.fieldLabel}>City *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Quezon City"
                  value={form.city}
                  onChangeText={(v) => onChange("city", v)}
                />
                <Text style={styles.fieldLabel}>Province *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Metro Manila"
                  value={form.province}
                  onChangeText={(v) => onChange("province", v)}
                />
                <Text style={styles.fieldLabel}>Zip / Postal code *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1100"
                  value={form.zip}
                  onChangeText={(v) => onChange("zip", v)}
                  keyboardType="number-pad"
                />

                <Text style={styles.label}>Vehicle type</Text>
                <Text style={styles.vehicleHint}>{vehicleHint}</Text>
                <View style={styles.vehicleCardRow}>
                  {LALAMOVE_VEHICLES.map((v) => {
                    const selected = lalamoveVehicle === v.id;
                    const cardFee = Number(vehicleFees[v.id] || 0);
                    const tag = getLalamoveVehicleTag(checkoutLineCount, v.id);
                    return (
                      <Pressable
                        key={v.id}
                        style={[styles.vehicleCard, selected ? styles.vehicleCardActive : null]}
                        onPress={() => setLalamoveVehicle(v.id)}
                      >
                        <View style={styles.vehicleTopRow}>
                          <MaterialCommunityIcons
                            name={v.iconName}
                            size={22}
                            color={selected ? "#0c5460" : brand.dark}
                          />
                          {tag ? (
                            <View
                              style={[
                                styles.vehicleBadge,
                                tag.style === "good" && styles.badgeRecommended,
                                tag.style === "neutral" && styles.badgeAvailable,
                                tag.style === "warn" && styles.badgeWarn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.vehicleBadgeText,
                                  tag.style === "good" && styles.vehicleBadgeTextGood,
                                  tag.style === "warn" && styles.vehicleBadgeTextWarn,
                                ]}
                              >
                                {tag.label.toUpperCase()}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.vehicleCardTitle, selected ? styles.vehicleCardTitleActive : null]}>
                          {v.label}
                        </Text>
                        <Text style={styles.vehicleCardSub}>{v.subtitle}</Text>
                        {cardFee > 0 && selected ? (
                          <Text style={[styles.vehicleCardPrice, styles.vehicleCardPriceActive]}>
                            ~{formatPrice(cardFee)}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {lalamoveVehicle === "motorcycle" ? (
                  <View style={styles.motorcycleAlert}>
                    <Text style={styles.motorcycleAlertText}>⚠ {MOTORCYCLE_DELIVERY_WARNING}</Text>
                  </View>
                ) : null}

                {lalamoveLoading ? <Text style={styles.deliveryHint}>Computing shipping estimate…</Text> : null}
                {!lalamoveLoading && lalamoveFee > 0 ? (
                  <Text style={styles.deliveryHint}>
                    {selectedVehicleMeta?.labelShort || "Sedan"} estimate:{" "}
                    <Text style={styles.deliveryStrong}>{formatPrice(lalamoveFee)}</Text>
                    {"  "}Dynamic pricing — final fare set by Lalamove at booking.
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
            {availablePaymentMethods.map((opt) => (
              <Pressable
                key={opt.id}
                style={[styles.optionCard, payment === opt.id ? styles.optionCardActive : null]}
                onPress={() => setPayment(opt.id)}
              >
                <View style={styles.paymentOptionRow}>
                  <Text style={styles.paymentIcon}>{opt.icon}</Text>
                  <View style={styles.paymentOptionText}>
                    <Text style={styles.optionTitle}>{opt.label}</Text>
                    <Text style={styles.optionDesc}>{opt.detail}</Text>
                  </View>
                  <View style={[styles.radio, payment === opt.id ? styles.radioActive : null]}>
                    {payment === opt.id ? <View style={styles.radioInner} /> : null}
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.sectionTitle}>Confirm your order</Text>

            <Text style={styles.confirmLabel}>Items</Text>
            {checkoutItems.map((item, index) => (
              <View key={`confirm-${item.id}-${index}`} style={styles.confirmItemRow}>
                <Text style={styles.confirmItemText}>
                  {item.name}
                  {item.size ? ` — ${item.size}` : ""} ×{item.qty}
                </Text>
                <Text style={styles.confirmItemPrice}>{formatPrice(item.subtotal)}</Text>
              </View>
            ))}

            <Text style={styles.confirmLabel}>Delivery</Text>
            <Text style={styles.confirmValue}>{deliveryLabel}</Text>
            {deliveryMethod === "delivery" ? (
              <>
                <Text style={styles.confirmSub}>
                  {selectedVehicleMeta?.label || "Sedan"} vehicle
                </Text>
                {deliveryAddressDisplay ? (
                  <Text style={styles.confirmSub}>{deliveryAddressDisplay}</Text>
                ) : null}
                <Text style={styles.confirmSub}>
                  Estimated delivery fee: {hasShippingEstimate ? formatPrice(deliveryFee) : "TBD"} · Final fee
                  confirmed before dispatch.
                </Text>
              </>
            ) : null}

            <View style={styles.confirmTotals}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatPrice(checkoutSubtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Shipping{deliveryMethod === "delivery" ? " (Lalamove est.)" : ""}
                </Text>
                <Text style={styles.summaryValue}>
                  {deliveryMethod === "pickup"
                    ? "Free"
                    : hasShippingEstimate
                      ? formatPrice(deliveryFee)
                      : "TBD"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Business tax (3%)</Text>
                <Text style={styles.summaryValue}>
                  {deliveryMethod === "delivery" && !hasShippingEstimate ? "TBD" : formatPrice(businessTax)}
                </Text>
              </View>
              <View style={styles.summaryLine} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryTotal}>{formatPrice(grandTotal)}</Text>
              </View>
            </View>

            <Pressable
              style={styles.termsRow}
              onPress={() => {
                if (termsAccepted) setTermsAccepted(false);
                else setShowTerms(true);
              }}
            >
              <View style={[styles.checkbox, termsAccepted ? styles.checkboxChecked : null]}>
                {termsAccepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>
                I have read and agree to the{" "}
                <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>
                  Terms & Conditions
                </Text>
              </Text>
            </Pressable>
            {!termsAccepted ? (
              <Text style={styles.termsWarning}>You must agree to Terms & Conditions before placing your order.</Text>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={styles.sectionTitle}>Payment</Text>
            <Text style={styles.qrOrderNote}>
              Order {placedOrderNumber || placedOrderId} placed — complete payment to finish.
            </Text>

            {!showOtherPayment ? (
              <>
                <View style={styles.qrBox}>
                  {qrLoading && !qrImageUrl ? (
                    <>
                      <ActivityIndicator size="small" color={brand.dark} />
                      <Text style={styles.qrLoadingText}>Generating your QR code…</Text>
                    </>
                  ) : qrImageUrl ? (
                    <>
                      <Text style={styles.qrScanText}>Scan to pay with GCash, Maya, or your bank</Text>
                      <Image source={{ uri: qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
                      <Text style={styles.qrAutoText}>
                        This page updates automatically once payment is received — no need to refresh.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.qrErrorText}>{qrError || "Could not load QR code."}</Text>
                  )}
                </View>
                <Pressable style={styles.linkBtn} onPress={() => setShowOtherPayment(true)}>
                  <Text style={styles.linkBtnText}>Pay another way →</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.confirmSub}>
                  Choose another payment method. You'll upload proof of payment on the next page.
                </Text>
                {PAYMENT_METHODS.filter((m) => m.id !== "qrph" && (!m.onlyWith || m.onlyWith === deliveryKey)).map(
                  (opt) => (
                  <Pressable
                    key={`alt-${opt.id}`}
                    style={styles.optionCard}
                    disabled={switchingPayment}
                    onPress={() => handleSwitchPayment(opt.id)}
                  >
                    <View style={styles.paymentOptionRow}>
                      <Text style={styles.paymentIcon}>{opt.icon}</Text>
                      <View style={styles.paymentOptionText}>
                        <Text style={styles.optionTitle}>{opt.label}</Text>
                        <Text style={styles.optionDesc}>{opt.detail}</Text>
                      </View>
                    </View>
                  </Pressable>
                  )
                )}
                {switchingPayment ? <Text style={styles.confirmSub}>Switching payment method…</Text> : null}
                <Pressable style={styles.linkBtn} onPress={() => setShowOtherPayment(false)}>
                  <Text style={styles.linkBtnText}>← Back to QR Ph payment</Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        {summaryItems.map((item, index) => (
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
          <Text style={styles.summaryValue}>{formatPrice(summarySubtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text style={styles.summaryValue}>
            {summaryDeliveryMethod === "pickup"
              ? "free"
              : summaryHasShippingEstimate
                ? formatPrice(summaryDeliveryFee)
                : "TBD"}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Business tax (3%)</Text>
          <Text style={styles.summaryValue}>
            {summaryDeliveryMethod === "delivery" && !summaryHasShippingEstimate
              ? "TBD"
              : formatPrice(summaryBusinessTax)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryTotal}>
            {summaryDeliveryMethod === "delivery" && !summaryHasShippingEstimate
              ? "TBD"
              : formatPrice(summaryGrandTotal)}
          </Text>
        </View>
        {summaryDeliveryMethod === "delivery" && !summaryHasShippingEstimate ? (
          <Text style={styles.summaryNote}>* Enter your address to calculate shipping and total</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {step < 3 ? (
          <>
            <Pressable style={styles.primaryBtn} onPress={nextStep}>
              <Text style={styles.primaryBtnText}>
                {step === 0 ? "Continue to Delivery" : step === 1 ? "Continue to Payment" : "Continue →"}
              </Text>
            </Pressable>
            {canGoBack ? (
              <Pressable style={styles.backBtn} onPress={prevStep}>
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            ) : null}
          </>
        ) : step === 3 ? (
          <>
            <Pressable style={styles.primaryBtn} onPress={placeOrder} disabled={submitting}>
              <Text style={styles.primaryBtnText}>{submitting ? "Placing order…" : "Place Order"}</Text>
            </Pressable>
            {canGoBack ? (
              <Pressable style={styles.backBtn} onPress={prevStep}>
                <Text style={styles.backBtnText}>Back</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
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
  paymentOptionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  paymentIcon: { fontSize: 22, marginTop: 2 },
  paymentOptionText: { flex: 1, paddingRight: 8 },
  confirmLabel: {
    color: brand.textLight,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 4,
  },
  confirmItemRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  confirmItemText: { flex: 1, color: brand.dark, fontSize: 13 },
  confirmItemPrice: { color: brand.dark, fontWeight: "700", fontSize: 13 },
  confirmValue: { color: brand.dark, fontWeight: "700", fontSize: 14 },
  confirmSub: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginTop: 2 },
  confirmTotals: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    gap: 6,
  },
  qrOrderNote: { color: brand.textLight, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  qrBox: {
    backgroundColor: "#F5EADC",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    minHeight: 180,
    justifyContent: "center",
  },
  qrLoadingText: { color: brand.textLight, fontSize: 14 },
  qrScanText: { color: brand.dark, fontWeight: "600", fontSize: 14, marginBottom: 12, textAlign: "center" },
  qrImage: { width: 220, height: 220, backgroundColor: brand.white, borderRadius: 8 },
  qrAutoText: { color: brand.textLight, fontSize: 11, marginTop: 12, textAlign: "center", lineHeight: 16 },
  qrErrorText: { color: "#8A1D1D", fontSize: 13, textAlign: "center", lineHeight: 18 },
  linkBtn: { alignSelf: "center", marginTop: 12, paddingVertical: 8 },
  linkBtnText: { color: brand.dark, fontWeight: "700", fontSize: 13, textDecorationLine: "underline" },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: "#B7A8AF", alignItems: "center", justifyContent: "center", backgroundColor: brand.white },
  radioActive: { borderColor: brand.dark },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.dark },
  noticeBox: { marginTop: 8, backgroundColor: "#F5EADC", borderRadius: 8, padding: 10, gap: 3 },
  noticeText: { color: brand.text, fontSize: 12, lineHeight: 18 },
  noticeStrong: { fontWeight: "700", color: brand.dark },
  label: { color: brand.dark, fontWeight: "700", marginTop: 8, marginBottom: 3, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  fieldLabel: { color: brand.textLight, fontWeight: "700", marginTop: 4, marginBottom: 3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  vehicleHint: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  vehicleCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  vehicleCard: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 108,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: brand.white,
    minHeight: 128,
  },
  vehicleCardActive: { borderColor: "#7a5a44", backgroundColor: "rgba(122,90,68,0.06)" },
  vehicleTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 6,
  },
  vehicleBadge: {
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: "72%",
  },
  badgeAvailable: { backgroundColor: "#e8f0ff" },
  badgeRecommended: { backgroundColor: "#d4edda" },
  badgeWarn: { backgroundColor: "#fff3cd" },
  vehicleBadgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3, color: "#2d5be3" },
  vehicleBadgeTextGood: { color: "#155724" },
  vehicleBadgeTextWarn: { color: "#856404" },
  vehicleCardTitle: { color: brand.dark, fontWeight: "700", fontSize: 11, lineHeight: 15 },
  vehicleCardTitleActive: { color: "#2c2420" },
  vehicleCardSub: { color: brand.textLight, fontSize: 10, lineHeight: 14, marginTop: 4 },
  vehicleCardPrice: { color: "#2c6e3f", fontWeight: "700", fontSize: 11, marginTop: 8 },
  vehicleCardPriceActive: { color: "#2c6e3f" },
  motorcycleAlert: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#ffecb5",
    backgroundColor: "#fff8e6",
    borderRadius: 8,
    padding: 10,
  },
  motorcycleAlertText: { color: "#856404", fontSize: 12, lineHeight: 18 },
  deliveryStrong: { fontWeight: "900", color: "#0c5460" },
  deliveryWarn: { color: "#856404", marginTop: 6, fontSize: 12 },
  input: { borderWidth: 1, borderColor: brand.border, padding: 11, marginBottom: 8, backgroundColor: brand.white, borderRadius: 8 },
  deliveryHint: { color: brand.textLight, fontSize: 11, marginTop: 6, marginBottom: 4 },
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
  summaryNote: { color: brand.textLight, fontSize: 10, marginTop: 4, fontStyle: "italic" },
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
