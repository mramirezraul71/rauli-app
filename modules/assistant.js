export function createAssistantHelpers({
  state,
  saveStore,
  normalizeMoney,
  money,
  queueLiteEvent,
  addAlert,
  fetchJsonAny,
  getDeviceId,
  fixMojibake,
  showView,
  refreshInventory,
  syncQueueNow,
}) {
  const ASSISTANT_PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
  const FLOW_PROMPTS = new Set([
    "Vamos a registrar una entrada a almacen. Dime el producto.",
    "Vamos a registrar una venta. Dime el producto.",
    "Vamos a registrar una salida a produccion. Dime el producto o lote.",
    "Vamos a crear una alerta. Dime el tipo: insumos, caja, produccion, ventas o general.",
    "Vamos con el cierre de caja. Dime el efectivo contado.",
  ]);

  function stampPendingFlow(flow) {
    const now = new Date().toISOString();
    return {
      ...flow,
      created_at: flow?.created_at || now,
      updated_at: now,
    };
  }

  function isPendingFlowValid(flow) {
    if (!flow || typeof flow !== "object") return false;
    if (!flow.kind || !flow.step || typeof flow.data !== "object") return false;
    if (!FLOW_PROMPTS.has(String(flow.prompt || "").trim())) return false;
    return true;
  }

  function getPendingFlowAgeMs(flow) {
    const source = flow?.updated_at || flow?.created_at || "";
    const ts = Date.parse(source);
    if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
    return Date.now() - ts;
  }

  function cleanupAssistantState(options = {}) {
    const maxAgeMs = Number(options.maxAgeMs || ASSISTANT_PENDING_MAX_AGE_MS);
    const pending = state.assistant?.pending || null;
    if (!pending) return { cleared: false, reason: "" };
    if (!isPendingFlowValid(pending)) {
      state.assistant.pending = null;
      saveStore();
      return { cleared: true, reason: "invalid" };
    }
    if (getPendingFlowAgeMs(pending) > maxAgeMs) {
      state.assistant.pending = null;
      saveStore();
      return { cleared: true, reason: "expired" };
    }
    return { cleared: false, reason: "" };
  }

  function assistantHelp() {
    return "Puedo ayudarte con entrada de almacen, venta, salida a produccion, alerta, cierre de caja, inventario y sincronizacion. Ejemplos: 'quiero reportar una venta', 'entrada de harina', 'salida a produccion', 'ver inventario'.";
  }

  function parseKeyVals(parts) {
    const out = {};
    parts.forEach((part) => {
      const index = part.indexOf("=");
      if (index > 0) {
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) out[key] = value;
      }
    });
    return out;
  }

  function startAssistantFlow(kind) {
    const flows = {
      entrada: {
        kind,
        step: "product",
        data: {},
        prompt: "Vamos a registrar una entrada a almacen. Dime el producto.",
      },
      venta: {
        kind,
        step: "product",
        data: {},
        prompt: "Vamos a registrar una venta. Dime el producto.",
      },
      produccion: {
        kind,
        step: "product",
        data: {},
        prompt: "Vamos a registrar una salida a produccion. Dime el producto o lote.",
      },
      alerta: {
        kind,
        step: "type",
        data: {},
        prompt: "Vamos a crear una alerta. Dime el tipo: insumos, caja, produccion, ventas o general.",
      },
      caja: {
        kind,
        step: "cash",
        data: {},
        prompt: "Vamos con el cierre de caja. Dime el efectivo contado.",
      },
    };
    state.assistant.pending = flows[kind] ? stampPendingFlow(flows[kind]) : null;
    saveStore();
    return state.assistant.pending?.prompt || assistantHelp();
  }

  function resetAssistantFlow() {
    state.assistant.pending = null;
    saveStore();
  }

  function isAffirmative(text) {
    return /^(si|sí|ok|confirmo|confirmar|dale|correcto)$/i.test(String(text || "").trim());
  }

  function isNegative(text) {
    return /^(no|cancelar|cancela|detener|salir)$/i.test(String(text || "").trim());
  }

  function detectAssistantIntent(text) {
    const value = String(text || "").toLowerCase();
    if (value.startsWith("/entrada") || /\bentrada\b/.test(value) || /\balmac[ée]n\b/.test(value) || /\bcompra\b/.test(value)) return "entrada";
    if (value.startsWith("/venta") || /\bventa\b/.test(value)) return "venta";
    if (value.startsWith("/produccion") || value.startsWith("/producción") || /\bproducci/.test(value) || /\bsalida\b/.test(value)) return "produccion";
    if (value.startsWith("/alerta") || /\balerta\b/.test(value) || /\binsumo\b/.test(value)) return "alerta";
    if (value.startsWith("/caja") || /\bcierre\b/.test(value) || /\bcaja\b/.test(value)) return "caja";
    if (value.startsWith("/inventario") || /\binventario\b/.test(value) || /\bcat[aá]logo\b/.test(value)) return "inventario";
    if (value.startsWith("/reporte") || /\breporte\b/.test(value) || /\bresumen\b/.test(value)) return "reporte";
    if (value.startsWith("/ayuda") || /\bayuda\b/.test(value)) return "ayuda";
    return "";
  }

  function finalizePendingFlow(flow) {
    if (flow.kind === "entrada") {
      const quantity = normalizeMoney(flow.data.quantity);
      const unitCost = normalizeMoney(flow.data.unit_cost);
      const total = Number((quantity * unitCost).toFixed(2));
      const payload = {
        product: flow.data.product,
        quantity,
        unit_cost: unitCost,
        total,
        supplier: flow.data.supplier || "",
        currency: state.currency,
      };
      queueLiteEvent("entrada_almacen", payload);
      resetAssistantFlow();
      return `Entrada guardada: ${payload.product} x${payload.quantity} por ${money(total)}.`;
    }
    if (flow.kind === "venta") {
      const quantity = normalizeMoney(flow.data.quantity);
      const unitPrice = normalizeMoney(flow.data.unit_price);
      const total = Number((quantity * unitPrice).toFixed(2));
      const payload = {
        product: flow.data.product,
        quantity,
        unit_price: unitPrice,
        total,
        payment_method: flow.data.payment_method || "efectivo",
        currency: state.currency,
      };
      queueLiteEvent("venta", payload);
      resetAssistantFlow();
      return `Venta guardada: ${payload.product} x${payload.quantity} por ${money(total)} (${payload.payment_method}).`;
    }
    if (flow.kind === "produccion") {
      queueLiteEvent("produccion", {
        product: flow.data.product,
        quantity: normalizeMoney(flow.data.quantity),
        unit: flow.data.unit || "unidad",
        notes: flow.data.notes || "",
      });
      resetAssistantFlow();
      return `Salida a produccion guardada: ${flow.data.product} ${flow.data.quantity} ${flow.data.unit || "unidad"}.`;
    }
    if (flow.kind === "alerta") {
      addAlert({ tipo: flow.data.type, nivel: flow.data.level, text: flow.data.text });
      queueLiteEvent("alerta", { tipo: flow.data.type, nivel: flow.data.level, text: flow.data.text });
      resetAssistantFlow();
      return `Alerta guardada: ${flow.data.type}/${flow.data.level}.`;
    }
    if (flow.kind === "caja") {
      queueLiteEvent("caja", {
        action: "cierre",
        cash: normalizeMoney(flow.data.cash),
        transfer: normalizeMoney(flow.data.transfer),
        note: flow.data.note || "",
      });
      resetAssistantFlow();
      return "Cierre de caja guardado y listo para sincronizar.";
    }
    resetAssistantFlow();
    return "Operacion guardada.";
  }

  function continuePendingFlow(text) {
    const flow = state.assistant.pending;
    if (!flow) return null;
    const value = String(text || "").trim();

    if (isNegative(value)) {
      resetAssistantFlow();
      return "Operacion cancelada.";
    }

    if (flow.step === "confirm") {
      if (isAffirmative(value)) return finalizePendingFlow(flow);
      return "Responde si para guardar o no para cancelar.";
    }

    if (flow.kind === "entrada") {
      if (flow.step === "product") {
        flow.data.product = value;
        flow.step = "quantity";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime la cantidad que entro al almacen.";
      }
      if (flow.step === "quantity") {
        const quantity = normalizeMoney(value);
        if (quantity <= 0) return "La cantidad debe ser mayor que cero. Dimela otra vez.";
        flow.data.quantity = quantity;
        flow.step = "unit_cost";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime el costo unitario.";
      }
      if (flow.step === "unit_cost") {
        const unitCost = normalizeMoney(value);
        if (unitCost <= 0) return "El costo debe ser mayor que cero. Dimelo otra vez.";
        flow.data.unit_cost = unitCost;
        flow.step = "supplier";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Si quieres, dime proveedor u observacion. Si no, escribe listo.";
      }
      if (flow.step === "supplier") {
        flow.data.supplier = /^listo$/i.test(value) ? "" : value;
        flow.step = "confirm";
        flow.updated_at = new Date().toISOString();
        saveStore();
        const total = normalizeMoney(flow.data.quantity) * normalizeMoney(flow.data.unit_cost);
        return `Confirmo entrada de ${flow.data.product} x${flow.data.quantity} con costo ${money(flow.data.unit_cost)} y total ${money(total)}. Responde si o no.`;
      }
    }

    if (flow.kind === "venta") {
      if (flow.step === "product") {
        flow.data.product = value;
        flow.step = "quantity";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime la cantidad vendida.";
      }
      if (flow.step === "quantity") {
        const quantity = normalizeMoney(value);
        if (quantity <= 0) return "La cantidad debe ser mayor que cero. Dimela otra vez.";
        flow.data.quantity = quantity;
        flow.step = "unit_price";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime el precio unitario.";
      }
      if (flow.step === "unit_price") {
        const unitPrice = normalizeMoney(value);
        if (unitPrice <= 0) return "El precio debe ser mayor que cero. Dimelo otra vez.";
        flow.data.unit_price = unitPrice;
        flow.step = "payment_method";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Como se cobro? Ejemplos: efectivo, transferencia o tarjeta.";
      }
      if (flow.step === "payment_method") {
        flow.data.payment_method = value || "efectivo";
        const total = normalizeMoney(flow.data.quantity) * normalizeMoney(flow.data.unit_price);
        flow.step = "confirm";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return `Confirmo venta de ${flow.data.product} x${flow.data.quantity} a ${money(flow.data.unit_price)} (${flow.data.payment_method}), total ${money(total)}. Responde si o no.`;
      }
    }

    if (flow.kind === "produccion") {
      if (flow.step === "product") {
        flow.data.product = value;
        flow.step = "quantity";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime la cantidad que salio a produccion.";
      }
      if (flow.step === "quantity") {
        const quantity = normalizeMoney(value);
        if (quantity <= 0) return "La cantidad debe ser mayor que cero.";
        flow.data.quantity = quantity;
        flow.step = "unit";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Cual es la unidad de medida? Ejemplos: unidad, lb, paquete.";
      }
      if (flow.step === "unit") {
        flow.data.unit = value || "unidad";
        flow.step = "confirm";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return `Confirmo salida a produccion de ${flow.data.product} ${flow.data.quantity} ${flow.data.unit}. Responde si o no.`;
      }
    }

    if (flow.kind === "alerta") {
      if (flow.step === "type") {
        flow.data.type = value || "general";
        flow.step = "text";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Describe la alerta.";
      }
      if (flow.step === "text") {
        flow.data.text = value;
        flow.step = "level";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Que nivel tiene? bajo, medio o alto.";
      }
      if (flow.step === "level") {
        flow.data.level = value || "medio";
        flow.step = "confirm";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return `Confirmo alerta ${flow.data.type}/${flow.data.level}: ${flow.data.text}. Responde si o no.`;
      }
    }

    if (flow.kind === "caja") {
      if (flow.step === "cash") {
        const cash = normalizeMoney(value);
        if (cash < 0) return "El efectivo no puede ser negativo.";
        flow.data.cash = cash;
        flow.step = "transfer";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Ahora dime el total de transferencias.";
      }
      if (flow.step === "transfer") {
        const transfer = normalizeMoney(value);
        if (transfer < 0) return "Las transferencias no pueden ser negativas.";
        flow.data.transfer = transfer;
        flow.step = "note";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return "Si deseas, anade una observacion. Si no, escribe listo.";
      }
      if (flow.step === "note") {
        flow.data.note = /^listo$/i.test(value) ? "" : value;
        flow.step = "confirm";
        flow.updated_at = new Date().toISOString();
        saveStore();
        return `Confirmo cierre con efectivo ${money(flow.data.cash)} y transferencias ${money(flow.data.transfer)}. Responde si o no.`;
      }
    }

    return null;
  }

  async function askAtlasAssistant(text) {
    const history = (state.messages || []).slice(0, 6).map((message) => ({
      role: String(message.who || "").includes("RAULI") ? "assistant" : "user",
      content: fixMojibake(message.txt),
    })).reverse();
    const result = await fetchJsonAny("/api/lite/chat", {
      method: "POST",
      body: JSON.stringify({
        message: text,
        context: {
          profile_name: state.userName,
          role: state.userRole,
          device_id: getDeviceId(),
          channel: "rauli-lite-web",
        },
        history,
      }),
    });
    if (result.ok && result.data?.reply) {
      return {
        reply: fixMojibake(result.data.reply),
        provider: result.data.provider || "atlas",
        offline: Boolean(result.data.offline),
      };
    }
    return {
      reply: "Sigo operativo en modo local. Puedo ayudarte con inventario, ventas, produccion y alertas aunque ATLAS tarde en responder.",
      provider: "local_fallback",
      offline: true,
    };
  }

  function runCommand(raw) {
    const parts = raw.trim().split(/\s+/);
    const cmd = (parts[0] || "").replace(/^\//, "").toLowerCase();
    const kv = parseKeyVals(parts.slice(1));

    if (cmd === "ayuda") {
      resetAssistantFlow();
      return assistantHelp();
    }
    if (cmd === "sync") {
      resetAssistantFlow();
      return "sync_now";
    }
    if (cmd === "inventario") {
      resetAssistantFlow();
      showView("inventario");
      refreshInventory(false);
      return "Te llevo al inventario operativo.";
    }
    if (cmd === "entrada") {
      const product = kv.producto || kv.product || "";
      const quantity = normalizeMoney(kv.cantidad || kv.qty || 0);
      const unitCost = normalizeMoney(kv.precio || kv.costo || kv.unit_cost || 0);
      const supplier = kv.proveedor || kv.supplier || "";
      if (!product || !quantity || !unitCost) return startAssistantFlow("entrada");
      const total = Number((quantity * unitCost).toFixed(2));
      queueLiteEvent("entrada_almacen", { product, quantity, unit_cost: unitCost, total, supplier, currency: state.currency });
      return `Entrada guardada: ${product} x${quantity} por ${money(total)}.`;
    }
    if (cmd === "venta") {
      const product = kv.producto || kv.product || "";
      const quantity = normalizeMoney(kv.cantidad || kv.qty || 0);
      const unitPrice = normalizeMoney(kv.precio || kv.unit_price || 0);
      const paymentMethod = kv.metodo || kv.method || "efectivo";
      if (!product || !quantity || !unitPrice) return startAssistantFlow("venta");
      const total = Number((quantity * unitPrice).toFixed(2));
      queueLiteEvent("venta", { product, quantity, unit_price: unitPrice, total, payment_method: paymentMethod, currency: state.currency });
      return `Venta guardada: ${product} x${quantity} por ${money(total)} (${paymentMethod}).`;
    }
    if (cmd === "alerta") {
      const tipo = kv.tipo || kv.area || "general";
      const nivel = kv.nivel || kv.prioridad || "medio";
      const text = kv.texto || kv.text || kv.nombre || "";
      if (!text) return startAssistantFlow("alerta");
      addAlert({ tipo, nivel, text });
      queueLiteEvent("alerta", { tipo, nivel, text });
      return `Alerta registrada (${tipo}/${nivel}).`;
    }
    if (cmd === "produccion") {
      const product = kv.producto || kv.product || kv.lote || "";
      const quantity = normalizeMoney(kv.cantidad || kv.qty || 0);
      const unit = kv.unidad || kv.unit || "unidad";
      if (!product || !quantity) return startAssistantFlow("produccion");
      queueLiteEvent("produccion", { product, quantity, unit });
      return `Salida a produccion guardada: ${product} ${quantity} ${unit}.`;
    }
    if (cmd === "caja") {
      const cash = normalizeMoney(kv.efectivo || kv.cash || 0);
      const transfer = normalizeMoney(kv.transferencia || kv.transfer || 0);
      const note = kv.observacion || kv.note || "";
      if (!cash && !transfer && !note) {
        resetAssistantFlow();
        showView("caja");
        return "Te llevo al cuadre de caja para registrarlo con claridad.";
      }
      queueLiteEvent("caja", { action: kv.accion || "cierre", cash, transfer, note, currency: state.currency });
      return "Cierre de caja guardado.";
    }
    if (cmd === "reporte") {
      resetAssistantFlow();
      showView("inventario");
      refreshInventory(false);
      queueLiteEvent("reporte", { tipo: kv.tipo || "dia" });
      return `Resumen solicitado (${kv.tipo || "dia"}).`;
    }
    return "Comando no reconocido. Usa /ayuda.";
  }

  async function handleAssistant(text) {
    if (text.startsWith("/")) {
      const reply = runCommand(text);
      if (reply === "sync_now") {
        await syncQueueNow(true);
        return "Sincronizacion ejecutada.";
      }
      return reply;
    }

    const pendingReply = continuePendingFlow(text);
    if (pendingReply) return pendingReply;

    const detected = detectAssistantIntent(text);
    if (detected === "entrada" || detected === "venta" || detected === "produccion" || detected === "alerta" || detected === "caja") {
      return startAssistantFlow(detected);
    }
    if (detected === "inventario" || detected === "reporte") {
      showView("inventario");
      await refreshInventory(false);
      return "Te llevo al inventario operativo y dejo la base lista para seguir registrando eventos.";
    }
    if (detected === "ayuda") {
      return assistantHelp();
    }

    const remote = await askAtlasAssistant(text);
    return remote.reply;
  }

  return {
    assistantHelp,
    startAssistantFlow,
    handleAssistant,
    cleanupAssistantState,
  };
}
