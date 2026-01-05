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
  if(h >= 6 && h <= 11) return "🌅 Buenos días. ¿Qué vamos a registrar hoy en RAULI?";
  if(h >= 12 && h <= 18) return "☀️ Buenas tardes. ¿Cómo va la producción y las ventas?";
  return "🌙 Buenas noches. ¿Deseas cerrar caja o revisar alertas?";
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

  // Detectores básicos para ayudar al usuario
  if(t.includes("venta")){
    return "🧾 Para registrar una venta: entra a 'Ventas' y completa Producto, Unidades, Total y Método.\nLuego vuelve a 'Finanzas' para ver el impacto en Fondo, Nómina y Amortización.";
  }
  if(t.includes("produccion") || t.includes("producción") || t.includes("lote") || t.includes("libras")){
    return "🥖 Producción: entra a 'Producción', registra el producto y las libras elaboradas.\nEso alimenta el pago por libras y ayuda al costo de producto.";
  }
  if(t.includes("fondo") || t.includes("circulante")){
    return "💼 Fondo Operativo: se repone automáticamente con ventas.\nSolo Raúl ajusta el 'Fondo objetivo'. En Finanzas verás el balance y alertas si baja demasiado.";
  }
  if(t.includes("amort") || t.includes("invers")){
    return "📉 Amortización: se calcula mensual (línea recta) con base en inversiones.\nAhora mismo ya ves 'Amortización mes' y 'Acumulado' en Finanzas.\nEn el siguiente paso agregamos la pantalla para registrar inversiones.";
  }
  if(t.includes("buenos días") || t.includes("buenos dias") || t.includes("buenas noches")){
    return "🤖 ¡Siempre! Yo te saludo y también puedo recordarte tareas: cierre de caja, inventario bajo, fondo bajo, etc.";
  }

  return "✅ Recibido. Puedo ayudarte a registrar ventas, producción, revisar fondo/nómina y alertas.\nDime: ¿qué pasó exactamente y hoy qué necesitas registrar?";
}

function detectAndCreateAlerts(text){
  // Aquí convertimos texto del usuario en alertas operativas si aplica.
  // NO manda WhatsApp aún; solo registra en Firestore.
  const core = CORE();
  if(!core?.createAlert) return;

  const t = (text||"").toLowerCase();

  // ejemplos simples
  if(t.includes("faltante") && (t.includes("caja") || t.includes("efectivo"))){
    core.createAlert(
      "caja_faltante",
      "Posible faltante de caja",
      "El usuario reportó un posible faltante de efectivo. Revisar cierre y evidencias.",
      true
    );
  }

  if(t.includes("inventario") && (t.includes("bajo") || t.includes("falta") || t.includes("mínimo") || t.includes("minimo"))){
    core.createAlert(
      "inventario_bajo",
      "Inventario reportado bajo",
      "El usuario reportó inventario bajo. Revisar insumos y movimientos.",
      true
    );
  }

  if(t.includes("fondo") && (t.includes("bajo") || t.includes("insuficiente"))){
    core.createAlert(
      "fondo_bajo",
      "Fondo operativo reportado bajo",
      "El usuario reportó fondo bajo. Revisar objetivo vs balance y ventas.",
      true
    );
  }

  if(t.includes("cierre") && t.includes("pendiente")){
    core.createAlert(
      "cierre_pendiente",
      "Cierre pendiente",
      "El usuario reportó cierre pendiente. Recomendado cerrar caja y dejar evidencias.",
      true
    );
  }
}

async function processMessage(text, fromQueue=false){
  const core = CORE();
  const online = navigator.onLine;

  // Mostrar en chat
  addChat((fromQueue ? "📥 (Cola) " : "") + text, "user");

  // Detectar alertas por texto
  detectAndCreateAlerts(text);

  // Si offline: guardar en cola
  if(!online && !fromQueue){
    const q = getQueue();
    q.push({ id: crypto.randomUUID(), text, ts: Date.now() });
    setQueue(q);
    addChat("🟥 Sin señal. Guardé tu mensaje y lo procesaré cuando vuelva internet.", "ai");
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
  addChat("✅ Cola procesada. Ya estás al día.", "ai");
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
addChat("🤖 RAULI listo. Puedo ayudarte con ventas, producción, fondo, nómina y amortización.", "ai");
