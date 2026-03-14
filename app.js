'use strict';

/* ===========================
   TSVs
=========================== */
const TSV_URLS = {
  "2026": "https://docs.google.com/spreadsheets/d/e/2PACX-1vREJFkqvhXwjBNPCQXTg4pHXUplygJU1ZZG6-xgOeAJ2ifnEMHmuoDJKwQIpxVfGfCrmfmNCS_8RHTc/pub?gid=1810443337&single=true&output=tsv",
  "2025": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv",
  "2024": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhAIn0x5D-p80AVkXrBaLhVyqakoQabAvUw3UmEzoo__1AXaWXM1dfvdagWNkHGO4YY_Txxb7OQHM/pub?gid=1810443337&single=true&output=tsv",
  "2023": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRL2kvbjxpU7qoPgiyoytANin1VsvqRx8BTZpSqBOJw_Lyid3NGPc88e3kwFiOsHpOPIgRricd64cin/pub?gid=1810443337&single=true&output=tsv",
};

const TSV_ESTUDIANTES =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQQO-CBQoN1QZ4GFExJWmPz6YNLO6rhaIsWBv-Whlu9okpZRpcxfUtLYeAMKaiNOQJrrf3Vcwhk32kZ/pub?gid=2130299316&single=true&output=tsv";

/* ===========================
   Column mapping
   ✅ Fecha es columna E => index 4 en 2024/25/26
   pago/profesor: autodetect por header si existe
=========================== */
const COLMAP = {
  "2023": { fecha: 1, nombre: 2, servicio: 4, hora: 7, pago: null, profesor: null },
  "2024": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
  "2025": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
  "2026": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
};

const FICHA_COL = {
  nombre: 0, estado: 1, edad: 4, tel: 9, cel: 10, curso: 11,
  estiloM: 12, estiloN: 13, estiloO: 14, plan: 16, modalidad: 17, acudiente: 20
};

/* ===========================
   Estados (orden + colores)
   Entre menor rank, más arriba sale (más urgente)
=========================== */
const ESTADO_RULES = [
  // 🔵 Activo no registro (más llamativo pero no "alarma roja")
  { key: "activo no registro",  match: /activo\s+no\s+registro/i,      rank: 0,  dot: "dot-blue",    pill: "pill-blue" },

  // 🟠 Activo en pausa (todavía activo)
  { key: "activo en pausa",     match: /activo\s+en\s+pausa/i,         rank: 1,  dot: "dot-orange",  pill: "pill-orange" },

  // 🟡 Inactivo en pausa (ya está más cerca de irse)
  { key: "inactivo en pausa",   match: /inactivo\s+en\s+pausa/i,       rank: 2,  dot: "dot-yellow",  pill: "pill-yellow" },

  // 🔴 Inactivos (todo lo que sea inactivo, rojo)
  { key: "inactivo lejano",     match: /inactivo\s+lejano/i,           rank: 3,  dot: "dot-red",     pill: "pill-red" },
  { key: "inactivo extendido",  match: /inactivo\s+extendido/i,        rank: 4,  dot: "dot-red",     pill: "pill-red" },
  { key: "inactivo historico",  match: /inactivo\s+hist[oó]rico/i,     rank: 5,  dot: "dot-red",     pill: "pill-red" },

  // Gris para exestudiante
  { key: "exestudiante",        match: /exestudiante/i,                rank: 6,  dot: "dot-gray",    pill: "pill-gray" },

  // 🟢 Activo normal
  { key: "activo",              match: /^activo$/i,                    rank: 7,  dot: "dot-green",   pill: "pill-green" },
];

function getEstadoInfo(estadoRaw){
  const estado = (estadoRaw || "").trim();
  const hit = ESTADO_RULES.find(r => r.match.test(estado));
  return hit
    ? { estado, rank: hit.rank, dot: hit.dot, pill: hit.pill }
    : { estado, rank: 50, dot: "dot-muted", pill: "pill-muted" };
}
// ===========================
// Agrupación por Estado + colapsables
// ===========================
const ESTADO_GROUPS = [
  { id: "g_activo_no_reg", label: "Activo no registro",  order: 0 },
  { id: "g_activo_pausa",  label: "Activo en pausa",     order: 1 },
  { id: "g_inac_pausa",    label: "Inactivo en pausa",   order: 2 },
  { id: "g_inactivos",     label: "Inactivos",           order: 3 }, // agrupa lejano/extendido/histórico
  { id: "g_ex",            label: "Exestudiante",        order: 4 },
  { id: "g_activo",        label: "Activo",              order: 5 },
  { id: "g_sin",           label: "Sin estado",          order: 99 },
];

const COLLAPSE_KEY = "seguimiento_collapse_v1";
let COLLAPSE_STATE = null;

function loadCollapse(){
  if (COLLAPSE_STATE) return COLLAPSE_STATE;
  try{
    COLLAPSE_STATE = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}") || {};
  }catch(e){
    COLLAPSE_STATE = {};
  }
  return COLLAPSE_STATE;
}
function saveCollapse(){
  try{ localStorage.setItem(COLLAPSE_KEY, JSON.stringify(COLLAPSE_STATE || {})); }catch(e){}
}
function isCollapsed(groupId){
  const st = loadCollapse();
  return !!st[groupId];
}
function toggleCollapsed(groupId){
  const st = loadCollapse();
  st[groupId] = !st[groupId];
  COLLAPSE_STATE = st;
  saveCollapse();
}

function groupIdFromEstado(estadoRaw){
  const s = (estadoRaw || "").trim();

  if (/activo\s+no\s+registro/i.test(s)) return "g_activo_no_reg";
  if (/activo\s+en\s+pausa/i.test(s)) return "g_activo_pausa";
  if (/inactivo\s+en\s+pausa/i.test(s)) return "g_inac_pausa";
  if (/inactivo\s+(lejano|extendido|hist[oó]rico)/i.test(s)) return "g_inactivos";
  if (/exestudiante/i.test(s)) return "g_ex";
  if (/^activo$/i.test(s)) return "g_activo";

  return "g_sin";
}
/* ===========================
   State
=========================== */
let DATA = {};               // year -> records[]
let META = {};               // year -> { hasPago, hasProfesor }
let EST_INDEX = null;        // Map(normalizedName -> row)

let selDays = new Set();
let selMonths = new Set();
let selServices = new Set();
let selHours = new Set();
let selTeachers = new Set();
let selPays = new Set();

let lastSelectedStudent = "";

/* ===========================
   DOM
=========================== */
const yearSelect = document.getElementById("yearSelect");
const statusEl = document.getElementById("status");
const btnClearAll = document.getElementById("btnClearAll");

const dayMenu = document.getElementById("dayMenu");
const dayToggle = document.getElementById("dayToggle");
const dayCount = document.getElementById("dayCount");

const monthGroup = document.getElementById("monthGroup");
const monthMenu = document.getElementById("monthMenu");
const monthToggle = document.getElementById("monthToggle");
const monthCount = document.getElementById("monthCount");

const serviceMenu = document.getElementById("serviceMenu");
const serviceToggle = document.getElementById("serviceToggle");
const srvCount = document.getElementById("srvCount");

const hourMenu = document.getElementById("hourMenu");
const hourToggle = document.getElementById("hourToggle");
const hourCount = document.getElementById("hourCount");

const teacherGroup = document.getElementById("teacherGroup");
const teacherMenu = document.getElementById("teacherMenu");
const teacherToggle = document.getElementById("teacherToggle");
const teacherCount = document.getElementById("teacherCount");

const payGroup = document.getElementById("payGroup");
const payMenu = document.getElementById("payMenu");
const payToggle = document.getElementById("payToggle");
const payCount = document.getElementById("payCount");

const attendeesBox = document.getElementById("attendeesBox");
const countBadge = document.getElementById("countBadge");

// Side ficha
const sideName = document.getElementById("sideName");
const sideSub = document.getElementById("sideSub");
const sideGrid = document.getElementById("sideGrid");
const sideEstadoPill = document.getElementById("sideEstadoPill");
const sideEstadoTxt = document.getElementById("sideEstadoTxt");
const sideQuick = document.getElementById("sideQuick");
const sideHistMeta = document.getElementById("sideHistMeta");
const sideTbody = document.getElementById("sideTbody");

/* ===========================
   Utils
=========================== */
const t = (msg) => { if (statusEl) statusEl.textContent = msg; };

const parseTSV = (text) =>
  text.trim().replace(/\r/g, "").split("\n").map(r => r.split("\t"));

function norm(s){
  return (s || "").toString().trim().toLowerCase();
}
function normName(s){
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ");
}
function normalizeService(s){
  if (!s) return "";
  return String(s).replace(/^\s*\d+\s*/,'').trim();
}

function parseDMY(dateStr){
  const s = (dateStr || "").trim();
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
  const d = new Date(yy, mm - 1, dd);
  if (d.getFullYear() !== yy || d.getMonth() !== (mm - 1) || d.getDate() !== dd) return null;
  return d;
}
const WEEKDAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function weekdayFromDMY(dateStr){
  const d = parseDMY(dateStr);
  return d ? WEEKDAYS_ES[d.getDay()] : "";
}
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function monthFromDateObj(d){
  return d ? MONTHS_ES[d.getMonth()] : "";
}

function findHeaderIndex(rows, keywords){
  const header = (rows?.[0] || []).map(h => norm(h));
  for (const kw of keywords){
    const i = header.findIndex(h => h.includes(norm(kw)));
    if (i >= 0) return i;
  }
  return -1;
}

/* ===========================
   Dropdown builder
=========================== */
function buildMultiMenu(menuEl, items, selectedSet, {
  onChange,
  allLabel = "Seleccionar todo",
  clearLabel = "Limpiar",
  searchPlaceholder = "Escribe para filtrar…"
}){
  menuEl.innerHTML = "";

  // actions
  const actions = document.createElement("div");
  actions.className = "dd-actions";

  const btnAll = document.createElement("button");
  btnAll.type = "button";
  btnAll.className = "mini-btn";
  btnAll.textContent = allLabel;

  const btnClear = document.createElement("button");
  btnClear.type = "button";
  btnClear.className = "mini-btn";
  btnClear.textContent = clearLabel;

  actions.appendChild(btnAll);
  actions.appendChild(btnClear);
  menuEl.appendChild(actions);

  // search
  const searchWrap = document.createElement("div");
  searchWrap.className = "dd-search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = searchPlaceholder;
  searchWrap.appendChild(input);
  menuEl.appendChild(searchWrap);

  const list = document.createElement("div");
  menuEl.appendChild(list);

  const render = (filter="") => {
    list.innerHTML = "";
    const f = norm(filter);
    const visible = items.filter(v => !f || norm(v).includes(f));

    if (!visible.length){
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Sin coincidencias";
      list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach(val => {
      const id = `${menuEl.id}_${btoa(unescape(encodeURIComponent(val))).replace(/=+/g,'')}`;

      const label = document.createElement("label");
      label.className = "check";
      label.htmlFor = id;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.value = val;
      cb.checked = selectedSet.has(val);
      cb.addEventListener("change", () => {
        cb.checked ? selectedSet.add(val) : selectedSet.delete(val);
        onChange?.();
        render(input.value);
      });

      const span = document.createElement("span");
      span.textContent = val;

      label.appendChild(cb);
      label.appendChild(span);
      frag.appendChild(label);
    });

    list.appendChild(frag);
  };

  btnAll.addEventListener("click", () => {
    items.forEach(v => selectedSet.add(v));
    onChange?.();
    render(input.value);
  });

  btnClear.addEventListener("click", () => {
    selectedSet.clear();
    onChange?.();
    render(input.value);
  });

  input.addEventListener("input", () => render(input.value));
  render("");
}

function openMenu(menuEl){
  menuEl.classList.add("open");
  menuEl.setAttribute("aria-hidden","false");
}
function closeMenu(menuEl){
  menuEl.classList.remove("open");
  menuEl.setAttribute("aria-hidden","true");
}
function closeAllMenus(except=null){
  [dayMenu, monthMenu, serviceMenu, hourMenu, teacherMenu, payMenu].forEach(m => {
    if (m && m !== except) closeMenu(m);
  });
}

document.addEventListener("click", (e) => {
  const menus = [dayMenu, monthMenu, serviceMenu, hourMenu, teacherMenu, payMenu].filter(Boolean);
  const toggles = [dayToggle, monthToggle, serviceToggle, hourToggle, teacherToggle, payToggle].filter(Boolean);
  const hit = [...menus, ...toggles].some(el => el.contains(e.target));
  if (!hit) closeAllMenus(null);
});

/* ===========================
   Load year data
=========================== */
async function loadYear(year, url){
  const res = await fetch(url + "&_ts=" + Date.now());
  const txt = await res.text();
  const rows = parseTSV(txt);

  const idx = COLMAP[year];
  if (!idx){ DATA[year] = []; META[year] = {hasPago:false, hasProfesor:false}; return; }

  // autodetect extra cols
  let pagoCol = idx.pago;
  if (pagoCol == null){
    const p = findHeaderIndex(rows, ["pago", "pagó", "pago?", "estado pago", "pago estado"]);
    if (p >= 0) pagoCol = p;
  }
  let profCol = idx.profesor;
  if (profCol == null){
    const p = findHeaderIndex(rows, ["profesor", "profe", "docente"]);
    if (p >= 0) profCol = p;
  }

  const maxIdx = Math.max(idx.fecha, idx.nombre, idx.servicio, idx.hora, pagoCol ?? 0, profCol ?? 0);
  const body = rows.slice(1).filter(r => r.length > maxIdx);

  const out = body.map(r => {
    const fecha = (r[idx.fecha] || "").trim();
    const dObj = parseDMY(fecha);
    const dia = weekdayFromDMY(fecha);
    const mes = monthFromDateObj(dObj);

    return {
      fecha,
      dia,
      mes,
      nombre: (r[idx.nombre] || "").trim(),
      servicio: normalizeService(r[idx.servicio] || ""),
      hora: (r[idx.hora] || "").trim(),
      pago: pagoCol != null ? (r[pagoCol] || "").trim() : "",
      profesor: profCol != null ? (r[profCol] || "").trim() : "",
      _date: dObj
    };
  }).filter(x => x.nombre && x.servicio && x.hora);

  DATA[year] = out;
  META[year] = { hasPago: pagoCol != null, hasProfesor: profCol != null };
}

/* ===========================
   Estudiantes index
=========================== */
async function ensureStudents(){
  if (EST_INDEX) return;

  const res = await fetch(TSV_ESTUDIANTES + "&_ts=" + Date.now());
  const txt = await res.text();
  const rows = parseTSV(txt);
  const body = rows.slice(1);

  const map = new Map();
  for (const r of body){
    const name = (r[FICHA_COL.nombre] || "").trim();
    if (!name) continue;
    const key = normName(name);
    if (!map.has(key)) map.set(key, r);
  }
  EST_INDEX = map;
}

function buildEstilo(row){
  const m = (row[FICHA_COL.estiloM] || "").trim();
  const n = (row[FICHA_COL.estiloN] || "").trim();
  const o = (row[FICHA_COL.estiloO] || "").trim();
  return [m,n,o].filter(Boolean).join(" · ");
}

/* ===========================
   Filtering
=========================== */
function clearAllFilters(){
  selDays.clear(); selMonths.clear(); selServices.clear(); selHours.clear(); selTeachers.clear(); selPays.clear();
  updateCountsAndLabels();
  renderFiltered();
  if (lastSelectedStudent) renderSideFicha(lastSelectedStudent);
}

function updateCountsAndLabels(){
  dayCount.textContent = selDays.size;
  monthCount.textContent = selMonths.size;
  srvCount.textContent = selServices.size;
  hourCount.textContent = selHours.size;
  teacherCount.textContent = selTeachers.size;
  payCount.textContent = selPays.size;

  dayToggle.querySelector("span").textContent = selDays.size ? `${selDays.size} día(s) seleccionado(s)` : "Selecciona día(s)";
  monthToggle.querySelector("span").textContent = selMonths.size ? `${selMonths.size} mes(es) seleccionado(s)` : "Selecciona mes(es)";
  serviceToggle.querySelector("span").textContent = selServices.size ? `${selServices.size} servicio(s) seleccionado(s)` : "Selecciona servicio(s)";
  hourToggle.querySelector("span").textContent = selHours.size ? `${selHours.size} hora(s) seleccionada(s)` : "Selecciona hora(s)";
  if (teacherToggle) teacherToggle.querySelector("span").textContent = selTeachers.size ? `${selTeachers.size} profesor(es)` : "Selecciona profesor(es)";
  if (payToggle) payToggle.querySelector("span").textContent = selPays.size ? `${selPays.size} estado(s)` : "Selecciona estado(s)";
}

function anyFiltersOn(){
  return selDays.size || selMonths.size || selServices.size || selHours.size || selTeachers.size || selPays.size;
}

function getYear(){
  return yearSelect.value;
}

function baseForYear(){
  const y = getYear();
  return y ? (DATA[y] || []) : [];
}

function buildHoursFromSelection(){
  const base = baseForYear();

  const horas = [...new Set(
    base
      .filter(r => selDays.size ? selDays.has(r.dia) : true)
      .filter(r => selMonths.size ? selMonths.has(r.mes) : true)
      .filter(r => selServices.size ? selServices.has(r.servicio) : true)
      .filter(r => selTeachers.size ? selTeachers.has(r.profesor) : true)
      .filter(r => selPays.size ? selPays.has(r.pago) : true)
      .map(r => r.hora)
      .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));

  // limpia horas inválidas
  [...selHours].forEach(h => { if (!horas.includes(h)) selHours.delete(h); });

  buildMultiMenu(hourMenu, horas, selHours, {
    onChange: () => { updateCountsAndLabels(); renderFiltered(); }
  });
}

function renderFiltered(){
  const base = baseForYear();

  if (!anyFiltersOn()){
    attendeesBox.innerHTML = `<div class="empty">Selecciona filtros para ver la lista. (Sí, ya sé, sería más cómodo sin eso).</div>`;
    countBadge.textContent = "0";
    return;
  }

  const filtered = base.filter(r => {
    const okDay = selDays.size ? selDays.has(r.dia) : true;
    const okMonth = selMonths.size ? selMonths.has(r.mes) : true;
    const okSrv = selServices.size ? selServices.has(r.servicio) : true;
    const okHour = selHours.size ? selHours.has(r.hora) : true;
    const okTeacher = selTeachers.size ? selTeachers.has(r.profesor) : true;
    const okPay = selPays.size ? selPays.has(r.pago) : true;
    return okDay && okMonth && okSrv && okHour && okTeacher && okPay;
  });

  const uniqueNames = [...new Set(filtered.map(r => r.nombre).filter(Boolean))];

  // items con estado + prioridad + grupo
  const items = uniqueNames.map(n => {
    const row = EST_INDEX ? (EST_INDEX.get(normName(n)) || null) : null;
    const estadoRaw = row ? (row[FICHA_COL.estado] || "").trim() : "";
    const info = getEstadoInfo(estadoRaw);
    const groupId = groupIdFromEstado(estadoRaw);
    return { name: n, estado: info.estado, rank: info.rank, dot: info.dot, groupId };
  });

  // orden global por prioridad y nombre (para que el total sea consistente)
  items.sort((a,b) => (a.rank - b.rank) || a.name.localeCompare(b.name,'es'));

  countBadge.textContent = String(items.length);

  if (!items.length){
    attendeesBox.innerHTML = `<div class="empty">No hay registros para los filtros seleccionados.</div>`;
    return;
  }

  // agrupar
  const groups = new Map();
  for (const it of items){
    if (!groups.has(it.groupId)) groups.set(it.groupId, []);
    groups.get(it.groupId).push(it);
  }

  // render secciones
  attendeesBox.innerHTML = "";
  const frag = document.createDocumentFragment();

  const orderedGroups = ESTADO_GROUPS
    .filter(g => groups.has(g.id))
    .sort((a,b) => a.order - b.order);

  orderedGroups.forEach(g => {
    const list = groups.get(g.id) || [];
    const collapsed = isCollapsed(g.id);

    const sec = document.createElement("section");
    sec.className = "estado-section";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "estado-header";
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    header.innerHTML = `
      <span class="estado-title">${g.label}</span>
      <span class="estado-meta">${list.length}</span>
      <span class="estado-chevron">${collapsed ? "▸" : "▾"}</span>
    `;

    const body = document.createElement("div");
    body.className = "estado-body";
    body.style.display = collapsed ? "none" : "";

    header.addEventListener("click", () => {
      toggleCollapsed(g.id);
      const nowCollapsed = isCollapsed(g.id);
      header.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
      body.style.display = nowCollapsed ? "none" : "";
      header.querySelector(".estado-chevron").textContent = nowCollapsed ? "▸" : "▾";
    });

    const chips = document.createDocumentFragment();
    list.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip chip-student";
      b.setAttribute("data-estado", item.estado || "");
      b.setAttribute("title", item.estado ? `Estado: ${item.estado}` : "Estado: (sin dato)");

      b.innerHTML = `
        <span class="dot ${item.dot}" aria-hidden="true"></span>
        <span class="chip-name">${item.name}</span>
      `;

      b.addEventListener("click", () => {
        lastSelectedStudent = item.name;
        renderSideFicha(item.name);
      });

      chips.appendChild(b);
    });

    body.appendChild(document.createElement("div")).appendChild(chips);

    sec.appendChild(header);
    sec.appendChild(body);
    frag.appendChild(sec);
  });

  attendeesBox.appendChild(frag);
}

/* ===========================
   Side ficha
=========================== */
function sideField(label, value, wide=false){
  const div = document.createElement("div");
  div.className = "field" + (wide ? " wide" : "");
  div.innerHTML = `<div class="k">${label}</div><div class="v">${(value && String(value).trim()) ? value : "—"}</div>`;
  return div;
}

function getStudentHistoryForYear(studentName, year){
  const key = normName(studentName);
  const base = DATA[year] || [];
  const hits = base.filter(r => normName(r.nombre) === key);
  hits.sort((a,b) => (b._date?.getTime?.() || -Infinity) - (a._date?.getTime?.() || -Infinity));
  return hits;
}

function applyEstadoPill(estadoRaw){
  // limpia clases previas
  sideEstadoPill.classList.remove(
    "pill-red","pill-orange","pill-amber","pill-yellow","pill-blue","pill-indigo","pill-green","pill-gray","pill-muted"
  );
  const info = getEstadoInfo(estadoRaw);
  sideEstadoPill.classList.add(info.pill);
}

async function renderSideFicha(studentName){
  const year = getYear();
  sideName.textContent = `Ficha · ${studentName}`;
  sideSub.textContent = "Cargando ficha…";
  sideGrid.innerHTML = `<div class="grid-empty">Cargando…</div>`;
  sideQuick.innerHTML = "";
  sideHistMeta.textContent = "";
  sideTbody.innerHTML = `<tr><td class="muted" colspan="6">Cargando…</td></tr>`;
  sideEstadoPill.style.display = "none";
  sideEstadoTxt.textContent = "";

  try{
    await ensureStudents();
    const row = EST_INDEX.get(normName(studentName)) || null;

    const estado = row ? (row[FICHA_COL.estado] || "").trim() : "";
    const edad = row ? (row[FICHA_COL.edad] || "").trim() : "";
    const tel = row ? (row[FICHA_COL.tel] || "").trim() : "";
    const cel = row ? (row[FICHA_COL.cel] || "").trim() : "";
    const curso = row ? (row[FICHA_COL.curso] || "").trim() : "";
    const estilo = row ? buildEstilo(row) : "";
    const plan = row ? (row[FICHA_COL.plan] || "").trim() : "";
    const modalidad = row ? (row[FICHA_COL.modalidad] || "").trim() : "";
    const acudiente = row ? (row[FICHA_COL.acudiente] || "").trim() : "";

    // pill
    if (estado){
      sideEstadoPill.style.display = "inline-flex";
      sideEstadoTxt.textContent = `Estado: ${estado}`;
      applyEstadoPill(estado);
    } else {
      sideEstadoPill.style.display = "inline-flex";
      sideEstadoTxt.textContent = `Estado: (sin dato)`;
      applyEstadoPill("");
    }

    // grid fields
    sideGrid.innerHTML = "";
    sideGrid.appendChild(sideField("Edad", edad));
    sideGrid.appendChild(sideField("Curso", curso));
    sideGrid.appendChild(sideField("Teléfono", tel));
    sideGrid.appendChild(sideField("Celular", cel));
    sideGrid.appendChild(sideField("Plan", plan));
    sideGrid.appendChild(sideField("Modalidad", modalidad));
    sideGrid.appendChild(sideField("Estilo", estilo, true));
    sideGrid.appendChild(sideField("Acudiente", acudiente, true));

    // historial
    const hist = year ? getStudentHistoryForYear(studentName, year) : [];
    const top = hist.slice(0, 10);
    const total = hist.length;

    const last = top[0];
    const lastPago = (last?.pago || "").trim();
    const lastSrv = (last?.servicio || "").trim();
    const lastDate = (last?.fecha || "").trim();

    sideSub.textContent = `Año ${year || "—"} · ${total} clase(s) registradas`;

    sideQuick.innerHTML = "";
    const q1 = document.createElement("div");
    q1.className = "q";
    q1.textContent = `Última: ${lastDate || "—"} · ${lastSrv || "—"}`;
    const q2 = document.createElement("div");
    q2.className = "q";
    q2.textContent = `Último pago: ${lastPago || "—"}`;
    sideQuick.appendChild(q1);
    sideQuick.appendChild(q2);

    sideHistMeta.textContent = total ? `Mostrando ${Math.min(10,total)} de ${total}` : "—";

    if (!top.length){
      sideTbody.innerHTML = `<tr><td class="muted" colspan="6">Sin registros en el año seleccionado.</td></tr>`;
      return;
    }

    sideTbody.innerHTML = "";
    for (const r of top){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.fecha || "—"}</td>
        <td>${r.dia || "—"}</td>
        <td>${r.servicio || "—"}</td>
        <td>${r.hora || "—"}</td>
        <td>${r.pago || "—"}</td>
        <td>${r.profesor || "—"}</td>
      `;
      sideTbody.appendChild(tr);
    }

  }catch(err){
    console.error(err);
    sideSub.textContent = "Error cargando ficha.";
    sideGrid.innerHTML = "";
    sideGrid.appendChild(sideField("Error", err?.message || String(err), true));
    sideTbody.innerHTML = `<tr><td class="muted" colspan="6">No se pudo cargar historial.</td></tr>`;
  }
}

/* ===========================
   UI bindings
=========================== */
btnClearAll.addEventListener("click", clearAllFilters);

dayToggle.addEventListener("click", () => {
  const open = dayMenu.classList.contains("open");
  closeAllMenus(open ? null : dayMenu);
  open ? closeMenu(dayMenu) : openMenu(dayMenu);
});
monthToggle.addEventListener("click", () => {
  const open = monthMenu.classList.contains("open");
  closeAllMenus(open ? null : monthMenu);
  open ? closeMenu(monthMenu) : openMenu(monthMenu);
});
serviceToggle.addEventListener("click", () => {
  const open = serviceMenu.classList.contains("open");
  closeAllMenus(open ? null : serviceMenu);
  open ? closeMenu(serviceMenu) : openMenu(serviceMenu);
});
hourToggle.addEventListener("click", () => {
  const open = hourMenu.classList.contains("open");
  closeAllMenus(open ? null : hourMenu);
  open ? closeMenu(hourMenu) : openMenu(hourMenu);
});
teacherToggle?.addEventListener("click", () => {
  const open = teacherMenu.classList.contains("open");
  closeAllMenus(open ? null : teacherMenu);
  open ? closeMenu(teacherMenu) : openMenu(teacherMenu);
});
payToggle?.addEventListener("click", () => {
  const open = payMenu.classList.contains("open");
  closeAllMenus(open ? null : payMenu);
  open ? closeMenu(payMenu) : openMenu(payMenu);
});

/* ===========================
   Year change: build menus
=========================== */
yearSelect.addEventListener("change", () => {
  clearAllFilters();

  const y = getYear();
  if (!y){ t("Selecciona un año."); return; }

  const base = DATA[y] || [];
  const meta = META[y] || {hasPago:false, hasProfesor:false};

  // show/hide optional filters
  teacherGroup.style.display = meta.hasProfesor ? "" : "none";
  payGroup.style.display = meta.hasPago ? "" : "none";

  // days
  const orderDays = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const days = [...new Set(base.map(r => r.dia).filter(Boolean))]
    .sort((a,b)=> orderDays.indexOf(a) - orderDays.indexOf(b));

  // months
  const months = [...new Set(base.map(r => r.mes).filter(Boolean))]
    .sort((a,b)=> MONTHS_ES.indexOf(a) - MONTHS_ES.indexOf(b));

  // services
  const services = [...new Set(base.map(r => r.servicio).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'es'));

  // teacher/pay values (optional)
  const teachers = meta.hasProfesor
    ? [...new Set(base.map(r => r.profesor).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
    : [];

  const pays = meta.hasPago
    ? [...new Set(base.map(r => r.pago).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
    : [];

  buildMultiMenu(dayMenu, days, selDays, {
    onChange: () => { updateCountsAndLabels(); buildHoursFromSelection(); renderFiltered(); }
  });
  buildMultiMenu(monthMenu, months, selMonths, {
    onChange: () => { updateCountsAndLabels(); buildHoursFromSelection(); renderFiltered(); }
  });
  buildMultiMenu(serviceMenu, services, selServices, {
    onChange: () => { updateCountsAndLabels(); buildHoursFromSelection(); renderFiltered(); }
  });

  if (meta.hasProfesor){
    buildMultiMenu(teacherMenu, teachers, selTeachers, {
      onChange: () => { updateCountsAndLabels(); buildHoursFromSelection(); renderFiltered(); }
    });
  } else {
    teacherMenu.innerHTML = "";
  }

  if (meta.hasPago){
    buildMultiMenu(payMenu, pays, selPays, {
      onChange: () => { updateCountsAndLabels(); buildHoursFromSelection(); renderFiltered(); }
    });
  } else {
    payMenu.innerHTML = "";
  }

  buildHoursFromSelection();
  updateCountsAndLabels();
  renderFiltered();

  if (lastSelectedStudent) renderSideFicha(lastSelectedStudent);

  t(`Listo. ${base.length} registros cargados para ${y}.`);
});

/* ===========================
   Init
=========================== */
async function init(){
  t("Cargando TSVs…");

  const years = Object.keys(TSV_URLS).sort((a,b)=>Number(b)-Number(a));
  for (const y of years){
    await loadYear(y, TSV_URLS[y]);
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    yearSelect.appendChild(opt);
  }

  // ✅ precarga estudiantes una vez (para orden + bolitas)
  try { await ensureStudents(); } catch(e) { /* no bloquea */ }

  if (years.length){
    yearSelect.value = years[0]; // 2026
    yearSelect.dispatchEvent(new Event("change"));
  } else {
    t("No hay años configurados.");
  }
}
init();