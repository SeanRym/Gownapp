import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAuditLogsAdmin } from "../services/audit";
import { brand } from "../theme/brand";
import {
  ENTITY_TYPES,
  PAGE_SIZE,
  fmtAuditTimestamp,
  fmtFilterDate,
  fmtFilterDateRange,
  formatPayload,
  getActionDomain,
  hasPayload,
  parseIsoDate,
  shortEntityId,
  toIsoDate,
} from "../utils/adminAuditUi";

const EMPTY_FILTERS = {
  action: "",
  entityType: "",
  actor: "",
  from: "",
  to: "",
};

function ActionBadge({ action }) {
  const domain = getActionDomain(action);
  return (
    <View style={[styles.actionBadge, { backgroundColor: domain.bg, borderColor: domain.color }]}>
      <View style={[styles.actionDot, { backgroundColor: domain.color }]} />
      <Text style={[styles.actionBadgeText, { color: domain.color }]} numberOfLines={1}>
        {String(action || "—").toUpperCase()}
      </Text>
    </View>
  );
}

function PayloadModal({ log, onClose }) {
  if (!log) return null;
  const text = formatPayload(log.payload);
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Payload</Text>
          <Text style={styles.modalMeta}>
            {log.action} · {log.entity_type || "—"} · {shortEntityId(log.entity_id)}
          </Text>
          <ScrollView style={styles.payloadScroll} contentContainerStyle={styles.payloadScrollContent}>
            <Text style={styles.payloadText} selectable>
              {text || "—"}
            </Text>
          </ScrollView>
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DatePickerField({ label, value, onPress }) {
  const display = fmtFilterDate(value);
  return (
    <View style={styles.dateCol}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.dateInput} onPress={onPress}>
        <Text style={display ? styles.dateInputText : styles.dateInputPlaceholder}>
          {display || "mm/dd/yyyy"}
        </Text>
        <Text style={styles.dateInputIcon}>📅</Text>
      </Pressable>
    </View>
  );
}

function IosDatePickerModal({ visible, label, value, onClose, onConfirm, onClear }) {
  const [picked, setPicked] = useState(value);

  useEffect(() => {
    if (visible) setPicked(value);
  }, [visible, value]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <Text style={styles.dateModalTitle}>{label}</Text>
          <DateTimePicker
            value={picked}
            mode="date"
            display="inline"
            onChange={(_, date) => {
              if (date) setPicked(date);
            }}
          />
          <View style={styles.dateModalActions}>
            <Pressable style={styles.dateModalClearBtn} onPress={onClear}>
              <Text style={styles.dateModalClearText}>Clear</Text>
            </Pressable>
            <Pressable style={styles.dateModalTodayBtn} onPress={() => setPicked(new Date())}>
              <Text style={styles.dateModalTodayText}>Today</Text>
            </Pressable>
            <Pressable style={styles.dateModalDoneBtn} onPress={() => onConfirm(picked)}>
              <Text style={styles.dateModalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AdminAuditScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_audit");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [payloadLog, setPayloadLog] = useState(null);
  const [datePickerField, setDatePickerField] = useState(null);
  const [iosPickerDate, setIosPickerDate] = useState(new Date());

  const openDatePicker = (field) => {
    const current = parseIsoDate(draftFilters[field]) || new Date();
    if (Platform.OS === "ios") {
      setIosPickerDate(current);
      setDatePickerField(field);
      return;
    }
    setDatePickerField(field);
    setIosPickerDate(current);
  };

  const closeDatePicker = () => setDatePickerField(null);

  const onAndroidDateChange = (event, date) => {
    const field = datePickerField;
    closeDatePicker();
    if (event?.type === "dismissed" || !field) return;
    if (date) {
      setDraftFilters((p) => ({ ...p, [field]: toIsoDate(date) }));
    }
  };

  const fetchLogs = useCallback(
    async (off = 0, activeFilters = filters) => {
      setLoading(true);
      setError("");
      try {
        const data = await getAuditLogsAdmin({
          action: activeFilters.action,
          entityType: activeFilters.entityType,
          actor: activeFilters.actor,
          from: activeFilters.from,
          to: activeFilters.to,
          limit: PAGE_SIZE,
          offset: off,
        });
        setLogs(data.logs);
        setTotal(data.total);
        setOffset(data.offset);
      } catch (e) {
        setError(e?.message || "Failed to load audit logs.");
        setLogs([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useFocusEffect(
    useCallback(() => {
      if (allowed) fetchLogs(0);
    }, [allowed, fetchLogs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLogs(offset);
    } finally {
      setRefreshing(false);
    }
  }, [fetchLogs, offset]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const currentPage = useMemo(() => Math.floor(offset / PAGE_SIZE) + 1, [offset]);

  const onApplyFilters = () => {
    setFilters(draftFilters);
    fetchLogs(0, draftFilters);
  };

  const onResetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    closeDatePicker();
    fetchLogs(0, EMPTY_FILTERS);
  };

  const appliedDateRange = fmtFilterDateRange(filters.from, filters.to);

  if (!allowed) {
    return (
      <View style={styles.deniedWrap}>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.deniedText}>Only admin accounts can view the audit trail.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Audit Trail</Text>
            <Text style={styles.subtitle}>
              Append-only log of all admin mutations — orders, users, gowns, CMS, exports, and security events.
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {total.toLocaleString()} event{total !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>FILTERS</Text>

          <Text style={styles.fieldLabel}>Action</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. order.status"
            value={draftFilters.action}
            onChangeText={(v) => setDraftFilters((p) => ({ ...p, action: v }))}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>Entity type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.entityScroll}>
            <View style={styles.entityRow}>
              {ENTITY_TYPES.map((t) => {
                const active = draftFilters.entityType === t.value;
                return (
                  <Pressable
                    key={t.value || "all"}
                    style={[styles.entityPill, active && styles.entityPillActive]}
                    onPress={() => setDraftFilters((p) => ({ ...p, entityType: t.value }))}
                  >
                    <Text style={active ? styles.entityPillTextActive : styles.entityPillText}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text style={styles.fieldLabel}>Actor (email)</Text>
          <TextInput
            style={styles.input}
            placeholder="partial email"
            value={draftFilters.actor}
            onChangeText={(v) => setDraftFilters((p) => ({ ...p, actor: v }))}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <View style={styles.dateRow}>
            <DatePickerField label="From" value={draftFilters.from} onPress={() => openDatePicker("from")} />
            <DatePickerField label="To" value={draftFilters.to} onPress={() => openDatePicker("to")} />
          </View>

          <View style={styles.filterActions}>
            <Pressable style={styles.applyBtn} onPress={onApplyFilters}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
            <Pressable style={styles.resetBtn} onPress={onResetFilters}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        {appliedDateRange ? (
          <View style={styles.activeRangeBanner}>
            <Text style={styles.activeRangeLabel}>Date range</Text>
            <Text style={styles.activeRangeValue}>{appliedDateRange}</Text>
            <Text style={styles.activeRangeMeta}>
              {total.toLocaleString()} event{total !== 1 ? "s" : ""} in this range
            </Text>
          </View>
        ) : null}

        {error ? (
          <Pressable
            style={styles.errorBanner}
            onPress={() => Alert.alert("Audit load failed", error)}
          >
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}

        {loading && !logs.length ? <Text style={styles.loadingText}>Loading…</Text> : null}

        {!loading && !logs.length && !error ? (
          <Text style={styles.emptyText}>No audit events match your filters.</Text>
        ) : null}

        {logs.map((log, i) => (
          <View key={String(log.id || `${log.logged_at}-${i}`)} style={[styles.logCard, i % 2 === 1 && styles.logCardAlt]}>
            <Text style={styles.logTs}>{fmtAuditTimestamp(log.logged_at)}</Text>
            <Text style={styles.logActor} numberOfLines={1}>
              {log.actor_email || "—"}
            </Text>
            <ActionBadge action={log.action} />
            <View style={styles.logMetaRow}>
              <Text style={styles.logMetaLabel}>Type</Text>
              <Text style={styles.logMetaValue}>{log.entity_type || "—"}</Text>
            </View>
            <View style={styles.logMetaRow}>
              <Text style={styles.logMetaLabel}>Entity ID</Text>
              <Text style={styles.logEntityId} numberOfLines={2}>
                {log.entity_id || "—"}
              </Text>
            </View>
            <View style={styles.logMetaRow}>
              <Text style={styles.logMetaLabel}>IP</Text>
              <Text style={styles.logMetaValue}>{log.ip || "—"}</Text>
            </View>
            {hasPayload(log.payload) ? (
              <Pressable style={styles.payloadBtn} onPress={() => setPayloadLog(log)}>
                <Text style={styles.payloadBtnText}>▼ view payload</Text>
              </Pressable>
            ) : (
              <Text style={styles.noPayload}>—</Text>
            )}
          </View>
        ))}

        {totalPages > 1 ? (
          <View style={styles.pagination}>
            <Text style={styles.pageMeta}>
              Page {currentPage} of {totalPages} · {total.toLocaleString()} total
            </Text>
            <View style={styles.pageBtns}>
              <Pressable
                style={[styles.pageBtn, offset === 0 && styles.pageBtnDisabled]}
                disabled={offset === 0 || loading}
                onPress={() => fetchLogs(Math.max(0, offset - PAGE_SIZE))}
              >
                <Text style={styles.pageBtnText}>← Prev</Text>
              </Pressable>
              <Pressable
                style={[styles.pageBtn, offset + PAGE_SIZE >= total && styles.pageBtnDisabled]}
                disabled={offset + PAGE_SIZE >= total || loading}
                onPress={() => fetchLogs(offset + PAGE_SIZE)}
              >
                <Text style={styles.pageBtnText}>Next →</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <PayloadModal log={payloadLog} onClose={() => setPayloadLog(null)} />

      {Platform.OS === "ios" ? (
        <IosDatePickerModal
          visible={Boolean(datePickerField)}
          label={datePickerField === "to" ? "To date" : "From date"}
          value={iosPickerDate}
          onClose={closeDatePicker}
          onClear={() => {
            if (datePickerField) {
              setDraftFilters((p) => ({ ...p, [datePickerField]: "" }));
            }
            closeDatePicker();
          }}
          onConfirm={(date) => {
            if (datePickerField) {
              setDraftFilters((p) => ({ ...p, [datePickerField]: toIsoDate(date) }));
            }
            closeDatePicker();
          }}
        />
      ) : null}

      {Platform.OS === "android" && datePickerField ? (
        <DateTimePicker
          value={iosPickerDate}
          mode="date"
          display="default"
          onChange={onAndroidDateChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 32 },
  deniedWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 20, fontWeight: "800", color: brand.dark, marginBottom: 8 },
  deniedText: { color: brand.textLight, textAlign: "center", fontSize: 13 },

  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  headerLeft: { flex: 1 },
  title: { fontSize: 28, fontWeight: "700", color: "#202020", fontStyle: "italic" },
  subtitle: { color: "#8a8a8a", fontSize: 12, marginTop: 4, lineHeight: 17 },
  countBadge: {
    backgroundColor: "#4a2c82",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countBadgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },

  filterCard: {
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 10,
    backgroundColor: brand.white,
    padding: 12,
    marginBottom: 12,
  },
  filterLabel: { color: "#9b9b9b", fontSize: 10, letterSpacing: 1.1, marginBottom: 10, fontWeight: "700" },
  fieldLabel: { color: "#666", fontSize: 11, fontWeight: "700", marginBottom: 4, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#202020",
    marginBottom: 6,
    backgroundColor: "#fff",
  },
  entityScroll: { marginBottom: 6 },
  entityRow: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  entityPill: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fafafa",
  },
  entityPillActive: { backgroundColor: "#4a2c82", borderColor: "#4a2c82" },
  entityPillText: { color: "#666", fontSize: 11, fontWeight: "600" },
  entityPillTextActive: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateCol: { flex: 1 },
  dateInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dateInputText: { color: "#202020", fontSize: 13, fontWeight: "600" },
  dateInputPlaceholder: { color: "#aaa", fontSize: 13 },
  dateInputIcon: { fontSize: 16 },
  activeRangeBanner: {
    borderWidth: 1,
    borderColor: "#d4c4e8",
    backgroundColor: "#f7f2fc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  activeRangeLabel: { color: "#4a2c82", fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 4 },
  activeRangeValue: { color: "#202020", fontSize: 15, fontWeight: "800", marginBottom: 2 },
  activeRangeMeta: { color: "#666", fontSize: 11 },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  dateModalCard: {
    backgroundColor: brand.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 24,
  },
  dateModalTitle: { fontSize: 16, fontWeight: "800", color: "#202020", marginBottom: 8, textAlign: "center" },
  dateModalActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 },
  dateModalClearBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  dateModalClearText: { color: "#a33d54", fontWeight: "700", fontSize: 14 },
  dateModalTodayBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  dateModalTodayText: { color: "#4a2c82", fontWeight: "700", fontSize: 14 },
  dateModalDoneBtn: {
    backgroundColor: "#4a2c82",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginLeft: "auto",
  },
  dateModalDoneText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  filterActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  applyBtn: { backgroundColor: "#4a2c82", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  resetBtn: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "#fff" },
  resetBtnText: { color: "#666", fontWeight: "700", fontSize: 13 },

  errorBanner: {
    borderWidth: 1,
    borderColor: "#f5c2c7",
    backgroundColor: "#f8d7da",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  errorText: { color: "#721c24", fontSize: 12, fontWeight: "600" },
  loadingText: { color: brand.textLight, fontSize: 12, marginBottom: 8 },
  emptyText: { color: brand.textLight, fontSize: 12, marginBottom: 8 },

  logCard: {
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    backgroundColor: brand.white,
    padding: 12,
    marginBottom: 8,
  },
  logCardAlt: { backgroundColor: "#fafafa" },
  logTs: { color: "#666", fontSize: 11, marginBottom: 4 },
  logActor: { color: "#202020", fontWeight: "700", fontSize: 13, marginBottom: 6 },
  actionBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 8,
    maxWidth: "100%",
  },
  actionDot: { width: 5, height: 5, borderRadius: 99 },
  actionBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, flexShrink: 1 },
  logMetaRow: { flexDirection: "row", gap: 8, marginBottom: 3 },
  logMetaLabel: { width: 72, color: "#999", fontSize: 11, fontWeight: "700" },
  logMetaValue: { flex: 1, color: "#444", fontSize: 11 },
  logEntityId: { flex: 1, color: "#444", fontSize: 10, fontFamily: "monospace" },
  payloadBtn: { alignSelf: "flex-start", marginTop: 6 },
  payloadBtnText: { color: "#4a2c82", fontWeight: "700", fontSize: 11, fontFamily: "monospace" },
  noPayload: { color: "#bbb", fontSize: 12, marginTop: 4 },

  pagination: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 10,
    backgroundColor: brand.white,
    padding: 12,
    gap: 10,
  },
  pageMeta: { color: "#888", fontSize: 11 },
  pageBtns: { flexDirection: "row", gap: 8 },
  pageBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: "#444", fontWeight: "700", fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: brand.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#202020", marginBottom: 4 },
  modalMeta: { color: "#888", fontSize: 11, marginBottom: 10 },
  payloadScroll: { maxHeight: 360 },
  payloadScrollContent: { paddingBottom: 8 },
  payloadText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#4a2c82",
    lineHeight: 17,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 10,
  },
  modalCloseBtn: {
    marginTop: 12,
    backgroundColor: "#4a2c82",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCloseBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
