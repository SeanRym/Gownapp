import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { createUserAdmin, deleteUserAdmin, listUsersAdmin, updateUserRoleAdmin, restoreUserAdmin } from "../services/authLocal";
import { brand } from "../theme/brand";

const ROLE_OPTIONS = ["customer", "staff", "admin"];
const EMPTY_FORM = { firstName: "", lastName: "", email: "", role: "customer" };
const FILTER_OPTIONS = ["all", "customer", "staff", "admin"];

function formatUserDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminUsersScreen({ navigation }) {
  const { user } = useShop();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;
  const allowed = canAccess(user, "admin_users");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tab, setTab] = useState("active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditorUser, setRoleEditorUser] = useState(null);
  const [roleDraft, setRoleDraft] = useState("staff");
  const [createdUserInfo, setCreatedUserInfo] = useState(null);
  const [creating, setCreating] = useState(false);

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
      .sort((a, b) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return String(a?.email || "").localeCompare(String(b?.email || ""));
      });
  }, [items, query, roleFilter]);

  const roleCounts = useMemo(() => {
    const all = items.length;
    const customer = items.filter((u) => String(u?.role || "").toLowerCase() === "customer").length;
    const staff = items.filter((u) => String(u?.role || "").toLowerCase() === "staff").length;
    const admin = items.filter((u) => String(u?.role || "").toLowerCase() === "admin").length;
    return { all, customer, staff, admin };
  }, [items]);

  const onCreate = async () => {
    if (creating) return;
    const firstName = String(form.firstName || "").trim();
    const lastName = String(form.lastName || "").trim();
    const email = String(form.email || "").trim();
    if (!firstName || !lastName || !email) {
      Alert.alert("Missing details", "Enter the first name, last name, and email.");
      return;
    }

    setCreating(true);
    try {
      const res = await createUserAdmin({ ...form, firstName, lastName, email });
      if (!res.ok) {
        Alert.alert("Create failed", res.error || "Unable to create user.");
        return;
      }
      setForm(EMPTY_FORM);
      setEditorOpen(false);
      await loadData();
      setCreatedUserInfo({
        firstName: String(res.user?.firstName || firstName).trim(),
        lastName: String(res.user?.lastName || lastName).trim(),
        email: String(res.user?.email || email).trim(),
        password: String(res.temporaryPassword || res.password || "").trim(),
        role: String(res.user?.role || form.role || "customer").toLowerCase(),
      });
    } catch (e) {
      Alert.alert("Create failed", e?.message || "Unable to create user on the server.");
    } finally {
      setCreating(false);
    }
  };

  const onChangeRole = async (id, email, role) => {
    const res = await updateUserRoleAdmin({ id, email, role });
    if (!res.ok) {
      Alert.alert("Update failed", res.error || "Unable to update role.");
      return;
    }
    setRoleEditorOpen(false);
    setRoleEditorUser(null);
    loadData();
  };

  const openRoleEditor = (user) => {
    if (!user || String(user.role || "").toLowerCase() !== "staff") return;
    setRoleEditorUser(user);
    setRoleDraft(String(user.role || "staff").toLowerCase());
    setRoleEditorOpen(true);
  };

  const staffRoleOptions = ["staff", "admin"];

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

  const adminNav = [
    { label: "Dashboard", route: "Main" },
    { label: "Catalogue", route: "AdminGowns" },
    { label: "Orders", route: "AdminOrders" },
    { label: "Sales", route: "AdminStats" },
    { label: "Users", route: "AdminUsers", active: true },
    { label: "Returns", route: "AdminReturns" },
    { label: "Audit", route: "AdminAudit" },
  ];

  return (
    <View style={styles.shell}>
      {isDesktop ? (
        <View style={styles.sidebar}>
          <View>
            <Text style={styles.brandName}>JCE Bridal</Text>
            <Text style={styles.brandCaption}>Admin panel</Text>
            <View style={styles.sidebarDivider} />
            {adminNav.map((item) => (
              <Pressable
                key={item.label}
                style={[styles.sidebarItem, item.active ? styles.sidebarItemActive : null]}
                onPress={() => navigation.navigate(item.route)}
              >
                <View style={[styles.sidebarDot, item.active ? styles.sidebarDotActive : null]} />
                <Text style={[styles.sidebarText, item.active ? styles.sidebarTextActive : null]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sidebarFooter}>
            <Pressable style={styles.modeButton} onPress={() => {}}>
              <Text style={styles.modeButtonText}>☼  Light mode</Text>
            </Pressable>
            <Text style={styles.sidebarFooterLink}>Clear secret</Text>
            <Text style={styles.sidebarFooterLink}>Change secret</Text>
            <Text style={styles.sidebarFooterLink}>Logout</Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, isDesktop ? styles.desktopContent : null]}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Users</Text>
          <Text style={styles.subtitle}>{roleCounts.all} registered</Text>
        </View>
        <Pressable style={styles.editBtn} onPress={() => Alert.alert("Profile", "Edit profile is managed on web admin for now.")}>
          <Text style={styles.editBtnText}>Edit my profile</Text>
        </Pressable>
      </View>

      <View style={[styles.searchRow, !isDesktop ? styles.searchRowMobile : null]}>
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
            <Pressable style={styles.userTop} onPress={() => setSelectedUser(u)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(u?.name, u?.email)}</Text>
              </View>
              <View style={styles.userMain}>
                <Text style={styles.userName}>{u.name || "User"}</Text>
                <View style={styles.emailRow}>
                  <Text style={styles.userMeta}>{u.email}</Text>
                  <Pressable
                    onPress={async () => {
                      const value = String(u.email || "").trim();
                      if (!value) {
                        Alert.alert("Email", "No email available.");
                        return;
                      }
                      await Clipboard.setStringAsync(value);
                      Alert.alert("Email copied", value);
                    }}
                  >
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
            </Pressable>

            <View style={styles.row}>
              {String(u?.role || "").toLowerCase() === "staff" ? (
                <Pressable
                  style={styles.changeRoleBtn}
                  onPress={() => openRoleEditor(u)}
                >
                  <Text style={styles.changeRoleBtnText}>Change role</Text>
                </Pressable>
              ) : (
                <View style={styles.spacerBtn} />
              )}
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
            <Pressable style={styles.userTop} onPress={() => setSelectedUser(u)}>
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
            </Pressable>
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
              <Text style={styles.cardTitle}>Add User</Text>
              <Pressable style={styles.closeButton} onPress={() => setEditorOpen(false)}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>First name</Text>
              <TextInput
                style={styles.input}
                placeholder="Maria"
                value={form.firstName}
                autoCapitalize="words"
                onChangeText={(v) => setForm((p) => ({ ...p, firstName: v }))}
              />
            </View>

            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Last name</Text>
              <TextInput
                style={styles.input}
                placeholder="Santos"
                value={form.lastName}
                autoCapitalize="words"
                onChangeText={(v) => setForm((p) => ({ ...p, lastName: v }))}
              />
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
              <Pressable style={[styles.primaryBtn, styles.actionButton]} onPress={onCreate} disabled={creating}>
                <Text style={styles.primaryBtnText}>{creating ? "Creating…" : "Create user"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(createdUserInfo)} transparent animationType="fade" onRequestClose={() => setCreatedUserInfo(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreatedUserInfo(null)}>
          <Pressable style={styles.successModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.successModalTitle}>User Created</Text>
              <Pressable style={styles.closeButton} onPress={() => setCreatedUserInfo(null)}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>✓ User account created successfully</Text>
              <Text style={styles.successBannerName}>
                {createdUserInfo?.firstName} {createdUserInfo?.lastName}
              </Text>
              <Text style={styles.successBannerEmail}>{createdUserInfo?.email || "user@example.com"}</Text>
              <Text style={styles.successBannerRole}>{roleLabel(createdUserInfo?.role)}</Text>
            </View>

            <Text style={styles.successLabel}>Temporary password (send to user securely)</Text>
            <View style={styles.passwordRow}>
              <Text style={styles.passwordText}>{createdUserInfo?.password || "Unavailable"}</Text>
              <Pressable
                style={styles.copyButton}
                onPress={async () => {
                  const value = String(createdUserInfo?.password || "").trim();
                  if (!value) {
                    Alert.alert("Password unavailable", "The server did not return a temporary password.");
                    return;
                  }
                  await Clipboard.setStringAsync(value);
                  Alert.alert("Password copied", value);
                }}
              >
                <Text style={styles.copyButtonText}>Copy</Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              Use this password with the email above to log in on web or mobile. The user can change it after logging in.
            </Text>

            <Pressable style={[styles.primaryBtn, styles.actionButton, styles.successDoneButton]} onPress={() => setCreatedUserInfo(null)}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(selectedUser)} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedUser(null)}>
          <Pressable style={styles.infoModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.infoModalTitle}>User Information</Text>
              <Pressable style={styles.closeButton} onPress={() => setSelectedUser(null)}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            {selectedUser ? (
              <>
                <View style={styles.infoIdentity}>
                  <View style={styles.infoAvatar}>
                    <Text style={styles.avatarText}>{initials(selectedUser.name, selectedUser.email)}</Text>
                  </View>
                  <View style={styles.infoIdentityText}>
                    <Text style={styles.infoName}>{selectedUser.name || "User"}</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{String(selectedUser.role || "customer").toUpperCase()}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoDetails}>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Email</Text><Text style={styles.infoValue}>{selectedUser.email || "—"}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone</Text><Text style={styles.infoValue}>{selectedUser.phone || "—"}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Address</Text><Text style={styles.infoValue}>{selectedUser.address || "—"}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Joined</Text><Text style={styles.infoValue}>{formatUserDate(selectedUser.createdAt)}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Status</Text><Text style={styles.infoValue}>{selectedUser.isActive === false ? "Archived" : "Active"}</Text></View>
                </View>
                <Text style={styles.infoNote}>User information can only be changed by the account owner.</Text>
                <Pressable style={styles.infoCloseButton} onPress={() => setSelectedUser(null)}>
                  <Text style={styles.infoCloseText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={roleEditorOpen} transparent animationType="fade" onRequestClose={() => setRoleEditorOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRoleEditorOpen(false)}>
          <Pressable style={styles.roleModalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.roleModalTitle}>Change Role</Text>
              <Pressable style={styles.closeButton} onPress={() => setRoleEditorOpen(false)}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.roleModalText}>Changing role for {roleEditorUser?.name || roleEditorUser?.email || "this user"}.</Text>

            <View style={styles.roleModalFieldRow}>
              <Text style={styles.fieldLabel}>Role</Text>
              <Pressable style={styles.roleSelect} onPress={() => {
                const currentIndex = staffRoleOptions.indexOf(roleDraft);
                const nextIndex = (currentIndex + 1) % staffRoleOptions.length;
                setRoleDraft(staffRoleOptions[nextIndex]);
              }}>
                <Text style={styles.roleSelectValue}>{String(roleDraft || "staff").charAt(0).toUpperCase() + String(roleDraft || "staff").slice(1)}</Text>
                <Text style={styles.roleChevron}>⌄</Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>Only staff accounts can have their role changed. Customer roles are fixed.</Text>

            <View style={styles.modalActionRow}>
              <Pressable style={[styles.cancelButton, styles.actionButton]} onPress={() => setRoleEditorOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, styles.actionButton]}
                onPress={() => {
                  if (!roleEditorUser) return;
                  onChangeRole(roleEditorUser.id, roleEditorUser.email, roleDraft);
                }}
              >
                <Text style={styles.primaryBtnText}>Change role</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: brand.bg },
  sidebar: { width: 148, backgroundColor: brand.white, borderRightWidth: 1, borderRightColor: "#e6e2e2", justifyContent: "space-between" },
  brandName: { color: brand.dark, fontSize: 13, fontWeight: "900", marginHorizontal: 14, marginTop: 16 },
  brandCaption: { color: brand.textLight, fontSize: 9, marginHorizontal: 14, marginTop: 3 },
  sidebarDivider: { height: 1, backgroundColor: "#e6e2e2", marginTop: 14, marginBottom: 10 },
  sidebarItem: { height: 30, flexDirection: "row", alignItems: "center", paddingHorizontal: 7, marginBottom: 2, borderRadius: 7 },
  sidebarItemActive: { backgroundColor: "#efedff", borderLeftWidth: 3, borderLeftColor: "#5147e8", paddingLeft: 4 },
  sidebarDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#c8c5c5", marginRight: 8 },
  sidebarDotActive: { backgroundColor: "#5147e8" },
  sidebarText: { color: "#666161", fontSize: 10 },
  sidebarTextActive: { color: "#5147e8", fontWeight: "800" },
  sidebarFooter: { padding: 7, gap: 12, paddingBottom: 14 },
  modeButton: { borderWidth: 1, borderColor: "#d7d3d3", borderRadius: 7, paddingVertical: 7, paddingHorizontal: 8 },
  modeButtonText: { color: "#555050", fontSize: 9 },
  sidebarFooterLink: { color: "#777070", fontSize: 9, paddingHorizontal: 8 },
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 28 },
  desktopContent: { width: "100%", maxWidth: 700, paddingHorizontal: 26, paddingTop: 28 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  subtitle: { color: brand.textLight, marginTop: 2, marginBottom: 10 },
  editBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#14101a" },
  editBtnText: { color: brand.white, fontWeight: "700", fontSize: 11 },

  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  searchRowMobile: { flexDirection: "column" },
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
  infoModalCard: { width: "100%", maxWidth: 390, borderWidth: 1, borderColor: "#e2deda", borderRadius: 11, backgroundColor: "#fffdfa", padding: 24 },
  infoModalTitle: { color: "#514047", fontFamily: "serif", fontSize: 17, marginBottom: 10 },
  infoIdentity: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#e7e2de" },
  infoAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#5147e8", alignItems: "center", justifyContent: "center", marginRight: 10 },
  infoIdentityText: { flex: 1, gap: 4 },
  infoName: { color: brand.dark, fontWeight: "800", fontSize: 13 },
  infoDetails: { paddingTop: 4 },
  infoRow: { minHeight: 38, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e7e2de" },
  infoLabel: { width: 72, color: "#776f6c", fontSize: 9 },
  infoValue: { flex: 1, color: brand.dark, fontSize: 10 },
  infoNote: { color: "#8f8783", fontSize: 8, marginTop: 12, marginBottom: 14 },
  infoCloseButton: { height: 28, borderWidth: 1, borderColor: "#d7d1ce", borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: brand.white },
  infoCloseText: { color: brand.dark, fontSize: 10, fontWeight: "800" },
  closeButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  closeButtonText: { color: brand.textLight, fontSize: 26, fontWeight: "500", lineHeight: 26 },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 8, padding: 11, marginBottom: 9 },
  formTwoCol: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  formTwoColMobile: { flexDirection: "column", gap: 0 },
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
  changeRoleBtn: { flex: 1, minWidth: 110, borderWidth: 1, borderColor: "#9e9cf3", borderRadius: 10, paddingVertical: 8, backgroundColor: "#f2efff", justifyContent: "center" },
  changeRoleBtnText: { color: "#4d4ae1", textAlign: "center", fontWeight: "800", fontSize: 11 },
  roleModalCard: { width: "100%", maxWidth: 390, borderWidth: 1, borderColor: brand.border, borderRadius: 12, backgroundColor: brand.white, padding: 16 },
  roleModalTitle: { color: brand.dark, fontWeight: "900", fontSize: 20 },
  roleModalText: { color: brand.textLight, fontSize: 12, marginBottom: 12 },
  roleModalFieldRow: { marginBottom: 10 },

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

  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  secondaryBtn: { flex: 1, minWidth: 70, borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingVertical: 8, backgroundColor: brand.white },
  secondaryBtnActive: { backgroundColor: brand.accentSoft },
  secondaryBtnText: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.dark },
  secondaryBtnTextActive: { textAlign: "center", fontWeight: "900", fontSize: 11, color: brand.dark },

  archiveBtn: { minWidth: 70, borderWidth: 1, borderColor: "#d7bcc3", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#fff7f8", justifyContent: "center" },
  archiveBtnText: { color: "#8f475b", textAlign: "center", fontWeight: "800", fontSize: 11 },
  spacerBtn: { flex: 1, minWidth: 110 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 390, borderWidth: 1, borderColor: brand.border, borderRadius: 12, backgroundColor: brand.white, padding: 12 },
  successModalCard: { width: "88%", maxWidth: 420, backgroundColor: brand.white, borderRadius: 18, padding: 22, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  successModalTitle: { fontSize: 24, fontWeight: "700", color: brand.dark, textAlign: "center", marginBottom: 14 },
  successBanner: { backgroundColor: "#eafaf1", borderWidth: 1, borderColor: "#bfe8d0", borderRadius: 10, padding: 12, marginBottom: 16 },
  successBannerText: { color: "#0f6b42", fontWeight: "700", fontSize: 15, textAlign: "center" },
  successBannerName: { color: "#0f6b42", fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: 6 },
  successBannerEmail: { color: "#0f6b42", fontSize: 12, textAlign: "center", marginTop: 4 },
  successBannerRole: { color: "#0f6b42", fontSize: 11, textAlign: "center", marginTop: 3, textTransform: "uppercase" },
  successLabel: { fontSize: 12, color: brand.textLight, marginBottom: 8 },
  passwordRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 12, justifyContent: "space-between" },
  passwordText: { flex: 1, color: brand.dark, fontSize: 14, fontWeight: "700" },
  copyButton: { backgroundColor: "#f3f1ff", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  copyButtonText: { color: brand.primary, fontWeight: "700", fontSize: 12 },
  successDoneButton: { marginTop: 10 },

  deniedWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 18, fontWeight: "900", color: brand.dark },
  deniedText: { marginTop: 6, color: brand.textLight, textAlign: "center" },
});

