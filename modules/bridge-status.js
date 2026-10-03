export function createBridgeStatusHelpers({
  state,
  $,
  saveStore,
  ensureInventoryState,
  defaultBridgeState,
  sourceLabelFromBase,
  fetchJsonAny,
  toast,
}) {
  function setLamp(lampId, textId, tone, text) {
    const lamp = $(lampId);
    const label = $(textId);
    if (lamp) lamp.className = `lamp ${tone}`;
    if (label) label.textContent = text;
  }

  function updateTopConnectivityChip() {
    ensureInventoryState();
    const bridge = state.inventory.bridge || defaultBridgeState();
    let tone = "red";
    let label = "Offline";
    if (bridge.backend || bridge.tunnel) {
      tone = "green";
      label = "Online";
    } else if (bridge.internet) {
      tone = "amber";
      label = "Local";
    }
    $("dotNet").className = `dot ${tone}`;
    $("netTxt").textContent = label;
    $("chipOnline").title = bridge.tunnel
      ? `Internet, backend y tunel operativos${bridge.public_url ? `: ${bridge.public_url}` : ""}`
      : bridge.backend
        ? "Internet y backend operativos"
        : bridge.internet
          ? "Internet disponible, backend no responde"
          : "Sin conexion";
  }

  function renderBridgeStatus() {
    ensureInventoryState();
    const bridge = state.inventory.bridge || defaultBridgeState();
    setLamp("lampInternet", "internetTxt", bridge.internet ? "green" : "red", bridge.internet ? "Disponible" : "Sin señal");
    setLamp("lampBackend", "backendTxt", bridge.backend ? "green" : (bridge.internet ? "amber" : "red"), bridge.backend ? "Operativo" : (bridge.internet ? "Sin respuesta" : "Sin backend"));
    setLamp("lampTunnel", "tunnelTxt", bridge.tunnel ? "green" : (bridge.backend ? "amber" : "red"), bridge.tunnel ? "Publicado" : (bridge.backend ? "No detectado" : "Sin publicar"));
    const pendingProducts = Number(state.inventory.pendingOps?.length || 0);
    const details = [];
    details.push(bridge.mode === "offline" ? "Modo offline" : "Modo conectado");
    if (bridge.api_base) details.push(`Bridge: ${sourceLabelFromBase(bridge.api_base)}`);
    if (bridge.public_url) details.push(`URL publica: ${bridge.public_url}`);
    if (pendingProducts > 0) details.push(`${pendingProducts} cambio(s) de catalogo pendientes`);
    if (bridge.checked_at) details.push(`Chequeado ${new Date(bridge.checked_at).toLocaleTimeString()}`);
    $("bridgeHint").textContent = details.join(" · ");
    $("inventorySourcePill").textContent = state.inventory.sourceLabel || "Local";
    const openTunnelBtn = $("btnOpenTunnel");
    if (openTunnelBtn) {
      openTunnelBtn.style.display = bridge.public_url ? "" : "none";
    }
    updateTopConnectivityChip();
  }

  async function refreshBridgeStatus(verbose = false) {
    ensureInventoryState();
    const bridge = {
      ...defaultBridgeState(),
      ...(state.inventory.bridge || {}),
      internet: navigator.onLine,
      checked_at: new Date().toISOString(),
    };
    let observedBase = "";
    const runtime = await fetchJsonAny("/api/runtime/bridge-status");
    if (runtime.ok) {
      observedBase = runtime.base || "";
      const data = runtime.data || {};
      bridge.backend = true;
      bridge.atlas = Boolean(data.atlas?.ok || data.atlas_app?.ok);
      bridge.tunnel = Boolean(data.tunnel?.ok || data.tunnel_app?.ok);
      bridge.public_url = String(data.tunnel_app?.url || data.debug?.cached_tunnel_app_base || data.tunnel?.url || "").trim();
      bridge.api_base = observedBase;
      bridge.backend_version = String(data.backend?.version || "");
      bridge.atlas_version = String(data.versions?.atlas || "");
      bridge.tunnel_version = String(data.versions?.tunnel || "");
      bridge.mode = bridge.tunnel ? "online_tunnel" : "online_local";
    } else {
      const lite = await fetchJsonAny("/api/lite/status");
      if (lite.ok) {
        observedBase = lite.base || "";
        bridge.backend = true;
        bridge.api_base = observedBase;
        bridge.mode = bridge.internet ? "online_local" : "offline";
      } else {
        bridge.mode = bridge.internet ? "degraded" : "offline";
      }
    }
    state.inventory.bridge = bridge;
    if (observedBase) state.inventory.sourceLabel = sourceLabelFromBase(observedBase);
    saveStore();
    renderBridgeStatus();
    if (verbose) {
      toast(
        bridge.backend ? "ok" : "err",
        "Conectividad",
        bridge.tunnel
          ? "Tunel y backend detectados."
          : bridge.backend
            ? "Backend operativo, tunel no detectado."
            : "Backend no disponible."
      );
    }
    return bridge;
  }

  return {
    renderBridgeStatus,
    refreshBridgeStatus,
  };
}
