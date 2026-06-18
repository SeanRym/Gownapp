import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import {
  OrderConfirmationHero,
  OrderSummaryCard,
  ProofStatusBanner,
  WhatHappensNextCard,
} from "../components/OrderConfirmationSections";
import { getCustomerOrderById } from "../services/orders";
import { brand } from "../theme/brand";
import { orderMatchesKey } from "../utils/id";

export function OrderProofSubmittedScreen({ route, navigation }) {
  const { user } = useShop();
  const { orderId, orderNumber, order: initialOrder } = route.params || {};
  const lookupKey = orderId || orderNumber;
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (initialOrder && (!lookupKey || orderMatchesKey(initialOrder, lookupKey))) {
          if (!active) return;
          setOrder(initialOrder);
          setLoading(false);
          return;
        }
        setLoading(true);
        const data =
          user?.email && lookupKey ? await getCustomerOrderById(lookupKey, user.email, user.id) : null;
        if (!active) return;
        setOrder(data || initialOrder || null);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [initialOrder, lookupKey, user?.email, user?.id])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Loading your order…</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Order not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <OrderConfirmationHero order={order} userFirstName={user?.firstName || user?.name} />
      <WhatHappensNextCard order={order} />
      <ProofStatusBanner order={order} />
      <OrderSummaryCard order={order} />

      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("MyOrders")}>
        <Text style={styles.linkText}>View all orders →</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Main")}>
        <Text style={styles.linkText}>Continue browsing →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: brand.bg },
  meta: { color: brand.textLight, fontSize: 12 },
  linkBtn: { paddingVertical: 2 },
  linkText: { color: brand.dark, fontWeight: "600", fontSize: 13 },
});
