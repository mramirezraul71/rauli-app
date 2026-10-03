export function createSyncHelpers({
  state,
  $,
  saveStore,
  loadQueue,
  saveQueue,
  ensureInventoryState,
  defaultBridgeState,
  toast,
  logLine,
  fetchJsonAny,
  getDeviceId,
  flushInventoryPendingOps,
  refreshInventory,
}) {
  function refreshSyncHint() {
    ensureInventoryState();
    const queuePending = loadQueue().length;
    const productPending = Number(state.inventory.pendingOps?.length || 0);
    const pending = queuePending + productPending;
    state.sync.pending = pending;
    const bridge = state.inventory.bridge || defaultBridgeState();
    const parts = [];
    parts.push(bridge.backend ? "Online" : (bridge.internet ? "Local" : "Offline"));
    parts.push(`${pending} pendiente${pending === 1 ? "" : "s"}`);
    if (productPending > 0) parts.push(`${productPending} del catalogo`);
    if (state.sync.lastAt) {
      parts.push(`ultima sync ${new Date(state.sync.lastAt).toLocaleTimeString()}`);
    }
    $("syncHint").textContent = parts.join(" · ");
    saveStore();
  }

  async function syncQueueNow(verbose = true) {
    if (navigator.onLine) {
      await flushInventoryPendingOps(false);
    }
    const queue = loadQueue();
    refreshSyncHint();
    if (queue.length === 0) {
      if (verbose) toast("ok", "Sincronizar", "No hay eventos pendientes.");
      return { ok: true, synced: [] };
    }
    const result = await fetchJsonAny("/api/lite/sync", {
      method: "POST",
      body: JSON.stringify({
        device_id: getDeviceId(),
        operations: queue,
      }),
    });
    if (!result.ok) {
      if (verbose) toast("err", "Sincronizar", "No pude sincronizar con ATLAS en este momento.");
      logLine("warn", `Sync error: ${JSON.stringify(result.errors || [])}`);
      refreshSyncHint();
      return { ok: false, errors: result.errors || [] };
    }
    const syncedIds = new Set((result.data?.synced || []).map((item) => item.local_id));
    const remaining = queue.filter((item) => !syncedIds.has(item.local_id || item.id));
    saveQueue(remaining);
    state.sync.lastAt = new Date().toISOString();
    state.sync.lastResult = result.data;
    saveStore();
    refreshSyncHint();
    await refreshInventory(false);
    if (verbose) toast("ok", "Sincronizar", `Sincronizados ${syncedIds.size} evento(s).`);
    logLine("ok", `Sync ok: ${syncedIds.size} evento(s).`);
    return { ok: true, synced: result.data?.synced || [] };
  }

  return {
    refreshSyncHint,
    syncQueueNow,
  };
}
