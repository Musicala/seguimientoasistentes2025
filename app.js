/* ===========================
   Fuentes TSV por año
=========================== */
const TSV_URLS = {
  "2023": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRL2kvbjxpU7qoPgiyoytANin1VsvqRx8BTZpSqBOJw_Lyid3NGPc88e3kwFiOsHpOPIgRricd64cin/pub?gid=1810443337&single=true&output=tsv",
  "2024": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhAIn0x5D-p80AVkXrBaLhVyqakoQabAvUw3UmEzoo__1AXaWXM1dfvdagWNkHGO4YY_Txxb7OQHM/pub?gid=1810443337&single=true&output=tsv",
  "2025": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv"
};

/* ===========================
   Mapeo de columnas por año (0-based)
   2024/2025: Nombre=Col4(3), Servicio=Col6(5), Hora=Col9(8)
   2023:      Nombre=Col C(2), Servicio=Col E(4), Hora=Col H(7)
=========================== */
const COLMAP = {
  "2023": { nombre:2, servicio:4, hora:7 },
  "2024": { nombre:3, servicio:5, hora:8 },
  "2025": { nombre:3, servicio:5, hora:8 },
};

/* ===========================
   Estado
=========================== */
let DATA = {}; // { "2023":[{nombre, servicio, hora}], ... }
let selectedServices = new Set();
let selectedHours    = new Set();

/* ===========================
   DOM
=========================== */
const yearSelect    = document.getElementById("yearSelect");
const serviceMenu   = document.getElementById("serviceMenu");
const serviceToggle = document.getElementById("serviceToggle");
const srvCountEl    = document.getElementById("srvCount");

const hourMenu      = document.getElementById("hourMenu");
const hourToggle    = document.getElementById("hourToggle");
const hourCountEl   = document.getElementById("hourCount");

const attendeesBox  = document.getElementById("attendeesBox");
const countBadge    = document.getElementById("countBadge");
const statusEl      = document.getElementById("status");

/* ===========================
   Utils
=========================== */
const parseTSV = (text) => text.trim().split("\n").map(r => r.split("\t"));
const t = (msg) => statusEl.textContent = msg;

/* Quita numeración inicial en servicio: "1 Cuerdas ..." -> "Cuerdas ..." */
function normalizeService(s) {
  if (!s) return "";
  return s.replace(/^\s*\d+\s*/,'').trim();
}

/* Construye un menú con buscador + checks */
function buildCheckMenu(container, items, selectedSet, onChange) {
  container.innerHTML = "";

  // Buscador
  const searchWrap = document.createElement("div");
  searchWrap.className = "menu-search";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Escribe para filtrar…";
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  // Contenedor de opciones
  const listWrap = document.createElement("div");
  container.appendChild(listWrap);

  function renderList(filterText=""){
    listWrap.innerHTML = "";
    const frag = document.createDocumentFragment();
    const f = filterText.trim().toLowerCase();

    items
      .filter(v => !f || v.toLowerCase().includes(f))
      .forEach(val => {
        const id = `${container.id}_${btoa(unescape(encodeURIComponent(val))).replace(/=+/g,'')}`;
        const label = document.createElement("label");
        label.className = "check";
        label.htmlFor = id;

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = id;
        input.value = val;
        input.checked = selectedSet.has(val);
        input.addEventListener("change", () => {
          if (input.checked) selectedSet.add(val); else selectedSet.delete(val);
          onChange();
        });

        const span = document.createElement("span");
        span.textContent = val;

        label.appendChild(input);
        label.appendChild(span);
        frag.appendChild(label);
      });

    if (!frag.childNodes.length){
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Sin coincidencias";
      listWrap.appendChild(empty);
    } else {
      listWrap.appendChild(frag);
    }
  }

  renderList();
  searchInput.addEventListener("input", () => renderList(searchInput.value));
}

function closeAllMenus(e){
  if (!e) return;
  const menus = [serviceMenu, hourMenu];
  const toggles = [serviceToggle, hourToggle];
  if (![...menus, ...toggles].some(el => el.contains(e.target))) {
    menus.forEach(m => m.classList.remove("open"));
  }
}

/* ===========================
   Carga (con cache-buster)
=========================== */
async function loadYear(year, url){
  const res  = await fetch(url + '&_ts=' + Date.now());
  const txt  = await res.text();
  const rows = parseTSV(txt);
  const idx  = COLMAP[year];

  const body = rows.slice(1) // quitar header
    .filter(r => r.length > Math.max(idx.nombre, idx.servicio, idx.hora));

  DATA[year] = body.map(r => ({
    nombre:  (r[idx.nombre]  || "").trim(),
    servicio: normalizeService(r[idx.servicio] || ""),
    hora:    (r[idx.hora]    || "").trim()
  })).filter(x => x.nombre && x.servicio && x.hora);
}

async function init(){
  t("Cargando datos…");
  for (const year of Object.keys(TSV_URLS).sort()) {
    await loadYear(year, TSV_URLS[year]);
    const opt = document.createElement("option");
    opt.value = year; opt.textContent = year;
    yearSelect.appendChild(opt);
  }
  t("Listo. Selecciona filtros.");
}
init();

/* ===========================
   Eventos de filtros
=========================== */
yearSelect.addEventListener("change", () => {
  selectedServices.clear();
  selectedHours.clear();
  srvCountEl.textContent = 0;
  hourCountEl.textContent = 0;
  serviceToggle.textContent = "Selecciona servicio(s) ▾";
  hourToggle.textContent = "Selecciona hora(s) ▾";
  serviceMenu.classList.remove("open");
  hourMenu.classList.remove("open");
  renderAttendees([]);

  const year = yearSelect.value;
  if (!year) {
    serviceMenu.innerHTML = "";
    hourMenu.innerHTML = "";
    return;
  }

  const servicios = [...new Set(DATA[year].map(d => d.servicio))].sort((a,b)=>a.localeCompare(b,'es'));
  buildCheckMenu(serviceMenu, servicios, selectedServices, () => {
    srvCountEl.textContent = selectedServices.size;
    buildHoursFromSelection();
    renderFiltered();
    serviceToggle.textContent = selectedServices.size ? `${selectedServices.size} seleccionado(s) ▾` : "Selecciona servicio(s) ▾";
  });
});

function buildHoursFromSelection(){
  const year = yearSelect.value;
  const base = DATA[year] || [];
  const horas = [...new Set(
    base
      .filter(d => selectedServices.size ? selectedServices.has(d.servicio) : true)
      .map(d => d.hora)
  )].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  selectedHours.forEach(h => { if (!horas.includes(h)) selectedHours.delete(h); });
  buildCheckMenu(hourMenu, horas, selectedHours, () => {
    hourCountEl.textContent = selectedHours.size;
    renderFiltered();
    hourToggle.textContent = selectedHours.size ? `${selectedHours.size} seleccionado(s) ▾` : "Selecciona hora(s) ▾";
  });
}

serviceToggle.addEventListener("click", () => {
  serviceMenu.classList.toggle("open");
  hourMenu.classList.remove("open");
});
hourToggle.addEventListener("click", () => {
  hourMenu.classList.toggle("open");
  serviceMenu.classList.remove("open");
});
document.addEventListener("click", closeAllMenus);

/* ===========================
   Render
=========================== */
function renderFiltered(){
  const year = yearSelect.value;
  if (!year) { renderAttendees([]); return; }

  const base = DATA[year] || [];
  const filtered = base.filter(d => {
    const byService = selectedServices.size ? selectedServices.has(d.servicio) : false;
    const byHour    = selectedHours.size ? selectedHours.has(d.hora) : false;
    return byService && byHour;
  });

  const nombres = [...new Set(filtered.map(d => d.nombre))].sort((a,b)=>a.localeCompare(b,'es'));
  renderAttendees(nombres);
}

function renderAttendees(nombres){
  attendeesBox.innerHTML = "";
  countBadge.textContent = nombres.length || 0;

  if (!nombres.length){
    attendeesBox.innerHTML = `<div class="empty">No hay registros para los filtros seleccionados.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  nombres.forEach(n => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = n;

    // Abrir Callcenter con hoja y búsqueda pre-cargada
    btn.addEventListener("click", () => {
      const base = (window.CALLCENTER_URL || "").trim();
      if (!base) return alert("CALLCENTER_URL no está configurada en index.html");
      const url = `${base}${base.includes('?') ? '&' : '?'}sheet=${encodeURIComponent('Estudiantes')}&q=${encodeURIComponent(n)}`;
      window.open(url, "_blank", "noopener");
    });

    frag.appendChild(btn);
  });
  attendeesBox.appendChild(frag);
}
