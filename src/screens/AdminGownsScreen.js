import { useCallback, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { deleteGownAdmin, getAllGownsAdmin, setGownArchivedAdmin, uploadAdminTryonImage, upsertGownAdmin } from "../services/gowns";
import { useShop } from "../context/ShopContext";
import { canAccess } from "../utils/access";
import { brand } from "../theme/brand";

const EMPTY_FORM = {
  id: "",
  name: "",
  price: "",
  promoPrice: "",
  promo: false,
  image: "",
  type: "Gowns",
  color: "",
  silhouette: "",
  fabric: "",
  neckline: "",
  alt: "",
  description: "",
  additionalImage1: "",
  tryonImage: "",
  tryonImageBack: "",
  tryonCalibration: null,
  sizeInventory: {},
  stockQty: "0",
  lowStockThreshold: "0",
};

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "6", "8", "10", "12", "14", "16"];

function gownToForm(g) {
  return {
    id: String(g?.id || ""),
    name: g?.name || "",
    price: g?.price || "",
    promoPrice: g?.promoPrice || "",
    promo: Boolean(g?.promo),
    image: g?.image || "",
    type: g?.type || "Gowns",
    color: g?.color || "",
    silhouette: g?.silhouette || "",
    fabric: g?.fabric || "",
    neckline: g?.neckline || "",
    alt: g?.alt || "",
    description: g?.description || "",
    additionalImage1: Array.isArray(g?.additionalImages) ? String(g.additionalImages[0] || "") : "",
    tryonImage: g?.tryonImage || "",
    tryonImageBack: g?.tryonImageBack || "",
    tryonCalibration: g?.tryonCalibration || null,
    sizeInventory: g?.sizeInventory && typeof g.sizeInventory === "object" ? g.sizeInventory : {},
    stockQty: String(Number(g?.stockQty) || 0),
    lowStockThreshold: String(Number(g?.lowStockThreshold) || 0),
  };
}

export function AdminGownsScreen() {
  const { user } = useShop();
  const navigation = useNavigation();
  const allowed = canAccess(user, "admin_gowns");
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("name_asc");
  const [tab, setTab] = useState("active");
  const [customSize, setCustomSize] = useState("");
  const [stockEditorOpen, setStockEditorOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockDraft, setStockDraft] = useState({});
  const [stockCustomSize, setStockCustomSize] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [uploadingField, setUploadingField] = useState("");
  const [saving, setSaving] = useState(false);

  const buildPayloadFromForm = () => {
    const parsedSizeInventory =
      form?.sizeInventory && typeof form.sizeInventory === "object"
        ? Object.fromEntries(
            Object.entries(form.sizeInventory).map(([k, v]) => [String(k || "").trim(), Math.max(0, Number(v) || 0)])
          )
        : {};
    return {
      ...form,
      tryonImage: String(form.tryonImage || "").trim(),
      tryonImageBack: String(form.tryonImageBack || "").trim(),
      tryonCalibration: form.tryonCalibration || null,
      additionalImages: [form.additionalImage1]
        .map((x) => String(x || "").trim())
        .filter(Boolean),
      sizeInventory: parsedSizeInventory,
    };
  };

  const pickAndUploadImage = useCallback(async (fieldName) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo library access to pick an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setUploadingField(fieldName);
    try {
      const uploaded = await uploadAdminTryonImage(uri);
      if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed.");
      setForm((p) => ({ ...p, [fieldName]: uploaded.url }));
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
    } finally {
      setUploadingField("");
    }
  }, []);

  const pickImageFromGallery = useCallback(async () => {
    await pickAndUploadImage("image");
  }, [pickAndUploadImage]);

  const pickImageForField = useCallback(
    async (fieldName) => {
      await pickAndUploadImage(fieldName);
    },
    [pickAndUploadImage]
  );

  const takePhotoAndUpload = useCallback(async (fieldName) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.92 });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setUploadingField(fieldName);
    try {
      const uploaded = await uploadAdminTryonImage(uri);
      if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed.");
      setForm((p) => ({ ...p, [fieldName]: uploaded.url }));
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
    } finally {
      setUploadingField("");
    }
  }, []);

  const takePhotoForImage = useCallback(async () => {
    await takePhotoAndUpload("image");
  }, [takePhotoAndUpload]);

  const takePhotoForField = useCallback(
    async (fieldName) => {
      await takePhotoAndUpload(fieldName);
    },
    [takePhotoAndUpload]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await getAllGownsAdmin();
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed) loadData();
    }, [loadData])
  );

  const onSave = async () => {
    if (!String(form.name || "").trim()) {
      Alert.alert("Missing name", "Please enter a gown name.");
      return;
    }
    if (!String(form.image || "").trim()) {
      Alert.alert("Missing image", "Please add a display image.");
      return;
    }
    let payload;
    try {
      payload = buildPayloadFromForm();
    } catch (e) {
      Alert.alert("Invalid size inventory", e.message || "Please check your size inventory format.");
      return;
    }
    setSaving(true);
    try {
      const result = await upsertGownAdmin(payload);
      if (!result.ok) {
        Alert.alert("Save failed", result.error || "Could not save gown.");
        return;
      }
      setForm(EMPTY_FORM);
      setCustomSize("");
      setEditorOpen(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const activeItems = items.filter((g) => !Boolean(g?.archived));
    const active = activeItems.length;
    const archived = items.filter((g) => Boolean(g?.archived)).length;

    // Match web admin KPI logic:
    // - Units available = sum of available stock per size row
    // - Low stock = count of size rows where available is 1..2
    const inventoryRows = activeItems.flatMap((g) =>
      Object.entries(g?.sizeInventory || {}).map(([size, qty]) => ({
        size,
        available: Math.max(0, Number(qty) || 0),
      }))
    );
    const unitsAvailable = inventoryRows.reduce((sum, row) => sum + row.available, 0);
    const lowStock = inventoryRows.filter((row) => row.available > 0 && row.available <= 2).length;
    const soldOut = inventoryRows.filter((row) => row.available <= 0).length;

    return { active, archived, unitsAvailable, lowStock, soldOut };
  }, [items]);

  const filteredItems = useMemo(() => {
    const cleanQuery = String(query || "").trim().toLowerCase();
    let next = [...items];
    next = next.filter((g) => (tab === "archived" ? Boolean(g?.archived) : !Boolean(g?.archived)));
    if (cleanQuery) {
      next = next.filter((g) => {
        const hay = [g?.name, g?.type, g?.color, g?.silhouette, g?.price]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        return hay.includes(cleanQuery);
      });
    }
    next.sort((a, b) => {
      if (sortKey === "stock_low") return (Number(a?.stockQty) || 0) - (Number(b?.stockQty) || 0);
      if (sortKey === "stock_high") return (Number(b?.stockQty) || 0) - (Number(a?.stockQty) || 0);
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });
    return next;
  }, [items, query, sortKey, tab]);

  if (!allowed) {
    return (
      <View style={styles.deniedWrap}>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.deniedText}>You don’t have permission to manage gowns.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Catalogue</Text>
          <Text style={styles.subtitle}>{stats.active} active · {stats.archived} archived</Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            setForm(EMPTY_FORM);
            setCustomSize("");
            setEditorOpen(true);
          }}
        >
          <Text style={styles.addBtnText}>+ Add Gown</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active products</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.unitsAvailable}</Text>
          <Text style={styles.statLabel}>Units available</Text>
        </View>
        <View style={[styles.statCard, styles.statCardWarn]}>
          <Text style={styles.statValue}>{stats.lowStock}</Text>
          <Text style={styles.statLabel}>Low stock</Text>
        </View>
        {stats.soldOut > 0 ? (
          <View style={[styles.statCard, styles.statCardDanger]}>
            <Text style={styles.statValue}>{stats.soldOut}</Text>
            <Text style={styles.statLabel}>Sold out</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.filterWrap}>
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === "active" ? styles.tabBtnActive : null]} onPress={() => setTab("active")}>
            <Text style={tab === "active" ? styles.tabTextActive : styles.tabText}>Active ({stats.active})</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === "archived" ? styles.tabBtnActive : null]} onPress={() => setTab("archived")}>
            <Text style={tab === "archived" ? styles.tabTextActive : styles.tabText}>Archived ({stats.archived})</Text>
          </Pressable>
        </View>
        <TextInput
          style={[styles.input, styles.searchInput]}
          placeholder="Search by name, type, color..."
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.sortRow}>
          <Pressable
            style={[styles.sortPill, sortKey === "name_asc" ? styles.sortPillActive : null]}
            onPress={() => setSortKey("name_asc")}
          >
            <Text style={sortKey === "name_asc" ? styles.sortTextActive : styles.sortText}>Name A-Z</Text>
          </Pressable>
          <Pressable
            style={[styles.sortPill, sortKey === "stock_low" ? styles.sortPillActive : null]}
            onPress={() => setSortKey("stock_low")}
          >
            <Text style={sortKey === "stock_low" ? styles.sortTextActive : styles.sortText}>Low stock</Text>
          </Pressable>
          <Pressable
            style={[styles.sortPill, sortKey === "stock_high" ? styles.sortPillActive : null]}
            onPress={() => setSortKey("stock_high")}
          >
            <Text style={sortKey === "stock_high" ? styles.sortTextActive : styles.sortText}>High stock</Text>
          </Pressable>
        </View>
        <View style={styles.tabHintWrap}>
          <Text style={styles.tabHintText}>
            {tab === "active"
              ? "Archived products are hidden from customers but preserved in order history."
              : "These products are archived. Tap Unarchive to move them back to Active."}
          </Text>
        </View>
      </View>

      {loading ? <Text style={styles.subtitle}>Loading gowns...</Text> : null}
      {filteredItems.map((g) => (
        <View key={g.id} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Image source={{ uri: g.image }} style={styles.itemImage} />
            <View style={styles.itemHeaderText}>
              <Text style={styles.itemTitle}>{g.name}</Text>
              <Text style={styles.itemMeta}>
                #{g.id} • {g.type} • {g.promo && g.promoPrice ? `${g.price} → ${g.promoPrice}` : g.price}
              </Text>
              {g.tryonImage ? <Text style={styles.vtoBadge}>VTO</Text> : null}
              {g.tryonImageBack ? <Text style={styles.vtoBadgeBack}>↩ Back</Text> : null}
              <Text style={Number(g.stockQty) <= 0 ? styles.stockOut : Number(g.stockQty) <= Number(g.lowStockThreshold || 0) ? styles.stockLow : styles.stockOk}>
                Stock: {Number(g.stockQty) || 0}
                {Number(g.stockQty) <= 0 ? " (out)" : Number(g.stockQty) <= Number(g.lowStockThreshold || 0) ? " (low)" : ""}
              </Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            {tab === "archived" ? (
              <>
                <Pressable
                  style={styles.viewBtn}
                  onPress={() => {
                    setViewTarget(g);
                    setViewOpen(true);
                  }}
                >
                  <Text style={styles.viewBtnText}>View</Text>
                </Pressable>
                <Pressable
                  style={styles.restoreBtn}
                  onPress={async () => {
                    await setGownArchivedAdmin(g.id, false);
                    setTab("active");
                    loadData();
                  }}
                >
                  <Text style={styles.restoreBtnText}>Restore</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() =>
                    Alert.alert("Delete permanently", `Delete ${g.name} permanently?`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          await deleteGownAdmin(g.id);
                          loadData();
                        },
                      },
                    ])
                  }
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.secondaryBtn} onPress={() => {
                  setForm(gownToForm(g));
                  setCustomSize("");
                  setEditorOpen(true);
                }}>
                  <Text style={styles.secondaryBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.stockBtn}
                  onPress={() => {
                    setStockTarget(g);
                    setStockDraft(g?.sizeInventory && typeof g.sizeInventory === "object" ? g.sizeInventory : {});
                    setStockCustomSize("");
                    setStockEditorOpen(true);
                  }}
                >
                  <Text style={styles.stockBtnText}>Stock</Text>
                </Pressable>
                <Pressable
                  style={styles.viewBtn}
                  onPress={() => {
                    setViewTarget(g);
                    setViewOpen(true);
                  }}
                >
                  <Text style={styles.viewBtnText}>View</Text>
                </Pressable>
                <Pressable
                  style={styles.archiveBtn}
                  onPress={() =>
                    Alert.alert("Archive gown", `Archive ${g.name}?`, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Archive",
                        onPress: async () => {
                          await setGownArchivedAdmin(g.id, true);
                          setTab("archived");
                          loadData();
                        },
                      },
                    ])
                  }
                >
                  <Text style={styles.archiveBtnText}>Archive</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}
      {!loading && filteredItems.length === 0 ? <Text style={styles.subtitle}>No products found.</Text> : null}

      <Modal visible={viewOpen} animationType="fade" transparent onRequestClose={() => setViewOpen(false)}>
        <View style={styles.viewModalBackdrop}>
          <View style={styles.viewModalCard}>
            <View style={styles.viewModalHead}>
              <Text style={styles.viewModalTitle}>Preview</Text>
              <Pressable onPress={() => setViewOpen(false)} style={styles.viewCloseBtn}>
                <Text style={styles.stockModalClose}>x</Text>
              </Pressable>
            </View>
            <View style={styles.viewNameRow}>
              <Text style={styles.viewNameText}>{viewTarget?.name || "-"}</Text>
              <Pressable
                style={styles.viewEditMiniBtn}
                onPress={() => {
                  setViewOpen(false);
                  if (!viewTarget) return;
                  setForm(gownToForm(viewTarget));
                  setEditorOpen(true);
                }}
              >
                <Text style={styles.viewEditMiniText}>Edit</Text>
              </Pressable>
            </View>

            <View style={styles.viewTopRow}>
              <Image source={{ uri: String(viewTarget?.image || "") }} style={styles.viewImageLarge} />
              <View style={styles.viewMetaCol}>
                <Text style={styles.viewPrice}>
                  {viewTarget?.promo && viewTarget?.promoPrice ? viewTarget?.promoPrice : viewTarget?.price || "-"}
                </Text>
                {viewTarget?.promo && viewTarget?.promoPrice ? (
                  <Text style={styles.viewOldPrice}>{viewTarget?.price}</Text>
                ) : null}
                <View style={styles.viewPillWrap}>
                  <Text style={styles.viewPill}>{viewTarget?.type || "-"}</Text>
                  <Text style={styles.viewPill}>{viewTarget?.color || "-"}</Text>
                </View>
                <Text style={styles.viewMetaLine}>Alt text: {viewTarget?.alt || "-"}</Text>
              </View>
            </View>

            <Text style={styles.viewSectionLabel}>Inventory • Units Available</Text>
            <View style={styles.viewSizesWrap}>
              {Object.entries(viewTarget?.sizeInventory || {}).length ? (
                Object.entries(viewTarget?.sizeInventory || {}).map(([size, qty]) => (
                  <View key={`view-${size}`} style={styles.viewSizeChip}>
                    <Text style={styles.viewSizeName}>{size}</Text>
                    <Text style={styles.viewSizeQty}>{Math.max(0, Number(qty) || 0)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.viewMetaLine}>No size inventory set.</Text>
              )}
            </View>

            {viewTarget?.tryonImage || viewTarget?.tryonImageBack ? (
              <>
                <Text style={styles.viewSectionLabel}>Try-on images</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewThumbRow}>
                  {viewTarget?.tryonImage ? (
                    <View style={styles.viewTryonWrap}>
                      <Image source={{ uri: String(viewTarget.tryonImage) }} style={styles.viewThumb} />
                      <Text style={styles.viewTryonLabel}>Front</Text>
                    </View>
                  ) : null}
                  {viewTarget?.tryonImageBack ? (
                    <View style={styles.viewTryonWrap}>
                      <Image source={{ uri: String(viewTarget.tryonImageBack) }} style={styles.viewThumb} />
                      <Text style={styles.viewTryonLabel}>Back</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}

            {Array.isArray(viewTarget?.additionalImages) && viewTarget.additionalImages.length ? (
              <>
                <Text style={styles.viewSectionLabel}>Additional images</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewThumbRow}>
                  {viewTarget.additionalImages.map((uri, index) => (
                    <Image key={`view-thumb-${index}`} source={{ uri: String(uri || "") }} style={styles.viewThumb} />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Text style={styles.viewSectionLabel}>Description</Text>
            <Text style={styles.viewDescription}>{viewTarget?.description || "No description provided."}</Text>

            <View style={styles.viewActions}>
              <Pressable
                style={styles.viewQuickBtn}
                onPress={() => {
                  setViewOpen(false);
                  if (!viewTarget) return;
                  navigation.navigate("GownDetail", { id: viewTarget.id });
                }}
              >
                <Text style={styles.viewQuickBtnText}>Open product page</Text>
              </Pressable>
              <Pressable
                style={styles.viewQuickBtn}
                onPress={() => {
                  setViewOpen(false);
                  if (!viewTarget) return;
                  navigation.navigate("AR Try-On", { id: viewTarget.id });
                }}
              >
                <Text style={styles.viewQuickBtnText}>Virtual try-on</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stockEditorOpen} animationType="fade" transparent onRequestClose={() => setStockEditorOpen(false)}>
        <View style={styles.stockModalBackdrop}>
          <View style={styles.stockModalCard}>
            <View style={styles.stockModalHead}>
              <Text style={styles.stockModalTitle}>{stockTarget?.name || "Stock"}</Text>
              <Pressable onPress={() => setStockEditorOpen(false)}>
                <Text style={styles.stockModalClose}>x</Text>
              </Pressable>
            </View>

            <View style={styles.inventoryHeadRow}>
              <Text style={styles.inventoryHeadText}>Size</Text>
              <Text style={styles.inventoryHeadText}>Stock</Text>
              <Text style={styles.inventoryHeadText}>Res.</Text>
              <Text style={styles.inventoryHeadText}>Avail</Text>
              <Text style={styles.inventoryHeadText}> </Text>
            </View>
            {Object.entries(stockDraft || {}).map(([sizeKey, stockValue]) => {
              const stockNum = Math.max(0, Number(stockValue) || 0);
              return (
                <View key={`stock-draft-${sizeKey}`} style={styles.inventoryRow}>
                  <Text style={styles.inventorySize}>{sizeKey}</Text>
                  <TextInput
                    style={styles.inventoryStockInput}
                    value={String(stockNum)}
                    onChangeText={(v) =>
                      setStockDraft((prev) => ({
                        ...(prev || {}),
                        [sizeKey]: Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0),
                      }))
                    }
                    keyboardType="number-pad"
                  />
                  <Text style={styles.inventoryMuted}>0</Text>
                  <Text style={styles.inventoryAvail}>{stockNum}</Text>
                  <Pressable
                    style={styles.inventoryRemoveBtn}
                    onPress={() =>
                      setStockDraft((prev) => {
                        const next = { ...(prev || {}) };
                        delete next[sizeKey];
                        return next;
                      })
                    }
                  >
                    <Text style={styles.inventoryRemoveText}>x</Text>
                  </Pressable>
                </View>
              );
            })}

            <Text style={styles.inventorySubLabel}>Add size</Text>
            <View style={styles.sizePresetWrap}>
              {SIZE_PRESETS.map((sizeKey) => {
                const selected = Object.prototype.hasOwnProperty.call(stockDraft || {}, sizeKey);
                return (
                  <Pressable
                    key={`stock-preset-${sizeKey}`}
                    style={[styles.sizePresetChip, selected ? styles.sizePresetChipActive : null]}
                    onPress={() =>
                      setStockDraft((prev) => {
                        const next = { ...(prev || {}) };
                        if (!Object.prototype.hasOwnProperty.call(next, sizeKey)) next[sizeKey] = 0;
                        return next;
                      })
                    }
                  >
                    <Text style={[styles.sizePresetText, selected ? styles.sizePresetTextActive : null]}>{sizeKey}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.customSizeRow}>
              <TextInput
                style={[styles.input, styles.customSizeInput]}
                placeholder="Custom size"
                value={stockCustomSize}
                onChangeText={setStockCustomSize}
                autoCapitalize="characters"
              />
              <Pressable
                style={styles.customAddBtn}
                onPress={() => {
                  const key = String(stockCustomSize || "").trim().toUpperCase();
                  if (!key) return;
                  setStockDraft((prev) => {
                    const next = { ...(prev || {}) };
                    if (!Object.prototype.hasOwnProperty.call(next, key)) next[key] = 0;
                    return next;
                  });
                  setStockCustomSize("");
                }}
              >
                <Text style={styles.customAddBtnText}>+ Custom</Text>
              </Pressable>
            </View>

            <View style={styles.stockModalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setStockEditorOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSaveBtn}
                onPress={async () => {
                  if (!stockTarget) return;
                  const total = Object.values(stockDraft || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
                  const payload = {
                    ...stockTarget,
                    sizeInventory: stockDraft,
                    stockQty: total,
                  };
                  const result = await upsertGownAdmin(payload);
                  if (!result?.ok) {
                    Alert.alert("Save failed", "Could not update stock.");
                    return;
                  }
                  setStockEditorOpen(false);
                  loadData();
                }}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{String(form.id || "").trim() ? "Edit Gown" : "Add Gown"}</Text>
              <Pressable onPress={() => setEditorOpen(false)}>
                <Text style={styles.modalClose}>X</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.sectionLabel}>Basic info</Text>
        <TextInput style={styles.input} placeholder="ID (optional for edit)" value={String(form.id)} onChangeText={(v) => setForm((p) => ({ ...p, id: v }))} autoCapitalize="none" />
              <View style={styles.splitRow}>
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Name" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Price" value={form.price} onChangeText={(v) => setForm((p) => ({ ...p, price: v }))} />
              </View>
              <View style={styles.splitRow}>
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Type" value={form.type} onChangeText={(v) => setForm((p) => ({ ...p, type: v }))} />
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Color" value={form.color} onChangeText={(v) => setForm((p) => ({ ...p, color: v }))} />
              </View>
              <View style={styles.splitRow}>
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Silhouette" value={form.silhouette} onChangeText={(v) => setForm((p) => ({ ...p, silhouette: v }))} />
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Fabric" value={form.fabric} onChangeText={(v) => setForm((p) => ({ ...p, fabric: v }))} />
              </View>
              <View style={styles.splitRow}>
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Neckline" value={form.neckline} onChangeText={(v) => setForm((p) => ({ ...p, neckline: v }))} />
                <TextInput style={[styles.input, styles.splitInput]} placeholder="Alt text" value={form.alt} onChangeText={(v) => setForm((p) => ({ ...p, alt: v }))} />
              </View>
        <View style={styles.promoRow}>
          <View style={styles.promoLeft}>
            <Text style={styles.promoLabel}>Discount / Promo</Text>
            <Text style={styles.promoHint}>Turn on to show discounted price + appear in promo banner.</Text>
          </View>
          <Switch
            value={Boolean(form.promo)}
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                promo: Boolean(v),
                promoPrice: v ? p.promoPrice : "",
              }))
            }
            thumbColor={brand.white}
            trackColor={{ false: brand.border, true: brand.buttonAlt }}
          />
        </View>
        <TextInput
          style={[styles.input, !form.promo ? styles.inputDisabled : null]}
          placeholder="Discounted price (e.g. P64,000)"
          value={form.promoPrice}
          editable={Boolean(form.promo)}
          onChangeText={(v) => setForm((p) => ({ ...p, promoPrice: v }))}
        />

              <TextInput style={[styles.input, styles.inputArea]} placeholder="Description" value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline />

              <Text style={styles.sectionLabel}>Images</Text>

              {[
                {
                  field: "image",
                  label: "Display image",
                  hint: "Shown in catalog & product pages. Not used for try-on.",
                  badge: null,
                },
                {
                  field: "tryonImage",
                  label: "Try-on — front",
                  hint: "Transparent PNG, front view. Upload separately from display image.",
                  badge: "FRONT",
                  badgeStyle: styles.tryonBadgeGold,
                },
                {
                  field: "tryonImageBack",
                  label: "Try-on — back",
                  hint: "Back view. Transparent PNG.",
                  badge: "BACK",
                  badgeStyle: styles.tryonBadgeBlue,
                },
              ].map((slot) => {
                const value = String(form[slot.field] || "").trim();
                const busy = uploadingField === slot.field;
                return (
                  <View key={slot.field} style={styles.tryonSlot}>
                    <View style={styles.tryonSlotHead}>
                      <Text style={styles.tryonSlotLabel}>{slot.label}</Text>
                      {slot.badge ? (
                        <View style={[styles.tryonBadge, slot.badgeStyle]}>
                          <Text style={styles.tryonBadgeText}>{slot.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.tryonSlotHint}>{slot.hint}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="/images/filename.png or https://..."
                      value={value}
                      onChangeText={(v) => setForm((p) => ({ ...p, [slot.field]: v }))}
                      autoCapitalize="none"
                    />
                    <View style={styles.additionalRowActions}>
                      <Pressable
                        style={styles.secondaryBtn}
                        disabled={busy}
                        onPress={() => pickImageForField(slot.field)}
                      >
                        <Text style={styles.secondaryBtnText}>{busy ? "Uploading…" : "Upload"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryBtn}
                        disabled={busy}
                        onPress={() => takePhotoForField(slot.field)}
                      >
                        <Text style={styles.secondaryBtnText}>Camera</Text>
                      </Pressable>
                      <Pressable
                        style={styles.clearMiniBtn}
                        onPress={() => setForm((p) => ({ ...p, [slot.field]: "" }))}
                      >
                        <Text style={styles.clearMiniBtnText}>Clear</Text>
                      </Pressable>
                    </View>
                    {value ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: value }} style={styles.tryonPreviewImage} resizeMode="contain" />
                      </View>
                    ) : (
                      <View style={styles.tryonEmptyBox}>
                        <Text style={styles.tryonEmptyText}>Drop or tap Upload</Text>
                      </View>
                    )}
                  </View>
                );
              })}

              <Text style={styles.sectionLabel}>Inventory</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Stock qty (e.g. 5)"
            value={String(form.stockQty)}
            onChangeText={(v) => setForm((p) => ({ ...p, stockQty: v.replace(/[^\d]/g, "") }))}
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Low-stock alert at (e.g. 2)"
            value={String(form.lowStockThreshold)}
            onChangeText={(v) => setForm((p) => ({ ...p, lowStockThreshold: v.replace(/[^\d]/g, "") }))}
            keyboardType="number-pad"
          />
        </View>
              <View style={styles.inventoryHeadRow}>
                <Text style={styles.inventoryHeadText}>Size</Text>
                <Text style={styles.inventoryHeadText}>Stock</Text>
                <Text style={styles.inventoryHeadText}>Reserved</Text>
                <Text style={styles.inventoryHeadText}>Avail</Text>
                <Text style={styles.inventoryHeadText}> </Text>
              </View>
              {Object.entries(form.sizeInventory || {}).map(([sizeKey, stockValue]) => {
                const stockNum = Math.max(0, Number(stockValue) || 0);
                return (
                  <View key={`inv-${sizeKey}`} style={styles.inventoryRow}>
                    <Text style={styles.inventorySize}>{sizeKey}</Text>
                    <TextInput
                      style={styles.inventoryStockInput}
                      value={String(stockNum)}
                      onChangeText={(v) =>
                        setForm((p) => ({
                          ...p,
                          sizeInventory: {
                            ...(p.sizeInventory || {}),
                            [sizeKey]: Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0),
                          },
                        }))
                      }
                      keyboardType="number-pad"
                    />
                    <Text style={styles.inventoryMuted}>0</Text>
                    <Text style={styles.inventoryAvail}>{stockNum}</Text>
                    <Pressable
                      style={styles.inventoryRemoveBtn}
                      onPress={() =>
                        setForm((p) => {
                          const next = { ...(p.sizeInventory || {}) };
                          delete next[sizeKey];
                          return { ...p, sizeInventory: next };
                        })
                      }
                    >
                      <Text style={styles.inventoryRemoveText}>x</Text>
          </Pressable>
        </View>
                );
              })}

              <Text style={styles.inventorySubLabel}>Add another size</Text>
              <View style={styles.sizePresetWrap}>
                {SIZE_PRESETS.map((sizeKey) => {
                  const selected = Object.prototype.hasOwnProperty.call(form.sizeInventory || {}, sizeKey);
                  return (
                    <Pressable
                      key={`preset-${sizeKey}`}
                      style={[styles.sizePresetChip, selected ? styles.sizePresetChipActive : null]}
                      onPress={() =>
                        setForm((p) => {
                          const next = { ...(p.sizeInventory || {}) };
                          if (!Object.prototype.hasOwnProperty.call(next, sizeKey)) next[sizeKey] = 0;
                          return { ...p, sizeInventory: next };
                        })
                      }
                    >
                      <Text style={[styles.sizePresetText, selected ? styles.sizePresetTextActive : null]}>{sizeKey}</Text>
            </Pressable>
                  );
                })}
          </View>
              <View style={styles.customSizeRow}>
                <TextInput
                  style={[styles.input, styles.customSizeInput]}
                  placeholder="Custom size"
                  value={customSize}
                  onChangeText={setCustomSize}
                  autoCapitalize="characters"
                />
                <Pressable
                  style={styles.customAddBtn}
                  onPress={() => {
                    const key = String(customSize || "").trim().toUpperCase();
                    if (!key) return;
                    setForm((p) => {
                      const next = { ...(p.sizeInventory || {}) };
                      if (!Object.prototype.hasOwnProperty.call(next, key)) next[key] = 0;
                      return { ...p, sizeInventory: next };
                    });
                    setCustomSize("");
                  }}
                >
                  <Text style={styles.customAddBtnText}>+ Custom</Text>
        </Pressable>
      </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setEditorOpen(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
                <Pressable style={styles.modalSaveBtn} onPress={onSave} disabled={saving || Boolean(uploadingField)}>
                  <Text style={styles.modalSaveText}>{saving ? "Saving…" : "Update Gown"}</Text>
            </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.bg },
  content: { padding: 16, paddingBottom: 32 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 34, fontWeight: "800", color: brand.dark, fontStyle: "italic" },
  subtitle: { color: brand.textLight, marginTop: 4, marginBottom: 12 },
  addBtn: { backgroundColor: "#9b6d28", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  addBtnText: { color: brand.white, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  statCard: { flex: 1, borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 10 },
  statCardWarn: { backgroundColor: "#f7f1e5" },
  statCardDanger: { backgroundColor: "#f8ecee", borderColor: "#ebd5da" },
  statValue: { color: brand.dark, fontWeight: "900", fontSize: 22 },
  statLabel: { color: brand.textLight, fontSize: 11, marginTop: 2 },
  filterWrap: { borderTopWidth: 1, borderTopColor: brand.border, paddingTop: 10, marginBottom: 8 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tabBtn: { borderBottomWidth: 2, borderBottomColor: "transparent", paddingBottom: 6, paddingHorizontal: 2 },
  tabBtnActive: { borderBottomColor: "#9b6d28" },
  tabText: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: brand.dark, fontWeight: "800", fontSize: 12 },
  searchInput: { marginBottom: 6 },
  sortRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 2 },
  sortPill: { borderWidth: 1, borderColor: brand.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: brand.white },
  sortPillActive: { backgroundColor: brand.button, borderColor: brand.button },
  sortText: { color: brand.dark, fontWeight: "700", fontSize: 11 },
  sortTextActive: { color: brand.white, fontWeight: "700", fontSize: 11 },
  tabHintWrap: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f4f4f4",
    marginTop: 4,
  },
  tabHintText: { color: "#7b7b7b", fontSize: 11, lineHeight: 16 },
  formCard: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 12, padding: 10, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, padding: 10, marginBottom: 8 },
  inputHalf: { flex: 1 },
  inputDisabled: { opacity: 0.5 },
  inputArea: { minHeight: 70, textAlignVertical: "top" },
  promoRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8, paddingVertical: 4 },
  promoLeft: { flex: 1 },
  promoLabel: { color: brand.dark, fontWeight: "900" },
  promoHint: { color: brand.textLight, fontSize: 12, marginTop: 2 },
  imagePickerRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  additionalActionsBlock: { gap: 8, marginBottom: 8 },
  additionalRow: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, padding: 8, backgroundColor: "#f6f6f6" },
  additionalRowLabel: { color: brand.textLight, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  additionalRowActions: { flexDirection: "row", gap: 6 },
  clearMiniBtn: { borderWidth: 1, borderColor: brand.border, borderRadius: 8, backgroundColor: brand.white, paddingVertical: 7, paddingHorizontal: 10 },
  clearMiniBtnText: { color: brand.textLight, fontWeight: "700", fontSize: 11 },
  previewWrap: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, overflow: "hidden", backgroundColor: brand.white, marginBottom: 8 },
  previewImage: { width: "100%", height: 180, backgroundColor: "#eee" },
  tryonPreviewImage: { width: "100%", height: 140, backgroundColor: "#f5f5f5" },
  tryonSlot: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: brand.white,
    marginBottom: 10,
  },
  tryonSlotHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  tryonSlotLabel: { color: brand.dark, fontWeight: "800", fontSize: 12 },
  tryonSlotHint: { color: brand.textLight, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  tryonBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  tryonBadgeGold: { backgroundColor: "rgba(200,169,110,0.2)" },
  tryonBadgeBlue: { backgroundColor: "rgba(74,127,212,0.15)" },
  tryonBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5, color: brand.dark },
  tryonEmptyBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: brand.border,
    borderRadius: 8,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
    marginTop: 8,
  },
  tryonEmptyText: { color: brand.textLight, fontSize: 11 },
  extraPreviewRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  extraPreviewThumb: { width: 64, height: 78, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#eee" },
  clearImageBtn: { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: brand.border, backgroundColor: brand.white },
  clearImageText: { color: brand.textLight, fontWeight: "800", textAlign: "center", fontSize: 12 },
  primaryBtn: { backgroundColor: brand.button, paddingVertical: 12, borderRadius: 8, marginTop: 2 },
  primaryBtnText: { color: brand.white, textAlign: "center", fontWeight: "800" },
  itemCard: { borderWidth: 1, borderColor: brand.border, borderRadius: 10, backgroundColor: brand.white, padding: 10, marginBottom: 8 },
  itemHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  itemImage: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#eee" },
  itemHeaderText: { flex: 1, minWidth: 0 },
  itemTitle: { color: brand.dark, fontWeight: "800", fontSize: 14 },
  itemMeta: { color: brand.textLight, marginTop: 2, fontSize: 12 },
  vtoBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    fontSize: 9,
    fontWeight: "800",
    color: "#155724",
    backgroundColor: "#d4edda",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: "hidden",
  },
  vtoBadgeBack: {
    alignSelf: "flex-start",
    marginTop: 4,
    fontSize: 9,
    fontWeight: "800",
    color: "#0a5276",
    backgroundColor: "#e8f4fd",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: "hidden",
  },
  stockOk: { marginTop: 4, fontSize: 12, fontWeight: "800", color: brand.text },
  stockLow: { marginTop: 4, fontSize: 12, fontWeight: "900", color: "#a36a00" },
  stockOut: { marginTop: 4, fontSize: 12, fontWeight: "900", color: "#b00020" },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  row: { flexDirection: "row", gap: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: brand.border, paddingVertical: 7, backgroundColor: brand.white, borderRadius: 8 },
  secondaryBtnText: { textAlign: "center", color: brand.dark, fontWeight: "700" },
  stockBtn: { flex: 1, borderWidth: 1, borderColor: "#d7c7ad", backgroundColor: "#f7f1e6", borderRadius: 8, paddingVertical: 7 },
  stockBtnText: { textAlign: "center", color: "#8a5a16", fontWeight: "700" },
  viewBtn: { flex: 1, borderWidth: 1, borderColor: "#b8c9e6", backgroundColor: "#edf3ff", borderRadius: 8, paddingVertical: 7 },
  viewBtnText: { textAlign: "center", color: "#2d65c2", fontWeight: "700" },
  archiveBtn: { flex: 1, paddingVertical: 7, borderWidth: 1, borderColor: "#d7c7ad", backgroundColor: "#f7f1e6", borderRadius: 8 },
  archiveBtnText: { textAlign: "center", color: "#8a5a16", fontWeight: "700" },
  restoreBtn: { flex: 1, borderWidth: 1, borderColor: "#c6e3d0", backgroundColor: "#edf8f1", borderRadius: 8, paddingVertical: 7 },
  restoreBtnText: { textAlign: "center", color: "#3f8f67", fontWeight: "700" },
  deleteBtn: { flex: 1, borderWidth: 1, borderColor: "#dbdbdb", backgroundColor: "#f1f1f1", borderRadius: 8, paddingVertical: 7 },
  deleteBtnText: { textAlign: "center", color: "#9e9e9e", fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "flex-end" },
  modalCard: {
    width: "92%",
    maxWidth: 420,
    height: "100%",
    backgroundColor: "#f8f8f8",
    borderWidth: 1,
    borderColor: brand.border,
    overflow: "hidden",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    backgroundColor: "#f3f3f3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { color: brand.dark, fontSize: 15, fontWeight: "800" },
  modalClose: { color: brand.textLight, fontWeight: "700", fontSize: 12 },
  modalBody: { padding: 14, paddingBottom: 30 },
  sectionLabel: {
    color: "#8e8e8e",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
    fontWeight: "700",
  },
  splitRow: { flexDirection: "row", gap: 8 },
  splitInput: { flex: 1 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  modalCancelBtn: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 14 },
  modalCancelText: { color: brand.textLight, fontWeight: "700", fontSize: 11 },
  modalSaveBtn: { borderRadius: 6, backgroundColor: "#9b6d28", paddingVertical: 9, paddingHorizontal: 14 },
  modalSaveText: { color: brand.white, fontWeight: "800", fontSize: 11 },
  inventoryHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
    borderBottomWidth: 0,
    backgroundColor: "#f4f4f4",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 2,
  },
  inventoryHeadText: { flex: 1, fontSize: 10, color: "#8d8d8d", textTransform: "uppercase", fontWeight: "700" },
  inventoryRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.border,
    borderTopWidth: 0,
    backgroundColor: brand.white,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  inventorySize: { flex: 1, color: brand.dark, fontWeight: "700", fontSize: 12 },
  inventoryStockInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    backgroundColor: brand.white,
    fontSize: 12,
  },
  inventoryMuted: { flex: 1, color: "#8d8d8d", fontSize: 12 },
  inventoryAvail: { flex: 1, color: "#8a5a16", fontWeight: "700", fontSize: 12 },
  inventoryRemoveBtn: { width: 24, alignItems: "center" },
  inventoryRemoveText: { color: "#909090", fontWeight: "700", fontSize: 14 },
  inventorySubLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: "#8e8e8e",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  sizePresetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  sizePresetChip: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f5f5f5",
  },
  sizePresetChipActive: { backgroundColor: "#ececec", borderColor: "#d1d1d1" },
  sizePresetText: { color: brand.text, fontWeight: "700", fontSize: 11 },
  sizePresetTextActive: { color: brand.dark, fontWeight: "800" },
  customSizeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  customSizeInput: { flex: 1, marginBottom: 0 },
  customAddBtn: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  customAddBtnText: { color: brand.text, fontWeight: "700", fontSize: 11 },
  stockModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.22)", alignItems: "center", justifyContent: "center", padding: 18 },
  stockModalCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    backgroundColor: "#f8f8f8",
    padding: 12,
  },
  stockModalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  stockModalTitle: { color: brand.dark, fontWeight: "700", fontSize: 13 },
  stockModalClose: { color: brand.textLight, fontWeight: "700", fontSize: 14 },
  stockModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  viewModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center", padding: 16 },
  viewModalCard: { width: "100%", maxWidth: 360, borderRadius: 12, borderWidth: 1, borderColor: brand.border, backgroundColor: "#f8f8f8", padding: 12 },
  viewModalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  viewModalTitle: { color: brand.dark, fontWeight: "700", fontSize: 12 },
  viewCloseBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  viewNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  viewNameText: { color: brand.text, fontSize: 11, fontWeight: "600" },
  viewEditMiniBtn: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  viewEditMiniText: { color: brand.textLight, fontWeight: "700", fontSize: 10 },
  viewTopRow: { flexDirection: "row", gap: 8 },
  viewImageLarge: { width: 92, height: 124, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#efefef" },
  viewMetaCol: { flex: 1, gap: 2 },
  viewPrice: { color: "#8a5a16", fontWeight: "900", fontSize: 18 },
  viewOldPrice: { color: brand.textLight, textDecorationLine: "line-through", fontSize: 11, marginBottom: 4 },
  viewPillWrap: { flexDirection: "row", gap: 6, marginBottom: 2 },
  viewPill: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.white, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6, color: brand.textLight, fontSize: 10 },
  viewMetaLine: { color: brand.text, fontSize: 11 },
  viewSectionLabel: { marginTop: 8, marginBottom: 6, color: "#8e8e8e", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700" },
  viewSizesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  viewSizeChip: { borderWidth: 1, borderColor: brand.border, borderRadius: 6, backgroundColor: brand.white, paddingVertical: 4, paddingHorizontal: 8, flexDirection: "row", gap: 6 },
  viewSizeName: { color: brand.dark, fontWeight: "700", fontSize: 11 },
  viewSizeQty: { color: "#8a5a16", fontWeight: "800", fontSize: 11 },
  viewThumbRow: { gap: 8 },
  viewThumb: { width: 44, height: 56, borderRadius: 8, borderWidth: 1, borderColor: brand.border, backgroundColor: "#efefef" },
  viewTryonWrap: { alignItems: "center", gap: 4 },
  viewTryonLabel: { fontSize: 9, color: brand.textLight, fontWeight: "700", textTransform: "uppercase" },
  viewDescription: { color: brand.text, fontSize: 11, lineHeight: 16 },
  viewActions: { flexDirection: "row", justifyContent: "flex-start", gap: 8, marginTop: 8 },
  viewQuickBtn: { borderWidth: 1, borderColor: brand.border, backgroundColor: "#edf3ff", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10 },
  viewQuickBtnText: { color: "#48699f", fontWeight: "700", fontSize: 10 },

  deniedWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: brand.bg },
  deniedTitle: { fontSize: 18, fontWeight: "900", color: brand.dark },
  deniedText: { marginTop: 6, color: brand.textLight, textAlign: "center" },
});
