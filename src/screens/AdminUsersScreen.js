import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { createUserAdmin, deleteUserAdmin, listUsersAdmin, updateUserRoleAdmin, restoreUserAdmin } from "../services/authLocal";
import { brand } from "../theme/brand";

const ROLE_OPTIONS = ["customer", "staff", "admin"];
const EMPTY_FORM = { firstName: "", lastName: "", email: "", role: "customer" };
const FILTER_OPTIONS = ["all", "customer", "staff", "admin"];

export function AdminUsersScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_users");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tab, setTab] = useState("active");
  const [editorOpen, setEditorOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const users = await listUsersAdmin();
    setItems(Array.isArray(users) ? users : []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const visibleUsers = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return items
      .filter((u) => {
        if (roleFilter !== "all" && String(u?.role || "").toLowerCase() !== roleFilter) return false;
        if (!q) return true;
        const hay = [u?.name, u?.email, u?.role].map((x) => String(x || "").toLowerCase()).join(" ");
        return hay.includes(q);
      })
      .sort((a, b) => String(a?.email || "").localeCompare(String(b?.email || "")));
  }, [items, query, roleFilter]);

  const roleCounts = useMemo(() => {
    const all = items.length;
    const customer = items.filter((u) => String(u?.role || "").toLowerCase() === "customer").length;
    const staff = items.filter((u) => String(u?.role || "").toLowerCase() === "staff").length;
    const admin = items.filter((u) => String(u?.role || "").toLowerCase() === "admin").length;
    return { all, customer, staff, admin };
  }, [items]);

  const onCreate = async () => {
    const res = await createUserAdmin(form);
    if (!res.ok) {
      Alert.alert("Create failed", res.error || "Unable to create user.");
      return;
    }
    setForm(EMPTY_FORM);
    setEditorOpen(false);
    loadData();
    Alert.alert("Created", "Staff account created.");
  };

  const onChangeRole = async (id, email, role) => {
    const res = await updateUserRoleAdmin({ id, email, role });
    if (!res.ok) {
      Alert.alert("Update failed", res.error || "Unable to update role.");
      return;
    }
    loadData();
  };

  const onDelete = async (id, email) => {
    const res = await deleteUserAdmin({ id, email });
    if (!res.ok) {
      Alert.alert("Delete failed", res.error || "Unable to delete user.");
      return;
    }
    loadData();
  };

  const onRestore = async (id, email) => {
    const res = await restoreUserAdmin({ id, email });
    if (!res.ok) {
      Alert.alert("Restore failed", res.error || "Unable to restore user.");
      return;
    }
    loadData();
  };

  const initials = useCallback((name, email) => {
    const base = String(name || "").trim() || String(email || "").split("@")[0] || "U";
    const parts = base.split(/\s+/).filter(Boolean);
    if (!parts.length) return "U";
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }, []);

  if (!allowed) {
    return (
      <View style={styles.deniedWrap}>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.deniedText}>You don’t have permission to manage user accounts.</Text>
      </View>
    );
  }

  const tabUsers = useMemo(() => {
    if (tab === "archived") return visibleUsers.filter((u) => u?.isActive === false);
    return visibleUsers.filter((u) => u?.isActive !== false);
  }, [tab, visibleUsers]);

  const roleLabel = (role) => {
    const normalized = String(role || "customer").trim().toLowerCase();
    if (!normalized) return "Customer";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Users</Text>
          <Text style={styles.subtitle}>{roleCounts.all} registered</Text>
        </View>
        <Pressable style={styles.editBtn} onPress={() => Alert.alert("Profile", "Edit profile is managed on web admin for now.")}>
          <Text style={styles.editBtnText}>Edit my profile</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.addBtn} onPress={() => setEditorOpen(true)}>
          <Text style={styles.addBtnText}>+ Add user</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((key) => (
          <Pressable key={key} style={[styles.filterPill, roleFilter === key ? styles.filterPillActive : null]} onPress={() => setRoleFilter(key)}>
            <Text style={roleFilter === key ? styles.filterPillTextActive : styles.filterPillText}>
              {key === "all" ? "All" : key[0].toUpperCase() + key.slice(1)} ({roleCounts[key] ?? 0})
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, tab === "active" ? styles.tabBtnActive : null]} onPress={() => setTab("active")}>
          <Text style={tab === "active" ? styles.tabTextActive : styles.tabText}>Active</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === "archived" ? styles.tabBtnActive : null]} onPress={() => setTab("archived")}>
          <Text style={tab === "archived" ? styles.tabTextActive : styles.tabText}>
            Archived ({visibleUsers.filter((u) => u?.isActive === false).length})
          </Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.subtitle}>Loading users...</Text> : null}
      {!loading && tabUsers.length === 0 ? <Text style={styles.subtitle}>No users found.</Text> : null}

      {tab === "active" &&
        tabUsers.map((u) => (
          <View key={u.id} style={styles.userCard}>
            <View style={styles.userTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(u?.name, u?.email)}</Text>
              </View>
              <View style={styles.userMain}>
                <Text style={styles.userName}>{u.name || "User"}</Text>
                <View style={styles.emailRow}>
                  <Text style={styles.userMeta}>{u.email}</Text>
                  <Pressable onPress={() => Alert.alert("Email", u.email || "-")}>
                    <Text style={styles.copyLink}>Copy</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.userRight}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{String(u?.role || "customer").toUpperCase()}</Text>
                </View>
                <Text style={styles.userStatus}>• Active</Text>
              </View>
            </View>

            <View style={styles.row}>
              {ROLE_OPTIONS.map((r) => (
                <Pressable
                  key={`${u.id}-${r}`}
                  style={[styles.secondaryBtn, u.role === r ? styles.secondaryBtnActive : null]}
                  onPress={() => onChangeRole(u.id, u.email, r)}
                >
                  <Text style={u.role === r ? styles.secondaryBtnTextActive : styles.secondaryBtnText}>{r}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.archiveBtn}
                onPress={() =>
                  Alert.alert("Archive user", `Archive ${u.email}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Archive", style: "destructive", onPress: () => onDelete(u.id, u.email) },
                  ])
                }
              >
                <Text style={styles.archiveBtnText}>Archive</Text>
              </Pressable>
            </View>
          </View>
        ))}

      {tab === "archived" &&
        tabUsers.map((u) => (
          <View key={u.id} style={[styles.userCard, styles.userCardArchived]}>
            <View style={styles.userTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(u?.name, u?.email)}</Text>
              </View>
              <View style={styles.userMain}>
                <Text style={styles.userName}>{u.name || "User"}</Text>
                <Text style={styles.userMeta}>{u.email}</Text>
              </View>
              <View style={styles.userRight}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{String(u?.role || "customer").toUpperCase()}</Text>
                </View>
                <Text style={styles.userStatusArchived}>• Archived</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Pressable
                style={[styles.primaryBtn, styles.actionButton]}
                onPress={() =>
                  Alert.alert("Restore user", `Restore ${u.email}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Restore", onPress: () => onRestore(u.id, u.email) },
                  ])
                }
              >
                <Text style={styles.primaryBtnText}>Restore</Text>
              </Pressable>
            </View>
          </View>
        ))}

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={() => setEditorOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditorOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>All User</Text>
              <Pressable style={styles.closeButton} onPress={() => setEditorOpen(false)}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.formTwoCol}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>First name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Maria"
                  value={form.firstName}
                  autoCapitalize="words"
                  onChangeText={(v) => setForm((p) => ({ ...p, firstName: v }))}
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Last name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Santos"
                  value={form.lastName}
                  autoCapitalize="words"
                  onChangeText={(v) => setForm((p) => ({ ...p, lastName: v }))}
                />
              </View>
            </View>

            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="user@example.com"
                value={form.email}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
              />
            </View>

            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.roleSelectWrap}>
                <Pressable style={styles.roleSelect} onPress={() => {
                  const nextIndex = (ROLE_OPTIONS.indexOf(form.role) + 1) % ROLE_OPTIONS.length;
                  setForm((p) => ({ ...p, role: ROLE_OPTIONS[nextIndex] }));
                }}>
                  <Text style={styles.roleSelectValue}>{roleLabel(form.role)}</Text>
                  <Text style={styles.roleChevron}>⌄</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.helperText}>A temporary password will be generated. The user can change it after logging in.</Text>

            <View style={styles.modalActionRow}>
              <Pressable style={[styles.cancelButton, styles.actionButton]} onPress={() => setEditorOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, styles.actionButton]} onPress={onCreate}>
                <Text style={styles.primaryBtnText}>Create user</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  subtitle: { color: brand.textLight, marginTop: 2, marginBottom: 10 },
  editBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#14101a" },
  editBtnText: { color: brand.white, fontWeight: "700", fontSize: 11 },

  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 12 },
  addBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#9c6f2d", justifyContent: "center" },
  addBtnText: { color: brand.white, fontWeight: "800", fontSize: 11 },

  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  filterPill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, backgroundColor: brand.white, paddingVertical: 5, paddingHorizontal: 10 },
  filterPillActive: { backgroundColor: brand.dark, borderColor: brand.dark },
  filterPillText: { color: brand.dark, fontWeight: "700", fontSize: 11 },
  filterPillTextActive: { color: brand.white, fontWeight: "700", fontSize: 11 },

  tabRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tabBtn: { borderBottomWidth: 2, borderBottomColor: "transparent", paddingBottom: 5 },
  tabBtnActive: { borderBottomColor: brand.dark },
  tabText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: brand.dark, fontWeight: "900", fontSize: 12 },

  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardTitle: { color: brand.dark, fontWeight: "900", fontSize: 24, marginBottom: 0 },
  closeButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  closeButtonText: { color: brand.textLight, fontSize: 26, fontWeight: "500", lineHeight: 26 },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 8, padding: 11, marginBottom: 9 },
  formTwoCol: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  formFieldHalf: { flex: 1 },
  formFieldFull: { marginBottom: 4 },
  fieldLabel: { color: "#b47b35", fontWeight: "800", fontSize: 12, marginBottom: 4, textTransform: "capitalize" },
  helperText: { color: brand.textLight, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 12 },

  roleRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  rolePill: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 8, backgroundColor: brand.white },
  rolePillActive: { backgroundColor: brand.button, borderColor: brand.button },
  roleText: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.textLight },
  roleTextActive: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.white },

  roleSelectWrap: { marginBottom: 8 },
  roleSelect: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: brand.white, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roleSelectValue: { textTransform: "capitalize", fontSize: 12, color: brand.dark, fontWeight: "700" },
  roleChevron: { color: brand.textLight, fontSize: 18, fontWeight: "900" },

  modalActionRow: { flexDirection: "row", gap: 12, marginTop: 8, justifyContent: "space-between" },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center" },
  cancelButton: { backgroundColor: brand.white, borderWidth: 1, borderColor: brand.border, paddingVertical: 12, borderRadius: 10 },
  cancelButtonText: { color: brand.dark, fontWeight: "900", fontSize: 11, textAlign: "center" },
  primaryBtn: { backgroundColor: brand.buttonAlt, paddingVertical: 12, borderRadius: 10 },
  primaryBtnText: { color: brand.white, textAlign: "center", fontWeight: "900", letterSpacing: 0.8, fontSize: 11 },

  userCard: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 14, padding: 12, marginBottom: 10 },
  userCardArchived: { opacity: 0.7 },
  userTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#5d5adb", alignItems: "center", justifyContent: "center" },
  avatarText: { color: brand.white, fontWeight: "900", fontSize: 12 },
  userMain: { flex: 1, minWidth: 0 },
  userName: { color: brand.dark, fontWeight: "900" },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  userMeta: { color: brand.textLight, fontSize: 11 },
  copyLink: { color: "#6a65d8", fontWeight: "700", fontSize: 10 },
  userRight: { alignItems: "flex-end", gap: 4 },
  roleBadge: { borderWidth: 1, borderColor: brand.border, backgroundColor: "#f1f2ff", borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  roleBadgeText: { color: "#4f56a6", fontSize: 9, fontWeight: "900" },
  userStatus: { color: "#4a7f4f", fontSize: 10, fontWeight: "700" },
  userStatusArchived: { color: "#9a6b13", fontSize: 10, fontWeight: "700" },

  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 8, backgroundColor: brand.white },
  secondaryBtnActive: { backgroundColor: brand.accentSoft },
  secondaryBtnText: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.dark },
  secondaryBtnTextActive: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.dark },

  archiveBtn: { borderWidth: 1, borderColor: "#d7bcc3", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#fff7f8", justifyContent: "center" },
  archiveBtnText: { color: "#8f475b", textAlign: "center", fontWeight: "800", fontSize: 11 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 390, borderWidth: 1, borderColor: brand.border, borderRadius: 12, backgroundColor: brand.white, padding: 12 },

  deniedWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 18, fontWeight: "900", color: brand.dark },
  deniedText: { marginTop: 6, color: brand.textLight, textAlign: "center" },
});

