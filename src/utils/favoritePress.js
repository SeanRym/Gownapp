import { Alert } from "react-native";

/** Prompt login when toggling favorites while signed out — matches web HeartButton. */
export async function handleToggleFavorite(toggleFavorite, gownId, navigation) {
  const result = await toggleFavorite(gownId);
  if (result?.needsAuth) {
    Alert.alert("Sign in required", "Please log in to save favorites.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log in", onPress: () => navigation?.navigate?.("Login") },
    ]);
    return result;
  }
  if (result?.ok === false && result?.error) {
    Alert.alert("Favorite failed", result.error);
  }
  return result;
}
