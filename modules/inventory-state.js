export function defaultBridgeState() {
  return {
    internet: false,
    backend: false,
    atlas: false,
    tunnel: false,
    public_url: "",
    api_base: "",
    backend_version: "",
    atlas_version: "",
    tunnel_version: "",
    mode: "offline",
    checked_at: null,
  };
}

export function defaultInventoryDraft(product = null) {
  const item = product || {};
  return {
    id: item.id || "",
    name: item.name || "",
    description: item.description || "",
    category_id: item.category_id || "",
    price: String(Number(item.price ?? 0)),
    cost: String(Number(item.cost ?? 0)),
    stock: String(Number(item.stock ?? 0)),
    min_stock: String(Number(item.min_stock ?? 0)),
    unit: item.unit || "unidad",
    barcode: item.barcode || "",
    is_manufactured: String(Number(item.is_manufactured ?? 1) ? 1 : 0),
  };
}

export function defaultInventoryState() {
  return {
    items: [],
    categories: [],
    lastLoadedAt: null,
    lowCount: 0,
    remoteCount: 0,
    sourceLabel: "Local",
    selectedId: "",
    filterText: "",
    pendingOps: [],
    editorMode: "create",
    dirty: false,
    bridge: defaultBridgeState(),
    editor: defaultInventoryDraft(),
  };
}

export function createInventoryStateHelpers({
  state,
  saveStore,
  normalizeMoney,
  fixMojibake,
  cryptoRandomId,
}) {
  const LEGACY_SEED_NAMES = [
    "producto a",
    "producto b",
    "producto c",
    "servicio basico",
    "servicio premium",
    "insumo general (kg)",
    "material de empaque",
    "equipo de oficina",
    "accesorio",
  ];

  function normalizeSeedName(value) {
    return fixMojibake(String(value || ""))
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeInventoryItem(raw = {}) {
    return {
      id: String(raw.id || `local-${cryptoRandomId()}`),
      name: fixMojibake(String(raw.name || "Producto sin nombre").trim()) || "Producto sin nombre",
      description: fixMojibake(String(raw.description || "").trim()),
      category_id: String(raw.category_id || ""),
      category_name: fixMojibake(String(raw.category_name || "").trim()),
      category_color: String(raw.category_color || ""),
      price: normalizeMoney(raw.price, 0),
      cost: normalizeMoney(raw.cost, 0),
      stock: normalizeMoney(raw.stock, 0),
      min_stock: normalizeMoney(raw.min_stock, 0),
      unit: fixMojibake(String(raw.unit || "unidad").trim()) || "unidad",
      barcode: fixMojibake(String(raw.barcode || "").trim()),
      is_manufactured: Number(raw.is_manufactured || 0) ? 1 : 0,
      active: raw.active === undefined ? 1 : Number(raw.active),
      local_only: Boolean(raw.local_only),
      pending_sync: Boolean(raw.pending_sync),
      updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
    };
  }

  function ensureInventoryState() {
    const current = state.inventory || {};
    state.inventory = {
      ...defaultInventoryState(),
      ...current,
      items: Array.isArray(current.items) ? current.items.map((item) => normalizeInventoryItem(item)) : [],
      categories: Array.isArray(current.categories) ? current.categories : [],
      pendingOps: Array.isArray(current.pendingOps) ? current.pendingOps : [],
      bridge: { ...defaultBridgeState(), ...(current.bridge || {}) },
      editor: { ...defaultInventoryDraft(), ...(current.editor || {}) },
    };
  }

  function inventoryLooksLikeLegacySeed(items = []) {
    const activeItems = (Array.isArray(items) ? items : []).filter((item) => Number(item?.active ?? 1) !== 0);
    if (activeItems.length !== LEGACY_SEED_NAMES.length) return false;
    const names = activeItems.map((item) => normalizeSeedName(item?.name)).sort();
    const expected = [...LEGACY_SEED_NAMES].sort();
    return names.every((name, idx) => name === expected[idx]);
  }

  function deriveInventoryCategories(items = []) {
    const map = new Map();
    items.forEach((item) => {
      const name = fixMojibake(String(item.category_name || "").trim());
      const id = String(item.category_id || (name ? `derived-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""));
      if (!name || !id || map.has(id)) return;
      map.set(id, { id, name, color: item.category_color || "" });
    });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  }

  function inventoryVisibleItems() {
    ensureInventoryState();
    const query = String(state.inventory.filterText || "").trim().toLowerCase();
    const list = state.inventory.items
      .filter((item) => Number(item.active || 0) !== 0)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    if (!query) return list;
    return list.filter((item) =>
      [item.name, item.category_name, item.unit, item.barcode]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query))
    );
  }

  function getSelectedInventoryItem() {
    ensureInventoryState();
    return state.inventory.items.find((item) => item.id === state.inventory.selectedId) || null;
  }

  function reconcileInventorySelection(options = {}) {
    ensureInventoryState();
    const preserveDirtyCreate = options.preserveDirtyCreate !== false;
    const visibleItems = inventoryVisibleItems();
    const selected = getSelectedInventoryItem();

    if (selected) {
      if (state.inventory.editorMode === "edit" && !state.inventory.dirty) {
        state.inventory.editor = defaultInventoryDraft(selected);
      }
      return selected;
    }

    if (preserveDirtyCreate && state.inventory.editorMode === "create" && state.inventory.dirty) {
      return null;
    }

    const fallback = visibleItems[0] || null;
    if (fallback) {
      state.inventory.selectedId = fallback.id;
      state.inventory.editorMode = "edit";
      if (!state.inventory.dirty) {
        state.inventory.editor = defaultInventoryDraft(fallback);
      }
      return fallback;
    }

    state.inventory.selectedId = "";
    state.inventory.editorMode = "create";
    if (!state.inventory.dirty) {
      state.inventory.editor = defaultInventoryDraft();
    }
    return null;
  }

  function recalculateInventoryCounts() {
    ensureInventoryState();
    const activeItems = state.inventory.items.filter((item) => Number(item.active || 0) !== 0);
    state.inventory.lowCount = activeItems.filter((item) => Number(item.stock || 0) <= Number(item.min_stock || 0)).length;
    state.inventory.remoteCount = activeItems.filter((item) => !item.local_only).length;
  }

  function sourceLabelFromBase(base) {
    if (!base) return "Local";
    try {
      const host = new URL(base).hostname;
      if (/^(localhost|127\.0\.0\.1)$/i.test(host)) return "ATLAS local";
      if (host.includes("rauliatlasapp")) return "Tunel";
      return host;
    } catch {
      return "Local";
    }
  }

  function inventoryResponseHasError(result, ...codes) {
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    return errors.some((entry) => codes.includes(String(entry?.error || "").trim().toLowerCase()));
  }

  function inventoryResponseLooksOffline(result) {
    const transient = new Set(["timeout", "network_error", "fetch failed", "failed to fetch"]);
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    if (errors.length === 0) return false;
    return errors.every((entry) => {
      const code = String(entry?.error || "").trim().toLowerCase();
      return transient.has(code) || code.startsWith("http_5");
    });
  }

  function describeInventoryError(result, fallback) {
    if (inventoryResponseHasError(result, "barcode_exists")) return "Ese codigo ya existe en el catalogo.";
    if (inventoryResponseHasError(result, "invalid_category")) return "La categoria elegida ya no esta disponible.";
    if (inventoryResponseHasError(result, "name_required")) return "El nombre del producto es obligatorio.";
    if (inventoryResponseHasError(result, "product_not_found")) return "El producto ya no existe en el backend.";
    return fallback;
  }

  return {
    defaultBridgeState,
    defaultInventoryDraft,
    defaultInventoryState,
    normalizeInventoryItem,
    ensureInventoryState,
    inventoryLooksLikeLegacySeed,
    deriveInventoryCategories,
    inventoryVisibleItems,
    getSelectedInventoryItem,
    reconcileInventorySelection,
    recalculateInventoryCounts,
    sourceLabelFromBase,
    inventoryResponseHasError,
    inventoryResponseLooksOffline,
    describeInventoryError,
  };
}
