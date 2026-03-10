// rauli-assistant.js (RAULI Assistant)
// Asistente personal digital + cola offline + saludos + alertas inteligentes (solo registra)
// Autor del prototipo: ChatGPT

const $ = (id)=>document.getElementById(id);
const CORE = ()=>window.RAULI_CORE;

const QUEUE_KEY = "rauli_assistant_queue_v1";

function getQueue(){
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function setQueue(q){
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function nowGreeting(){
  const h = new Date().getHours();
  if(h >= 6 && h <= 11) return "ðŸŒ… Buenos dÃ­as. Â¿QuÃ© vamos a registrar hoy en RAULI?";
  if(h >= 12 && h <= 18) return "â˜€ï¸ Buenas tardes. Â¿CÃ³mo va la producciÃ³n y las ventas?";
  return "ðŸŒ™ Buenas noches. Â¿Deseas cerrar caja o revisar alertas?";
}

function setGreeting(){
  const el = $("saludo");
  if(!el) return;
  const s = CORE()?.session;
  const name = s?.name ? `, ${s.name}` : "";
  el.textContent = nowGreeting() + name;
}

function addChat(text, who="user"){
  const box = $("chatBox");
  if(!box) return;
  const div = document.createElement("div");
  div.style.padding = "10px 12px";
  div.style.borderRadius = "12px";
  div.style.margin = "8px 0";
  div.style.border = "1px solid rgba(255,255,255,.08)";
  div.style.background = (who==="ai") ? "rgba(255,180,0,.12)" : "rgba(30,90,255,.12)";
  div.style.color = "var(--yellow)";
  div.style.whiteSpace = "pre-wrap";
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function localBrain(text){
  // Respuesta local (offline o sin IA remota)
  const t = (text||"").toLowerCase();

  // Detectores bÃ¡sicos para ayudar al usuario
  if(t.includes("venta")){
    return "ðŸ§¾ Para registrar una venta: entra a 'Ventas' y completa Producto, Unidades, Total y MÃ©todo.\nLuego vuelve a 'Finanzas' para ver el impacto en Fondo, NÃ³mina y AmortizaciÃ³n.";
  }
  if(t.includes("produccion") || t.includes("producciÃ³n") || t.includes("lote") || t.includes("libras")){
    return "ðŸ¥– ProducciÃ³n: entra a 'ProducciÃ³n', registra el producto y las libras elaboradas.\nEso alimenta el pago por libras y ayuda al costo de producto.";
  }
  if(t.includes("fondo") || t.includes("circulante")){
    return "ðŸ’¼ Fondo Operativo: se repone automÃ¡ticamente con ventas.\nSolo RaÃºl ajusta el 'Fondo objetivo'. En Finanzas verÃ¡s el balance y alertas si baja demasiado.";
  }
  if(t.includes("amort") || t.includes("invers")){
    return "ðŸ“‰ AmortizaciÃ³n: se calcula mensual (lÃ­nea recta) con base en inversiones.\nAhora mismo ya ves 'AmortizaciÃ³n mes' y 'Acumulado' en Finanzas.\nEn el siguiente paso agregamos la pantalla para registrar inversiones.";
  }
  if(t.includes("buenos dÃ­as") || t.includes("buenos dias") || t.includes("buenas noches")){
    return "ðŸ¤– Â¡Siempre! Yo te saludo y tambiÃ©n puedo recordarte tareas: cierre de caja, inventario bajo, fondo bajo, etc.";
  }

  return "âœ… Recibido. Puedo ayudarte a registrar ventas, producciÃ³n, revisar fondo/nÃ³mina y alertas.\nDime: Â¿quÃ© pasÃ³ exactamente y hoy quÃ© necesitas registrar?";
}

function detectAndCreateAlerts(text){
  // AquÃ­ convertimos texto del usuario en alertas operativas si aplica.
  // NO manda WhatsApp aÃºn; solo registra en Firestore.
  const core = CORE();
  if(!core?.createAlert) return;

  const t = (text||"").toLowerCase();

  // ejemplos simples
  if(t.includes("faltante") && (t.includes("caja") || t.includes("efectivo"))){
    core.createAlert(
      "caja_faltante",
      "Posible faltante de caja",
      "El usuario reportÃ³ un posible faltante de efectivo. Revisar cierre y evidencias.",
      true
    );
  }

  if(t.includes("inventario") && (t.includes("bajo") || t.includes("falta") || t.includes("mÃ­nimo") || t.includes("minimo"))){
    core.createAlert(
      "inventario_bajo",
      "Inventario reportado bajo",
      "El usuario reportÃ³ inventario bajo. Revisar insumos y movimientos.",
      true
    );
  }

  if(t.includes("fondo") && (t.includes("bajo") || t.includes("insuficiente"))){
    core.createAlert(
      "fondo_bajo",
      "Fondo operativo reportado bajo",
      "El usuario reportÃ³ fondo bajo. Revisar objetivo vs balance y ventas.",
      true
    );
  }

  if(t.includes("cierre") && t.includes("pendiente")){
    core.createAlert(
      "cierre_pendiente",
      "Cierre pendiente",
      "El usuario reportÃ³ cierre pendiente. Recomendado cerrar caja y dejar evidencias.",
      true
    );
  }
}

async function processMessage(text, fromQueue=false){
  const core = CORE();
  const online = navigator.onLine;

  // Mostrar en chat
  addChat((fromQueue ? "ðŸ“¥ (Cola) " : "") + text, "user");

  // Detectar alertas por texto
  detectAndCreateAlerts(text);

  // Si offline: guardar en cola
  if(!online && !fromQueue){
    const q = getQueue();
    q.push({ id: crypto.randomUUID(), text, ts: Date.now() });
    setQueue(q);
    addChat("ðŸŸ¥ Sin seÃ±al. GuardÃ© tu mensaje y lo procesarÃ© cuando vuelva internet.", "ai");
    return;
  }

  // Respuesta local (por ahora)
  const ans = localBrain(text);
  addChat(ans, "ai");

  // Sugerencia: refrescar finanzas si el usuario habla de dinero
  if(core?.renderFinance && (text.toLowerCase().includes("venta") || text.toLowerCase().includes("produ"))){
    try { await core.renderFinance(); } catch {}
  }
}

async function flushQueue(){
  if(!navigator.onLine) return;
  const q = getQueue();
  if(!q.length) return;

  // procesar cola en orden
  for(const item of q){
    await processMessage(item.text, true);
  }
  setQueue([]);
  addChat("âœ… Cola procesada. Ya estÃ¡s al dÃ­a.", "ai");
}

// UI events
$("btnIA")?.addEventListener("click", async ()=>{
  const input = $("assistantInput");
  if(!input) return;
  const text = (input.value||"").trim();
  if(!text) return;
  input.value = "";
  await processMessage(text, false);
});

window.addEventListener("online", flushQueue);
window.addEventListener("load", ()=>{
  setGreeting();
  flushQueue();
});
window.addEventListener("focus", setGreeting);
setInterval(setGreeting, 60_000);

// Mensaje inicial
addChat("ðŸ¤– RAULI listo. Puedo ayudarte con ventas, producciÃ³n, fondo, nÃ³mina y amortizaciÃ³n.", "ai");

