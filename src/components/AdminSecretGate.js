import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE_URL } from "../config/apiEnv";
import { brand } from "../theme/brand";
import { pingAdminApi, saveAdminSecret, unlockAdminSession } from "../utils/adminCredentials";

const ADMIN_ACCENT = "#4f46e5";

function deployedHostLabel() {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return "your deployed site";
  }
}

export function AdminSecretGate({ onSuccess, onChangeSecret }) {
  const inputRef = useRef(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const validateSecret = async () => {
    const trimmed = String(secret || "").trim();
    if (!trimmed) {
      setError("Enter the admin secret.");
      inputRef.current?.focus();
      return;
    }
    setValidating(true);
    setError("");
    try {
      await saveAdminSecret(trimmed);
      const ping = await pingAdminApi({ force: true });
      if (!ping.ok) {
        setError(
          ping.status === 401
            ? `Incorrect secret. Use the same password as the web admin on ${deployedHostLabel()}.`
            : "Could not reach the deployed server. Check your connection and try again."
        );
        inputRef.current?.focus();
        return;
      }
      unlockAdminSession();
      onSuccess?.();
    } catch (e) {
      setError(e?.message || "Could not validate secret.");
      inputRef.current?.focus();
    } finally {
      setValidating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        <View style={styles.gate}>
          <Text style={styles.title}>Enter admin secret</Text>
          <Text style={styles.hint}>
            Please enter the admin secret to continue.{"\n"}
            Use the same password as the web admin on{" "}
            <Text style={styles.hintStrong}>{deployedHostLabel()}</Text> — it must match the server{" "}
            <Text style={styles.hintStrong}>ADMIN_SECRET</Text>.
          </Text>

          <View style={styles.form}>
            <View style={[styles.fieldWrap, focused ? styles.fieldWrapFocused : null]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, styles.inputWithToggle]}
                value={secret}
                onChangeText={(v) => {
                  setSecret(v);
                  if (error) setError("");
                }}
                secureTextEntry={!showSecret}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                blurOnSubmit={false}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={validateSecret}
                returnKeyType="go"
              />
              {!secret ? (
                <Text style={[styles.fieldPlaceholder, styles.fieldPlaceholderWithToggle]} pointerEvents="none">
                  Admin secret
                </Text>
              ) : null}
              <Pressable
                style={styles.showBtn}
                onPress={() => setShowSecret((prev) => !prev)}
                hitSlop={8}
              >
                <Text style={styles.showBtnText}>{showSecret ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.continueBtn, validating ? styles.continueBtnDisabled : null]}
              onPress={validateSecret}
              disabled={validating}
            >
              {validating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.continueBtnText}>Continue</Text>
              )}
            </Pressable>

            <Pressable style={styles.changeLink} onPress={() => onChangeSecret?.()}>
              <Text style={styles.changeLinkText}>Change secret</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  gate: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: brand.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 14,
    color: brand.textLight,
    lineHeight: 22,
    marginBottom: 24,
  },
  hintStrong: {
    fontWeight: "700",
    color: brand.text,
  },
  form: {
    gap: 12,
  },
  fieldWrap: {
    position: "relative",
    borderWidth: 1.5,
    borderColor: ADMIN_ACCENT,
    borderRadius: 10,
    backgroundColor: brand.white,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldWrapFocused: {
    borderColor: ADMIN_ACCENT,
  },
  input: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: brand.text,
    minHeight: 44,
  },
  inputWithToggle: {
    paddingRight: 4,
  },
  fieldPlaceholder: {
    position: "absolute",
    left: 14,
    top: 13,
    color: brand.placeholder,
    fontSize: 15,
    lineHeight: 20,
  },
  fieldPlaceholderWithToggle: {
    right: 56,
  },
  showBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  showBtnText: {
    color: ADMIN_ACCENT,
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: "#b42318",
    fontSize: 13,
    lineHeight: 18,
  },
  continueBtn: {
    backgroundColor: ADMIN_ACCENT,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  continueBtnDisabled: {
    opacity: 0.7,
  },
  continueBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  changeLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  changeLinkText: {
    color: brand.text,
    fontSize: 14,
  },
});
