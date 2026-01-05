// rauli-core.js (RAULI FINAL CORE)
// Offline-first + Nómina + Fondo + Amortización + Ventas + Producción
// Autor del prototipo: ChatGPT

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, enableIndexedDbPersistence,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, query, orderBy, limit, getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ====== CONFIG FIREBASE (TU PROYECTO) ======
const firebaseConfig = {
  apiKey: "AIzaSyCGPDlRAIKsrI6EhE3Tb2-1sYJ1VDaH2jw",
  authDomain: "rauli-e7fdb.firebaseapp.com",
  projectId: "rauli-e7fdb",
  storageBucket: "rauli-e7fdb.firebasestorage.app",
  messagingSenderId: "406292569158",
  appId: "1:406292569158:web:c26f46de60d31827317e47",
  measurementId: "G-PVC6X0TTTL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

try { await enableIndexedDbPersistence(db); } catch(e) { /* multi-tab ok */ }

// ====== HELPERS UI ======
const $ = (id)=>document.getElementById(id);

function money(n){
  return "$" + (Number(n||0)).toFixed(2);
}
function todayKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function monthKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}
function ymKey(dateObj){
  const y=dateObj.getFullYear();
  const m=String(dateObj.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}
function addMonths(d, n){
  const x=new Date(d.getTime());
  x.setMonth(x.getMonth()+n);
  return x;
}

function toast(msg, ok=true){
  // UI minimal: usar alert suave en el chat del asistente si existe
  console.log(ok ? "OK:" : "ERR:", msg);
}

function safeNum(x, def=0){
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

// ====== BUSINESS PATHS ======
const BIZ = "rauli";
const subCol = (name)=>collection(db, "business", BIZ, name);
const refUser = (uid)=>doc(db, "business", BIZ, "users", uid);
const refSettings = ()=>doc(db, "business", BIZ, "settings", "compensation");

// ====== ROLES & PERMISSIONS ======
export const session = { uid:null, email:null, role:null, name:null };

const ROLE = {
  owner:"owner",
  co_owner:"co_owner",
  supervisor:"supervisor",
  admin_produccion:"admin_produccion",
  contadora:"contadora",
  operario:"operario",
  ventas:"ventas"
};

function canEditFund(){
  return session.role === ROLE.owner;
}
function canEditIndirectPercents(){
  return session.role === ROLE.owner;
}
function canEditRates(){
  return session.role === ROLE.owner || session.role === ROLE.contadora;
}
function canSeeAll(){
  return session.role === ROLE.owner || session.role === ROLE.co_owner || session.role === ROLE.contadora;
}

// ====== DEFAULT SETTINGS ======
const DEFAULT_SETTINGS = {
  fundTarget: 500,     // editable SOLO Raúl
  fundBalance: 0,      // auto
  adminPct: 0.20,
  amortPct: 0.30,
  ownerPoolPct: 0.50,

  // editable SOLO Raúl
  betyPct: 0.08,
  orlanditoPct: 0.06,

  // editable contadora y Raúl
  operarioRatePerLb: 0.45,
  vendedorRatePerUnit: 0.10
};

// ====== ALERT SYSTEM (solo registra; WhatsApp va en Functions luego) ======
async function createAlert(type, title, message, notify=true){
  try{
    await addDoc(subCol("alerts"), {
      type, title, message,
      day: todayKey(),
      notify,
      createdAt: serverTimestamp(),
      by:{ uid:session.uid||null, role:session.role||null, email:session.email||null }
    });
  }catch(e){
    console.warn("alert fail", e);
  }
}

// ====== AMORTIZACIÓN (Inversiones) ======
// Guardamos inversiones en: business/rauli/inversiones
// { name, cost, date (YYYY-MM-DD), lifeMonths, residual, method:"linea_recta" }

async function listInvestments(){
  const snap = await getDocs(query(subCol("inversiones"), orderBy("createdAt","desc"), limit(200)));
  const arr=[];
  snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
  return arr;
}

function amortScheduleForInvestment(inv){
  // Línea recta mensual
  const cost = safeNum(inv.cost, 0);
  const residual = safeNum(inv.residual, 0);
  const life = Math.max(1, Math.floor(safeNum(inv.lifeMonths, 1)));
  const base = Math.max(0, cost - residual);
  const perMonth = base / life;

  const start = inv.date ? new Date(inv.date + "T00:00:00") : new Date();
  const months = [];

  for(let i=0;i<life;i++){
    const d = addMonths(start, i);
    months.push({
      ym: ymKey(d),
      amount: perMonth
    });
  }
  return months; // array por mes
}

async function computeAmortization(){
  const invs = await listInvestments().catch(()=>[]);
  const map = new Map(); // ym -> amount
  invs.forEach(inv=>{
    amortScheduleForInvestment(inv).forEach(row=>{
      map.set(row.ym, (map.get(row.ym)||0) + row.amount);
    });
  });

  // total acumulado = suma de todos los meses
  let total = 0;
  for(const v of map.values()) total += v;

  // mes actual
  const thisMonth = monthKey();
  const monthAmount = safeNum(map.get(thisMonth), 0);

  // construir serie 12 meses atrás para gráfico
  const now = new Date();
  const labels = [];
  const data = [];
  for(let i=11;i>=0;i--){
    const d = addMonths(now, -i);
    const ym = ymKey(d);
    labels.push(ym);
    data.push(safeNum(map.get(ym), 0));
  }

  return {
    invCount: invs.length,
    monthAmount,
    total,
    series: { labels, data }
  };
}

// ====== CASH WATERFALL / NÓMINA ======
async function getSettings(){
  const r = refSettings();
  const snap = await getDoc(r);
  if(!snap.exists()){
    await setDoc(r, { ...DEFAULT_SETTINGS, createdAt: serverTimestamp() }, { merge:true });
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

async function setSettingsPartial(partial){
  // solo Raúl edita fondo/porcentajes indirectos
  const current = await getSettings();
  const next = { ...current };

  for(const k of Object.keys(partial)){
    if(k==="fundTarget" && !canEditFund()) continue;
    if((k==="betyPct" || k==="orlanditoPct") && !canEditIndirectPercents()) continue;
    if((k==="operarioRatePerLb" || k==="vendedorRatePerUnit") && !canEditRates()) continue;
    next[k] = partial[k];
  }
  await setDoc(refSettings(), next, { merge:true });
  return next;
}

async function listSales(day){
  const snap = await getDocs(query(subCol("ventas"), orderBy("createdAt","desc"), limit(600)));
  const arr=[];
  snap.forEach(d=>{
    const v=d.data();
    if(v.day===day) arr.push(v);
  });
  return arr;
}

async function listProduction(day){
  const snap = await getDocs(query(subCol("produccion"), orderBy("createdAt","desc"), limit(400)));
  const arr=[];
  snap.forEach(d=>{
    const v=d.data();
    if(v.day===day) arr.push(v);
  });
  return arr;
}

function sumBy(arr, fn){
  return arr.reduce((a,x)=>a + safeNum(fn(x),0), 0);
}

async function recalcPayroll(day){
  const s = await getSettings();

  const sales = await listSales(day);
  const lots = await listProduction(day);

  // ventas efectivas: para reponer fondo puedes usar solo efectivo si deseas;
  // aquí se usa el TOTAL de ventas (tu app puede separar luego).
  const salesEffective = sumBy(sales, v=>v.total);

  // Reponer fondo primero
  const need = Math.max(0, safeNum(s.fundTarget) - safeNum(s.fundBalance));
  const replenish = Math.min(salesEffective, need);
  const fundBalanceAfter = safeNum(s.fundBalance) + replenish;
  const excedente = salesEffective - replenish;

  // Nómina variable
  // Operarios por libras: suma de lbs * rate
  const payOperarios = sumBy(lots, l => safeNum(l.lbs) * safeNum(s.operarioRatePerLb));
  // Ventas por unidades
  const payVentas = sumBy(sales, v => safeNum(v.qty) * safeNum(s.vendedorRatePerUnit));

  const baseDistribucion = excedente - payOperarios - payVentas;

  const adminAmount = baseDistribucion > 0 ? baseDistribucion * safeNum(s.adminPct,0.20) : 0;
  const amortAmount = baseDistribucion > 0 ? baseDistribucion * safeNum(s.amortPct,0.30) : 0;
  const ownerPool   = baseDistribucion > 0 ? baseDistribucion * safeNum(s.ownerPoolPct,0.50) : 0;

  const betyAmount = ownerPool * safeNum(s.betyPct,0);
  const orlanditoAmount = ownerPool * safeNum(s.orlanditoPct,0);
  const ownerRemaining = ownerPool - betyAmount - orlanditoAmount;

  // Guardar resumen diario
  const dailyRef = doc(db, "business", BIZ, "payroll_daily", day);
  await setDoc(dailyRef, {
    day,
    salesEffective,
    replenish,
    fundBalanceAfter,
    payOperarios,
    payVentas,
    baseDistribucion,
    adminAmount,
    amortAmount,
    ownerPool,
    betyAmount,
    orlanditoAmount,
    ownerRemaining,
    createdAt: serverTimestamp()
  }, { merge:true });

  // Actualizar fundBalance en settings (auto)
  await setDoc(refSettings(), { fundBalance: fundBalanceAfter }, { merge:true });

  // Alertas
  if(baseDistribucion < 0){
    await createAlert("deficit_operativo", "Déficit operativo", `Base de distribución negativa: ${money(baseDistribucion)} el ${day}`, true);
  }
  if(fundBalanceAfter < safeNum(s.fundTarget)*0.25){
    await createAlert("fondo_bajo", "Fondo operativo bajo", `Fondo: ${money(fundBalanceAfter)} / Objetivo: ${money(s.fundTarget)}`, true);
  }

  return {
    settings: s,
    day,
    salesEffective,
    replenish,
    fundBalanceAfter,
    payOperarios,
    payVentas,
    baseDistribucion,
    adminAmount,
    amortAmount,
    ownerPool,
    betyAmount,
    orlanditoAmount,
    ownerRemaining
  };
}

// ====== PERSONAL EARNINGS (lo que ve cada usuario) ======
function earningsForUser(summary){
  const r = session.role;
  if(r===ROLE.admin_produccion) return summary.adminAmount;          // Papito
  if(r===ROLE.contadora) return summary.betyAmount;                 // Bety
  if(r===ROLE.supervisor) return summary.orlanditoAmount;           // Orlandito
  if(r===ROLE.owner) return summary.ownerRemaining;                 // Raúl
  if(r===ROLE.co_owner) return summary.ownerRemaining;              // Lisi (por ahora igual; luego lo separamos)
  // otros (operario/ventas) se verán cuando asignemos IDs por persona
  return 0;
}

// ====== UI BINDINGS ======
let financeChart = null;

async function renderFinance(){
  const day = todayKey();
  const settings = await getSettings();
  const summary = await recalcPayroll(day);
  const amort = await computeAmortization();

  // UI: Fondo
  if($("fundTarget")) $("fundTarget").textContent = money(settings.fundTarget);
  if($("fundBalance")) $("fundBalance").textContent = money(summary.fundBalanceAfter);

  // UI: Ganancia personal
  if($("todayEarnings")) $("todayEarnings").textContent = money(earningsForUser(summary));

  // UI: Amortización
  if($("amortMonth")) $("amortMonth").textContent = money(amort.monthAmount);
  if($("amortTotal")) $("amortTotal").textContent = money(amort.total);

  // Chart
  const canvas = $("financeChart");
  if(canvas && window.Chart){
    if(financeChart) financeChart.destroy();
    financeChart = new window.Chart(canvas.getContext("2d"),{
      type:"line",
      data:{
        labels: amort.series.labels,
        datasets:[
          { label:"Amortización mensual", data: amort.series.data }
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ display:true } },
        scales:{ y:{ beginAtZero:true } }
      }
    });
  }
}

function setUserChip(){
  if($("userChip")){
    const label = session.name ? `${session.name}` : (session.email || "Usuario");
    $("userChip").textContent = `👤 ${label}`;
  }
}

// ====== ACTIONS: Producción y Ventas ======
$("btnProd")?.addEventListener("click", async ()=>{
  const product = ($("prodProducto")?.value||"").trim();
  const lbs = safeNum($("prodLbs")?.value, 0);
  if(!product || lbs<=0) return;

  await addDoc(subCol("produccion"),{
    product,
    lbs,
    day: todayKey(),
    createdAt: serverTimestamp(),
    by:{ uid:session.uid||null, role:session.role||null, email:session.email||null }
  });

  $("prodProducto").value="";
  $("prodLbs").value="";
  await renderFinance();
});

$("btnVenta")?.addEventListener("click", async ()=>{
  const product = ($("ventaProducto")?.value||"").trim();
  const qty = safeNum($("ventaUnidades")?.value, 0);
  const total = safeNum($("ventaTotal")?.value, 0);
  const method = $("ventaMetodo")?.value || "efectivo";

  if(!product || qty<=0 || total<=0) return;

  await addDoc(subCol("ventas"),{
    product, qty, total, method,
    day: todayKey(),
    month: monthKey(),
    createdAt: serverTimestamp(),
    by:{ uid:session.uid||null, role:session.role||null, email:session.email||null }
  });

  $("ventaProducto").value="";
  $("ventaUnidades").value="";
  $("ventaTotal").value="";
  await renderFinance();
});

// ====== AUTH (login automático si ya está logueado) ======
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    // Si no hay UI de login aquí, no forzamos; la app puede operar demo
    session.uid=null; session.email=null; session.role=null; session.name=null;
    setUserChip();
    await renderFinance().catch(()=>{});
    return;
  }

  session.uid = user.uid;
  session.email = user.email || null;

  // Leer rol desde Firestore
  try{
    const snap = await getDoc(refUser(user.uid));
    if(snap.exists()){
      const u = snap.data();
      session.role = u.role || ROLE.owner;
      session.name = u.name || user.email || "Usuario";
    }else{
      session.role = ROLE.owner;
      session.name = user.email || "Usuario";
    }
  }catch(e){
    session.role = ROLE.owner;
    session.name = user.email || "Usuario";
  }

  setUserChip();
  await renderFinance().catch(()=>{});
});

// Exponer a assistant
window.RAULI_CORE = {
  db, auth, session,
  money, todayKey, monthKey,
  getSettings, setSettingsPartial,
  recalcPayroll, computeAmortization,
  createAlert,
  renderFinance
};

// Primer render
await renderFinance().catch(()=>{});
setUserChip();
