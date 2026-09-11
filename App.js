import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShopProvider } from "./src/context/ShopContext";
import { FittingProvider } from "./src/context/FittingContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { prepareAdminForAppLaunch } from "./src/utils/adminCredentials";
import { initializeSyncEndpoint } from "./src/services/sync";

export default function App() {
  const [credentialsReady, setCredentialsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([Promise.resolve(prepareAdminForAppLaunch()), initializeSyncEndpoint()]);
      } finally {
        if (!cancelled) setCredentialsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!credentialsReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFF7FA" }}>
        <ActivityIndicator size="large" color="#4a2c82" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ShopProvider>
        <FittingProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </FittingProvider>
      </ShopProvider>
    </SafeAreaProvider>
  );
}
