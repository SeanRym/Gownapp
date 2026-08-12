import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { changeUserPassword, deleteUserAccount, updateUserProfile } from "../services/authLocal";
import { sendLoginOtp, verifyLoginOtp } from "../services/auth";
import { getOrdersByEmail } from "../services/orders";
import { loadCheckoutProfiles, saveCheckoutProfiles } from "../utils/storage";
import { brand } from "../theme/brand";

const BROWN = "#3B2B1F";

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
  const isAdmin = user?.role === "admin";
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
    (async () => {
      if (!user?.email) return;
      const checkoutProfiles = await loadCheckoutProfiles();
      const saved = checkoutProfiles?.[String(user.email).toLowerCase()];
      if (saved) {
        setCheckoutDefaults({
          firstName: String(saved.firstName || ""),
          lastName: String(saved.lastName || ""),
          phone: String(saved.phone || ""),
          address: String(saved.address || ""),
          city: String(saved.city || ""),
          province: String(saved.province || ""),
          zip: String(saved.zip || ""),
        });
      }
      try {
        const orders = await getOrdersByEmail(user.email, user.id);
        setRecentOrders(Array.isArray(orders) ? orders.slice(0, 3) : []);
      } catch {
        setRecentOrders([]);
      }
    })();
  }, [user?.email, user?.id, user?.name, user?.phone]);

  const completion = useMemo(
    () => profilePercent(user, checkoutDefaults),
    [user, checkoutDefaults]
  );

  const onSaveAll = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      const res = await updateUserProfile({
        id: user.id,
        email: user.email,
        name: profileForm.name,
        phone: profileForm.phone,
      });
      if (!res.ok) throw new Error(res.error || "Failed to save profile.");

      const cleanEmail = String(user.email).toLowerCase();
      const all = await loadCheckoutProfiles();
      const nameParts = String(profileForm.name || "").trim().split(/\s+/);
      await saveCheckoutProfiles({
        ...(all || {}),
        [cleanEmail]: {
          ...checkoutDefaults,
          firstName: checkoutDefaults.firstName || nameParts[0] || "",
          lastName: checkoutDefaults.lastName || nameParts.slice(1).join(" ") || "",
          phone: String(checkoutDefaults.phone || profileForm.phone || "").replace(/\D/g, ""),
        },
      });

      await login(res.user);
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

      {!isAdmin ? (
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
      ) : null}

      {!isAdmin ? (
        <Card
          title="My Measurements"
          hint="Use the size recommender to get personalised size suggestions on any gown."
        >
          <Text style={styles.emptyMeasurements}>
            No measurements saved yet. Use the size recommender to get personalised size suggestions on any gown.
          </Text>
        </Card>
      ) : null}

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
