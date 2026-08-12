import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMemo, useState, useRef, useEffect } from "react";
import { verifyLoginOtp, sendOtpRemote } from "../services/auth";
import { useShop } from "../context/ShopContext";
import { checkEmailTaken, getUserByEmail, registerUser } from "../services/authLocal";
import { getPasswordRuleChecks, validateSignupForm } from "../utils/authValidation";
import { brand } from "../theme/brand";

export function SignupScreen({ navigation }) {
  const { login } = useShop();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [emailTakenMessage, setEmailTakenMessage] = useState("");
  const [emailChecking, setEmailChecking] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const checks = useMemo(() => getPasswordRuleChecks(form.password), [form.password]);
  const formValidation = useMemo(
    () => validateSignupForm(form),
    [form.firstName, form.lastName, form.email, form.password, form.confirmPassword]
  );
  const canSubmit = formValidation.ok && !loading && !emailTaken && !emailChecking;
  const onChange = (key, value) => {
    if (registerError) setRegisterError("");
    if (key === "email") {
      setEmailTaken(false);
      setEmailTakenMessage("");
      setRegisterError("");
      setEmailChecking(true);
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    let active = true;
    const checkEmail = async () => {
      const cleanEmail = String(form.email || "").trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        if (active) {
          setEmailTaken(false);
          setEmailChecking(false);
        }
        return;
      }

      if (active) setEmailChecking(true);
      try {
        const taken = await checkEmailTaken(cleanEmail);
        if (active) {
          setEmailTaken(Boolean(taken));
          if (taken) {
            setEmailTakenMessage("An account with this email already exists.");
          } else {
            setEmailTakenMessage("");
          }
          setRegisterError("");
          setEmailChecking(false);
        }
      } catch {
        if (active) {
          setEmailChecking(false);
          setEmailTaken(false);
          setEmailTakenMessage("");
        }
      }
    };
    checkEmail();
    return () => {
      active = false;
    };
  }, [form.email]);

  const sendOtp = async () => {
    if (!formValidation.ok) {
      setRegisterError("Please complete all registration requirements first.");
      return;
    }

    if (emailChecking) {
      setRegisterError("Please wait while we confirm your email.");
      return;
    }

    if (emailTaken) {
      setRegisterError("An account with this email already exists.");
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = String(form.email || "").trim();
      const taken = await checkEmailTaken(cleanEmail);
      if (taken) {
        setEmailTaken(true);
        setEmailTakenMessage("An account with this email already exists.");
        setRegisterError("");
        setStep(1);
        return;
      }

      const otpResult = await sendOtpRemote(cleanEmail, "signup");
      if (!otpResult.ok) {
        const message = otpResult.error || "Failed to send verification code.";
        if (message.toLowerCase().includes("already exists")) {
          throw new Error("An account with this email already exists.");
        }
        if (message.toLowerCase().includes("network")) {
          const existingUser = await getUserByEmail(cleanEmail);
          if (existingUser) {
            throw new Error("An account with this email already exists.");
          }
        }
        throw new Error(message);
      }
      // backend may return a cooldown error as text in the error path; here
      // we assume success means an email was sent. Start resend timer.
      setStep(2);
      startResendCountdown(30);
      Alert.alert("Verification sent", "A verification code has been sent to your email.");
    } catch (e) {
      Alert.alert("Signup error", e.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  // Resend countdown state
  const [resendSeconds, setResendSeconds] = useState(0);
  const resendTimerRef = useRef(null);
  function startResendCountdown(seconds) {
    setResendSeconds(seconds);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) {
          clearInterval(resendTimerRef.current);
          resendTimerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const verifyOtp = async () => {
    setLoading(true);
    try {
      await verifyLoginOtp(form.email.trim(), otp.trim(), "signup");

      const result = await registerUser({
        name: `${String(form.firstName || "").trim()} ${String(form.lastName || "").trim()}`.trim(),
        email: form.email,
        password: form.password,
      });

      if (!result.ok || !result.user) {
        setStep(1);
        setOtp("");
        setRegisterError(result.error || "Unable to create account.");
        return;
      }

      await login({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role || "customer",
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("OTP error", e.message || "Unable to verify code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Register</Text>
      {step === 1 ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor="#7A6A73"
                value={form.firstName}
                onChangeText={(v) => onChange("firstName", v)}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor="#7A6A73"
                value={form.lastName}
                onChangeText={(v) => onChange("lastName", v)}
              />
            </View>
          </View>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#7A6A73"
            value={form.email}
            onChangeText={(v) => onChange("email", v)}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {emailTaken ? <Text style={styles.errorText}>{emailTakenMessage}</Text> : null}

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWithAction}>
            <TextInput
              style={styles.inputControl}
              placeholder="Create a password"
              placeholderTextColor="#7A6A73"
              value={form.password}
              onChangeText={(v) => onChange("password", v)}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword((prev) => !prev)}>
              <Text style={styles.toggleText}>{showPassword ? "HIDE" : "SHOW"}</Text>
            </Pressable>
          </View>
          <Text style={[styles.rule, checks.length ? styles.ruleOk : styles.rulePending]}>
            {checks.length ? "✓" : "-"} At least 8 characters
          </Text>
          <Text style={[styles.rule, checks.letter ? styles.ruleOk : styles.rulePending]}>
            {checks.letter ? "✓" : "-"} At least one letter
          </Text>
          <Text style={[styles.rule, checks.number ? styles.ruleOk : styles.rulePending]}>
            {checks.number ? "✓" : "-"} At least one number
          </Text>
          <Text style={[styles.rule, form.password && form.confirmPassword && form.password === form.confirmPassword ? styles.ruleOk : styles.rulePending]}>
            {form.password && form.confirmPassword && form.password === form.confirmPassword ? "✓" : "-"} Passwords match
          </Text>

          <Text style={[styles.label, styles.confirmLabel]}>Confirm Password</Text>
          <View style={styles.inputWithAction}>
            <TextInput
              style={styles.inputControl}
              placeholder="Confirm your password"
              placeholderTextColor="#7A6A73"
              value={form.confirmPassword}
              onChangeText={(v) => onChange("confirmPassword", v)}
              secureTextEntry={!showConfirmPassword}
            />
            <Pressable onPress={() => setShowConfirmPassword((prev) => !prev)}>
              <Text style={styles.toggleText}>{showConfirmPassword ? "HIDE" : "SHOW"}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.btn} onPress={sendOtp} disabled={!canSubmit}>
            <Text style={styles.btnText}>{loading ? "Sending code..." : "Register"}</Text>
          </Pressable>
          <Text style={styles.bottomText}>
            Already have an account?{" "}
            <Text style={styles.link} onPress={() => navigation.navigate("Login")}>
              Log in
            </Text>
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.note}>Enter the 6-digit verification code sent to {form.email}.</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor="#7A6A73"
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable style={styles.btn} onPress={verifyOtp} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Verifying..." : "Verify and Create Account"}</Text>
          </Pressable>
          <View style={{ marginTop: 10 }} />
          <Pressable
            style={[styles.btn, { backgroundColor: resendSeconds ? '#DDD' : brand.button }]}
            onPress={async () => {
              if (resendSeconds) return;
              setLoading(true);
              try {
                const r = await sendOtpRemote(form.email.trim(), 'signup');
                if (!r.ok) throw new Error(r.error || 'Unable to resend code.');
                startResendCountdown(30);
                Alert.alert('Verification sent', 'A new code has been sent to your email.');
              } catch (e) {
                Alert.alert('Resend failed', e.message || 'Unable to resend code.');
              } finally {
                setLoading(false);
              }
            }}
            disabled={Boolean(resendSeconds)}
          >
            <Text style={styles.btnText}>{resendSeconds ? `Resend in ${resendSeconds}s` : 'Resend code'}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F3F8" },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 34, fontWeight: "700", color: brand.dark, marginBottom: 12, fontStyle: "italic" },
  card: { backgroundColor: "#F9F8FA", borderWidth: 1, borderColor: "#EFE9ED", padding: 14 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  label: { color: "#35495F", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6, marginTop: 2, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#D9CDD3",
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: brand.white,
    color: "#1C2430",
    fontSize: 16,
    lineHeight: 22,
  },
  inputWithAction: {
    borderWidth: 1,
    borderColor: "#D9CDD3",
    backgroundColor: brand.white,
    marginBottom: 6,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  inputControl: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, color: "#1C2430", fontSize: 16, lineHeight: 22 },
  toggleText: { color: "#4A5A6D", fontWeight: "700", letterSpacing: 1 },
  rule: { color: "#4A5A6D", fontSize: 13, marginBottom: 4 },
  ruleOk: { color: "#2E7D32", fontWeight: "700" },
  rulePending: { color: "#4A5A6D" },
  confirmLabel: { marginTop: 14 },
  errorText: { color: "#c42121", fontSize: 13, marginTop: 8, lineHeight: 18 },
  validationSummary: { marginTop: 12, paddingHorizontal: 4 },
  validationTitle: { color: "#35495F", fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginBottom: 4, textTransform: "uppercase" },
  note: { color: "#4A5A6D", marginBottom: 10, fontSize: 14, lineHeight: 20 },
  btn: { marginTop: 14, backgroundColor: brand.button, paddingVertical: 14 },
  btnText: { color: brand.white, textAlign: "center", fontWeight: "800", letterSpacing: 1.6, fontSize: 12, textTransform: "uppercase" },
  bottomText: { color: "#4A5A6D", marginTop: 18, fontSize: 14 },
  link: { textDecorationLine: "underline", color: "#2E3D52" },
});
