export function defaultUiState() {
  return {
    currentView: "home",
    drafts: {
      aiInput: "",
      prodProducto: "",
      prodCantidad: "",
      prodUnidad: "unidad",
      ventaProducto: "",
      ventaCantidad: "",
      ventaPrecio: "",
      ventaMetodo: "efectivo",
      cajaCash: "",
      cajaTransfer: "",
      cajaNote: "",
      alertTipo: "insumos",
      alertNivel: "medio",
      alertTexto: "",
    },
  };
}

export function createUiStateHelpers({ state, saveStore, $ }) {
  function ensureUiState() {
    const current = state.ui || {};
    state.ui = {
      ...defaultUiState(),
      ...current,
      drafts: {
        ...defaultUiState().drafts,
        ...((current && current.drafts) || {}),
      },
    };
  }

  function persistUiDrafts() {
    ensureUiState();
    state.ui.drafts.aiInput = $("aiInput")?.value || "";
    state.ui.drafts.prodProducto = $("prodProducto")?.value || "";
    state.ui.drafts.prodCantidad = $("prodCantidad")?.value || "";
    state.ui.drafts.prodUnidad = $("prodUnidad")?.value || "unidad";
    state.ui.drafts.ventaProducto = $("ventaProducto")?.value || "";
    state.ui.drafts.ventaCantidad = $("ventaCantidad")?.value || "";
    state.ui.drafts.ventaPrecio = $("ventaPrecio")?.value || "";
    state.ui.drafts.ventaMetodo = $("ventaMetodo")?.value || "efectivo";
    state.ui.drafts.cajaCash = $("cajaCash")?.value || "";
    state.ui.drafts.cajaTransfer = $("cajaTransfer")?.value || "";
    state.ui.drafts.cajaNote = $("cajaNote")?.value || "";
    state.ui.drafts.alertTipo = $("alertTipo")?.value || "insumos";
    state.ui.drafts.alertNivel = $("alertNivel")?.value || "medio";
    state.ui.drafts.alertTexto = $("alertTexto")?.value || "";
    saveStore();
  }

  function applyUiDrafts() {
    ensureUiState();
    $("aiInput").value = state.ui.drafts.aiInput || "";
    $("prodProducto").value = state.ui.drafts.prodProducto || "";
    $("prodCantidad").value = state.ui.drafts.prodCantidad || "";
    $("prodUnidad").value = state.ui.drafts.prodUnidad || "unidad";
    $("ventaProducto").value = state.ui.drafts.ventaProducto || "";
    $("ventaCantidad").value = state.ui.drafts.ventaCantidad || "";
    $("ventaPrecio").value = state.ui.drafts.ventaPrecio || "";
    $("ventaMetodo").value = state.ui.drafts.ventaMetodo || "efectivo";
    $("cajaCash").value = state.ui.drafts.cajaCash || "";
    $("cajaTransfer").value = state.ui.drafts.cajaTransfer || "";
    $("cajaNote").value = state.ui.drafts.cajaNote || "";
    $("alertTipo").value = state.ui.drafts.alertTipo || "insumos";
    $("alertNivel").value = state.ui.drafts.alertNivel || "medio";
    $("alertTexto").value = state.ui.drafts.alertTexto || "";
  }

  return {
    ensureUiState,
    persistUiDrafts,
    applyUiDrafts,
  };
}
