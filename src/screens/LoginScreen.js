import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useState } from "react";
import { useShop } from "../context/ShopContext";
import { verifyLoginCredentials } from "../services/authLocal";
import { brand } from "../theme/brand";

export function LoginScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { login } = useShop();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const onLogin = async () => {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !password) {
      setLoginError("Please enter your email and password.");
      return;
    }
    setLoginError("");
    setLoading(true);
    try {
      const check = await verifyLoginCredentials({ email: cleanEmail, password });
      if (!check.ok || !check.user) {
        throw new Error(check.error || "Invalid email or password.");
      }
      await login({
        id: check.user.id,
        name: check.user.name,
        email: check.user.email,
        role:
          check.user.role ||
          (String(check.user.email || "").toLowerCase().includes("admin") ? "admin" : "customer"),
      });
      navigation.goBack();
    } catch (e) {
      setLoginError(e?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topSection, isWide ? styles.topSectionWide : null]}>
        {!isWide ? (
          <View style={styles.mobileHero}>
            <Text style={styles.heroTag}>Welcome back</Text>
            <Text style={styles.mobileHeroTitle}>Log in to your account</Text>
            <Text style={styles.mobileHeroText}>
              Access your saved favorites and make it easier to inquire about your chosen looks.
            </Text>
          </View>
        ) : null}

        {isWide ? (
          <View style={styles.heroBlock}>
            <Text style={styles.heroTag}>Welcome back</Text>
            <Text style={styles.heroTitle}>Log in to your account</Text>
            <Text style={styles.heroText}>
              Access your saved favorites and make it easier to inquire about your chosen looks.
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, isWide ? styles.cardWide : null]}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.fieldWrap}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {!email ? (
              <Text style={styles.fieldPlaceholder} pointerEvents="none">
                you@example.com
              </Text>
            ) : null}
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!password ? (
              <Text style={[styles.fieldPlaceholder, styles.passwordPlaceholder]} pointerEvents="none">
                Your password
              </Text>
            ) : null}
            <Pressable style={styles.showBtn} onPress={() => setShowPassword((prev) => !prev)}>
              <Text style={styles.showBtnText}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.forgotBtn} onPress={() => navigation.navigate("ForgotPassword")}> 
            <Text style={styles.forgotText}>
              Forgot your password? <Text style={styles.linkInline}>Reset it</Text>
            </Text>
          </Pressable>
          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
          <Pressable style={styles.btn} onPress={onLogin} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Signing in…" : "LOG IN"}</Text>
          </Pressable>
          <Pressable style={styles.signupBtn} onPress={() => navigation.navigate("Signup")}> 
            <Text style={styles.signupText}>
              New to JCE Bridal? <Text style={styles.linkInline}>Create an account</Text>
            </Text>
          </Pressable>
        </View>
      </View>

      {isWide ? (
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>JCE Bridal.</Text>
          <Text style={styles.footerLinks}>INSTAGRAM    FACEBOOK    PINTEREST</Text>
          <Text style={styles.footerCopyright}>As 2026 JCE Bridal Boutique. All rights reserved.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f3f6", paddingHorizontal: 12, paddingTop: 20 },
  topSection: { paddingBottom: 18 },
  topSectionWide: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  mobileHero: { marginTop: 6, marginBottom: 8, paddingHorizontal: 2 },
  heroBlock: { width: "52%", paddingTop: 8 },
  heroTag: { color: "#c7c1c8", fontSize: 12, letterSpacing: 1.2, marginBottom: 10 },
  heroTitle: { color: "#1f1f22", fontSize: 48, lineHeight: 54, fontWeight: "700", marginBottom: 12 },
  heroText: { color: "#615d63", fontSize: 15, lineHeight: 24, maxWidth: 460 },
  mobileHeroTitle: { color: "#1f1f22", fontSize: 30, lineHeight: 36, fontWeight: "700", marginBottom: 8 },
  mobileHeroText: { color: "#615d63", fontSize: 13, lineHeight: 20, marginBottom: 6 },
  card: {
    width: "100%",
    backgroundColor: "#f4f4f4",
    padding: 16,
    borderWidth: 1,
    borderColor: "#ececec",
    marginTop: 8,
  },
  cardWide: { width: 420, marginTop: 0 },
  label: {
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 2,
    color: "#2f4d63",
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d7d1ca",
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: brand.white,
    color: brand.text,
  },
  fieldWrap: {
    position: "relative",
    marginBottom: 14,
  },
  fieldPlaceholder: {
    position: "absolute",
    left: 12,
    top: 11,
    color: brand.placeholder,
    fontSize: 14,
    lineHeight: 20,
  },
  passwordPlaceholder: { right: 56 },
  passwordWrap: {
    position: "relative",
    borderWidth: 1,
    borderColor: "#d7d1ca",
    backgroundColor: brand.white,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  passwordInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 12, color: brand.text },
  showBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  showBtnText: { textTransform: "uppercase", fontSize: 12, letterSpacing: 1.1, color: "#2f4d63" },
  forgotBtn: { marginBottom: 10 },
  forgotText: { color: "#4e5b66", fontSize: 12 },
  errorText: { color: "#c42121", fontSize: 12, marginBottom: 12, lineHeight: 18 },
  linkInline: { textDecorationLine: "underline" },
  btn: { backgroundColor: "#111317", paddingVertical: 13, marginBottom: 14 },
  btnText: { color: brand.white, textAlign: "center", fontWeight: "800", letterSpacing: 1.3, fontSize: 11 },
  signupBtn: { marginBottom: 2 },
  signupText: { color: "#4e5b66", fontSize: 12 },
  footer: {
    marginTop: "auto",
    backgroundColor: "#e9e4de",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 8,
  },
  footerBrand: { color: "#1f1f22", fontSize: 38, fontWeight: "500" },
  footerLinks: { color: "#1f1f22", fontSize: 11, letterSpacing: 0.8 },
  footerCopyright: { color: "#5f5d61", fontSize: 10 },
});
