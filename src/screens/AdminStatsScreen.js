import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { getAllOrdersAdmin } from "../services/orders";
import { getAllGownsAdmin } from "../services/gowns";
import { brand } from "../theme/brand";
import { normalizeId } from "../utils/id";

function money(n) {
  return `P${Math.round(Number(n || 0)).toLocaleString("en-PH")}`;
}

function shortMoney(n) {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return `${Math.round(num)}`;
}

function getOrderTotal(o) {
  const t = Number(o?.total);
  if (Number.isFinite(t) && t > 0) return t;
  const sub = Number(o?.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return 0;
}

function normalizeStatus(s) {
  return String(s || "placed").trim().toLowerCase();
}

function isCompletedOrder(o) {
  return normalizeStatus(o?.status) === "completed";
}

const ACTIVE_ORDER_STATUSES = new Set(["paid", "processing", "ready", "shipped"]);
const STATUS_DISPLAY = {
  placed: { label: "Placed", color: "#2d5be3" },
  pending_payment: { label: "Pending Payment", color: "#856404" },
  paid: { label: "Paid", color: "#155724" },
  processing: { label: "Processing", color: "#4a2c82" },
  ready: { label: "Ready", color: "#0a5276" },
  shipped: { label: "Shipped", color: "#0c5460" },
  completed: { label: "Completed", color: "#155724" },
  cancelled: { label: "Cancelled", color: "#721c24" },
  refunded: { label: "Refunded", color: "#7a3608" },
};

function parseOrderDate(o) {
  const raw = o?.createdAt || o?.placedAt;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDateRangeConfig(key) {
  const now = new Date();
  const todayStart = startOfDay(now);
  if (key === "today") return { label: "Today", from: todayStart, to: now };
  if (key === "last7days") return { label: "Last 7 days", from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
  if (key === "last30days") return { label: "Last 30 days", from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
  if (key === "thisyear") return { label: "This year", from: new Date(now.getFullYear(), 0, 1), to: now };
  return { label: "All time", from: null, to: now };
}

function inDateRange(order, rangeKey) {
  const d = parseOrderDate(order);
  if (!d) return false;
  const { from, to } = getDateRangeConfig(rangeKey);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getWritableCsvDirectory() {
  const preferred =
    FileSystemLegacy.documentDirectory ||
    FileSystem.documentDirectory ||
    FileSystemLegacy.cacheDirectory ||
    FileSystem.cacheDirectory ||
    "";

  if (typeof preferred === "string" && preferred.trim()) {
    return preferred.replace(/\/+$/, "") + "/";
  }

  return "file:///";
}

async function writeCsvFile(fileUri, csvText) {
  const encoding = FileSystemLegacy.EncodingType?.UTF8 ?? "utf8";
  const dir = fileUri.includes("/") ? fileUri.slice(0, fileUri.lastIndexOf("/")) : fileUri;
  try {
    await FileSystemLegacy.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory already exists or is not writable in this environment.
  }
  return FileSystemLegacy.writeAsStringAsync(fileUri, csvText, { encoding });
}

export function AdminStatsScreen() {
  const { user } = useShop();
  const allowed = canAccess(user, "admin_stats");
  const [orders, setOrders] = useState([]);
  const [gowns, setGowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("daily"); // daily | month | year
  const [reportType, setReportType] = useState("overview");
  const [dateRangeKey, setDateRangeKey] = useState("alltime");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ordersData, gownsData] = await Promise.all([getAllOrdersAdmin(), getAllGownsAdmin()]);
    setOrders(Array.isArray(ordersData) ? ordersData : []);
    setGowns(Array.isArray(gownsData) ? gownsData : []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) loadData();
    }, [loadData])
  );

  const stats = useMemo(() => {
    const allOrders = Array.isArray(orders) ? orders : [];
    const allGowns = Array.isArray(gowns) ? gowns : [];

    const now = Date.now();
    const days7 = 7 * 24 * 60 * 60 * 1000;
    const from7d = new Date(now - days7);
    const todayStart = startOfDay(new Date(now));

    const ordersWithDate = allOrders
      .map((o) => ({ o, d: parseOrderDate(o) }))
      .filter((x) => Boolean(x.d));

    const last7Orders = ordersWithDate.filter((x) => x.d >= from7d).map((x) => x.o);
    const todayOrders = ordersWithDate.filter((x) => x.d >= todayStart).map((x) => x.o);
    const completedOrders = allOrders.filter(isCompletedOrder);
    const completedLast7 = last7Orders.filter(isCompletedOrder);
    const completedToday = todayOrders.filter(isCompletedOrder);

    const revenueAll = completedOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
    const revenue7 = completedLast7.reduce((sum, o) => sum + getOrderTotal(o), 0);
    const revenueToday = completedToday.reduce((sum, o) => sum + getOrderTotal(o), 0);

    const totalOrders = allOrders.length;
    const totalOrders7 = last7Orders.length;
    const totalOrdersToday = todayOrders.length;
    const completedCount = completedOrders.length;
    const activeCount = allOrders.filter((o) => ACTIVE_ORDER_STATUSES.has(normalizeStatus(o?.status))).length;

    const itemsSoldAll = completedOrders.reduce(
      (sum, o) => sum + (Array.isArray(o?.items) ? o.items.reduce((s, it) => s + (Number(it?.qty) || 0), 0) : 0),
      0
    );
    const itemsSold7 = completedLast7.reduce(
      (sum, o) => sum + (Array.isArray(o?.items) ? o.items.reduce((s, it) => s + (Number(it?.qty) || 0), 0) : 0),
      0
    );
    const itemsSoldToday = completedToday.reduce(
      (sum, o) => sum + (Array.isArray(o?.items) ? o.items.reduce((s, it) => s + (Number(it?.qty) || 0), 0) : 0),
      0
    );

    const aovAll = completedCount ? revenueAll / completedCount : 0;
    const aov7 = completedLast7.length ? revenue7 / completedLast7.length : 0;
    const aovToday = completedToday.length ? revenueToday / completedToday.length : 0;

    const statusCounts = allOrders.reduce((acc, o) => {
      const s = normalizeStatus(o?.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const byItem = new Map();
    for (const o of allOrders) {
      const items = Array.isArray(o?.items) ? o.items : [];
      for (const it of items) {
        const id = normalizeId(it?.id);
        if (!id) continue;
        const qty = Number(it?.qty) || 0;
        const subtotal = Number(it?.subtotal) || 0;
        const prev = byItem.get(id) || { id, name: String(it?.name || `#${id}`), qty: 0, revenue: 0 };
        byItem.set(id, { ...prev, qty: prev.qty + qty, revenue: prev.revenue + subtotal });
      }
    }

    const topByQty = [...byItem.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topByRevenue = [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const outOfStock = allGowns.filter((g) => Number(g?.stockQty) <= 0);
    const lowStock = allGowns.filter((g) => {
      const stock = Number(g?.stockQty) || 0;
      const threshold = Number(g?.lowStockThreshold) || 0;
      return stock > 0 && stock <= threshold;
    });

    const uniqueCustomers = new Set(
      allOrders
        .map((o) => String(o?.contact?.email || "").trim().toLowerCase())
        .filter(Boolean)
    );

    // Chart data: daily = last 7 days; monthly = last 30 days; yearly = last 12 months
    const nowDate = new Date(now);
    const weekBuckets = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(nowDate);
      d.setDate(d.getDate() - (6 - idx));
      const day = startOfDay(d);
      const label = day.toLocaleDateString("en-PH", { weekday: "short" });
      return { label, value: 0, day };
    });
    for (const { o, d } of ordersWithDate) {
      if (!isCompletedOrder(o)) continue;
      const bucket = weekBuckets.find((b) => sameDay(b.day, d));
      if (bucket) bucket.value += getOrderTotal(o);
    }

    const monthlyBuckets = Array.from({ length: 30 }).map((_, idx) => {
      const d = new Date(nowDate);
      d.setDate(d.getDate() - (29 - idx));
      const day = startOfDay(d);
      const label = day.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      return { label, value: 0, day };
    });
    for (const { o, d } of ordersWithDate) {
      if (!isCompletedOrder(o)) continue;
      const bucket = monthlyBuckets.find((b) => sameDay(b.day, d));
      if (bucket) bucket.value += getOrderTotal(o);
    }

    const yearlyBuckets = Array.from({ length: 12 }).map((_, idx) => {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (11 - idx), 1);
      const label = d.toLocaleDateString("en-PH", { month: "short" });
      return { label, value: 0, month: d.getMonth(), year: d.getFullYear() };
    });
    for (const { o, d } of ordersWithDate) {
      if (!isCompletedOrder(o)) continue;
      const bucket = yearlyBuckets.find((b) => b.month === d.getMonth() && b.year === d.getFullYear());
      if (bucket) bucket.value += getOrderTotal(o);
    }

    const hourBuckets = [
      { label: "0-3", from: 0, to: 3, value: 0 },
      { label: "4-7", from: 4, to: 7, value: 0 },
      { label: "8-11", from: 8, to: 11, value: 0 },
      { label: "12-15", from: 12, to: 15, value: 0 },
      { label: "16-19", from: 16, to: 19, value: 0 },
      { label: "20-23", from: 20, to: 23, value: 0 },
    ];
    for (const { o, d } of ordersWithDate) {
      if (!isCompletedOrder(o)) continue;
      if (!sameDay(d, nowDate)) continue;
      const h = d.getHours();
      const bucket = hourBuckets.find((b) => h >= b.from && h <= b.to);
      if (bucket) bucket.value += getOrderTotal(o);
    }

    return {
      revenueAll,
      revenue7,
      revenueToday,
      totalOrders,
      totalOrders7,
      totalOrdersToday,
      activeCount,
      completedCount,
      itemsSoldAll,
      itemsSold7,
      itemsSoldToday,
      aovAll,
      aov7,
      aovToday,
      statusCounts,
      topByQty,
      topByRevenue,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      customersCount: uniqueCustomers.size,
      dailySeries: weekBuckets.map((b) => ({ label: b.label, value: b.value })),
      monthlySeries: monthlyBuckets.map((b) => ({ label: b.label, value: b.value })),
      yearlySeries: yearlyBuckets.map((b) => ({ label: b.label, value: b.value })),
      todaySeries: hourBuckets.map((b) => ({ label: b.label, value: b.value })),
    };
  }, [orders, gowns]);

  const series = range === "daily" ? stats.dailySeries : range === "month" ? stats.monthlySeries : stats.yearlySeries;
  const maxValue = Math.max(...series.map((s) => Number(s.value) || 0), 1);
  const statusLegend = [
    "placed",
    "pending_payment",
    "paid",
    "processing",
    "ready",
    "shipped",
    "completed",
    "cancelled",
    "refunded",
  ]
    .map((key) => ({ key, count: Number(stats.statusCounts?.[key] || 0) }))
    .filter((x) => x.count > 0);
  const topQtyBase = Math.max(1, ...(stats.topByQty || []).map((x) => Number(x?.qty) || 0));
  const reportOrders = useMemo(() => orders.filter((o) => inDateRange(o, dateRangeKey)), [orders, dateRangeKey]);

  const onExportCsv = useCallback(async () => {
    if (!reportOrders.length) {
      Alert.alert("No data", "No orders found in the selected date range.");
      return;
    }

    const headers = [
      "Order ID",
      "Date",
      "Customer Name",
      "Email",
      "Status",
      "Payment",
      "Order Total",
      "Item",
      "Size",
      "Qty",
      "Unit Price",
      "Line Total",
    ];

    const rows = [headers];
    for (const order of reportOrders) {
      const customerName = `${order?.contact?.firstName || ""} ${order?.contact?.lastName || ""}`.trim() || "-";
      const date = parseOrderDate(order)?.toISOString().slice(0, 10) || "-";
      const orderTotal = Number(getOrderTotal(order)).toFixed(2);
      const items = Array.isArray(order?.items) && order.items.length ? order.items : [{ name: "-", size: "-", qty: 0, subtotal: 0 }];

      for (const item of items) {
        const qty = Number(item?.qty) || 0;
        const subtotal = Number(item?.subtotal) || 0;
        const unitPrice = qty > 0 ? subtotal / qty : 0;
        rows.push([
          order?.id ?? "",
          date,
          customerName,
          order?.contact?.email || "",
          normalizeStatus(order?.status),
          String(order?.payment || "").toUpperCase(),
          orderTotal,
          item?.name || "-",
          item?.size || "-",
          qty,
          unitPrice.toFixed(2),
          subtotal.toFixed(2),
        ]);
      }
    }

    const csvText = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    const fileName = `jce_sales_report_${dateRangeKey}_${Date.now()}.csv`;
    const baseDir = getWritableCsvDirectory();
    const fileUri = `${baseDir}${fileName}`;

    try {
      await writeCsvFile(fileUri, csvText);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Sales report CSV" });
        return;
      }
      Alert.alert("CSV generated", `Saved to: ${fileUri}`);
    } catch (e) {
      Alert.alert("CSV export failed", e?.message || "Unable to generate CSV export.");
    }
  }, [dateRangeKey, reportOrders]);

  const onExportPdf = useCallback(async () => {
    const rangeCfg = getDateRangeConfig(dateRangeKey);
    if (!reportOrders.length) {
      Alert.alert("No data", "No orders found in the selected date range.");
      return;
    }
    const completed = reportOrders.filter((o) => String(o?.status || "").toLowerCase() === "completed").length;
    const cancelledRefunded = reportOrders.filter((o) => {
      const s = String(o?.status || "").toLowerCase();
      return s === "cancelled" || s === "refunded";
    }).length;
    const totalRevenue = reportOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
    const avgOrderValue = reportOrders.length ? totalRevenue / reportOrders.length : 0;
    const statusCounts = reportOrders.reduce((acc, o) => {
      const k = normalizeStatus(o?.status);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const itemRows = reportOrders.flatMap((o) =>
      (o?.items || []).map((it) => {
        const qty = Number(it?.qty) || 0;
        const subtotal = Number(it?.subtotal) || 0;
        const unit = qty > 0 ? subtotal / qty : 0;
        return {
          orderId: o?.id,
          customer: `${o?.contact?.firstName || ""} ${o?.contact?.lastName || ""}`.trim() || o?.contact?.email || "-",
          item: it?.name || "-",
          size: it?.size || "N/A",
          qty,
          unit,
          total: subtotal,
        };
      })
    );
    const generatedAt = new Date().toLocaleString();
    const statusTableRows = Object.entries(statusCounts)
      .map(([status, count]) => `<tr><td>${status}</td><td>${count}</td><td>${Math.round((Number(count) / reportOrders.length) * 100)}%</td></tr>`)
      .join("");
    const orderTableRows = reportOrders
      .map(
        (o) => `<tr>
      <td>#${o?.id}</td>
      <td>${parseOrderDate(o)?.toLocaleDateString() || "-"}</td>
      <td>${(o?.contact?.firstName || "") + " " + (o?.contact?.lastName || "")}</td>
      <td>${o?.contact?.email || "-"}</td>
      <td>${normalizeStatus(o?.status)}</td>
      <td>${String(o?.payment || "").toUpperCase()}</td>
      <td>PHP ${Number(getOrderTotal(o)).toLocaleString()}</td>
    </tr>`
      )
      .join("");
    const itemTableRows = itemRows
      .map(
        (r) => `<tr>
      <td>#${r.orderId}</td>
      <td>${r.customer}</td>
      <td>${r.item}</td>
      <td>${r.size}</td>
      <td>${r.qty}</td>
      <td>PHP ${Number(r.unit).toLocaleString()}</td>
      <td>PHP ${Number(r.total).toLocaleString()}</td>
    </tr>`
      )
      .join("");

    const html = `
<!doctype html><html><head><meta charset="utf-8" />
<style>
body{font-family:Arial,sans-serif;color:#111;margin:22px}
h1{font-size:20px;margin:0}
h2{font-size:12px;margin:18px 0 8px;text-transform:uppercase}
.top{background:#11152e;color:#f0d49f;padding:10px 12px}
.sub{font-size:11px;color:#ddd;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{border:1px solid #ddd;padding:6px;text-align:left}
th{background:#11152e;color:#f0d49f}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px}
</style></head><body>
<div class="top"><h1>JCE Bridal Boutique</h1><div class="sub">Consolidated Report</div><div class="sub">${rangeCfg.label} • Generated ${generatedAt}</div></div>
<h2>Overview</h2>
<div class="grid">
<div>Total Orders: <b>${reportOrders.length}</b></div>
<div>Completed Orders: <b>${completed}</b></div>
<div>Revenue (complete): <b>PHP ${Number(totalRevenue).toLocaleString()}</b></div>
<div>Avg Order Value: <b>PHP ${Number(avgOrderValue).toLocaleString()}</b></div>
<div>Fulfillment: <b>${reportOrders.length ? Math.round((completed / reportOrders.length) * 100) : 0}%</b></div>
<div>Cancelled / Refunded: <b>${cancelledRefunded}</b></div>
</div>
<h2>Orders by Status</h2>
<table><thead><tr><th>Status</th><th>Count</th><th>Share</th></tr></thead><tbody>${statusTableRows}</tbody></table>
<h2>Order Details</h2>
<table><thead><tr><th>Order ID</th><th>Date</th><th>Customer Name</th><th>Email</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead><tbody>${orderTableRows}</tbody></table>
<h2>Line Items</h2>
<table><thead><tr><th>Order Number</th><th>Customer</th><th>Item</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead><tbody>${itemTableRows}</tbody></table>
</body></html>`;

    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Sales report PDF" });
      return;
    }
    Alert.alert("PDF generated", `Saved to: ${uri}`);
  }, [dateRangeKey, reportOrders]);

  if (!allowed) {
    return (
      <View style={styles.deniedWrap}>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.deniedText}>You don’t have permission to view statistics.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sales dashboard</Text>
        <Pressable style={styles.linkBtn} onPress={() => Alert.alert("View orders", "Open Orders tab to manage sales orders.")}>
          <Text style={styles.linkBtnText}>View orders →</Text>
        </Pressable>
      </View>

      <View style={styles.reportCard}>
        <View style={styles.reportTop}>
          <Text style={styles.reportLabel}>Report type</Text>
          <View style={styles.reportTypeRow}>
            {[
              { key: "orders", label: "Orders" },
              { key: "line", label: "Line items" },
              { key: "overview", label: "Summary" },
              { key: "cancelled", label: "Cancelled" },
            ].map((r) => (
              <Pressable
                key={r.key}
                style={[styles.reportTypeBtn, reportType === r.key ? styles.reportTypeBtnActive : null]}
                onPress={() => setReportType(r.key)}
              >
                <Text style={reportType === r.key ? styles.reportTypeTextActive : styles.reportTypeText}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.reportLabel}>Date range</Text>
        <View style={styles.rangeRow}>
          {[
            { key: "today", label: "Today" },
            { key: "last7days", label: "Last 7 days" },
            { key: "last30days", label: "Last 30 days" },
            { key: "thisyear", label: "This year" },
            { key: "alltime", label: "All time" },
          ].map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.rangePill, dateRangeKey === opt.key ? styles.rangePillActive : null]}
              onPress={() => setDateRangeKey(opt.key)}
            >
              <Text style={dateRangeKey === opt.key ? styles.rangePillTextActive : styles.rangePillText}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.exportRow}>
          <Pressable style={styles.exportBtn} onPress={onExportCsv}>
            <Ionicons name="download-outline" size={14} color={brand.dark} />
            <Text style={styles.exportBtnText}>Download CSV</Text>
          </Pressable>
          <Pressable style={[styles.exportBtn, styles.exportBtnPrimary]} onPress={onExportPdf}>
            <Ionicons name="document-text-outline" size={14} color={brand.white} />
            <Text style={styles.exportBtnTextPrimary}>Download PDF</Text>
          </Pressable>
        </View>
      </View>

      {loading ? <Text style={styles.meta}>Loading stats...</Text> : null}

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>TOTAL REVENUE</Text>
          <Text style={styles.kpiValue}>{money(stats.revenueAll)}</Text>
          <Text style={styles.kpiSub}>Completed orders only</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>TOTAL ORDERS</Text>
          <Text style={styles.kpiValue}>{stats.totalOrders}</Text>
          <Text style={styles.kpiSub}>{stats.activeCount || 0} active</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>AVG ORDER VALUE</Text>
          <Text style={styles.kpiValue}>{money(stats.aovAll)}</Text>
          <Text style={styles.kpiSub}>Completed orders only</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiTitle}>FULFILLMENT RATE</Text>
          <Text style={styles.kpiValue}>
            {stats.totalOrders ? `${Math.round((Number(stats.statusCounts?.completed || 0) / stats.totalOrders) * 100)}%` : "0%"}
          </Text>
          <Text style={styles.kpiSub}>{Number(stats.statusCounts?.completed || 0)} completed</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Revenue over time</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, range === "daily" ? styles.segmentBtnActive : null]}
              onPress={() => setRange("daily")}
            >
              <Text style={[styles.segmentText, range === "daily" ? styles.segmentTextActive : null]}>Daily</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, range === "month" ? styles.segmentBtnActive : null]}
              onPress={() => setRange("month")}
            >
              <Text style={[styles.segmentText, range === "month" ? styles.segmentTextActive : null]}>Monthly</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, range === "year" ? styles.segmentBtnActive : null]}
              onPress={() => setRange("year")}
            >
              <Text style={[styles.segmentText, range === "year" ? styles.segmentTextActive : null]}>Yearly</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.chartWrap}>
          <View style={styles.chartBars}>
            {series.map((s) => {
              const heightPct = (Number(s.value) || 0) / maxValue;
              const h = Math.max(3, Math.round(heightPct * 120));
              return (
                <View key={s.label} style={styles.chartBarCol}>
                  <View style={[styles.chartBar, { height: h }]} />
                  <Text style={styles.chartLabel}>{s.label}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.chartHint}>Max: {shortMoney(maxValue)} • Revenue based on selected period</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardTitle}>Top items sold</Text>
          {stats.topByQty.length ? (
            <>
              {stats.topByQty.slice(0, 3).map((x, idx) => (
                <View key={x.id} style={styles.topRow}>
                  <Text style={styles.topRank}>#{idx + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>{x.name}</Text>
                  <View style={styles.topBarBg}>
                    <View style={[styles.topBarFill, { width: `${Math.round(((Number(x?.qty) || 0) / topQtyBase) * 100)}%` }]} />
                  </View>
                  <Text style={styles.topValue}>{Number(x?.qty) || 0} sold</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.meta}>No item data yet.</Text>
          )}
        </View>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardTitle}>Orders by status</Text>
          <View style={styles.statusLegendRow}>
            <View style={styles.ringChart} />
            <View style={styles.legendCol}>
              {statusLegend.map((entry) => (
                <View key={entry.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: STATUS_DISPLAY[entry.key]?.color || "#999" }]} />
                  <Text style={styles.legendText}>{STATUS_DISPLAY[entry.key]?.label || entry.key}</Text>
                  <Text style={styles.legendVal}>{entry.count}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 28 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 30, fontWeight: "900", color: brand.dark, fontStyle: "italic" },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  linkBtnText: { color: "#4e4a95", fontWeight: "700", fontSize: 11 },
  reportCard: { borderWidth: 1, borderColor: brand.border, borderRadius: 12, backgroundColor: brand.white, padding: 10, marginBottom: 10 },
  reportTop: { marginBottom: 8 },
  reportLabel: { color: brand.textLight, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: "800" },
  reportTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reportTypeBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#f7f7f7",
  },
  reportTypeBtnActive: { backgroundColor: "#ece9ff", borderColor: "#c7c1ff" },
  reportTypeText: { color: brand.text, fontSize: 11, fontWeight: "700" },
  reportTypeTextActive: { color: "#4e4a95", fontSize: 11, fontWeight: "800" },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  rangePill: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#f8f8f8" },
  rangePillActive: { backgroundColor: "#ece9ff", borderColor: "#c7c1ff" },
  rangePillText: { color: brand.textLight, fontSize: 10, fontWeight: "700" },
  rangePillTextActive: { color: "#4e4a95", fontSize: 10, fontWeight: "800" },
  exportRow: { flexDirection: "row", gap: 8 },
  exportBtn: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: brand.white, paddingVertical: 8, paddingHorizontal: 10 },
  exportBtnPrimary: { backgroundColor: "#161324", borderColor: "#161324" },
  exportBtnText: { color: brand.text, fontWeight: "700", fontSize: 11 },
  exportBtnTextPrimary: { color: brand.white, fontWeight: "700", fontSize: 11 },
  subtitle: { color: brand.textLight, marginTop: 2, fontSize: 12, fontWeight: "700" },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6, marginBottom: 10 },
  kpiCard: {
    width: "48%",
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    padding: 12,
  },
  kpiTitle: { color: brand.textLight, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  kpiValue: { marginTop: 8, fontSize: 20, fontWeight: "900", color: brand.dark },
  kpiLabel: { marginTop: 3, fontSize: 12, fontWeight: "700", color: brand.textLight },
  kpiSub: { marginTop: 4, fontSize: 10, color: "#9b8f7b" },

  card: {
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { color: brand.dark, fontWeight: "900" },

  segment: { flexDirection: "row", borderWidth: 1, borderColor: brand.border, borderRadius: 999, overflow: "hidden" },
  segmentBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: brand.white },
  segmentBtnActive: { backgroundColor: brand.button },
  segmentText: { fontSize: 12, fontWeight: "800", color: brand.textLight },
  segmentTextActive: { color: brand.white },

  chartWrap: { borderWidth: 1, borderColor: brand.border, borderRadius: 12, padding: 10, backgroundColor: brand.white },
  chartBars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 150 },
  chartBarCol: { alignItems: "center", flex: 1 },
  chartBar: { width: 10, borderRadius: 999, backgroundColor: brand.buttonAlt },
  chartLabel: { marginTop: 6, fontSize: 10, color: brand.textLight, fontWeight: "800" },
  chartHint: { marginTop: 8, color: brand.textLight, fontSize: 11, fontWeight: "700" },

  topRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: brand.border, gap: 6 },
  topRank: { color: brand.textLight, fontSize: 11, fontWeight: "900", width: 18 },
  topName: { color: brand.dark, fontWeight: "800", fontSize: 12, width: 82 },
  topBarBg: { flex: 1, height: 6, borderRadius: 999, backgroundColor: "#ece7f8", overflow: "hidden" },
  topBarFill: { height: 6, borderRadius: 999, backgroundColor: "#7F77DD" },
  topValue: { color: brand.textLight, fontWeight: "900", fontSize: 11, width: 48, textAlign: "right" },
  bottomRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  halfCard: { flex: 1, minWidth: 150 },
  statusLegendRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  ringChart: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 8,
    borderColor: "#ad8b19",
    borderRightColor: "#2f7d53",
    transform: [{ rotate: "20deg" }],
  },
  legendCol: { flex: 1, gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { flex: 1, color: brand.text, fontSize: 11 },
  legendVal: { color: brand.dark, fontWeight: "800", fontSize: 11 },

  meta: { color: brand.textLight, fontSize: 12, marginTop: 2 },

  deniedWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 18, fontWeight: "900", color: brand.dark },
  deniedText: { marginTop: 6, color: brand.textLight, textAlign: "center" },
});

