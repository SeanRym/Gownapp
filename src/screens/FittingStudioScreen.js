import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFitting } from "../context/FittingContext";
import { FittingProfileSheet } from "../components/fitting/FittingProfileSheet";
import { fetchCmsSection } from "../services/cms";
import { brand } from "../theme/brand";
import { FittingScanPanel } from "./fitting/FittingScanPanel";
import { FittingSizePanel } from "./fitting/FittingSizePanel";
import { FittingStylePanel } from "./fitting/FittingStylePanel";
import { FittingTryOnPanel } from "./fitting/FittingTryOnPanel";

const PANELS = [
  { id: "scan", label: "Scan", sub: "Measure & detect" },
  { id: "size", label: "Size", sub: "Find your fit" },
  { id: "style", label: "Style", sub: "Gown matches" },
  { id: "tryon", label: "Try On", sub: "See it on you" },
];
const PANEL_IDS = new Set(PANELS.map((p) => p.id));

export function FittingStudioInner({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { profile, sizeResult } = useFitting();
  const initialPanel = route?.params?.panel || (route?.params?.gownId ? "tryon" : "scan");
  const gownId = route?.params?.gownId;
  const [activePanel, setActivePanel] = useState(PANEL_IDS.has(initialPanel) ? initialPanel : "scan");
  const [profileOpen, setProfileOpen] = useState(false);
  const [content, setContent] = useState({
    heading: "My Fitting Room",
    subheading: "Find your size, match your style, try on virtually.",
  });

  useEffect(() => {
    fetchCmsSection("fitting-room").then(setContent);
  }, []);

  useEffect(() => {
    if (route?.params?.panel && PANEL_IDS.has(route.params.panel)) setActivePanel(route.params.panel);
  }, [route?.params?.panel]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setProfileOpen(true)} hitSlop={8}>
            <Text style={styles.profileLink}>Profile</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Cart")} hitSlop={8}>
            <Text style={styles.savedLink}>Saved gowns</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.heroContent}>
        <Text style={styles.eyebrow}>Fit studio</Text>
        <Text style={styles.title}>{content.heading}</Text>
        <Text style={styles.sub}>{content.subheading}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {PANELS.map((p) => {
            const hasBadge =
              (p.id === "size" && sizeResult?.size) || (p.id === "scan" && (profile.bust || profile.waist));
            const badgeText = p.id === "size" ? sizeResult?.size?.label : "✓";
            return (
              <Pressable
                key={p.id}
                style={[styles.tab, activePanel === p.id ? styles.tabActive : null]}
                onPress={() => setActivePanel(p.id)}
              >
                <Text style={[styles.tabText, activePanel === p.id ? styles.tabTextActive : null]}>
                  {p.label}
                </Text>
                <Text style={styles.tabSub}>{p.sub}</Text>
                {hasBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeText}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.panelHost}>
        {activePanel === "scan" ? <FittingScanPanel /> : null}
        {activePanel === "size" ? <FittingSizePanel /> : null}
        {activePanel === "style" ? <FittingStylePanel /> : null}
        {activePanel === "tryon" ? <FittingTryOnPanel initialGownId={gownId} /> : null}
      </View>

      <FittingProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

export function FittingStudioScreen(props) {
  return <FittingStudioInner {...props} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  back: { color: brand.dark, fontWeight: "600", fontSize: 14 },
  headerRight: { flexDirection: "row", gap: 14 },
  profileLink: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  savedLink: { color: brand.buttonAlt, fontWeight: "700", fontSize: 12 },
  heroContent: { paddingHorizontal: 16, paddingBottom: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: brand.textLight },
  title: { fontSize: 26, fontWeight: "700", color: brand.dark, fontStyle: "italic", marginTop: 4 },
  sub: { color: brand.textLight, fontSize: 12, lineHeight: 18, marginTop: 6 },
  tabsScroll: { flexGrow: 0, marginTop: 8 },
  tabs: { flexDirection: "row", paddingHorizontal: 12, gap: 8 },
  tab: {
    width: 100,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    backgroundColor: brand.white,
  },
  tabActive: { backgroundColor: "#f5eadc", borderColor: brand.buttonAlt },
  tabText: { fontSize: 12, fontWeight: "700", color: brand.textLight },
  tabTextActive: { color: brand.dark },
  tabSub: { fontSize: 9, color: brand.textLight, marginTop: 2, textAlign: "center" },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: brand.buttonAlt,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 8, color: brand.white, fontWeight: "800" },
  panelHost: { flex: 1, marginTop: 8 },
});
