const MAP_CENTER = [-40.8, -72.4];
const MAP_ZOOM = 7;
const ASSETS_URL = "data/processed/activos_puntuales_validados.geojson";
const LINES_URL = "data/processed/lineas_validadas.geojson";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const POWERBI_FIRE_URL =
  "https://wabi-south-central-us-c-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true";

const POWERBI_FIRE_RESOURCE_KEY =
  "d6ce11e7-3c00-4399-93c0-83e9944031f9";

const map = L.map("fire-map", {
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  minZoom: 4,
  zoomControl: false,
  preferCanvas: true,
  doubleClickZoom: true
});
window.GridVisionFireMap = map;
L.control.zoom({ position: "topleft" }).addTo(map);
L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

// ======================================================
// GRIDVISION FIRE GPS V2 - ACTIVAR / DESACTIVAR / NAVEGACION LIBRE
// ======================================================
(() => {
    let seguimientoActivo = false;
    let primeraLectura = true;
    let marcador = null;
    let circuloPrecision = null;
    let boton = null;
    let ultimaLectura = null;

    const control = L.control({ position: "topleft" });

    function mostrarEstado() {
        if (!boton) return;
        boton.style.color = seguimientoActivo ? "#1976d2" : "#23313c";
        boton.style.backgroundColor = seguimientoActivo ? "#e1f0ff" : "white";
        boton.title = seguimientoActivo
            ? "Desactivar mi ubicacion actual"
            : "Activar mi ubicacion actual";
        boton.setAttribute("aria-label", boton.title);
        boton.setAttribute("aria-pressed", String(seguimientoActivo));
    }

    function desactivar() {
        seguimientoActivo = false;
        primeraLectura = true;
        ultimaLectura = null;
        map.stopLocate();
        if (marcador) {
            map.removeLayer(marcador);
            marcador = null;
        }
        if (circuloPrecision) {
            map.removeLayer(circuloPrecision);
            circuloPrecision = null;
        }
        mostrarEstado();
    }

    function activar() {
        seguimientoActivo = true;
        primeraLectura = true;
        mostrarEstado();
        map.locate({
            watch: true,
            setView: false,
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });
    }

    async function compartirUbicacion() {
        if (!ultimaLectura) return;
        const lat = ultimaLectura.latlng.lat.toFixed(6);
        const lng = ultimaLectura.latlng.lng.toFixed(6);
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        const texto = `Mi ubicacion actual: ${lat}, ${lng}\nPrecision aproximada: ${Math.round(ultimaLectura.accuracy)} m\n${url}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: "Mi ubicacion - GridVision Fire", text: texto });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(texto);
                alert("Ubicacion copiada al portapapeles.");
            } else {
                window.prompt("Copia tu ubicacion:", texto);
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                window.prompt("Copia tu ubicacion:", texto);
            }
        }
    }

    control.onAdd = function () {
        const contenedor = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        boton = L.DomUtil.create("a", "", contenedor);
        boton.href = "#";
        boton.innerHTML = `
<svg viewBox="0 0 24 24" width="20" height="20"
     aria-hidden="true">
  <circle cx="12" cy="12" r="4"
          fill="none" stroke="currentColor"
          stroke-width="2"/>
  <path d="M12 2V5 M12 19V22 M2 12H5 M19 12H22"
        fill="none" stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>
</svg>`;
        boton.style.cssText =
            "display:block;width:30px;height:30px;line-height:30px;" +
            "font-size:24px;text-align:center;font-weight:bold;cursor:pointer;";

        L.DomEvent.disableClickPropagation(contenedor);
        L.DomEvent.disableScrollPropagation(contenedor);
        L.DomEvent.on(boton, "click", function (e) {
            L.DomEvent.stop(e);
            if (seguimientoActivo) desactivar();
            else activar();
        });
        mostrarEstado();
        return contenedor;
    };
    control.addTo(map);

    map.on("locationfound", function (e) {
        if (!seguimientoActivo) return;
        ultimaLectura = { latlng: e.latlng, accuracy: e.accuracy };

        if (!marcador) {
            marcador = L.circleMarker(e.latlng, {
                radius: 8,
                color: "#ffffff",
                weight: 3,
                fillColor: "#1976d2",
                fillOpacity: 1
            }).addTo(map);
            marcador.bindPopup("");
            marcador.on("popupopen", function (evento) {
                const popup = evento.popup.getElement();
                const compartir = popup && popup.querySelector(".gv-fire-share-gps");
                if (compartir) compartir.addEventListener("click", compartirUbicacion);
            });
        } else {
            marcador.setLatLng(e.latlng);
        }

        if (!circuloPrecision) {
            circuloPrecision = L.circle(e.latlng, {
                radius: e.accuracy,
                interactive: false,
                color: "#1976d2",
                weight: 1,
                fillColor: "#1976d2",
                fillOpacity: 0.12
            }).addTo(map);
        } else {
            circuloPrecision.setLatLng(e.latlng);
            circuloPrecision.setRadius(e.accuracy);
        }

        const contenido =
            "<strong>Mi ubicacion actual</strong>" +
            "<br>Latitud: " + e.latlng.lat.toFixed(6) +
            "<br>Longitud: " + e.latlng.lng.toFixed(6) +
            "<br>Precision aproximada: " + Math.round(e.accuracy) + " m" +
            '<br><br><button type="button" class="gv-fire-share-gps">Compartir ubicacion</button>';
        marcador.setPopupContent(contenido);

        // Solo se centra al iniciar el GPS, nunca en las actualizaciones.
        if (primeraLectura) {
            primeraLectura = false;
            map.setView(e.latlng, 17);
        }
    });

    map.on("locationerror", function (e) {
        if (!seguimientoActivo) return;
        console.warn("GridVision Fire GPS:", e.message);
        desactivar();
        alert("No se pudo obtener la ubicacion. Comprueba los permisos GPS del navegador.");
    });
})();

/* =========================================================
   CONTROLES CARTOGRAFICOS - GRIDVISION FIRE
   ========================================================= */




const fireLineLegend = L.control({ position: "bottomright" });

fireLineLegend.onAdd = function () {
  const div = L.DomUtil.create(
    "div",
    "gv-fire-line-legend leaflet-control"
  );

  div.style.cssText = `
    min-width:190px;
    margin:8px;
    padding:11px 13px;
    box-sizing:border-box;
    background:rgba(255,255,255,0.97);
    color:#17212b;
    border:1px solid rgba(0,0,0,0.16);
    border-radius:10px;
    box-shadow:0 2px 10px rgba(0,0,0,0.28);
    font-family:inherit;
  `;

  div.innerHTML = `
    <div style="
      margin:0 0 8px 0;
      color:#17212b;
      font-size:13px;
      font-weight:800;
      line-height:17px;
    ">
      Tensión de líneas
    </div>

    <div style="
      display:flex;
      align-items:center;
      gap:9px;
      min-height:21px;
      color:#26323d;
      font-size:12px;
    ">
      <span style="
        display:inline-block;
        width:30px;
        height:4px;
        background:#8e24aa;
        border-radius:3px;
      "></span>
      <span>500 kV</span>
    </div>

    <div style="
      display:flex;
      align-items:center;
      gap:9px;
      min-height:21px;
      color:#26323d;
      font-size:12px;
    ">
      <span style="
        display:inline-block;
        width:30px;
        height:4px;
        background:#d32f2f;
        border-radius:3px;
      "></span>
      <span>220–345 kV</span>
    </div>

    <div style="
      display:flex;
      align-items:center;
      gap:9px;
      min-height:21px;
      color:#26323d;
      font-size:12px;
    ">
      <span style="
        display:inline-block;
        width:30px;
        height:4px;
        background:#f57c00;
        border-radius:3px;
      "></span>
      <span>110–154 kV</span>
    </div>

    <div style="
      display:flex;
      align-items:center;
      gap:9px;
      min-height:21px;
      color:#26323d;
      font-size:12px;
    ">
      <span style="
        display:inline-block;
        width:30px;
        height:4px;
        background:#1976d2;
        border-radius:3px;
      "></span>
      <span>66–69 kV</span>
    </div>

    <div style="
      display:flex;
      align-items:center;
      gap:9px;
      min-height:21px;
      color:#26323d;
      font-size:12px;
    ">
      <span style="
        display:inline-block;
        width:30px;
        height:4px;
        background:#607d8b;
        border-radius:3px;
      "></span>
      <span>Otras tensiones</span>
    </div>
  `;

  L.DomEvent.disableClickPropagation(div);

  return div;
};

fireLineLegend.addTo(map);

const satellite = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, maxNativeZoom: 12, attribution: "Tiles © Esri - Sources: Esri, Maxar, Earthstar Geographics and the GIS User Community" }
).addTo(map);
const mapLabels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    opacity: 1,
    attribution: "Labels © Esri"
  }
).addTo(map);

// GV FIRE: SATELITE SEGURO FIJO v0.3 (sin selector visible)
// Esri World Imagery: maxNativeZoom=12, maxZoom=19.
// No se crea selector de modos ni capa satelital duplicada.
// Zoom superior: Leaflet amplia el mosaico del nivel 12.

const layers = {
  fires: L.layerGroup().addTo(map),
  assets: L.layerGroup().addTo(map),
  lines: L.layerGroup().addTo(map),
  radius: L.layerGroup().addTo(map),
  measures: L.layerGroup().addTo(map)
};

let fires = [];
let assets = [];
let linesGeo = null;
let selectedFire = null;
let currentFiltered = [];
let measureMode = null;
let measurePoints = [];
let measureLine = null;
let measureCircle = null;
let measureMarkers = [];
let measureLabel = null;
let windLayer = null;
let selectedFireWeather = null;

const $ = (id) => document.getElementById(id);

// GV FIRE V2.0.3 - last successful query, never a live alert offline.
const GV_FIRE_SNAPSHOT_KEY = 'gv-fire-last-valid-query-v203';
const GV_FIRE_POLL_MS = 5 * 60 * 1000;
let gvFireMode = 'unavailable';
let gvFireSnapshot = null;
let gvFireStored = false;
let gvFireBusy = false;
let gvFireAssetsReady = false;
let gvFireController = null;
let gvFireLastAttempt = 0;

function gvFireStateKey(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function gvFireIsCurrent(f) {
  return ['en combate','bajo observacion','observacion','controlado'].includes(gvFireStateKey(f.estado));
}
function gvFireValidRow(f) {
  return f && Number.isFinite(f.lat) && Number.isFinite(f.lon) &&
    f.lat >= -90 && f.lat <= 90 && f.lon >= -180 && f.lon <= 180 &&
    typeof f.nombre === 'string' && !!f.nombre.trim() && typeof f.estado === 'string' && !!f.estado.trim();
}
function gvFireCompact(f) {
  const estado = gvFireStateKey(f.estado);
  return {lat:f.lat,lon:f.lon,nombre:f.nombre,region:String(f.region??''),comuna:String(f.comuna??''),
    ambito:String(f.ambito??''),f_inicio:f.f_inicio??null,
    estado:estado==='en combate'?'En combate':estado==='controlado'?'Controlado':'Bajo observacion',
    superficie_ha:Number.isFinite(f.superficie_ha)?f.superficie_ha:null};
}
function gvFireReadSnapshot() {
  if (gvFireSnapshot) return gvFireSnapshot;
  try {
    const s=JSON.parse(localStorage.getItem(GV_FIRE_SNAPSHOT_KEY)||'null');
    if(s?.schema===203 && Number.isFinite(Date.parse(s.receivedAt)) &&
       Array.isArray(s.rows) && s.rows.every(f=>gvFireValidRow(f)&&gvFireIsCurrent(f))) {
      gvFireSnapshot=s; gvFireStored=true; return s;
    }
  } catch(e) { console.warn('Fire: respaldo no disponible',e); }
  return null;
}
function gvFireSaveSnapshot(rows,sourceTimestamp) {
  const s={schema:203,receivedAt:new Date().toISOString(),sourceTimestamp:sourceTimestamp??null,
    rows:rows.filter(gvFireIsCurrent).map(gvFireCompact)};
  gvFireSnapshot=s;gvFireStored=false;
  try {localStorage.setItem(GV_FIRE_SNAPSHOT_KEY,JSON.stringify(s));gvFireStored=true;}
  catch(e){console.warn('Fire: no se pudo guardar el respaldo persistente',e);}
  return s;
}
window.GridVisionFireSnapshotV203 = {version:'gv-fire-v204-20261112', get status(){return gvFireMode;}, get receivedAt(){return gvFireSnapshot?.receivedAt??null;}, get count(){return gvFireSnapshot?.rows.length??null;}, get persisted(){return gvFireStored;}};
function gvFireFormatTime(value) {
  const d=new Date(value);return value!=null&&Number.isFinite(d.getTime())?d.toLocaleString('es-CL',{timeZone:'America/Santiago',hour12:false}):'sin fecha disponible';
}
function gvFirePaintStatus() {
  const saved=gvFireMode==='snapshot';
  const totalLabel = $('kpi-total')?.parentElement?.querySelector('small');
  if (totalLabel) totalLabel.textContent =
    saved ? 'Vigentes en copia' : 'Incendios CONAF vigentes';

  const live=gvFireMode==='live'&&navigator.onLine;
  document.body.classList.toggle('gv-fire-snapshot',saved);
  document.body.classList.toggle('gv-nav-live-stale',!live);
  const s=gvFireSnapshot;
  const date=gvFireFormatTime(s?.receivedAt);
  const banner=$('gv-fire-backup-status');
  if(banner) {
    banner.dataset.mode=live?'live':saved?'snapshot':'unavailable';
    banner.textContent=live
      ? 'Power BI · Última consulta exitosa: '+date+(gvFireStored?' · Respaldo de vigentes guardado':' · Respaldo no persistente')
      : saved ? 'SIN ACTUALIZACIÓN EN VIVO · Última copia: '+date+' · '+s.rows.length+' incendios registrados entonces como vigentes. Estado actual desconocido.'
      : 'INCENDIOS SIN DATOS · No hay respaldo válido. No implica ausencia de incendios.';
  }
  $('map-status').textContent=live?`${currentFiltered.length} incendios · Power BI`:saved?'Copia de referencia · no en vivo':'Incendios sin datos';
  if(!live) $('table-count').textContent=saved?`${currentFiltered.length} registros de la copia`:'Sin datos';
  for(const id of ['kpi-total','kpi-critical','kpi-attention','kpi-watch']) {
    const el=$(id);if(!el)continue;
    if(!live&&!saved)el.textContent='—';
    el.setAttribute('aria-label',live?'Consulta Power BI: '+el.textContent:saved?'Última copia, no estado actual: '+el.textContent:'Sin datos de incendios');
  }
  if(!live&&!currentFiltered.length) {
    const detail=$('detail-panel');
    if(detail)detail.innerHTML='<div class="detail-empty"><div class="detail-icon">🔥</div><h2>'+ (saved?'Sin registros en esta copia':'Incendios sin datos') +'</h2><p>El estado actual no está disponible. No implica ausencia de incendios.</p></div>';
  }
}
function gvFireRenderRows(rows,mode,sourceTimestamp) {
  const selectedRegion=$('filter-region').value;
  gvFireMode=mode; window.GV_POWERBI_TIMESTAMP=sourceTimestamp??null;
  selectedFire=null;selectedFireWeather=null;clearWindLayer();
  fires=rows.map(enrichFire);
  initRegions();
  if([...$('filter-region').options].some(o=>o.value===selectedRegion))$('filter-region').value=selectedRegion;
  applyFilters();
}
function gvFireUseSnapshot() {
  const s=gvFireReadSnapshot();
  gvFireRenderRows(s?.rows||[],s?'snapshot':'unavailable',s?.sourceTimestamp);
}
async function gvFireRefresh() {
  if(gvFireBusy||!gvFireAssetsReady)return;
  if(!navigator.onLine){gvFireUseSnapshot();return;}
  gvFireBusy=true;gvFireLastAttempt=Date.now();
  const controller=new AbortController();gvFireController=controller;
  const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const result=await loadFires(controller.signal);
    if(controller.signal.aborted||!navigator.onLine)throw new Error('Conexión interrumpida');
    gvFireSaveSnapshot(result.rows,result.sourceTimestamp);
    gvFireRenderRows(result.rows,'live',result.sourceTimestamp);
  } catch(e) {
    console.warn('Fire: consulta no disponible; usando última copia válida',e);
    gvFireUseSnapshot();
  } finally {
    clearTimeout(timer);gvFireController=null;gvFireBusy=false;
  }
}


function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function riskForDistance(km) {
  if (km < 2) return "Crítico";
  if (km <= 5) return "Atención";
  if (km <= 10) return "Vigilancia";
  return "Sin proximidad";
}

function riskClass(risk) {
  return risk === "Crítico" ? "critico" : risk === "Atención" ? "atencion" : risk === "Vigilancia" ? "vigilancia" : "sin";
}

function markerClass(risk) {
  return risk === "Crítico" ? "" : risk === "Atención" ? "attention" : risk === "Vigilancia" ? "watch" : "none";
}

function iconFire(risk) {
  return L.divIcon({ className: "", html: `<div class="fire-marker ${markerClass(risk)}">🔥</div>`, iconSize: [32,32], iconAnchor: [16,16], popupAnchor: [0,-16] });
}

function iconAsset(categoria) {
  const cls = categoria === "Subestación" ? "sub" : categoria === "Central" ? "central" : "";
  return L.divIcon({ className: "", html: `<div class="asset-marker ${cls}"></div>`, iconSize: [12,12], iconAnchor: [6,6] });
}

function nearestAssets(lat, lon) {
  return assets
    .map(a => ({ ...a, distance: haversineKm(lat, lon, a.lat, a.lon) }))
    .sort((a,b) => a.distance - b.distance);
}

function enrichFire(fire) {
  const near = nearestAssets(fire.lat, fire.lon);
  const closest = near[0] || null;
  return { ...fire, nearest: closest, distanceKm: closest?.distance ?? Infinity, risk: riskForDistance(closest?.distance ?? Infinity), nearby: near.slice(0,5) };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function prop(props, keys, fallback = "—") {
  for (const key of keys) {
    const value = props?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function normalizeAsset(feature) {
  const props = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  return {
    lat: Number(lat),
    lon: Number(lon),
    id: String(prop(props, ["id", "ID", "codigo", "Código", "cod", "NE"], "")),
    nombre: String(prop(props, ["nombre", "Nombre", "name", "NAME", "descripcion", "Descripción"], "Activo")),
    categoria: String(prop(props, ["categoria", "Categoría", "category", "tipo", "Tipo"], "Activo puntual")),
    subcategoria: String(prop(props, ["subcategoria", "Subcategoría", "subtipo", "Subtipo"], "")),
    tension: String(prop(props, ["tension", "Tensión", "nivel_tension", "Nivel de tensión", "voltaje", "Voltage", "nivel"], "—")),
    comuna: String(prop(props, ["comuna", "Comuna"], "—")),
    region: String(prop(props, ["region", "Región"], "—")),
    props
  };
}

function formatCoord(value) {
  return Number(value).toFixed(5);
}

function assetPopupBase(asset) {
  const rows = [
    ["Categoría", asset.categoria],
    ["Subcategoría", asset.subcategoria],
    ["ID / Código", asset.id],
    ["Tensión", asset.tension],
    ["Comuna", asset.comuna],
    ["Región", asset.region],
    ["Coordenadas", `${formatCoord(asset.lat)}, ${formatCoord(asset.lon)}`]
  ].filter(([,value]) => value !== "—" && value !== "");

  return `<div class="asset-popup"><h3>${escapeHtml(asset.nombre)}</h3><div class="popup-meta">Infraestructura eléctrica · GridVision</div><div class="popup-info-grid">${rows.map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div id="asset-weather-${escapeHtml(asset.id || `${asset.lat}-${asset.lon}`)}" class="popup-weather"><div class="popup-loading">Consultando meteorología de Open-Meteo…</div></div><a class="popup-link" href="index.html" target="_blank" rel="noopener noreferrer">Abrir GridVision Clima ↗</a></div>`;
}

function lineProperties(feature) {
  const props = feature.properties || {};
  return {
    id: String(prop(props, ["id", "ID", "codigo", "Código", "cod"], "")),
    nombre: String(prop(props, ["nombre", "Nombre", "name", "NAME", "linea", "Línea", "circuito", "Circuito", "tramo", "Tramo"], "Línea eléctrica")),
    tension: String(prop(props, ["tension", "Tensión", "nivel_tension", "Nivel de tensión", "voltaje", "Voltage", "nivel"], "—")),
    origen: String(prop(props, ["origen", "Origen", "subestacion_origen", "Subestación origen", "desde", "Desde"], "—")),
    destino: String(prop(props, ["destino", "Destino", "subestacion_destino", "Subestación destino", "hasta", "Hasta"], "—")),
    circuito: String(prop(props, ["circuito", "Circuito", "circuit", "tramo", "Tramo"], "—")),
    estado: String(prop(props, ["estado", "Estado", "status"], "—")),
    props
  };
}

function geometryLengthKm(geometry) {
  if (!geometry) return 0;
  const segmentLength = (a,b) => haversineKm(Number(a[1]), Number(a[0]), Number(b[1]), Number(b[0]));
  const lineLength = coords => {
    let total = 0;
    for (let i = 1; i < coords.length; i += 1) total += segmentLength(coords[i - 1], coords[i]);
    return total;
  };
  if (geometry.type === "LineString") return lineLength(geometry.coordinates);
  if (geometry.type === "MultiLineString") return geometry.coordinates.reduce((sum, line) => sum + lineLength(line), 0);
  return 0;
}

function midpointOfGeometry(geometry) {
  if (!geometry) return null;
  const coords = geometry.type === "LineString" ? geometry.coordinates : geometry.type === "MultiLineString" ? geometry.coordinates.flat() : [];
  if (!coords.length) return null;
  const mid = coords[Math.floor(coords.length / 2)];
  return [Number(mid[1]), Number(mid[0])];
}

function linePopupHtml(line, latlng, feature) {
  const p = lineProperties(feature);
  const length = geometryLengthKm(feature.geometry);
  const rows = [
    ["ID / Código", p.id],
    ["Tensión", p.tension],
    ["Origen", p.origen],
    ["Destino", p.destino],
    ["Circuito / tramo", p.circuito],
    ["Estado", p.estado],
    ["Longitud geométrica", length > 0 ? `${length.toFixed(1)} km` : "—"]
  ].filter(([,value]) => value !== "—" && value !== "");

  const weatherId = `line-weather-${Math.random().toString(36).slice(2)}`;
  return {
    html: `<div class="line-popup"><h3>${escapeHtml(p.nombre)}</h3><div class="popup-meta">Línea eléctrica · GridVision</div><div class="popup-info-grid">${rows.map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div id="${weatherId}" class="popup-weather"><div class="popup-loading">Consultando meteorología en el punto seleccionado…</div></div><a class="popup-link" href="index.html" target="_blank" rel="noopener noreferrer">Abrir GridVision Clima ↗</a></div>`,
    weatherId,
    lat: latlng.lat,
    lon: latlng.lng
  };
}

async function loadPointWeather(lat, lon, containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if(!navigator.onLine){box.textContent="Sin conexión · meteorología no disponible.";return;}
  const url = `${OPEN_METEO}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=precipitation,temperature_2m,wind_speed_10m,wind_gusts_10m&forecast_days=1&timezone=auto`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Open-Meteo respondió con error");
    const d = await r.json();
    const c = d.current || {};
    const times = Array.isArray(d.hourly?.time) ? d.hourly.time : [];
    const precipitation = Array.isArray(d.hourly?.precipitation) ? d.hourly.precipitation : [];
    const now = Date.parse(c.time || "");
    let idx = times.findIndex(t => Date.parse(t) >= now);
    if (idx < 0) idx = 0;
    const sumNextHours = (hours) => precipitation.slice(idx, idx + hours).filter(Number.isFinite).reduce((a,b) => a + b, 0);
    const temp = Number(c.temperature_2m);
    const wind = Number(c.wind_speed_10m);
    const gust = Number(c.wind_gusts_10m);
    const humidity = Number(c.relative_humidity_2m);
    const rain = Number(c.precipitation);
    box.innerHTML = `<div class="weather-main"><strong>${Number.isFinite(temp) ? temp.toFixed(1) : "—"} °C</strong><span>${windDir(c.wind_direction_10m)} · ${Number.isFinite(wind) ? wind.toFixed(0) : "—"} km/h</span></div><div class="popup-weather-grid"><div><span>Ráfaga</span><b>${Number.isFinite(gust) ? gust.toFixed(0) : "—"} km/h</b></div><div><span>Humedad</span><b>${Number.isFinite(humidity) ? humidity.toFixed(0) : "—"} %</b></div><div><span>Precip. 1 h</span><b>${Number.isFinite(rain) ? rain.toFixed(1) : "—"} mm</b></div><div><span>Próx. 3 h</span><b>${sumNextHours(3).toFixed(1)} mm</b></div><div><span>Próx. 6 h</span><b>${sumNextHours(6).toFixed(1)} mm</b></div><div><span>Punto</span><b>${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}</b></div></div>`;
  } catch (e) {
    box.innerHTML = `<div class="popup-loading">No fue posible consultar Open-Meteo en este momento.</div>`;
  }
}

function bindAssetPopup(asset, marker) {
  const popupId = `asset-weather-${String(asset.id || `${asset.lat}-${asset.lon}`).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const html = assetPopupBase(asset).replace(/asset-weather-[^\"]+/, popupId);
  marker.bindPopup(html, { maxWidth: 320, className: "gv-fire-popup" });
  marker.on("popupopen", () => { void loadPointWeather(asset.lat, asset.lon, popupId); });
}

function loadAssets() {
  return fetch(ASSETS_URL).then(r => r.json()).then(data => {
    assets = data.features.map(normalizeAsset).filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon));
    assets.forEach(a => {
      const m = L.marker([a.lat, a.lon], { icon: iconAsset(a.categoria), interactive: true });
      m.bindTooltip(a.nombre, { direction: "top", offset: [0,-7] });
      bindAssetPopup(a, m);
      layers.assets.addLayer(m);
    });
  });
}

function lineVoltageClass(feature) {
  const p = lineProperties(feature);
  const text = String(p.nombre || "").toUpperCase();

  const match = text.match(/(\d+(?:[.,]\d+)?)\s*KV\b/);
  const kv = match ? Number(match[1].replace(",", ".")) : NaN;

  if (kv === 500) return "trazo-500";
  if (kv === 220 || kv === 345) return "trazo-220";
  if (kv === 110 || kv === 154) return "trazo-110";
  if (kv === 66 || kv === 69) return "trazo-66";

  return "trazo-otras";
}

function lineStyle(feature) {
  const clase = lineVoltageClass(feature);

  const estilos = {
    "trazo-500":   { color: "#8e24aa", weight: 3.2, opacity: 0.90 },
    "trazo-220":   { color: "#d32f2f", weight: 2.8, opacity: 0.90 },
    "trazo-110":   { color: "#f57c00", weight: 2.4, opacity: 0.88 },
    "trazo-66":    { color: "#1976d2", weight: 2.1, opacity: 0.86 },
    "trazo-otras": { color: "#607d8b", weight: 1.7, opacity: 0.78 }
  };

  return estilos[clase];
}
function loadLines() {
  return fetch(LINES_URL).then(r => r.json()).then(data => {
    linesGeo = data;
    L.geoJSON(data, {
      style: lineStyle,
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(lineProperties(feature).nombre, { sticky: true });
        layer.on("click", (event) => {
          const popup = linePopupHtml(lineProperties(feature), event.latlng, feature);
          layer.bindPopup(popup.html, { maxWidth: 320, className: "gv-fire-popup" }).openPopup(event.latlng);
          setTimeout(() => { void loadPointWeather(popup.lat, popup.lon, popup.weatherId); }, 0);
        });
      }
    }).addTo(layers.lines);
  }).catch(err => {
    console.warn("No fue posible cargar líneas", err);
  });
}
async function loadFires(signal) {
  console.log("GridVision Fire: consultando Power BI...");

  const response = await fetch(POWERBI_FIRE_URL, {
    method: "POST",
    signal,
    headers: {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      "x-powerbi-resourcekey": POWERBI_FIRE_RESOURCE_KEY
    },
    body: JSON.stringify({
      version: "1.0.0",
      queries: [{
        Query: {
          Commands: [{
            SemanticQueryDataShapeCommand: {
              Query: {
                Version: 2,
                From: [{
                  Name: "i",
                  Entity: "Incendios T25-26",
                  Type: 0
                }],
                Select: [
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "lat"
                    },
                    Name: "Incendios T25-26.lat"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "lon"
                    },
                    Name: "Incendios T25-26.lon"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "f_inicio"
                    },
                    Name: "Incendios T25-26.f_inicio"
                  },
                  {
                    Aggregation: {
                      Expression: {
                        Column: {
                          Expression: { SourceRef: { Source: "i" } },
                          Property: "sup_total"
                        }
                      },
                      Function: 0
                    },
                    Name: "Sum(Incendios T25-26.sup_total)"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "nombre"
                    },
                    Name: "Incendios T25-26.nombre"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "region"
                    },
                    Name: "Incendios T25-26.region"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "comuna"
                    },
                    Name: "Incendios T25-26.comuna"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "ambito"
                    },
                    Name: "Incendios T25-26.ambito"
                  },
                  {
                    Column: {
                      Expression: { SourceRef: { Source: "i" } },
                      Property: "estado"
                    },
                    Name: "Incendios T25-26.estado"
                  }
                ],
                Where: [
                  {
                    Condition: {
                      And: {
                        Left: {
                          Not: {
                            Expression: {
                              Comparison: {
                                ComparisonKind: 0,
                                Left: {
                                  Column: {
                                    Expression: {
                                      SourceRef: { Source: "i" }
                                    },
                                    Property: "lat"
                                  }
                                },
                                Right: {
                                  Literal: { Value: "null" }
                                }
                              }
                            }
                          }
                        },
                        Right: {
                          Comparison: {
                            ComparisonKind: 1,
                            Left: {
                              Column: {
                                Expression: {
                                  SourceRef: { Source: "i" }
                                },
                                Property: "lat"
                              }
                            },
                            Right: {
                              Literal: { Value: "-100L" }
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    Condition: {
                      Not: {
                        Expression: {
                          Comparison: {
                            ComparisonKind: 0,
                            Left: {
                              Column: {
                                Expression: {
                                  SourceRef: { Source: "i" }
                                },
                                Property: "lon"
                              }
                            },
                            Right: {
                              Literal: { Value: "null" }
                            }
                          }
                        }
                      }
                    }
                  }
                ],
                OrderBy: [{
                  Direction: 2,
                  Expression: {
                    Aggregation: {
                      Expression: {
                        Column: {
                          Expression: {
                            SourceRef: { Source: "i" }
                          },
                          Property: "sup_total"
                        }
                      },
                      Function: 0
                    }
                  }
                }]
              },
              Binding: {
                Primary: {
                  Groupings: [{
                    Projections: [0,1,2,3,4,5,6,7,8]
                  }]
                },
                DataReduction: {
                  DataVolume: 3,
                  Primary: {
                    Sample: {
                      Count: 30000
                    }
                  }
                },
                Version: 1
              },
              ExecutionMetricsKind: 1
            }
          }]
        },
        CacheKey: "",
        QueryId: "",
        ApplicationContext: {
          DatasetId: "578431c4-b650-46be-9649-a40b4a8c5a88",
          Sources: [{
            ReportId: "3173e752-3a8d-492b-b680-2ceeb92da548",
            VisualId: "13d01d2003eee9138603"
          }]
        }
      }],
      cancelQueries: [],
      modelId: 2213491
    })
  });

  console.log("Power BI HTTP:", response.status);

  if (!response.ok) {
    throw new Error(`Power BI respondió HTTP ${response.status}`);
  }

  const data = await response.json();

  window.GV_POWERBI_RESPONSE = data;

 window.GV_POWERBI_TIMESTAMP =
  data.results?.[0]?.result?.data?.timestamp || null;

 console.log(
  "Consulta Power BI:",
  window.GV_POWERBI_TIMESTAMP
);
  const dm0 =
    data.results[0].result.data.dsr.DS[0].PH[0].DM0;

  // Decodificar formato comprimido de Power BI
  if (!Array.isArray(dm0) || !dm0.length || dm0.length >= 30000) throw new Error('Respuesta de incendios vacía o potencialmente truncada');
  const rows = [];
  let previous = new Array(9).fill(null);

  for (const item of dm0) {
    const values = [];
    let c = 0;

    for (let i = 0; i < 9; i++) {
      const repeated = item.R != null && (item.R & (1 << i));

      if (repeated) {
        values[i] = previous[i];
      } else {
        values[i] = item.C?.[c++];
      }
    }

    previous = values;

    rows.push({
      lat: values[0] == null || values[0] === "" ? NaN : Number(values[0]),
      lon: values[1] == null || values[1] === "" ? NaN : Number(values[1]),
      f_inicio: values[2],
      nombre: values[3],
      region: values[4],
      comuna: values[5],
      ambito: values[6],
      estado: values[7],
      superficie_ha: Number(values[8] ?? 0)
    });
  }

  if (rows.some(f=>gvFireIsCurrent(f)&&!gvFireValidRow(f))) throw new Error('Respuesta con incendios vigentes sin datos geográficos válidos');
  const validRows=rows.filter(gvFireValidRow);
  if(!validRows.length)throw new Error('Respuesta sin registros válidos');
  return {rows:validRows,sourceTimestamp:window.GV_POWERBI_TIMESTAMP};
}
function bearingDeg(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function windToBearing(fromDeg) {
  const n = Number(fromDeg);
  return Number.isFinite(n) ? (n + 180) % 360 : null;
}

function bearingLabel(deg) {
  if (!Number.isFinite(Number(deg))) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(Number(deg) / 22.5) % 16];
}

function windExposure(asset, fire, windFromDeg, windSpeed) {
  const speed = Number(windSpeed);
  const to = windToBearing(windFromDeg);
  if (!Number.isFinite(to) || !Number.isFinite(speed)) return { label: 'Sin evaluación', cls: 'neutral', detail: 'Sin datos de viento.' };
  if (speed < 5) return { label: 'Viento débil', cls: 'weak', detail: 'Indicador no concluyente con viento < 5 km/h.' };
  const bearingFireToAsset = bearingDeg(fire.lat, fire.lon, asset.lat, asset.lon);
  const delta = angleDifference(bearingFireToAsset, to);
  if (delta <= 45) return { label: 'A sotavento', cls: 'downwind', detail: `Activo ${bearingLabel(bearingFireToAsset)} del incendio; viento hacia ${bearingLabel(to)}.` };
  if (delta >= 135) return { label: 'A barlovento', cls: 'upwind', detail: `Activo ${bearingLabel(bearingFireToAsset)} del incendio; viento hacia ${bearingLabel(to)}.` };
  return { label: 'Lateral al viento', cls: 'crosswind', detail: `Activo ${bearingLabel(bearingFireToAsset)} del incendio; viento hacia ${bearingLabel(to)}.` };
}

function clearWindLayer() {
  if (windLayer) {
    layers.radius.removeLayer(windLayer);
    windLayer = null;
  }
}

function drawWindArrow(fire, windFromDeg, windSpeed) {
  clearWindLayer();

  const to = windToBearing(windFromDeg);
  if (!Number.isFinite(to)) return;

  const speed = Number(windSpeed || 0);
  const rad = Math.PI / 180;

  const lat1 = fire.lat;
  const lon1 = fire.lon;

  function pointAt(bearingDeg, distanceKm) {
    const bearing = bearingDeg * rad;
    const d = distanceKm / 111.32;

    return [
      lat1 + d * Math.cos(bearing),
      lon1 + d * Math.sin(bearing) / Math.cos(lat1 * rad)
    ];
  }

  // Longitud de la flecha según velocidad del viento
  const distanceKm = Math.max(
    0.8,
    Math.min(4.0, 1.2 + speed * 0.08)
  );

  // Radio máximo de la zona de sotavento
  // Tamaño del abanico según intensidad del viento.
  // Se mantiene deliberadamente acotado para no representar
  // una predicción de propagación del incendio.
  let sectorRadiusKm;
  let halfAngle;

  if (speed < 5) {
    sectorRadiusKm = 1.3;
    halfAngle = 24;
  } else if (speed < 15) {
    sectorRadiusKm = 2.4 + (speed - 5) * 0.08;
    halfAngle = 28;
  } else {
    sectorRadiusKm = Math.min(
      4.0,
      3.2 + (speed - 15) * 0.05
    );
    halfAngle = 32;
  }



  const endPoint = pointAt(to, distanceKm);

  const lat2 = endPoint[0];
  const lon2 = endPoint[1];

  // -----------------------------------------------------
  // FLECHA DE VIENTO
  // -----------------------------------------------------

  const headSize = Math.max(
    0.12,
    distanceKm * 0.09
  );

  const h1 = (to + 150) * rad;
  const h2 = (to - 150) * rad;

  const latH1 =
    lat2 +
    (headSize / 111.32) * Math.cos(h1);

  const lonH1 =
    lon2 +
    (headSize / 111.32) *
    Math.sin(h1) /
    Math.cos(lat1 * rad);

  const latH2 =
    lat2 +
    (headSize / 111.32) * Math.cos(h2);

  const lonH2 =
    lon2 +
    (headSize / 111.32) *
    Math.sin(h2) /
    Math.cos(lat1 * rad);

  const group = L.layerGroup();

    // -----------------------------------------------------
  // REPRESENTACIÓN DEL VIENTO
  // -----------------------------------------------------



   if (speed < 5) {

  // Viento débil:
  // no se representa gráficamente sobre el mapa.
  // La condición queda informada en el panel meteorológico.

  return;

} else {

    // ---------------------------------------------------
    // ZONA DE SOTAVENTO
    // ---------------------------------------------------

    const sectorPoints = [
      [lat1, lon1]
    ];

    for (
      let angle = -halfAngle;
      angle <= halfAngle;
      angle += 4
    ) {
      const p = pointAt(
        to + angle,
        sectorRadiusKm
      );

      sectorPoints.push(p);
    }

    sectorPoints.push([lat1, lon1]);

    L.polygon(
      sectorPoints,
      {
        color: '#ff9f43',
        weight: 1.5,
        opacity: 0.85,
        fillColor: '#ff9f43',
        fillOpacity: speed < 15 ? 0.06 : 0.09,
        dashArray: '7 5'
      }
    ).addTo(group);

    
    // ---------------------------------------------------
    // FLECHA DE VIENTO
    // ---------------------------------------------------

    L.polyline(
      [[lat1, lon1], [lat2, lon2]],
      {
        color: '#62d9ff',
        weight: 4,
        opacity: 0.95
      }
    ).addTo(group);

    L.polyline(
      [
        [latH1, lonH1],
        [lat2, lon2],
        [latH2, lonH2]
      ],
      {
        color: '#62d9ff',
        weight: 4,
        opacity: 0.95
      }
    ).addTo(group);

    // ---------------------------------------------------
    // ETIQUETA DE VIENTO + SOTAVENTO
    // ---------------------------------------------------

    const labelPoint = pointAt(
      to -22,
      sectorRadiusKm * 0.72
    );

    L.marker(
      labelPoint,
      {
        icon: L.divIcon({
          className: '',
          html:
            '<div class="wind-arrow-label">' +
            'VIENTO → ' +
            bearingLabel(to) +
            ' · ' +
            speed.toFixed(0) +
            ' km/h · SOTAVENTO' +
            '</div>',
          iconSize: [220, 24],
          iconAnchor: [110, 12]
        })
      }
    ).addTo(group);

  }

  group.addTo(layers.radius);

  windLayer = group;
}
function renderFires(list) {

  layers.fires.clearLayers();
  layers.radius.clearLayers();
  windLayer = null;

  list.forEach(fire => {

    // -----------------------------------------------------
    // INCENDIO
    // -----------------------------------------------------

    const marker = L.marker(
      [fire.lat, fire.lon],
      {
        icon: iconFire(fire.risk),
        title: fire.nombre,
        zIndexOffset: 10000
      }
    );

    marker.bindPopup(
      `<strong>${escapeHtml(fire.nombre)}</strong><br>` +
      `${escapeHtml(fire.estado)}<br>` +
      `${fire.superficie_ha.toLocaleString("es-CL")} ha<br>` +
      `${fire.distanceKm.toFixed(1)} km a ` +
      `${escapeHtml(
        fire.nearest?.nombre ||
        "infraestructura"
      )}`
    );

    marker.on(
      "click",
      () => selectFire(fire, true)
    );

    layers.fires.addLayer(marker);


    // -----------------------------------------------------
    // RADIO DE PROXIMIDAD
    // -----------------------------------------------------
    // Solo contorno.
    // SIN relleno para no tapar el incendio ni el mapa.
    // -----------------------------------------------------

    if (
      fire.distanceKm <= 10 &&
      fire.nearest
    ) {

      const color =
        fire.risk === "Crítico"
          ? "#ff3b45"
          : fire.risk === "Atención"
            ? "#ff8a00"
            : "#ffd21a";

      L.circle(
        [fire.lat, fire.lon],
        {
          radius: 1000,

          color: color,

          weight: 1.5,

          opacity: 0.65,

          fill: false,

          dashArray: "6 6"
        }
      ).addTo(
        layers.radius
      );


      // ---------------------------------------------------
      // LÍNEA INCENDIO → INFRAESTRUCTURA
      // ---------------------------------------------------

      L.polyline(
        [
          [fire.lat, fire.lon],
          [
            fire.nearest.lat,
            fire.nearest.lon
          ]
        ],
        {
          color: color,
          weight: 1.5,
          dashArray: "6 6",
          opacity: 0.65
        }
      ).addTo(
        layers.radius
      );

    }

  });
}

function renderTable(list) {
  const tbody = $("fire-table-body");
  tbody.innerHTML = "";
  list.slice().sort((a,b)=>a.distanceKm-b.distanceKm).forEach(fire => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(fire.nombre)}</strong></td>
      <td><span class="status ${statusClass(fire.estado)}">${escapeHtml(fire.estado)}</span></td>
      <td>${Number(fire.superficie_ha).toLocaleString("es-CL")} ha</td>
      <td>${escapeHtml(fire.nearest?.nombre || "—")}</td>
      <td>${escapeHtml(fire.nearest?.categoria || "—")}</td>
      <td><strong>${Number.isFinite(fire.distanceKm) ? fire.distanceKm.toFixed(1)+" km" : "—"}</strong></td>
      <td><span class="level ${riskClass(fire.risk)}">${escapeHtml(fire.risk)}</span></td>
      <td><button class="map-btn" type="button">Ver en mapa</button></td>`;
    tr.querySelector("button").addEventListener("click", () => selectFire(fire,true));
    tbody.appendChild(tr);
  });
  $("table-count").textContent = `${list.length} eventos`;
}

function statusClass(status) {
  const k=gvFireStateKey(status);return k === "en combate" ? "combate" : ["observacion","bajo observacion"].includes(k) ? "observacion" : k === "controlado" ? "controlado" : "extinguido";
}

function renderKpis() {

  // =========================================================
  // KPI GENERALES CONAF
  // Estos indicadores SIEMPRE se calculan sobre todos los
  // incendios cargados, independientemente de los filtros.
  // =========================================================

  const fuenteKpi = fires;

  const enCombate =
    fuenteKpi.filter(
      f =>
        String(f.estado || "")
          .trim()
          .toLowerCase() === "en combate"
    ).length;

  const enObservacion =
    fuenteKpi.filter(
      f => {
        const estado =
          String(f.estado || "")
            .trim()
            .toLowerCase();

        return (
          estado === "bajo observación" ||
          estado === "bajo observacion" ||
          estado === "observación" ||
          estado === "observacion"
        );
      }
    ).length;

  const controlados =
    fuenteKpi.filter(
      f =>
        String(f.estado || "")
          .trim()
          .toLowerCase() === "controlado"
    ).length;

  // Vigentes = incendios que todavía no están extinguidos.
  const vigentes =
    enCombate +
    enObservacion +
    controlados;

  $("kpi-total").textContent =
    vigentes;

  $("kpi-critical").textContent =
    enCombate;

  $("kpi-attention").textContent =
    enObservacion;

  $("kpi-watch").textContent =
    controlados;
}

function applyFilters() {
  const q = $("fire-search").value.trim().toLowerCase();
  const status = $("filter-status").value;
  const region = $("filter-region").value;
  const risk = $("filter-risk").value;
  currentFiltered = fires.filter(f => {
    const text = `${f.nombre} ${f.comuna} ${f.region} ${f.nearest?.nombre || ""}`.toLowerCase();
    return (!q || text.includes(q)) && (!status || (gvFireStateKey(status)==="bajo observacion" ? ["observacion","bajo observacion"].includes(gvFireStateKey(f.estado)) : gvFireStateKey(f.estado)===gvFireStateKey(status))) && (!region || f.region === region) && (!risk || f.risk === risk);
  });
  renderFires(currentFiltered); renderTable(currentFiltered); renderKpis(currentFiltered);
    // ---------------------------------------------------------
  // SINCRONIZAR PANEL DERECHO CON EL FILTRO ACTUAL
  // ---------------------------------------------------------

  if (currentFiltered.length) {

    const selectedStillVisible =
      selectedFire &&
      currentFiltered.some(
        fire => fire === selectedFire
      );

    if (!selectedStillVisible) {
      selectFire(
        currentFiltered[0],
        false
      );
    }

  } else {

    selectedFire = null;
    selectedFireWeather = null;

    clearWindLayer();

    $("detail-panel").innerHTML = `
      <div class="detail-empty">
        <div class="detail-icon">🔥</div>
        <h2>Sin incendios en el filtro</h2>
        <p>
          No hay incendios que coincidan con los
          filtros seleccionados.
        </p>
      </div>
    `;
  }
  gvFirePaintStatus();
}

async function selectFire(fire, fly=true) {
  selectedFire = fire;
  if (fly) map.flyTo([fire.lat,fire.lon], Math.max(map.getZoom(), 9), {duration:.6});
  renderDetail(fire);
  await loadWeather(fire);
}
function renderDetail(fire) {
  const panel = $("detail-panel");
  const near = fire.nearby || [];

  panel.innerHTML = `
    <div class="detail-head">
      <div class="photo"></div>
      <div class="detail-head-body">
        <div class="detail-head-label">🔥 INCENDIO FORESTAL${gvFireMode === "snapshot" ? " · COPIA NO ACTUALIZADA" : ""}</div>
        <h2>${escapeHtml(fire.nombre)}</h2>
        <span class="status ${statusClass(fire.estado)}">${escapeHtml(fire.estado)}</span>

        <div class="detail-grid">
          <div>
            <span>Superficie</span>
            <strong>${Number(fire.superficie_ha).toLocaleString("es-CL")} ha</strong>
          </div>

          <div>
            <span>Región</span>
            <strong>${escapeHtml(fire.region)}</strong>
          </div>

          <div>
            <span>Comuna</span>
            <strong>${escapeHtml(fire.comuna)}</strong>
          </div>

          <div>
            <span>${gvFireMode === "snapshot" ? "Consulta Power BI (copia)" : "Consulta Power BI"}</span>
            <strong>${
              window.GV_POWERBI_TIMESTAMP
                ? new Date(window.GV_POWERBI_TIMESTAMP).toLocaleString("es-CL", {
                    timeZone: "America/Santiago",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  })
                : "—"
            }</strong>
          </div>
        </div>
      </div>
    </div>

    <section class="detail-section">
      <h3>Infraestructura cercana</h3>

      <div class="nearby">
        ${near.map((a, i) => `
          <div
  class="nearby-link"
  data-near-index="${i}"
  title="Ver este activo en el mapa"
>
            <span>⚡</span>

            <div>
              <strong>${escapeHtml(a.nombre)}</strong>
              <small>${escapeHtml(a.categoria)}</small>
            </div>

            <b>${a.distance.toFixed(1)} km</b>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="detail-section">
      <h3>Condición meteorológica · Open-Meteo</h3>
      <div id="fire-weather" class="weather-box">
        Consultando meteorología…
      </div>
    </section>

    <p class="source-note">
      El nivel de proximidad se calcula por distancia. El indicador de sotavento
      es geométrico y orientativo: compara la dirección del viento con el rumbo
      entre el incendio y el activo; no es un pronóstico oficial de propagación.
    </p>
  `;

  /*
   * Al hacer clic en una infraestructura cercana:
   * 1. Busca el activo correspondiente.
   * 2. Lleva el mapa hasta ese activo.
   * 3. Hace zoom.
   * 4. Abre su información.
   */
  panel.querySelectorAll(".nearby-link").forEach((button) => {

    button.addEventListener("click", () => {

      const index = Number(button.dataset.nearIndex);
      const asset = near[index];

      if (!asset) return;

      map.flyTo(
        [asset.lat, asset.lon],
        Math.max(map.getZoom(), 12),
        { duration: 0.8 }
      );

      let foundMarker = null;

      layers.assets.eachLayer((layer) => {

        const position = layer.getLatLng?.();

        if (
          position &&
          Math.abs(position.lat - asset.lat) < 0.00001 &&
          Math.abs(position.lng - asset.lon) < 0.00001
        ) {
          foundMarker = layer;
        }
      });

      if (foundMarker) {

        setTimeout(() => {
          foundMarker.openPopup();
        }, 850);

      }
    });

  });
}

async function loadWeather(fire) {
  const box = $("fire-weather");
  if (!box) return;
  if(!navigator.onLine||gvFireMode!=="live"){box.textContent="Meteorología no actualizada · sin evaluación en vivo.";return;}
  const url = `${OPEN_METEO}?latitude=${encodeURIComponent(fire.lat)}&longitude=${encodeURIComponent(fire.lon)}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=precipitation,wind_speed_10m,wind_direction_10m&forecast_days=1&timezone=auto`;
  try {
    const r = await fetch(url); if (!r.ok) throw new Error("Open-Meteo respondió con error");
    const d = await r.json(); const c = d.current || {};
    if(!navigator.onLine||gvFireMode!=="live"||selectedFire!==fire)return;
    selectedFireWeather = c;
    const times = Array.isArray(d.hourly?.time) ? d.hourly.time : [];
    const precipitation = Array.isArray(d.hourly?.precipitation) ? d.hourly.precipitation : [];
    const now = Date.parse(c.time || "");
    let idx = times.findIndex(t => Date.parse(t) >= now); if (idx < 0) idx = 0;
    const sum = h => precipitation.slice(idx, idx+h).filter(Number.isFinite).reduce((a,b)=>a+b,0);
    const windFrom = Number(c.wind_direction_10m);
const windSpeed = Number(c.wind_speed_10m);

const temperature = Number(c.temperature_2m);
const humidity = Number(c.relative_humidity_2m);
const gust = Number(c.wind_gusts_10m);

const dmcTemp = Number.isFinite(temperature) && temperature > 30;
const dmcHumidity = Number.isFinite(humidity) && humidity < 30;
const dmcWind = Number.isFinite(windSpeed) && windSpeed > 30;

const dmcCount =
  [dmcTemp, dmcHumidity, dmcWind]
    .filter(Boolean)
    .length;
const dmcStatus =
  dmcCount === 0 ? "🟢" :
  dmcCount === 1 ? "🟡" :
  dmcCount === 2 ? "� " :
  "🔴";

const dmcLabel =
  dmcCount === 0 ? "Condición meteorológica normal" :
  dmcCount === 1 ? "Condición meteorológica desfavorable" :
  dmcCount === 2 ? "Condición meteorológica alta" :
  "Condición meteorológica crítica";

    const dmcState =
  dmcCount === 0
    ? {
        cls: "dmc-normal",
        icon: "🟢",
        label: "Condición meteorológica normal"
      }
    : dmcCount === 1
    ? {
        cls: "dmc-attention",
        icon: "🟡",
        label: "Atención meteorológica"
      }
    : dmcCount === 2
    ? {
        cls: "dmc-high",
        icon: "� ",
        label: "Condición meteorológica alta"
      }
    : {
        cls: "dmc-critical",
        icon: "🔴",
        label: "Condición meteorológica crítica"
      };

const dmcSummary = `
  <div class="exposure-card ${dmcState.cls}">

    <span>Referencia meteorológica DMC</span>

    <strong>
      ${dmcState.icon} ${dmcState.label}
    </strong>

    <small>
      ${dmcCount}/3 condiciones superadas
      <br>
      T° &gt; 30 °C:
      ${dmcTemp ? "Sí" : "No"}
      ·
      HR &lt; 30 %:
      ${dmcHumidity ? "Sí" : "No"}
      ·
      Viento &gt; 30 km/h:
      ${dmcWind ? "Sí" : "No"}
    </small>

  </div>
`;

const windTo = windToBearing(windFrom);
    drawWindArrow(fire, windFrom, windSpeed);
    const closest = fire.nearest;
    const exposure = closest ? windExposure(closest, fire, windFrom, windSpeed) : { label: 'Sin evaluación', cls: 'neutral', detail: 'No hay infraestructura cercana.' };
    const arrowText = Number.isFinite(windTo) ? `${bearingLabel(windFrom)} → ${bearingLabel(windTo)}` : '—';
    box.innerHTML = `<div class="weather-main"><strong>${Number(c.temperature_2m).toLocaleString("es-CL")} °C</strong><span>🌬️ ${arrowText} · ${Number.isFinite(windSpeed) ? windSpeed.toFixed(0) : "—"} km/h</span></div><div class="wind-direction-card"><div><span>Viento desde</span><strong>${bearingLabel(windFrom)}</strong></div><div><span>Viento hacia</span><strong>${bearingLabel(windTo)}</strong></div><div><span>Ráfaga</span><strong>${Number(c.wind_gusts_10m).toFixed(0)} km/h</strong></div></div><div class="exposure-card ${exposure.cls}"><span>Relación con activo más cercano</span><strong>${escapeHtml(exposure.label)}</strong><small>${escapeHtml(exposure.detail)}</small></div><div class="weather-grid"><div><span>Humedad</span><strong>${Number(c.relative_humidity_2m).toFixed(0)} %</strong></div><div><span>Precipitación</span><strong>${Number(c.precipitation).toFixed(1)} mm</strong></div><div><span>Próx. 3 h</span><strong>${sum(3).toFixed(1)} mm</strong></div><div><span>Próx. 6 h</span><strong>${sum(6).toFixed(1)} mm</strong></div><div><span>Dirección</span><strong>${bearingLabel(windFrom)} → ${bearingLabel(windTo)}</strong></div><div><span>Coordenadas</span><strong>${fire.lat.toFixed(3)}, ${fire.lon.toFixed(3)}</strong></div></div>${dmcSummary}`;
  } catch (e) {
    selectedFireWeather = null;
    clearWindLayer();
    box.innerHTML = `<span style="color:#ff8b8b">No fue posible consultar Open-Meteo en este momento.</span>`;
  }
}

function windDir(deg) {
  const dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
  return dirs[Math.round(Number(deg)/22.5)%16];
}

function initRegions() {
  const select = $("filter-region");
  select.querySelectorAll("option:not(:first-child)").forEach(option => option.remove());
  [...new Set(fires.map(f=>f.region))].sort().forEach(region=>{
    const o=document.createElement("option"); o.value=region; o.textContent=region; $("filter-region").appendChild(o);
  });
}

function toggleLayer(id, layer) {
  $(id).checked ? layer.addTo(map) : map.removeLayer(layer);
}

function updateMeasureStatus(text, active = false) {
  const el = $("measure-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("active", active);
}

function updateMeasureButtons() {
  $("measure-distance")?.classList.toggle("active", measureMode === "distance");
  $("measure-radius")?.classList.toggle("active", measureMode === "radius");
}

function clearMeasurements() {
  layers.measures.clearLayers();
  measurePoints = [];
  measureLine = null;
  measureCircle = null;
  measureMarkers = [];
  measureLabel = null;
  measureMode = null;
  map.doubleClickZoom.enable();
  updateMeasureButtons();
  updateMeasureStatus("Seleccione Regla para medir una distancia o Radio para medir una circunferencia.");
}

function startMeasurement(mode) {
  clearMeasurements();
  measureMode = mode;
  map.doubleClickZoom.disable();
  updateMeasureButtons();
  if (mode === "distance") {
    updateMeasureStatus("Regla activa: haga clic para agregar puntos. Puede medir varios tramos; use Limpiar para terminar.", true);
  } else {
    updateMeasureStatus("Radio activo: primer clic = centro; segundo clic = borde de la circunferencia.", true);
  }
}

function addMeasureMarker(latlng) {
  const marker = L.circleMarker(latlng, { radius: 4, color: "#ffffff", weight: 2, fillColor: "#32c7f4", fillOpacity: 1 });
  layers.measures.addLayer(marker);
  measureMarkers.push(marker);
}

function measureDistanceClick(latlng) {
  measurePoints.push(latlng);
  addMeasureMarker(latlng);
  if (measurePoints.length === 1) {
    updateMeasureStatus("Punto inicial marcado. Haga clic para agregar el siguiente punto.", true);
    return;
  }
  const total = measurePoints.reduce((sum, p, i) => i === 0 ? 0 : sum + haversineKm(measurePoints[i-1].lat, measurePoints[i-1].lng, p.lat, p.lng), 0);
  if (measureLine) layers.measures.removeLayer(measureLine);
  measureLine = L.polyline(measurePoints, { color: "#32c7f4", weight: 3, dashArray: "8 5" }).addTo(layers.measures);
  const last = measurePoints[measurePoints.length - 1];
  if (measureLabel) layers.measures.removeLayer(measureLabel);
  measureLabel = L.marker(last, { icon: L.divIcon({ className: "", html: `<div class="map-measure-label">📏 ${total.toFixed(2)} km</div>`, iconSize: [110,24], iconAnchor: [55,30] }) }).addTo(layers.measures);
  updateMeasureStatus(`Distancia total: ${total.toFixed(2)} km · ${measurePoints.length} puntos. Siga haciendo clic para continuar.`, true);
}

function measureRadiusClick(latlng) {
  if (measurePoints.length === 0) {
    measurePoints.push(latlng);
    addMeasureMarker(latlng);
    updateMeasureStatus("Centro marcado. Haga clic en el borde para definir el radio.", true);
    return;
  }
  const center = measurePoints[0];
  const radiusKm = haversineKm(center.lat, center.lng, latlng.lat, latlng.lng);
  measurePoints.push(latlng);
  addMeasureMarker(latlng);
  measureCircle = L.circle(center, { radius: radiusKm * 1000, color: "#ffd21a", weight: 2, fillColor: "#ffd21a", fillOpacity: .10, dashArray: "7 5" }).addTo(layers.measures);
  const areaKm2 = Math.PI * radiusKm * radiusKm;
  if (measureLabel) layers.measures.removeLayer(measureLabel);
  measureLabel = L.marker(center, { icon: L.divIcon({ className: "", html: `<div class="map-measure-label">⭕ Radio ${radiusKm.toFixed(2)} km · Área ${areaKm2.toFixed(1)} km²</div>`, iconSize: [180,24], iconAnchor: [90,42] }) }).addTo(layers.measures);
  updateMeasureStatus(`Radio: ${radiusKm.toFixed(2)} km · Área: ${areaKm2.toFixed(1)} km². Use Limpiar para una nueva medición.`, true);
  measureMode = null;
  map.doubleClickZoom.enable();
  updateMeasureButtons();
}

function onMapClick(event) {
  if (!measureMode) return;
  if (measureMode === "distance") measureDistanceClick(event.latlng);
  if (measureMode === "radius") measureRadiusClick(event.latlng);
}

function bindUI() {
  ["fire-search","filter-status","filter-region","filter-risk"].forEach(id=>$(id).addEventListener(id==="fire-search"?"input":"change",applyFilters));
  $("layer-fires").addEventListener("change",()=>toggleLayer("layer-fires",layers.fires));
  $("layer-assets").addEventListener("change",()=>toggleLayer("layer-assets",layers.assets));
  $("layer-lines").addEventListener("change",()=>toggleLayer("layer-lines",layers.lines));
  $("layer-radius").addEventListener("change",()=>toggleLayer("layer-radius",layers.radius));
  $("btn-refresh").addEventListener("click", async ()=>{ await bootstrap(); });
  $("measure-distance")?.addEventListener("click",()=>startMeasurement("distance"));
  $("measure-radius")?.addEventListener("click",()=>startMeasurement("radius"));
  $("measure-clear")?.addEventListener("click",clearMeasurements);
  map.on("click", onMapClick);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && measureMode) clearMeasurements();
  });
}

async function bootstrap() {
  if(gvFireBusy)return;
  if(!gvFireAssetsReady){
    gvFireBusy=true;
    $('map-status').textContent='Cargando inventario SEN…';
    try {
      layers.assets.clearLayers();layers.lines.clearLayers();
      await Promise.all([loadAssets(),loadLines()]);
      gvFireAssetsReady=true;
      gvFireUseSnapshot();
    } catch(e) {console.error(e);gvFirePaintStatus();$('map-status').textContent='Error cargando inventario SEN';return;}
    finally {gvFireBusy=false;}
  }
  await gvFireRefresh();
}
bindUI();
window.addEventListener('offline',()=>{gvFireController?.abort();if(gvFireAssetsReady)gvFireUseSnapshot();});
window.addEventListener('online',()=>{if(gvFireAssetsReady)void gvFireRefresh();});
window.setInterval(()=>{if(navigator.onLine&&!document.hidden&&gvFireAssetsReady)void gvFireRefresh();},GV_FIRE_POLL_MS);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine&&gvFireAssetsReady&&(gvFireMode!=='live'||Date.now()-gvFireLastAttempt>=GV_FIRE_POLL_MS))void gvFireRefresh();});
bootstrap();

/* GRIDVISION FIRE - EXPOSURE MODULE V1 */
(() => {
  "use strict";

  const GV_FIRE_ASSET_URL =
    "data/processed/activos_puntuales_validados.geojson";

  const GV_FIRE_MAX_KM = 50;

  let gvFireAssetsCache = null;
  let gvFireLastKey = "";
  let gvFireRenderToken = 0;

  // ---------------------------------------------------------
  // UTILIDADES
  // ---------------------------------------------------------

  function gvFireEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function gvFireHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat =
      (lat2 - lat1) * Math.PI / 180;

    const dLon =
      (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function gvFireBearing(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;

    const p1 = lat1 * rad;
    const p2 = lat2 * rad;

    const dl = (lon2 - lon1) * rad;

    const y = Math.sin(dl) * Math.cos(p2);

    const x =
      Math.cos(p1) * Math.sin(p2) -
      Math.sin(p1) * Math.cos(p2) * Math.cos(dl);

    return (
      Math.atan2(y, x) * 180 / Math.PI + 360
    ) % 360;
  }

  function gvFireDirection(deg) {
    const dirs = [
      "N", "NNE", "NE", "ENE",
      "E", "ESE", "SE", "SSE",
      "S", "SSO", "SO", "OSO",
      "O", "ONO", "NO", "NNO"
    ];

    if (!Number.isFinite(deg)) {
      return "—";
    }

    return dirs[
      Math.round(((deg % 360) + 360) % 360 / 22.5) % 16
    ];
  }

  function gvFireAngleDifference(a, b) {
    return Math.abs(
      ((a - b + 540) % 360) - 180
    );
  }

  // ---------------------------------------------------------
  // EVALUACION DE EXPOSICION
  // ---------------------------------------------------------

function gvFireExposure(
  fire,
  asset,
  windFromDeg,
  windSpeed,
  nearestPoint = null
) {
  const speed = Number(windSpeed);

  if (
    !Number.isFinite(windFromDeg) ||
    !Number.isFinite(speed)
  ) {
    return {
      label: "Sin evaluación",
      cls: "neutral",
      bearing: null,
      detail: "No hay datos de viento."
    };
  }

  // Para líneas usamos el punto real más cercano
  // al incendio. Para activos puntuales usamos
  // sus propias coordenadas.
  const targetLat =
    nearestPoint &&
    Number.isFinite(nearestPoint.lat)
      ? nearestPoint.lat
      : asset.lat;

  const targetLon =
    nearestPoint &&
    Number.isFinite(nearestPoint.lon)
      ? nearestPoint.lon
      : asset.lon;

  const bearing =
    gvFireBearing(
      fire.lat,
      fire.lon,
      targetLat,
      targetLon
    );

  if (speed < 5) {
    return {
      label: "Viento débil",
      cls: "weak",
      bearing,
      detail:
        "Indicador no concluyente con viento menor a 5 km/h."
    };
  }

  const windTo =
    (windFromDeg + 180) % 360;

  const delta =
    gvFireAngleDifference(
      bearing,
      windTo
    );

  if (delta <= 45) {
    return {
      label: "A sotavento",
      cls: "downwind",
      bearing,
      detail:
        `Activo ${gvFireDirection(bearing)} del incendio; viento hacia ${gvFireDirection(windTo)}.`
    };
  }

  if (delta >= 135) {
    return {
      label: "A barlovento",
      cls: "upwind",
      bearing,
      detail:
        `Activo ${gvFireDirection(bearing)} del incendio; viento hacia ${gvFireDirection(windTo)}.`
    };
  }

  return {
    label: "Lateral al viento",
    cls: "crosswind",
    bearing,
    detail:
      `Activo ${gvFireDirection(bearing)} del incendio; viento hacia ${gvFireDirection(windTo)}.`
  };
}

  function gvFireProximity(distanceKm) {
    if (distanceKm < 2) {
      return {
        label: "< 2 km",
        cls: "critical"
      };
    }

    if (distanceKm < 5) {
      return {
        label: "2–5 km",
        cls: "attention"
      };
    }

    return {
      label: "5–10 km",
      cls: "watch"
    };
  }
// =========================================================
// DISTANCIA INCENDIO → INFRAESTRUCTURA ELÉCTRICA
// Para puntos: distancia directa.
// Para líneas: distancia al tramo más cercano.
// =========================================================

function gvFirePointToSegmentNearest(lat, lon, a, b) {

  const latRad =
    Number(lat) * Math.PI / 180;

  const cosLat =
    Math.cos(latRad);

  const px =
    Number(lon) * cosLat;

  const py =
    Number(lat);

  const x1 =
    Number(a[0]) * cosLat;

  const y1 =
    Number(a[1]);

  const x2 =
    Number(b[0]) * cosLat;

  const y2 =
    Number(b[1]);

  if (
    !Number.isFinite(px) ||
    !Number.isFinite(py) ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return null;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;

  const length2 =
    dx * dx + dy * dy;

  let t = 0;

  if (length2 > 0) {

    t =
      (
        (px - x1) * dx +
        (py - y1) * dy
      ) / length2;

    t =
      Math.max(
        0,
        Math.min(1, t)
      );
  }

  const nearestX =
    x1 + t * dx;

  const nearestY =
    y1 + t * dy;

  const nearestLon =
    nearestX / cosLat;

  const nearestLat =
    nearestY;

  const distanceKm =
    gvFireHaversine(
      lat,
      lon,
      nearestLat,
      nearestLon
    );

  return {
    lat: nearestLat,
    lon: nearestLon,
    distanceKm
  };
}


function gvFireNearestPointOnGeometry(
  lat,
  lon,
  geometry
) {

  if (!geometry) {
    return null;
  }

  let best = null;

  function inspectLine(coords) {

    if (
      !Array.isArray(coords) ||
      coords.length === 0
    ) {
      return;
    }

    if (coords.length === 1) {

      const p = coords[0];

      const distanceKm =
        gvFireHaversine(
          lat,
          lon,
          Number(p[1]),
          Number(p[0])
        );

      if (
        !best ||
        distanceKm < best.distanceKm
      ) {
        best = {
          lat: Number(p[1]),
          lon: Number(p[0]),
          distanceKm
        };
      }

      return;
    }

    for (
      let i = 1;
      i < coords.length;
      i += 1
    ) {

      const candidate =
        gvFirePointToSegmentNearest(
          lat,
          lon,
          coords[i - 1],
          coords[i]
        );

      if (
        candidate &&
        (
          !best ||
          candidate.distanceKm < best.distanceKm
        )
      ) {
        best = candidate;
      }
    }
  }

  if (
    geometry.type ===
    "LineString"
  ) {

    inspectLine(
      geometry.coordinates
    );

  } else if (
    geometry.type ===
    "MultiLineString"
  ) {

    geometry.coordinates.forEach(
      line => inspectLine(line)
    );
  }

  return best;
}


function gvFireDistanceToAsset(
  lat,
  lon,
  asset
) {

  // -------------------------------------------------------
  // LÍNEA ELÉCTRICA
  // -------------------------------------------------------

  if (
    asset.kind === "line" &&
    asset.geometry
  ) {

    return gvFireNearestPointOnGeometry(
      lat,
      lon,
      asset.geometry
    );
  }

  // -------------------------------------------------------
  // ACTIVO PUNTUAL
  // -------------------------------------------------------

  const distanceKm =
    gvFireHaversine(
      lat,
      lon,
      asset.lat,
      asset.lon
    );

  return {
    lat: Number(asset.lat),
    lon: Number(asset.lon),
    distanceKm
  };
}
  // ---------------------------------------------------------
  // CARGA DE ACTIVOS GRIDVISION
  // ---------------------------------------------------------

  async function gvFireLoadAssets() {

  if (gvFireAssetsCache) {
    return gvFireAssetsCache;
  }

  // =========================================================
  // 1. ACTIVOS PUNTUALES
  // =========================================================

  const assetResponse =
    await fetch(
      GV_FIRE_ASSET_URL,
      { cache: "no-store" }
    );

  if (!assetResponse.ok) {
    throw new Error(
      "No fue posible cargar los activos GridVision."
    );
  }

  const assetGeojson =
    await assetResponse.json();

  const pointAssets =
    (assetGeojson.features || [])
      .filter(feature =>
        feature.geometry &&
        feature.geometry.type === "Point" &&
        Array.isArray(feature.geometry.coordinates)
      )
      .map(feature => {

        const [
          lon,
          lat
        ] = feature.geometry.coordinates;

        const p =
          feature.properties || {};

        return {
          id:
            p.id ||
            p.ID ||
            feature.id ||
            "",

          nombre:
            p.nombre ||
            p.NOMBRE ||
            p.name ||
            p.Name ||
            p.nombre_activo ||
            p.activo ||
            feature.id ||
            "Activo GridVision",

          categoria:
            p.categoria ||
            p.Categoria ||
            p.tipo ||
            p.type ||
            "Activo",

          lat: Number(lat),
          lon: Number(lon),

          kind: "point"
        };

      })
      .filter(asset =>
        Number.isFinite(asset.lat) &&
        Number.isFinite(asset.lon)
      );

  // =========================================================
  // 2. LÍNEAS ELÉCTRICAS
  // =========================================================

  let lineGeojson =
    linesGeo;

  if (!lineGeojson) {

    const lineResponse =
      await fetch(
        LINES_URL,
        { cache: "no-store" }
      );

    if (!lineResponse.ok) {
      throw new Error(
        "No fue posible cargar las líneas eléctricas."
      );
    }

    lineGeojson =
      await lineResponse.json();
  }

  const lineAssets =
    (lineGeojson?.features || [])
      .filter(feature =>
        feature.geometry &&
        (
          feature.geometry.type === "LineString" ||
          feature.geometry.type === "MultiLineString"
        )
      )
      .map(feature => {

        const p =
          lineProperties(feature);

        const midpoint =
          midpointOfGeometry(
            feature.geometry
          );

        if (!midpoint) {
          return null;
        }

        return {

          id:
            p.id ||
            feature.id ||
            "",

          nombre:
            p.nombre ||
            "Línea eléctrica",

          categoria:
            "Línea eléctrica",

          tension:
            p.tension,

          origen:
            p.origen,

          destino:
            p.destino,

          circuito:
            p.circuito,

          estado:
            p.estado,

          lat:
            midpoint[0],

          lon:
            midpoint[1],

          geometry:
            feature.geometry,

          kind:
            "line",

          props:
            p.props || {}

        };

      })
      .filter(Boolean);

  // =========================================================
  // 3. UNA SOLA LISTA DE INFRAESTRUCTURA ELÉCTRICA
  // =========================================================

  gvFireAssetsCache = [
    ...pointAssets,
    ...lineAssets
  ];

  console.log(
    "GridVision Fire: infraestructura cargada:",
    {
      activosPuntuales: pointAssets.length,
      lineas: lineAssets.length,
      total: gvFireAssetsCache.length
    }
  );

  return gvFireAssetsCache;
}

  // ---------------------------------------------------------
  // CREAR CONTENEDORES
  // ---------------------------------------------------------

  function gvFireEnsureContainers() {

    const weather =
      document.getElementById(
        "fire-weather"
      );

    if (!weather) {
      return null;
    }

    let side =
      document.getElementById(
        "gv-fire-exposure"
      );

    if (!side) {

      side =
        document.createElement("div");

      side.id =
        "gv-fire-exposure";

      weather.insertAdjacentElement(
        "afterend",
        side
      );
    }

    let main =
      document.getElementById(
        "gv-fire-exposure-main"
      );

    if (!main) {

      const host =
        document.querySelector(
          ".fire-main"
        );

      if (host) {

        main =
          document.createElement(
            "section"
          );

        main.id =
          "gv-fire-exposure-main";

        host.appendChild(main);
      }
    }

    return {
      side,
      main
    };
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------

  function gvFireRenderExposure() {
    // Módulo visual de exposición viento-infraestructura desactivado.
    // El clima Open-Meteo principal permanece activo.
  }
  // ---------------------------------------------------------
  // ACTUALIZAR
  // ---------------------------------------------------------

  async function gvFireRefreshExposure() {
    // Desactivado.
    // No modifica el panel meteorológico Open-Meteo.
  }
  // ---------------------------------------------------------
  // OBSERVAR CAMBIOS EN EL PANEL METEOROLOGICO
  // ---------------------------------------------------------

  function gvFireStartObserver() {
    // Observer de exposición viento-infraestructura desactivado.
    return true;
  }
  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => {

        if (
          !gvFireStartObserver()
        ) {

          window.setTimeout(
            gvFireStartObserver,
            500
          );

        }

      },
      { once: true }
    );

  }
  else {

    if (
      !gvFireStartObserver()
    ) {

      window.setTimeout(
        gvFireStartObserver,
        500
      );

    }

  }

})();









