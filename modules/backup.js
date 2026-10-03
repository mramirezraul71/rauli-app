export function createBackupHelpers({
  APP,
  state,
  loadQueue,
  saveStore,
  saveQueue,
  applyUiDrafts,
  showView,
  renderMsgs,
  renderAlerts,
  renderInventory,
  refreshBridgeStatus,
  refreshSyncHint,
  toast,
  logLine,
}) {
  function exportAll() {
    const payload = {
      app: APP.VERSION,
      exportedAt: new Date().toISOString(),
      store: state,
      queue: loadQueue(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `RAULI_BACKUP_${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("ok", "Exportar", "Backup descargado.");
  }

  function importAllFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        if (data?.store) {
          Object.assign(state, data.store);
          saveStore();
        }
        if (Array.isArray(data?.queue)) saveQueue(data.queue);
        applyUiDrafts();
        showView(state.ui?.currentView || "home");
        renderMsgs();
        renderAlerts();
        renderInventory();
        refreshSyncHint();
        refreshBridgeStatus(false);
        toast("ok", "Importar", "Backup cargado.");
        logLine("ok", "Importacion completada.");
      } catch (error) {
        toast("err", "Importar", "Archivo invalido.");
        logLine("err", `Import error: ${error?.message || error}`);
      }
    };
    reader.readAsText(file);
  }

  return {
    exportAll,
    importAllFromFile,
  };
}
