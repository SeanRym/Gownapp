import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";
import { sendOtpRemote, verifyOtpRemote } from "../services/auth";
import { resetUserPassword } from "../services/authLocal";
import { getPasswordRuleChecks, passwordMeetsRules } from "../utils/authValidation";
import { brand } from "../theme/brand";

export function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const cleanEmail = String(email || "").trim();
      if (!cleanEmail) throw new Error("Please enter your email address.");
      const result = await sendOtpRemote(cleanEmail, "password_reset");
      if (!result.ok) throw new Error(result.error || "Unable to send verification code.");
      Alert.alert("Verification sent", "A verification code has been sent to your email.");
      setStep(2);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      await verifyOtpRemote(email.trim(), otp.trim(), "password_reset");
      setStep(3);
    } catch (e) {
      Alert.alert("OTP error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const passwordChecks = useMemo(() => getPasswordRuleChecks(password), [password]);
  const resetValid = useMemo(
    () => passwordMeetsRules(password) && password && password === confirmPassword,
    [password, confirmPassword]
  );

  const resetPassword = async () => {
    if (!resetValid) {
      Alert.alert("Invalid password", "Make sure your password meets all requirements and both fields match.");
      return;
    }
    setLoading(true);
    try {
      const result = await resetUserPassword({ email: email.trim(), password });
      if (!result.ok) throw new Error(result.error || "Could not reset password.");
      setResetSuccess(true);
    } catch (e) {
      Alert.alert("Reset failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Reset Your Password</Text>
      {step === 1 && (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#7A6A73"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable style={styles.btn} onPress={sendOtp} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Sending code..." : "Send Verification Code"}</Text>
          </Pressable>
        </>
      )}
      {step === 2 && (
        <>
          <Text style={styles.note}>Enter the 6-digit verification code sent to {email.trim() || "your email"}.</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor="#7A6A73"
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
            maxLength={6}
            keyboardType="number-pad"
          />
          <Pressable style={styles.btn} onPress={verifyOtp} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Verifying..." : "Verify Code"}</Text>
          </Pressable>
        </>
      )}
      {step === 3 && (
        <>
          {!resetSuccess ? (
            <>
              <Text style={styles.label}>New password</Text>
              <View style={styles.inputWithAction}>
                <TextInput
                  style={styles.inputControl}
                  placeholder="Create a new password"
                  placeholderTextColor="#7A6A73"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)}>
                  <Text style={styles.toggleText}>{showPassword ? "HIDE" : "SHOW"}</Text>
                </Pressable>
              </View>
              <Text style={[styles.rule, passwordChecks.length ? styles.ruleOk : styles.rulePending]}>
                {passwordChecks.length ? "✓" : "-"} At least 8 characters
              </Text>
              <Text style={[styles.rule, passwordChecks.letter ? styles.ruleOk : styles.rulePending]}>
                {passwordChecks.letter ? "✓" : "-"} At least one letter
              </Text>
              <Text style={[styles.rule, passwordChecks.number ? styles.ruleOk : styles.rulePending]}>
                {passwordChecks.number ? "✓" : "-"} At least one number
              </Text>
              <Text style={[styles.rule, password && confirmPassword && password === confirmPassword ? styles.ruleOk : styles.rulePending]}>
                {password && confirmPassword && password === confirmPassword ? "✓" : "-"} Passwords match
              </Text>

              <Text style={[styles.label, styles.confirmLabel]}>Confirm new password</Text>
              <View style={styles.inputWithAction}>
                <TextInput
                  style={styles.inputControl}
                  placeholder="Confirm your new password"
                  placeholderTextColor="#7A6A73"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                />
                <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)}>
                  <Text style={styles.toggleText}>{showConfirmPassword ? "HIDE" : "SHOW"}</Text>
                </Pressable>
              </View>

              <Pressable style={styles.btn} onPress={resetPassword} disabled={loading || !resetValid}>
                <Text style={styles.btnText}>{loading ? "Saving..." : "Reset Password"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.successText}>Success! Your password has been successfully reset.</Text>
              <Pressable style={styles.btn} onPress={() => navigation.replace("Login") }>
                <Text style={styles.btnText}>Go to login</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg, padding: 16 },
  title: { fontSize: 30, fontWeight: "700", color: brand.dark, marginBottom: 14, fontStyle: "italic" },
  label: { color: "#35495F", marginBottom: 6, fontWeight: "700", letterSpacing: 0.8, fontSize: 12 },
  note: { color: "#4A5A6D", marginBottom: 10, fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: brand.border, padding: 11, marginBottom: 10, backgroundColor: brand.white },
  inputWithAction: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, marginBottom: 6, paddingRight: 12, flexDirection: "row", alignItems: "center" },
  inputControl: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, color: brand.text, fontSize: 16, lineHeight: 22 },
  toggleText: { color: "#4A5A6D", fontWeight: "700", letterSpacing: 1 },
  rule: { color: "#4A5A6D", fontSize: 13, marginBottom: 4 },
  ruleOk: { color: "#2E7D32", fontWeight: "700" },
  rulePending: { color: "#4A5A6D" },
  confirmLabel: { marginTop: 14 },
  successText: { color: "#2E7D32", fontSize: 14, marginBottom: 12, lineHeight: 20 },
  btn: { marginTop: 10, backgroundColor: brand.button, paddingVertical: 12 },
  btnText: { color: brand.white, textAlign: "center", fontWeight: "700", letterSpacing: 1.1, fontSize: 11 },
});
