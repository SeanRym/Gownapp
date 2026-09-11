import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { changeUserPassword, deleteUserAccount, updateUserProfile } from "../services/authLocal";
import { sendLoginOtp, verifyLoginOtp } from "../services/auth";
import { getOrdersByEmail } from "../services/orders";
import { saveMeasurements, saveStylePreferences } from "../services/fitting";
import { useFitting } from "../context/FittingContext";
import { loadCheckoutProfiles, saveCheckoutProfiles } from "../utils/storage";
import { isAdminRole } from "../utils/access";
import { brand } from "../theme/brand";

const BROWN = "#3B2B1F";
const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;

function measurementValue(value, field, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (unit === "in") {
    return (field === "weight" ? number / KG_PER_POUND : number / CM_PER_INCH).toFixed(1);
  }
  return number.toFixed(1);
}

function measurementToMetric(value, field, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return unit === "in" ? number * (field === "weight" ? KG_PER_POUND : CM_PER_INCH) : number;
}

function initials(name) {
  const parts = String(name || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function memberSinceLabel(user) {
  const raw = user?.createdAt || user?.memberSince;
  if (!raw) return "Member since recently";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Member since recently";
  return `Member since ${d.toLocaleString("en-US", { month: "long", year: "numeric" })}`;
}

function profilePercent(user, checkoutDefaults) {
  const fields = [
    user?.name,
    user?.email,
    checkoutDefaults.phone,
    checkoutDefaults.address,
    checkoutDefaults.city,
    checkoutDefaults.province,
    checkoutDefaults.zip,
  ];
  const filled = fields.filter((v) => String(v || "").trim()).length;
  return Math.round((filled / fields.length) * 100);
}

function Card({ title, hint, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "Not set"}</Text>
    </View>
  );
}

function QuickLink({ label, onPress }) {
  return (
    <Pressable style={styles.quickLink} onPress={onPress}>
      <Text style={styles.quickLinkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#9a8f88" />
    </Pressable>
  );
}

export function ProfileScreen({ navigation }) {
  const { user, login, logout } = useShop();
  const { profile: fittingProfile, updateProfile: updateFittingProfile } = useFitting();
  const isAdmin = isAdminRole(user?.role);
  const [editing, setEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [passwordStage, setPasswordStage] = useState("idle");
  const [passwordForm, setPasswordForm] = useState({ otp: "", newPassword: "", confirmPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [measurementEditing, setMeasurementEditing] = useState(false);
  const [measurementUnit, setMeasurementUnit] = useState("cm");
  const [measurementForm, setMeasurementForm] = useState({
    bust: "",
    waist: "",
    hips: "",
    height: "",
    weight: "",
  });
  const [checkoutDefaults, setCheckoutDefaults] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    province: "",
    zip: "",
  });

  useEffect(() => {
    setProfileForm({
      name: String(user?.name || ""),
      phone: String(user?.phone || user?.phoneNumber || ""),
    });
    setMeasurementForm({
      bust: measurementValue(fittingProfile?.bust, "bust", measurementUnit),
      waist: measurementValue(fittingProfile?.waist, "waist", measurementUnit),
      hips: measurementValue(fittingProfile?.hips, "hips", measurementUnit),
      height: measurementValue(fittingProfile?.height, "height", measurementUnit),
      weight: measurementValue(fittingProfile?.weight, "weight", measurementUnit),
    });
    (async () => {
      if (!user?.email) return;
      const checkoutProfiles = await loadCheckoutProfiles();
      const saved = checkoutProfiles?.[String(user.email).toLowerCase()];
      const userAddressDefaults = {
        firstName: String(user?.firstName || ""),
        lastName: String(user?.lastName || ""),
        phone: String(user?.phone || user?.phoneNumber || ""),
        address: String(user?.address || ""),
        city: String(user?.city || ""),
        province: String(user?.province || ""),
        zip: String(user?.zip || ""),
      };
      const nextCheckoutDefaults = {
        firstName: String(userAddressDefaults.firstName || saved?.firstName || ""),
        lastName: String(userAddressDefaults.lastName || saved?.lastName || ""),
        phone: String(userAddressDefaults.phone || saved?.phone || ""),
        address: String(userAddressDefaults.address || saved?.address || ""),
        city: String(userAddressDefaults.city || saved?.city || ""),
        province: String(userAddressDefaults.province || saved?.province || ""),
        zip: String(userAddressDefaults.zip || saved?.zip || ""),
      };
      setCheckoutDefaults(nextCheckoutDefaults);
      try {
        const orders = await getOrdersByEmail(user.email, user.id);
        setRecentOrders(Array.isArray(orders) ? orders.slice(0, 3) : []);
      } catch {
        setRecentOrders([]);
      }
    })();
  }, [user?.email, user?.id, user?.name, user?.phone, user?.firstName, user?.lastName, user?.address, user?.city, user?.province, user?.zip]);

  const completion = useMemo(
    () => profilePercent(user, checkoutDefaults),
    [user, checkoutDefaults]
  );

  const hasSavedMeasurements = Boolean(
    fittingProfile?.bust || fittingProfile?.waist || fittingProfile?.hips || fittingProfile?.height || fittingProfile?.weight
  );

  const openMeasurementStudio = () => {
    navigation.navigate("FittingStudio", { panel: "scan" });
  };

  const resetMeasurementForm = () => {
    setMeasurementForm({
      bust: measurementValue(fittingProfile?.bust, "bust", measurementUnit),
      waist: measurementValue(fittingProfile?.waist, "waist", measurementUnit),
      hips: measurementValue(fittingProfile?.hips, "hips", measurementUnit),
      height: measurementValue(fittingProfile?.height, "height", measurementUnit),
      weight: measurementValue(fittingProfile?.weight, "weight", measurementUnit),
    });
  };

  const toggleMeasurementUnit = () => {
    const nextUnit = measurementUnit === "cm" ? "in" : "cm";
    setMeasurementForm((current) =>
      Object.fromEntries(
        Object.entries(current).map(([field, value]) => [
          field,
          measurementValue(measurementToMetric(value, field, measurementUnit), field, nextUnit),
        ])
      )
    );
    setMeasurementUnit(nextUnit);
  };

  const onSaveMeasurements = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Please sign in to save your measurements.");
      return;
    }

    const next = {
      bust: measurementToMetric(measurementForm.bust, "bust", measurementUnit),
      waist: measurementToMetric(measurementForm.waist, "waist", measurementUnit),
      hips: measurementToMetric(measurementForm.hips, "hips", measurementUnit),
      height: measurementToMetric(measurementForm.height, "height", measurementUnit),
      weight: measurementToMetric(measurementForm.weight, "weight", measurementUnit),
    };

    if (!next.bust && !next.waist && !next.hips && !next.height && !next.weight) {
      Alert.alert("No measurements", "Add at least one measurement before saving.");
      return;
    }

    try {
      const payload = {
        ...fittingProfile,
        ...next,
        source: fittingProfile?.source || "manual",
      };
      updateFittingProfile(payload);
      await saveMeasurements(user.id, {
        bust_cm: next.bust,
        waist_cm: next.waist,
        hips_cm: next.hips,
        height_cm: next.height,
        weight_kg: next.weight,
        source: payload.source,
      });
      await saveStylePreferences(user.id, payload);
      updateFittingProfile({
        bust: next.bust,
        waist: next.waist,
        hips: next.hips,
        height: next.height,
        weight: next.weight,
        source: payload.source,
      });
      setMeasurementEditing(false);
      Alert.alert("Saved", "Measurements saved to your fitting profile.");
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Unable to save your measurements.");
    }
  };

  const onSaveAll = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      const cleanEmail = String(user.email).toLowerCase();
      const all = await loadCheckoutProfiles();
      const nameParts = String(profileForm.name || "").trim().split(/\s+/);
      const persistedCheckout = {
        ...checkoutDefaults,
        firstName: checkoutDefaults.firstName || nameParts[0] || "",
        lastName: checkoutDefaults.lastName || nameParts.slice(1).join(" ") || "",
        phone: String(checkoutDefaults.phone || profileForm.phone || "").replace(/\D/g, ""),
        address: String(checkoutDefaults.address || "").trim(),
        city: String(checkoutDefaults.city || "").trim(),
        province: String(checkoutDefaults.province || "").trim(),
        zip: String(checkoutDefaults.zip || "").trim(),
      };

      const res = await updateUserProfile({
        id: user.id,
        email: user.email,
        name: profileForm.name,
        phone: persistedCheckout.phone,
        address: persistedCheckout.address,
        city: persistedCheckout.city,
        province: persistedCheckout.province,
        zip: persistedCheckout.zip,
      });
      if (!res?.ok) throw new Error(res?.error || "Unable to update profile.");

      await saveCheckoutProfiles({
        ...(all || {}),
        [cleanEmail]: persistedCheckout,
      });

      const nextUser = {
        ...(user || {}),
        ...(res?.user || {}),
        name: profileForm.name || user.name || "Customer",
        phone: persistedCheckout.phone || user.phone || "",
        email: user.email,
        address: persistedCheckout.address,
        city: persistedCheckout.city,
        province: persistedCheckout.province,
        zip: persistedCheckout.zip,
      };
      await login(nextUser);
      setEditing(false);
      Alert.alert("Saved", "Profile updated.");
    } catch (e) {
      Alert.alert("Update failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSendPasswordOtp = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      const result = await sendLoginOtp(user.email, "password_reset");
      if (!result.ok) throw new Error("Unable to send verification code.");
      Alert.alert(
        "Verification sent",
        result.devMode ? `Use this code: ${result.otp}` : "A verification code has been sent to your email."
      );
      setPasswordStage("verify");
    } catch (e) {
      Alert.alert("OTP send failed", e.message || "Unable to send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const onVerifyPasswordOtp = async () => {
    if (!user?.email) return;
    if (!passwordForm.otp) {
      Alert.alert("Missing code", "Enter the verification code sent to your email.");
      return;
    }
    setBusy(true);
    try {
      await verifyLoginOtp(user.email, passwordForm.otp, "password_reset");
      setPasswordStage("change");
      setPasswordForm((prev) => ({ ...prev, otp: "" }));
      Alert.alert("Verified", "Now choose a new password.");
    } catch (e) {
      Alert.alert("OTP verification failed", e.message || "Invalid verification code.");
    } finally {
      setBusy(false);
    }
  };

  const onChangePassword = async () => {
    if (!user?.email) return;
    if (!passwordForm.newPassword) {
      Alert.alert("Missing password", "Enter a new password.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert("Password mismatch", "New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await changeUserPassword({
        id: user.id,
        email: user.email,
        nextPassword: passwordForm.newPassword,
        otpVerified: true,
      });
      if (!res.ok) throw new Error(res.error || "Failed to change password.");
      setPasswordForm({ otp: "", newPassword: "", confirmPassword: "" });
      setPasswordStage("idle");
      setShowPassword(false);
      Alert.alert("Success", "Password updated.");
    } catch (e) {
      Alert.alert("Password update failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  function passwordChecks(pw) {
    const val = String(pw || "");
    return {
      length: val.length >= 8,
      letter: /[A-Za-z]/.test(val),
      number: /[0-9]/.test(val),
    };
  }

  const onDeleteAccount = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      const res = await deleteUserAccount({ email: user.email, password: deletePassword });
      if (!res.ok) throw new Error(res.error || "Failed to delete account.");
      await logout();
      setDeletePassword("");
    } catch (e) {
      Alert.alert("Delete failed", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.guestContent}>
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarText}>?</Text>
          </View>
          <Text style={styles.heroName}>Your account</Text>
          <Text style={styles.heroSub}>Sign in to manage orders, favorites, and checkout details.</Text>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.primaryBtnText}>SIGN IN</Text>
          </Pressable>
          <Pressable style={styles.outlineBtn} onPress={() => navigation.navigate("ForgotPassword")}>
            <Text style={styles.outlineBtnText}>Reset password</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarText}>{initials(user.name)}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{user.name || "Customer"}</Text>
            <Text style={styles.heroSub}>{memberSinceLabel(user)}</Text>
          </View>
        </View>
        <Pressable
          style={styles.editProfileBtn}
          onPress={() => {
            if (editing) onSaveAll();
            else setEditing(true);
          }}
          disabled={busy}
        >
          <Text style={styles.editProfileText}>{editing ? (busy ? "SAVING…" : "SAVE PROFILE") : "EDIT PROFILE"}</Text>
        </Pressable>
      </View>

      <Card title="Personal Information" hint="Pre-fills your checkout. Tap Edit profile to update.">
        {editing ? (
          <>
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              value={profileForm.name}
              onChangeText={(v) => setProfileForm((p) => ({ ...p, name: v }))}
            />
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
            <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
            <TextInput
              style={styles.input}
              value={profileForm.phone}
              onChangeText={(v) => setProfileForm((p) => ({ ...p, phone: v.replace(/\D/g, "") }))}
              keyboardType="phone-pad"
            />
          </>
        ) : (
          <>
            <InfoRow label="FULL NAME" value={user.name} />
            <InfoRow label="EMAIL" value={user.email} />
            <InfoRow label="PHONE NUMBER" value={profileForm.phone || checkoutDefaults.phone} />
          </>
        )}
      </Card>

      <Card title="Delivery Address">
          {editing ? (
            <>
              {[
                ["STREET / BARANGAY", "address"],
                ["CITY", "city"],
                ["PROVINCE", "province"],
                ["ZIP / POSTAL", "zip"],
              ].map(([label, key]) => (
                <View key={key}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    value={checkoutDefaults[key]}
                    onChangeText={(v) => setCheckoutDefaults((p) => ({ ...p, [key]: v }))}
                  />
                </View>
              ))}
            </>
          ) : (
            <>
              <InfoRow label="STREET / BARANGAY" value={checkoutDefaults.address} />
              <InfoRow label="CITY" value={checkoutDefaults.city} />
              <InfoRow label="PROVINCE" value={checkoutDefaults.province} />
              <InfoRow label="ZIP / POSTAL" value={checkoutDefaults.zip} />
            </>
          )}
      </Card>

      <Card title="My measurements" hint="Used by FitMatcher to recommend your size on every gown.">
          {!measurementEditing && !hasSavedMeasurements ? (
            <>
              <Text style={styles.measurementHint}>No measurements saved yet. Use this recommender to get personalized size suggestions for any gown.</Text>
              <Pressable style={styles.measurementPrimaryBtn} onPress={openMeasurementStudio}>
                <Text style={styles.measurementPrimaryBtnText}>USE CAMERA / ENTER MEASUREMENTS →</Text>
              </Pressable>
              <Pressable style={styles.measurementSecondaryBtn} onPress={() => setMeasurementEditing(true)}>
                <Text style={styles.measurementSecondaryBtnText}>ENTER MANUALLY</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.measurementHeader}>
                <Text style={styles.measurementHint}>Used by FitMatcher to recommend your size on every gown.</Text>
                <View style={styles.measurementHeaderActions}>
                  <Pressable style={styles.unitToggle} onPress={toggleMeasurementUnit}>
                    <Text style={measurementUnit === "cm" ? styles.unitToggleActive : styles.unitToggleText}>CM</Text>
                    <Text style={styles.unitToggleDivider}>/</Text>
                    <Text style={measurementUnit === "in" ? styles.unitToggleActive : styles.unitToggleText}>IN</Text>
                  </Pressable>
                  <Pressable
                    style={styles.editMeasureBtn}
                    onPress={() => {
                      if (measurementEditing) {
                        resetMeasurementForm();
                        setMeasurementEditing(false);
                        return;
                      }
                      resetMeasurementForm();
                      setMeasurementEditing(true);
                    }}
                  >
                    <Text style={styles.editMeasureBtnText}>{measurementEditing ? "×" : "✎"}</Text>
                  </Pressable>
                </View>
              </View>

              {!measurementEditing ? (
                <>
                  <View style={styles.measurementGrid}>
                    {[
                      ["Bust", fittingProfile?.bust, "cm"],
                      ["Waist", fittingProfile?.waist, "cm"],
                      ["Hips", fittingProfile?.hips, "cm"],
                      ["Height", fittingProfile?.height, "cm"],
                      ["Weight", fittingProfile?.weight, "kg"],
                    ]
                      .filter(([, value]) => value != null && value !== "")
                      .map(([label, value, unit]) => (
                        <View key={label} style={styles.measurementChip}>
                          <Text style={styles.measurementLabel}>{label}</Text>
                          <Text style={styles.measurementValue}>
                            {measurementValue(value, label.toLowerCase() === "weight" ? "weight" : label.toLowerCase(), measurementUnit)} {measurementUnit === "in" && unit === "kg" ? "lb" : measurementUnit === "in" ? "in" : unit}
                          </Text>
                        </View>
                      ))}
                  </View>

                  <View style={styles.sourceRow}>
                    <Text style={styles.sourceLabel}>Source</Text>
                    <View style={styles.sourceBadge}>
                      <Text style={styles.sourceBadgeText}>{fittingProfile?.source || "manual"}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.measurementEditGrid}>
                    {[
                      ["Bust", "bust"],
                      ["Waist", "waist"],
                      ["Hips", "hips"],
                      ["Height (optional)", "height"],
                      ["Weight (optional)", "weight"],
                    ].map(([label, key]) => (
                      <View key={key} style={styles.measurementFieldWrap}>
                        <Text style={styles.fieldLabel}>{label} ({key === "weight" ? (measurementUnit === "cm" ? "kg" : "lb") : measurementUnit})</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="decimal-pad"
                          value={measurementForm[key]}
                          placeholder="0"
                          onChangeText={(v) => setMeasurementForm((prev) => ({ ...prev, [key]: v }))}
                        />
                      </View>
                    ))}
                  </View>

                  <View style={styles.editActionsRow}>
                    <Pressable style={styles.secondaryBtn} onPress={() => {
                      resetMeasurementForm();
                      setMeasurementEditing(false);
                    }}>
                      <Text style={styles.secondaryBtnText}>CANCEL</Text>
                    </Pressable>
                    <Pressable style={styles.primaryBtn} onPress={onSaveMeasurements}>
                      <Text style={styles.primaryBtnText}>SAVE MEASUREMENTS</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}
      </Card>

      <Card title="Security" hint="Keep your account safe with a strong password.">
        {!showPassword ? (
          <Pressable
            style={styles.outlineBtn}
            onPress={() => {
              setShowPassword(true);
              setPasswordStage("send");
              setPasswordForm({ otp: "", newPassword: "", confirmPassword: "" });
            }}
          >
            <Text style={styles.outlineBtnText}>CHANGE PASSWORD</Text>
          </Pressable>
        ) : (
          <>
            {passwordStage === "send" ? (
              <Pressable style={styles.primaryBtn} onPress={onSendPasswordOtp} disabled={busy}>
                <Text style={styles.primaryBtnText}>{busy ? "SENDING…" : "Send verification code to email"}</Text>
              </Pressable>
            ) : passwordStage === "verify" ? (
              <>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  placeholder="Enter verification code"
                  placeholderTextColor={brand.placeholder}
                  value={passwordForm.otp}
                  onChangeText={(v) => setPasswordForm((p) => ({ ...p, otp: v.replace(/\D/g, "") }))}
                />
                <Pressable style={styles.primaryBtn} onPress={onVerifyPasswordOtp} disabled={busy}>
                  <Text style={styles.primaryBtnText}>{busy ? "VERIFYING…" : "Verify code"}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    secureTextEntry={!showNewPassword}
                    placeholder="Create a new password"
                    placeholderTextColor={brand.dark}
                    value={passwordForm.newPassword}
                    onChangeText={(v) => setPasswordForm((p) => ({ ...p, newPassword: v }))}
                  />
                  <Pressable style={styles.showBtn} onPress={() => setShowNewPassword((prev) => !prev)}>
                    <Text style={styles.showBtnText}>{showNewPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>
                {/* Password validation hints */}
                {(() => {
                  const checks = passwordChecks(passwordForm.newPassword);
                  return (
                    <View style={styles.validationList}>
                      <View style={styles.validationItem}>
                        <Text style={[styles.validationIcon, checks.length ? styles.valid : null]}> {checks.length ? '✓' : '○'}</Text>
                        <Text style={[styles.validationText, checks.length ? styles.valid : null]}>At least 8 characters</Text>
                      </View>
                      <View style={styles.validationItem}>
                        <Text style={[styles.validationIcon, checks.letter ? styles.valid : null]}> {checks.letter ? '✓' : '○'}</Text>
                        <Text style={[styles.validationText, checks.letter ? styles.valid : null]}>At least one letter</Text>
                      </View>
                      <View style={styles.validationItem}>
                        <Text style={[styles.validationIcon, checks.number ? styles.valid : null]}> {checks.number ? '✓' : '○'}</Text>
                        <Text style={[styles.validationText, checks.number ? styles.valid : null]}>At least one number</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    secureTextEntry={!showConfirmPassword}
                    placeholder="Confirm your new password"
                    placeholderTextColor={brand.dark}
                    value={passwordForm.confirmPassword}
                    onChangeText={(v) => setPasswordForm((p) => ({ ...p, confirmPassword: v }))}
                  />
                  <Pressable style={styles.showBtn} onPress={() => setShowConfirmPassword((prev) => !prev)}>
                    <Text style={styles.showBtnText}>{showConfirmPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.primaryBtn} onPress={onChangePassword} disabled={busy}>
                  <Text style={styles.primaryBtnText}>{busy ? "UPDATING…" : "UPDATE PASSWORD"}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
        <View style={styles.progressWrap}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>PROFILE</Text>
            <Text style={styles.progressPct}>{completion}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completion}%` }]} />
          </View>
        </View>
      </Card>

      <Card title="Quick Links">
        <QuickLink label="My orders" onPress={() => navigation.navigate("MyOrders")} />
        <QuickLink label="Favorites" onPress={() => navigation.navigate("Main", { screen: "Favorites" })} />
        <QuickLink label="Size recommender" onPress={() => navigation.navigate("Main", { screen: "FittingRoom" })} />
        <QuickLink label="Virtual try-on" onPress={() => navigation.navigate("AR Try-On")} />
        <QuickLink label="Browse collection" onPress={() => navigation.navigate("Main", { screen: "Catalogue" })} />
        <QuickLink label="View cart" onPress={() => navigation.navigate("Cart")} />
      </Card>

      <Card title="Recent Orders">
        {recentOrders.length ? (
          recentOrders.map((order) => {
            const date = order?.createdAt || order?.placedAt || order?.date;
            const d = date ? new Date(date) : null;
            const dateLabel = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-PH") : "—";
            const total = Number(order?.total || order?.subtotal || 0);
            return (
              <Pressable
                key={String(order?.id || order?.orderId || dateLabel)}
                style={styles.orderRow}
                onPress={() => navigation.navigate("MyOrders")}
              >
                <View>
                  <Text style={styles.orderId}>#{String(order?.id || order?.orderId || "—").slice(0, 12)}</Text>
                  <Text style={styles.orderDate}>{dateLabel}</Text>
                </View>
                <Text style={styles.orderTotal}>₱ {total.toLocaleString("en-PH")}</Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptyMeasurements}>No orders yet.</Text>
        )}
      </Card>

      <Pressable style={styles.outlineBtn} onPress={() => navigation.navigate("Contact")}>
        <Text style={styles.outlineBtnText}>Contact us</Text>
      </Pressable>
      <Pressable style={styles.outlineBtn} onPress={logout}>
        <Text style={styles.outlineBtnText}>Sign out</Text>
      </Pressable>

      {!isAdmin ? (
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Password to confirm"
            placeholderTextColor={brand.dark}
            value={deletePassword}
            onChangeText={setDeletePassword}
          />
          <Pressable
            style={styles.dangerBtn}
            onPress={() => {
              Alert.alert("Delete account", "This cannot be undone. Continue?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: onDeleteAccount },
              ]);
            }}
          >
            <Text style={styles.dangerBtnText}>Delete account</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F3F0" },
  content: { paddingBottom: 32 },
  guestContent: { paddingBottom: 32 },
  hero: {
    backgroundColor: BROWN,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 18,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: brand.gold,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarText: { color: brand.gold, fontSize: 18, fontWeight: "700", letterSpacing: 1 },
  heroInfo: { flex: 1 },
  heroName: { color: "#fff", fontSize: 22, fontWeight: "700", fontStyle: "italic", marginBottom: 4 },
  heroSub: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  editProfileBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editProfileText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  card: {
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: brand.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E0DA",
    padding: 14,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: BROWN, fontStyle: "italic", marginBottom: 4 },
  cardHint: { fontSize: 12, color: brand.textLight, lineHeight: 18, marginBottom: 12 },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 10, fontWeight: "700", color: "#9a8f88", letterSpacing: 0.8, marginBottom: 3 },
  infoValue: { fontSize: 14, color: BROWN, lineHeight: 20 },
  fieldLabel: { fontSize: 10, fontWeight: "700", color: "#9a8f88", letterSpacing: 0.8, marginBottom: 4, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FAFAFA",
    marginBottom: 10,
    fontSize: 14,
    color: brand.text,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
    paddingRight: 48,
  },
  showBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginLeft: 8,
  },
  showBtnText: {
    color: BROWN,
    fontWeight: "700",
    fontSize: 13,
  },
  validationList: { marginBottom: 10, paddingLeft: 6 },
  validationItem: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  validationIcon: { width: 22, fontSize: 14, color: "#999", marginRight: 8 },
  validationText: { fontSize: 13, color: "#777" },
  valid: { color: "#28a745" },
  emptyMeasurements: { fontSize: 13, color: brand.textLight, lineHeight: 20 },
  measurementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  measurementHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  unitToggle: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    backgroundColor: brand.white,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  unitToggleText: { color: brand.textLight, fontSize: 10, fontWeight: "700" },
  unitToggleActive: { color: BROWN, fontSize: 10, fontWeight: "800" },
  unitToggleDivider: { color: brand.border, fontSize: 10, marginHorizontal: 4 },
  measurementHint: {
    flex: 1,
    fontSize: 12,
    color: brand.textLight,
    lineHeight: 18,
  },
  measurementPrimaryBtn: {
    marginTop: 12,
    backgroundColor: "#C88B6A",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  measurementPrimaryBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  measurementSecondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: BROWN,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  measurementSecondaryBtnText: {
    color: BROWN,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  editMeasureBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.white,
    alignItems: "center",
    justifyContent: "center",
  },
  editMeasureBtnText: { fontSize: 13, color: BROWN, fontWeight: "700" },
  measurementGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  measurementChip: {
    minWidth: 88,
    backgroundColor: "#F9F4F1",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  measurementLabel: { fontSize: 9, color: brand.textLight, textTransform: "uppercase", letterSpacing: 0.5 },
  measurementValue: { fontSize: 13, color: BROWN, fontWeight: "700", marginTop: 2 },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  sourceLabel: { fontSize: 11, color: brand.textLight, textTransform: "uppercase", letterSpacing: 0.4 },
  sourceBadge: {
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: "#F8F5F1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sourceBadgeText: { fontSize: 10, color: BROWN, textTransform: "lowercase" },
  measurementEditGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  measurementFieldWrap: {
    width: "48%",
    marginBottom: 2,
  },
  editActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: brand.white,
  },
  secondaryBtnText: { color: BROWN, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: BROWN,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  outlineBtnText: { color: BROWN, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  primaryBtn: {
    backgroundColor: BROWN,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  progressWrap: { marginTop: 14 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { fontSize: 11, fontWeight: "700", color: BROWN, letterSpacing: 0.8 },
  progressPct: { fontSize: 11, fontWeight: "700", color: BROWN },
  progressTrack: { height: 6, backgroundColor: "#EDE6E0", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: brand.gold, borderRadius: 999 },
  quickLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EBE7",
  },
  quickLinkText: { fontSize: 14, color: BROWN },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EBE7",
  },
  orderId: { fontSize: 13, fontWeight: "700", color: BROWN },
  orderDate: { fontSize: 12, color: brand.textLight, marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: "700", color: BROWN },
  dangerZone: { marginHorizontal: 14, marginTop: 8, marginBottom: 20 },
  dangerTitle: { fontSize: 13, fontWeight: "700", color: "#a82949", marginBottom: 8 },
  dangerBtn: { backgroundColor: "#a82949", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  dangerBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
