import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useShop } from "../context/ShopContext";
import { changeAdminSecretOnServer, sendAdminChangeSecretOtp } from "../services/adminSecret";
import { brand } from "../theme/brand";
import { markAdminSecretChanged, pingAdminApi, saveAdminSecret } from "../utils/adminCredentials";

const ADMIN_ACCENT = "#4f46e5";

function secretHint(secret) {
  const t = String(secret || "").trim();
  if (!t) return null;
  if (t.length < 16) return `${16 - t.length} more character${16 - t.length !== 1 ? "s" : ""} needed`;
  if (/\s/.test(t)) return "No spaces allowed";
  return "Looks good";
}

export function AdminChangeSecretScreen({ navigation }) {
  const { user } = useShop();
  const [stage, setStage] = useState("password");
  const [adminEmail, setAdminEmail] = useState(String(user?.email || ""));
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [showSecret, setShowSecret] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const hint = secretHint(newSecret);
  const hintOk = hint === "Looks good";

  const handleSendOtp = async () => {
    const email = adminEmail.trim();
    if (!email) {
      setError("Enter your admin email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await sendAdminChangeSecretOtp({ adminEmail: email, password });
      setDevMode(Boolean(data.devMode));
      if (data.devMode) {
        Alert.alert("Dev mode", "Check the server terminal for the OTP code.");
      }
      setStage("otp");
    } catch (e) {
      setError(e?.message || "Could not send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    const email = adminEmail.trim();
    const code = otp.trim();
    const secret = newSecret.trim();
    if (!code) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!secret) {
      setError("Enter a new secret.");
      return;
    }
    if (secret.length < 16) {
      setError("New secret must be at least 16 characters.");
      return;
    }
    if (/\s/.test(secret)) {
      setError("New secret must not contain spaces.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await changeAdminSecretOnServer({
        adminEmail: email,
        password,
        otp: code,
        newSecret: secret,
      });
      await saveAdminSecret(secret);
      const ping = await pingAdminApi({ force: true });
      if (!ping.ok) {
        throw new Error("Secret was updated on the server but could not be verified from this device.");
      }
      markAdminSecretChanged();
      setStage("done");
    } catch (e) {
      setError(e?.message || "Could not change secret.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {stage === "password" ? (
          <>
            <Text style={styles.title}>Change admin secret</Text>
            <Text style={styles.hint}>
              Enter your admin email and account password to receive a one-time verification code. This updates the
              same secret used by the web admin.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.label}>Admin email</Text>
            <TextInput
              style={styles.input}
              value={adminEmail}
              onChangeText={(v) => {
                setAdminEmail(v);
                if (error) setError("");
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="off"
            />
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (error) setError("");
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="off"
            />
            <Pressable style={styles.btn} onPress={handleSendOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send verification code</Text>}
            </Pressable>
          </>
        ) : null}

        {stage === "otp" ? (
          <>
            <Text style={styles.title}>Verify and set new secret</Text>
            <Text style={styles.hint}>
              {devMode
                ? "Dev mode: OTP is printed on the server terminal."
                : `A 6-digit code was sent to ${adminEmail.trim()}. It expires in 10 minutes.`}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={styles.input}
              value={otp}
              onChangeText={(v) => {
                setOtp(v.replace(/\D/g, ""));
                if (error) setError("");
              }}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="off"
            />
            <Text style={styles.label}>New admin secret</Text>
            <View style={styles.secretRow}>
              <TextInput
                style={[styles.input, styles.secretInput]}
                value={newSecret}
                onChangeText={(v) => {
                  setNewSecret(v);
                  if (error) setError("");
                }}
                secureTextEntry={!showSecret}
                autoCapitalize="none"
                autoComplete="off"
              />
              <Pressable style={styles.showBtn} onPress={() => setShowSecret((p) => !p)}>
                <Text style={styles.showBtnText}>{showSecret ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            {hint ? <Text style={[styles.fieldHint, hintOk ? styles.fieldHintOk : styles.fieldHintBad]}>{hint}</Text> : null}
            <Text style={styles.note}>The new secret takes effect immediately on the deployed server — no restart needed.</Text>
            <Pressable style={styles.btn} onPress={handleChange} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Change secret</Text>}
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => { setStage("password"); setError(""); }}>
              <Text style={styles.linkText}>Back</Text>
            </Pressable>
          </>
        ) : null}

        {stage === "done" ? (
          <>
            <Text style={styles.title}>Secret updated</Text>
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                Admin secret updated on the server and saved on this device. Share the new value with other admins — their
                old sessions will stop working.
              </Text>
            </View>
            <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
              <Text style={styles.btnText}>Back to dashboard</Text>
            </Pressable>
          </>
        ) : null}

        {stage !== "done" ? (
          <Pressable style={styles.linkBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "700", color: brand.text, marginBottom: 8, fontStyle: "italic" },
  hint: { fontSize: 14, color: brand.textLight, lineHeight: 22, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", color: brand.textLight, marginBottom: 6, marginTop: 8, letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: brand.white,
    color: brand.text,
    fontSize: 15,
    marginBottom: 4,
  },
  secretRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  secretInput: { flex: 1 },
  showBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  showBtnText: { color: ADMIN_ACCENT, fontWeight: "700", fontSize: 13 },
  fieldHint: { fontSize: 12, marginBottom: 8 },
  fieldHintOk: { color: "#166534" },
  fieldHintBad: { color: "#b42318" },
  note: { fontSize: 12, color: brand.textLight, lineHeight: 18, marginBottom: 12 },
  error: { color: "#b42318", fontSize: 13, lineHeight: 18, marginBottom: 12 },
  btn: {
    backgroundColor: ADMIN_ACCENT,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  linkBtn: { alignSelf: "flex-start", paddingVertical: 12 },
  linkText: { color: brand.text, fontSize: 14 },
  successBox: {
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  successText: { color: "#166534", fontSize: 14, lineHeight: 22 },
});
