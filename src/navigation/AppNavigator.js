import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { brand } from "../theme/brand";
import { useShop } from "../context/ShopContext";
import { HomeScreen } from "../screens/HomeScreen";
import { GownsScreen } from "../screens/GownsScreen";
import { FittingRoomScreen } from "../screens/FittingRoomScreen";
import { FittingRoomTabScreen } from "../screens/FittingRoomTabScreen";
import { FittingStudioScreen } from "../screens/FittingStudioScreen";
import { ARTryOnScreen } from "../screens/ARTryOnScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { AdminPanelScreen } from "../screens/AdminPanelScreen";
import { GownDetailScreen } from "../screens/GownDetailScreen";
import { CheckoutScreen } from "../screens/CheckoutScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { SignupScreen } from "../screens/SignupScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { MyOrdersScreen } from "../screens/MyOrdersScreen";
import { OrderDetailScreen } from "../screens/OrderDetailScreen";
import { ContactScreen } from "../screens/ContactScreen";
import { AdminOrdersScreen } from "../screens/AdminOrdersScreen";
import { AdminReturnsScreen } from "../screens/AdminReturnsScreen";
import { AdminGownsScreen } from "../screens/AdminGownsScreen";
import { AdminStatsScreen } from "../screens/AdminStatsScreen";
import { AdminUsersScreen } from "../screens/AdminUsersScreen";
import { canAccess } from "../utils/access";
import { OrderPlacedScreen } from "../screens/OrderPlacedScreen";
import { OrderProofSubmittedScreen } from "../screens/OrderProofSubmittedScreen";
import { ReturnRequestScreen } from "../screens/ReturnRequestScreen";
import { MyReturnsScreen } from "../screens/MyReturnsScreen";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function TabsNavigator() {
  const { user } = useShop();
  const isAdmin = canAccess(user, "admin_tab");

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: brand.dark,
        tabBarInactiveTintColor: brand.textLight,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Home") {
            return <Ionicons name="home" size={size} color={color} />;
          }
          if (route.name === "Catalogue") {
            return <Ionicons name="storefront-outline" size={size} color={color} />;
          }
          if (route.name === "FittingRoom") {
            return <Ionicons name="scan-outline" size={size} color={color} />;
          }
          if (route.name === "Favorites") {
            return <Ionicons name="heart" size={size} color={color} />;
          }
          if (route.name === "Admin") {
            return <Ionicons name="shield" size={size} color={color} />;
          }
          return <Ionicons name="person" size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Catalogue" component={GownsScreen} />
      <Tabs.Screen name="FittingRoom" component={FittingRoomTabScreen} options={{ title: "Fitting Room" }} />
      <Tabs.Screen name="Favorites" component={FavoritesScreen} />
      {isAdmin ? <Tabs.Screen name="Admin" component={AdminPanelScreen} /> : null}
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={TabsNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="Gowns" component={GownsScreen} options={{ title: "Bridal Gowns & Dresses" }} />
        <Stack.Screen name="AR Try-On" component={ARTryOnScreen} options={{ title: "AR Try-On" }} />
        <Stack.Screen name="SavedGowns" component={FittingRoomScreen} options={{ title: "Saved gowns" }} />
        <Stack.Screen name="Cart" component={FittingRoomScreen} options={{ title: "Saved gowns" }} />
        <Stack.Screen name="FittingStudio" component={FittingStudioScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GownDetail" component={GownDetailScreen} options={{ title: "Gown Details" }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderPlaced" component={OrderPlacedScreen} options={{ title: "Order Placed" }} />
        <Stack.Screen name="OrderProofSubmitted" component={OrderProofSubmittedScreen} options={{ title: "Order Confirmation" }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: "Forgot Password" }} />
        <Stack.Screen name="MyOrders" component={MyOrdersScreen} options={{ title: "My Orders" }} />
        <Stack.Screen name="MyReturns" component={MyReturnsScreen} options={{ title: "My Returns" }} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Order Details" }} />
        <Stack.Screen name="ReturnRequest" component={ReturnRequestScreen} options={{ title: "Request Return" }} />
        <Stack.Screen name="Contact" component={ContactScreen} />
        <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} options={{ title: "Admin • Orders" }} />
        <Stack.Screen name="AdminReturns" component={AdminReturnsScreen} options={{ title: "Admin • Returns" }} />
        <Stack.Screen name="AdminGowns" component={AdminGownsScreen} options={{ title: "Admin • Gowns" }} />
        <Stack.Screen name="AdminStats" component={AdminStatsScreen} options={{ title: "Admin • Statistics" }} />
        <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: "Admin • Users" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
