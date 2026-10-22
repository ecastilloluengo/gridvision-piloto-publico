/* GridVision Vulcano 0.6.8.2 · SEN nacional, volcanes de carga selectiva */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const DIR='data/vulcano/';
const MAP_COLOR={Alto:'#ff0000',Medio:'#ffaa00',Bajo:'#ffff00'};
const RING_COLORS={5:'#a80000',10:'#e60000',15:'#e64c00',20:'#e69800',40:'#e6e600'};
const ALL=['hazards','haz-alto','haz-medio','haz-bajo','volcanoes','labels-volcanoes','routes','arrows','points-pe','points-pet','labels-points','evac-areas','rings','assets','power-lines'];
const ELECTRIC=['assets','substations','power-lines','line-500','line-220','line-110','line-66','line-other'];
const VOLCANIC=['hazards','haz-alto','haz-medio','haz-bajo','volcanoes','labels-volcanoes','routes','arrows','points-pe','points-pet','labels-points','evac-areas','rings'];
const defaults={hazards:true,'haz-alto':true,'haz-medio':true,'haz-bajo':true,volcanoes:true,'labels-volcanoes':true,routes:true,arrows:false,'points-pe':true,'points-pet':true,'labels-points':true,'evac-areas':false,rings:false,assets:true,substations:false,'power-lines':true,'line-500':true,'line-220':true,'line-110':true,'line-66':true,'line-other':true};
const classes={peligro:['Polygon','MultiPolygon'],centros:['Point','MultiPoint'],vias:['LineString','MultiLineString'],puntos:['Point','MultiPoint'],evacuacion:['Polygon','MultiPolygon'],anillos:['LineString','MultiLineString'],lineas:['LineString','MultiLineString'],activos:['Point','MultiPoint']};
const BOUNDS=[[-56.1,-75.8],[-17.5,-66.0]],CHILE_CENTER=[-34.1,-70.7],CALBUCO=[-41.329,-72.614];
// GV 0.6.6: small index plus selected volcano's independent geographic packets.
const DEFAULT_REGION='10';
const REGIONS_BY_ZONE={
 norte:['15','01','02','03','04'],
 centro:['05','13','06','07','16','08'],
 sur:['09','14','10','11','12']
};
function zoneForRegion(code){return Object.keys(REGIONS_BY_ZONE).find(k=>REGIONS_BY_ZONE[k].includes(code))||'sur';}
function updateMacrozone(zone){
 const select=$('region-selector');if(!select)return;
 for(const opt of select.options){opt.hidden=!REGIONS_BY_ZONE[zone].includes(opt.value);opt.disabled=opt.hidden;}
 if(!REGIONS_BY_ZONE[zone].includes(select.value))select.value=zone==='sur'?'10':REGIONS_BY_ZONE[zone][0];
}

const REGION_NAMES={'15':'Arica y Parinacota','01':'Tarapacá','02':'Antofagasta','03':'Atacama','04':'Coquimbo','05':'Valparaíso','13':'Metropolitana','06':'O’Higgins','07':'Maule','16':'Ñuble','08':'Biobío','09':'La Araucanía','14':'Los Ríos','10':'Los Lagos','11':'Aysén','12':'Magallanes'};
const regionCode=()=>$('region-selector')?.value||DEFAULT_REGION;
const currentRegion=()=>({code:regionCode(),name:REGION_NAMES[regionCode()]||regionCode()});
function regionVolcanoes(){return(state.volcanoIndex?.volcanes||[]).filter(v=>v.regiones.includes(regionCode())).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));}
function chosenIds(){return $('auto-viewport')?.checked?(state.autoIds||[]):[...new Set([$('volcano-one')?.value,$('volcano-two')?.value].filter(Boolean))].slice(0,2);}
function chosenVolcanoes(){const ids=new Set(chosenIds());return(state.volcanoIndex?.volcanes||[]).filter(v=>ids.has(v.id));}
function populateVolcanoSelectors(initial=false){
 const opts=regionVolcanoes(),a=$('volcano-one'),b=$('volcano-two');
 let prevA=initial?'':a.value,prevB=initial?'':b.value;
 for(const el of [a,b]){el.replaceChildren();const opt=document.createElement('option');opt.value='';opt.textContent=el===a?'Selecciona un volcán':'Ninguno · solo uno';el.append(opt);
  for(const volcano of opts){const o=document.createElement('option');o.value=volcano.id;o.textContent=volcano.nombre;el.append(o);}}
 if(initial){const calbuco=opts.find(v=>norm(v.nombre)==='calbuco');prevA=regionCode()==='05'?'':(calbuco?.id||opts[0]?.id||'');}
 a.value=opts.some(v=>v.id===prevA)?prevA:'';
 b.value=opts.some(v=>v.id===prevB&&v.id!==a.value)?prevB:'';
}
function focusSector(){
 if(!state.map)return;
 const volcanoes=chosenVolcanoes();
 if(volcanoes.length){const coords=volcanoes.map(v=>[v.lat,v.lon]);if(coords.length===1)state.map.setView(coords[0],8,{animate:false});else state.map.fitBounds(coords,{padding:[90,90],maxZoom:8,animate:false});return;}
 const r=state.volcanoIndex?.regiones?.[regionCode()];const b=r?.foco||r?.bbox;
 if(Array.isArray(b)&&b.length===4)state.map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[24,24],maxZoom:8,animate:false});
 else state.map.setView([-40.8,-72.7],8,{animate:false});
}
function selectionChanged(focus=true){
 if($('volcano-one').value&&$('volcano-one').value===$('volcano-two').value)$('volcano-two').value='';
 state.controller.abort();state.controller=new AbortController();
 state.raw={};state.current={};state.loading={};state.renderId++;state.lastTier=zoomTier();clearGroups();openDetail(false);state.selected=null;
 for(const k of ['n-volcanoes','n-routes','n-pe','n-pet','n-areas','n-rings','total-hazards','kpi-volcanoes','kpi-routes','kpi-points'])setText(k,'—');
 const v=chosenVolcanoes();status(v.length?`Solo ${v.map(x=>x.nombre).join(' + ')} · cargas aisladas`: 'Selecciona uno o dos volcanes para consultar');
 if(focus)focusSector();render();
}
function zoneChanged(){if($('auto-viewport'))$('auto-viewport').checked=false;const z=zoneForRegion(regionCode());$('macrozona-selector').value=z;updateMacrozone(z);populateVolcanoSelectors(true);selectionChanged(true);}
function macrozonaChanged(){const z=$('macrozona-selector').value;updateMacrozone(z);zoneChanged();}
const state={map:null,manifest:null,raw:{},loading:{},volcanoIndex:null,controller:new AbortController(),current:{},layerGroups:{},activeArrows:null,measuring:[],measureGroup:null,loaded:false,measureMode:false,selected:null,baseLayers:{},baseName:'satelite',renderId:0,lastTier:-1,autoIds:[]};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const enabled=id=>!!$(id)?.checked;
const setText=(id,value)=>{if($(id))$(id).textContent=value;};
const safeNum=(n)=>Number.isFinite(Number(n))?Number(n).toLocaleString('es-CL'):'—';
const fc=features=>({type:'FeatureCollection',features});
const isGeo=(key,d)=>d?.type==='FeatureCollection'&&Array.isArray(d.features)&&d.features.length<=4500&&d.features.every(f=>f?.type==='Feature'&&classes[key].includes(f.geometry?.type)&&f.properties&&typeof f.properties==='object');
function status(msg,error=false){const el=$('map-state');if(!el)return;el.textContent=msg;el.classList.toggle('error',error);}
// Zoom semantico: no consultar ni representar capas detalladas a escala nacional.
function zoomTier(){const z=state.map?.getZoom()??3;return z<8?0:z<9?1:z<10?2:z<11?3:4;}
function layerVisible(id){
 if(!enabled(id))return false;
 const z=state.map?.getZoom()??3;
 const min={volcanoes:8,'labels-volcanoes':9,hazards:9,'evac-areas':10,rings:10,routes:10,arrows:12,'points-pe':11,'points-pet':11,'labels-points':12};
 return z>=(min[id]??0);
}
function visibleAutoIds(){
 if(zoomTier()===0||!state.volcanoIndex||!state.map)return [];
 const center=state.map.getCenter(),bounds=state.map.getBounds().pad(.08),visible=regionVolcanoes().filter(v=>bounds.contains(L.latLng(v.lat,v.lon)));
 // Ponderamos la longitud geográfica para no privilegiar volcanes alejados de este a oeste.
 const factor=Math.cos(center.lat*Math.PI/180);
 visible.sort((a,b)=>{const da=(a.lat-center.lat)**2+((a.lon-center.lng)*factor)**2;const db=(b.lat-center.lat)**2+((b.lon-center.lng)*factor)**2;return da-db||a.id.localeCompare(b.id);});
 return visible.slice(0,2).map(v=>v.id).sort();
}
function syncMapScale(){
 if(!state.loaded)return;
 const tier=zoomTier(),changed=tier!==state.lastTier;state.lastTier=tier;
 if($('auto-viewport')?.checked){
  const ids=visibleAutoIds();const current=(state.autoIds||[]).slice().sort();
  if(ids.join('|')!==current.join('|')){
   state.autoIds=ids;selectionChanged(false);
   const item=$('auto-volcano-info');if(item)item.textContent=ids.length?'Visibles: '+chosenVolcanoes().map(v=>v.nombre).join(' + '):'Aleja el mapa o acércate a un sector con volcanes';
   if(!ids.length)status('Vista general: red SEN nacional; acércate para explorar volcanes.');
   return;
  }
 }
 if(changed)render();else {updateLabels();if(tier===4&&layerVisible('arrows'))updateArrows();}
 if(tier===0)status('Vista general: red SEN nacional; acércate para activar capas volcánicas.');
}

function makePane(name,z){if(!state.map.getPane(name))state.map.createPane(name);state.map.getPane(name).style.zIndex=String(z);}
function initMap(){
 if(!window.L){status('No se ha cargado Leaflet. Compruebe vendor/leaflet/leaflet.js',true);return false;}
 const m=state.map=L.map('vulcano-map',{preferCanvas:true,zoomControl:false,maxZoom:18,minZoom:3}).fitBounds(BOUNDS,{padding:[14,14],animate:false});
 L.control.zoom({position:'bottomright'}).addTo(m);L.control.scale({position:'bottomleft',imperial:false}).addTo(m);
 const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri, Maxar, Earthstar Geographics y colaboradores GIS',maxZoom:18});
 // GV RAPA NUI: PROTECCION DE MOSAICOS SATELITALES v0.2
 const satRapa=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri, Maxar, Earthstar Geographics y colaboradores GIS',maxNativeZoom:12,maxZoom:18});
 const labels=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri Reference',maxZoom:18,opacity:.85});
 const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18});
 state.baseLayers={satelite:[sat,labels],osm:[osm],'satellite-only':[sat]};sat.addTo(m);labels.addTo(m);
  // En Isla de Pascua el proveedor Esri devuelve mosaicos grises a zoom alto.
  // Allí reutilizamos mosaicos del nivel 12 (escalados por Leaflet) en vez de pedir
  // niveles sin cobertura. En Chile continental se conserva la resolución original.
  function gvSyncSatRapa(){
    const centro=m.getCenter();
    const esRapa=centro.lng < -100 && centro.lat > -29 && centro.lat < -25;
    const siguiente=esRapa?satRapa:sat;
    const anterior=state.baseLayers.satelite[0];
    if(anterior===siguiente)return;
    state.baseLayers.satelite=[siguiente,labels];
    state.baseLayers['satellite-only']=[siguiente];
    if(m.hasLayer(anterior)){
      m.removeLayer(anterior);
      siguiente.addTo(m);
      siguiente.bringToBack(); // No tapar etiquetas del fondo
    }
  }
  m.on('moveend',gvSyncSatRapa);
  gvSyncSatRapa();

 // Si el proveedor satelital falla, se usa el fondo de calles ya configurado.
 let fallosSatelite=0;
 sat.on('tileload',()=>{fallosSatelite=0;});
 sat.on('tileerror',()=>{
  if(++fallosSatelite>=4&&(state.baseName==='satelite'||state.baseName==='satellite-only')){
   switchBasemap('osm');
   status('Fondo satelital no disponible: se activó OpenStreetMap.',true);
  }
 });
 for(const [n,z] of [['search',540],['danger',360],['area',376],['distance',393],['power',403],['route',424],['arrow',432],['volcano',452],['point',464],['label',475]])makePane('gv-'+n,z);
 m.getPane('gv-search').style.pointerEvents='none';
 m.on('zoomend',syncMapScale);m.on('moveend',syncMapScale);
 m.on('click',handleMeasurement);
 state.measureGroup=L.layerGroup().addTo(m);
 return true;
}
function switchBasemap(name){
 if(!state.baseLayers[name]||name===state.baseName)return;
 for(const items of Object.values(state.baseLayers))for(const layer of items)if(state.map.hasLayer(layer))state.map.removeLayer(layer);
 for(const layer of state.baseLayers[name])layer.addTo(state.map);
 state.baseName=name;
 for(const input of document.querySelectorAll('input[name="basemap"],input[name="quick-basemap"]'))input.checked=input.value===name;
}
async function fetchJSON(path,max=20e6){const r=await fetch(path,{cache:'default',signal:state.controller.signal});if(!r.ok)throw new Error(`${r.status}: ${path}`);const n=Number(r.headers.get('content-length')||0);if(n>max)throw new Error(`Archivo demasiado grande: ${path}`);const text=await r.text();if(text.length>max)throw new Error(`Límite de descarga excedido: ${path}`);return JSON.parse(text);}
async function readLayer(key,spec){const a=spec?.archivos;if(!Array.isArray(a)||(!a.length&&spec.conteo!==0)||a.length>90)throw new Error('Catálogo inválido: '+key);
 let result=[];for(const path of a){if(typeof path!=='string'||!/^data\/vulcano\/[a-z0-9_\-]+\.geojson$/i.test(path))throw new Error('Ruta fuera del módulo volcánico');
 const d=await fetchJSON(path);if(!isGeo(key,d))throw new Error('GeoJSON no válido: '+path);result.push(...d.features);}
 if(result.length!==spec.conteo)throw new Error(`Cantidad inconsistente en ${key}: ${result.length} ≠ ${spec.conteo}`);
 const ids=new Set();for(const f of result){const id=f.properties.objectid??f.properties.OBJECTID; if(id!=null){if(ids.has(id))throw new Error('Identificador repetido en '+key);ids.add(id)}}
 return fc(result);
}
async function load(){
 status('Cargando índice ligero de volcanes…');
 try{
  const [manifest,index]=await Promise.all([
   fetchJSON(DIR+'catalogo_vulcano_v06.json',2000000),
   fetchJSON(DIR+'volcanes_v068.json',500000)]);
  if(manifest.schema!==60||manifest.ambito!=='NACIONAL_CHILE')throw new Error('Catálogo de referencia incompatible');
  if(index.schema!==68||index.ambito!=='VOLCANES_COMPLETOS_1_O_2'||!Array.isArray(index.volcanes)||index.volcanes.length<1)throw new Error('Índice v0.6.8 inválido');
  state.manifest=manifest;state.volcanoIndex=index;
  $('macrozona-selector').value=zoneForRegion(regionCode());updateMacrozone($('macrozona-selector').value);populateVolcanoSelectors(true);
  setText('source-date',String(manifest.descargadoEn||'Fecha no registrada'));
  state.loaded=true;state.lastTier=-1;syncMapScale();
  const v=chosenVolcanoes();if(v.length)status(v.map(x=>x.nombre).join(' + ')+' · Capas por escala · No es alerta en vivo');else status('Vista general: acerca el mapa para mostrar volcanes');
 }catch(e){if(e?.name==='AbortError')return;console.error('Vulcano por volcán:',e);status('Falta índice por volcán: '+e.message+' · Instale v0.6.8',true);}
}
async function readVolcanoLayer(v,key){
 const spec=v.capas?.[key];if(!spec||!spec.archivos.length)return fc([]);
 return readLayer(key,spec);
}
async function ensureLayer(key){
 if(state.raw[key])return;
 const names=chosenVolcanoes();if(!names.length){state.raw[key]=fc([]);return;}
 const token=key+':'+names.map(v=>v.id).join('+');
 let pending=state.loading[token];if(!pending){
  pending=(async()=>{
   const all=await Promise.all(names.map(v=>readVolcanoLayer(v,key)));
   const seen=new Set(),features=[];
   for(const coll of all)for(const f of coll.features){const id=f.properties?.id??f.properties?.objectid??f.properties?.OBJECTID;
    const ident=String(id??'sin-id')+':'+JSON.stringify(f.geometry);
    if(seen.has(ident))continue;seen.add(ident);features.push(f);}
   return fc(features);
  })();state.loading[token]=pending;
 }
 try{const coll=await pending;
  if(token===key+':'+chosenVolcanoes().map(v=>v.id).join('+'))state.raw[key]=coll;
 }catch(e){if(e?.name!=='AbortError'){console.error('Vulcano selección:',key,e);status(`No se pudo cargar ${key}: ${e.message}`,true);}}
 finally{if(state.loading[token]===pending)delete state.loading[token];}
}
function geographicFilter(features){return features; /* Geometrías originales completas: proximidad selecciona objetos, NUNCA corta geometría. */}
function byScope(key,features){return geographicFilter(features);}
function getCount(key){return state.raw[key]?filtered(key).length:null;}
function getType(f){return norm(f.properties?.tipo).replace(/[^a-z]/g,'')==='pet'?'PET':'PE';}
function filtered(key){return byScope(key,state.raw[key]?.features||[]);}
function bindCounts(){
 const hz=state.raw.peligro?.features;
 for(const cat of Object.keys(MAP_COLOR))setText('n-'+norm(cat),hz?safeNum(filtered('peligro').filter(f=>String(f.properties?.peligro).trim()===cat).length):'—');
 setText('total-hazards',hz?safeNum(filtered('peligro').length):'—');
 setText('n-areas',getCount('evacuacion')===null?'—':safeNum(getCount('evacuacion')));
 setText('n-rings',getCount('anillos')===null?'—':safeNum(getCount('anillos')));
 scopeCounts();
}
function scopeCounts(){
 const cen=getCount('centros'),routes=getCount('vias'),pts=state.raw.puntos?filtered('puntos'):null;
 setText('n-volcanoes',cen===null?'—':safeNum(cen));
 setText('n-routes',routes===null?'—':safeNum(routes));
 setText('n-pe',pts?safeNum(pts.filter(f=>getType(f)==='PE').length):'—');
 setText('n-pet',pts?safeNum(pts.filter(f=>getType(f)==='PET').length):'—');
 setText('kpi-volcanoes',cen===null?'—':safeNum(cen));
 setText('kpi-routes',routes===null?'—':safeNum(routes));
 setText('kpi-points',pts?safeNum(pts.length):'—');
 setText('scope-note','Volcanes: '+(chosenVolcanoes().map(v=>v.nombre).join(' + ')||'sin selección'));
}
function clickFeature(feature,title,key){state.selected={feature,title,key};showDetail(feature,title,key);}
/* GV VULCANO 0.6.3: FICHAS ELECTRICAS */
function electricInfo(f){
 const p=f.properties||{}, name=String(p.nombre??'').trim()||'Activo eléctrico sin nombre';
 const line=/LineString/.test(String(f.geometry?.type||''));
 const kind=String(p.categoria??'').trim()||(line?'Línea de transmisión':'Activo eléctrico');
 const sub=String(p.subcategoria??'').trim();
 const explicit=String(p.tension??p.voltage??p.nivel_tension??'').trim();
 const sourceVoltage=explicit||(/\b\d+(?:[.,]\d+)?\s*kV\b/i.test(sub)?sub:'');
 const fromName=name.match(/\b\d+(?:[.,]\d+)?\s*kV\b/i);
 let voltage=sourceVoltage||(fromName?fromName[0]:'');
 if(/^\d+(?:[.,]\d+)?$/.test(voltage))voltage+=' kV';
 const technology=sub&&!/\b\d+(?:[.,]\d+)?\s*kV\b/i.test(sub)?sub:'';
 return {name,kind,voltage:voltage||'No informada en la base',hasVoltage:!!voltage,
         technology,id:String(p.id??'').trim()||'No informado'};
}
function electricPopup(f){
 const v=electricInfo(f), div=document.createElement('div');
 const head=document.createElement('strong');head.textContent=v.name;div.append(head);
 for(const [field,value] of [['Tipo',v.kind],['Tensión nominal',v.voltage],...(v.technology?[['Tecnología / clase',v.technology]]:[]),['ID GridVision',v.id]]){
  const row=document.createElement('div');row.style.marginTop='5px';
  const b=document.createElement('b');b.textContent=field+': ';row.append(b,document.createTextNode(value));div.append(row);
 }
 return div;
}
function electricDetail(f,where,box){
 const v=electricInfo(f);const type=document.createElement('span');type.className='type-label';type.textContent=v.kind.toUpperCase();box.append(type);
 const h=document.createElement('h3');h.textContent=v.name;box.append(h);
 const dl=document.createElement('div');dl.className='detail-rows';
 const fields=[['Tipo de activo',v.kind],['Tensión nominal',v.voltage],...(v.technology?[['Tecnología / clase',v.technology]]:[]),['Identificador GridVision',v.id]];
 for(const [field,value] of fields){
  const row=document.createElement('div');row.className='detail-row';
  const label=document.createElement('span');label.textContent=field;
  const text=document.createElement('strong');text.textContent=value.slice(0,200);
  row.append(label,text);dl.append(row);
 }
 box.append(dl);
 const note=document.createElement('div');note.className='detail-warning';
 note.textContent=v.hasVoltage?'Tensión indicada por el inventario de GridVision; verificar antecedentes técnicos antes de maniobras.':'La fuente cartográfica no informa tensión nominal para este activo. No se ha estimado ni inferido por ubicación.';
 box.append(note);
 const src=document.createElement('p');src.style.cssText='font-size:10px;color:#9cc6da';src.textContent='Fuente: GridVision · inventario geográfico de infraestructura eléctrica';box.append(src);
 where.append(box);openDetail(true);
}
function itemLabel(f,key){if(key==='electrico')return electricInfo(f).name;const p=f.properties||{};if(key==='centros')return String(p.volcan||p.nombre||'Volcán');if(key==='puntos')return String(p.nombre||'Punto de encuentro');if(key==='vias')return String(p.volcan||p.nombre||'Vía de evacuación');if(key==='evacuacion')return String(p.nombre||'Área de evacuación');if(key==='anillos')return `${p.distance??'?'} km del cráter`;return `Peligro ${p.peligro||'sin categoría'}`;}
function makeTooltip(feature,label,key){if(key==='electrico')return electricPopup(feature);const div=document.createElement('div');const b=document.createElement('strong');b.textContent=label;div.append(b);const p=document.createElement('p');p.textContent=key==='vias'?'Vía oficial. Sentido de trazado NO acreditado como dirección de evacuación.':'Cartografía de referencia, no alerta en vivo.';div.append(p);return div;}
function each(key,title){return (f,l)=>{const label=itemLabel(f,key);l.on('click',()=>clickFeature(f,label,key));l.bindPopup(makeTooltip(f,label,key));};}
function createIcon(text,classname,cssClass,sz=[30,30]){return L.divIcon({html:`<span class="${classname}">${text}</span>`,className:cssClass,iconSize:sz,iconAnchor:[sz[0]/2,sz[1]/2]});}
function symbolIcon(key,value){
 const r=state.manifest?.capas?.[key]?.renderer;
 const info=r?.uniqueValueInfos?.find(x=>norm(x.value)===norm(value));
 const sym=info?.symbol||r?.symbol;
 const base64=sym?.imageData;
 if(typeof base64!=='string'||base64.length<40||base64.length>180000||!/^[-A-Za-z0-9_+/=\s]+$/.test(base64))return null;
 const mime=String(sym.contentType||'image/png').toLowerCase();
 if(!['image/png','image/jpeg','image/gif'].includes(mime))return null;
 const w=Math.max(20,Math.min(43,Number(sym.width)||30)),h=Math.max(20,Math.min(43,Number(sym.height)||30));
 const iconUrl=`data:${mime};base64,${base64.replace(/\s/g,'')}`;
 return L.icon({iconUrl,iconSize:[w,h],iconAnchor:[w/2,h/2],className:'gv-original-arcgis-icon'});
}
function markerVolcano(f,ll){const category=f.properties?.categoria;
 return L.marker(ll,{pane:'gv-volcano',icon:symbolIcon('centros',category)||createIcon('▲','volcano-pin','volcano-marker',[31,31]),riseOnHover:true});}
function markerPoint(f,ll){const t=getType(f),sym=t==='PET'?'PET':'PE';
 return L.marker(ll,{pane:'gv-point',icon:symbolIcon('puntos',t)||createIcon(sym,`pe-icon ${t.toLowerCase()}`,'gv-pe-marker',[28,28]),riseOnHover:true});}
function clearGroups(){for(const v of Object.values(state.layerGroups)){if(state.map.hasLayer(v))state.map.removeLayer(v);}state.layerGroups={};if(state.activeArrows){state.map.removeLayer(state.activeArrows);state.activeArrows=null;}}
function drawGeo(key,features,options){if(!features.length)return L.layerGroup();return L.geoJSON(fc(features),options)}
function drawHazards(){const g=L.layerGroup();if(!enabled('hazards'))return g;const hazard=filtered('peligro');
 for(const [cat,c] of Object.entries(MAP_COLOR)){if(!enabled('haz-'+norm(cat)))continue;
 const sub=hazard.filter(f=>String(f.properties.peligro).trim()===cat);
 const geo=drawGeo('peligro',sub,{pane:'gv-danger',renderer:L.canvas({pane:'gv-danger',padding:.4}),style:{color:'transparent',weight:0,fillColor:c,fillOpacity:.40},onEachFeature:each('peligro','Peligro '+cat)});g.addLayer(geo);}
 return g;}
function decorateRing(f){let distance=Number(f.properties?.distance);return {pane:'gv-distance',color:RING_COLORS[distance]||'#d5dc42',weight:2,opacity:.92,dashArray:'7 6'};}
function redrawGroup(key,active,features,opts){if(!active)return;const g=drawGeo(key,features,opts);state.layerGroups[key]=g;g.addTo(state.map);}
/* GV ZOOM ESTABLE v01: conserva geometrias ya dibujadas al cambiar la escala.
   Reemplaza solo la capa cuyo filtro, seleccion o fuente de datos cambia. */
const gvZoomGroupCache = new WeakMap();
function gvApplyVolcanoGroup(name, active, signature, makeLayer) {
  const old = state.layerGroups[name];
  if (!active) {
    if (old && state.map.hasLayer(old)) state.map.removeLayer(old);
    delete state.layerGroups[name];
    return;
  }
  if (old && state.map.hasLayer(old) && gvZoomGroupCache.get(old) === signature) return;
  // Construir antes de retirar la anterior evita una pantalla vacia al cruzar niveles.
  const next = makeLayer();
  next.addTo(state.map);
  if (old && state.map.hasLayer(old)) state.map.removeLayer(old);
  state.layerGroups[name] = next;
  gvZoomGroupCache.set(next, signature);
}
async function render(){
  if (!state.loaded) return;
  const epoch = ++state.renderId;
  if (!chosenIds().length) {
    clearGroups(); bindCounts(); renderLegend(); updateActiveBadge(); return;
  }
  const keys=[];
  if(layerVisible('volcanoes')) keys.push('centros');
  if(layerVisible('hazards')) keys.push('peligro');
  if(layerVisible('routes')) keys.push('vias');
  if(layerVisible('points-pe')||layerVisible('points-pet')) keys.push('puntos');
  if(layerVisible('evac-areas')) keys.push('evacuacion');
  if(layerVisible('rings')) keys.push('anillos');
  await Promise.all(keys.map(ensureLayer));
  if (epoch !== state.renderId) return;
  bindCounts();
  const selected = chosenIds().join('+');
  const sign = (key, extra='') => selected+'|'+key+'|'+(state.raw[key]?.features?.length ?? 'sin-datos')+'|'+extra;
  const hazardFilters=['haz-alto','haz-medio','haz-bajo'].filter(enabled).join(',');
  gvApplyVolcanoGroup('peligro',layerVisible('hazards'),sign('peligro',hazardFilters),()=>drawHazards());
  gvApplyVolcanoGroup('evacuacion',layerVisible('evac-areas'),sign('evacuacion'),()=>drawGeo('evacuacion',filtered('evacuacion'),{
    pane:'gv-area',renderer:L.canvas({pane:'gv-area'}),style:{color:'#161c22',weight:.6,fillColor:'#ffa77f',fillOpacity:.47},onEachFeature:each('evacuacion')
  }));
  const ringIds=[...document.querySelectorAll('[id^="ring-"]')].filter(x=>x.checked).map(x=>x.id).join(',');
  gvApplyVolcanoGroup('anillos',layerVisible('rings'),sign('anillos',ringIds),()=>drawGeo('anillos',filtered('anillos').filter(f=>enabled('ring-'+f.properties?.distance)),{
    pane:'gv-distance',renderer:L.canvas({pane:'gv-distance'}),style:decorateRing,onEachFeature:each('anillos')
  }));
  gvApplyVolcanoGroup('vias',layerVisible('routes'),sign('vias'),()=>drawGeo('vias',filtered('vias'),{
    pane:'gv-route',renderer:L.canvas({pane:'gv-route'}),style:{color:'#004da8',weight:3.4,opacity:.96},onEachFeature:each('vias')
  }));
  gvApplyVolcanoGroup('centros',layerVisible('volcanoes'),sign('centros'),()=>drawGeo('centros',filtered('centros'),{
    pane:'gv-volcano',pointToLayer:markerVolcano,onEachFeature:each('centros')
  }));
  const pts=filtered('puntos').filter(f=>layerVisible('points-'+getType(f).toLowerCase()));
  const pointFilters=[layerVisible('points-pe'),layerVisible('points-pet')].join(',');
  gvApplyVolcanoGroup('puntos',pts.length>0,sign('puntos',pointFilters),()=>drawGeo('puntos',pts,{
    pane:'gv-point',pointToLayer:markerPoint,onEachFeature:each('puntos')
  }));
  updateLabels(); updateArrows(); renderLegend(); updateActiveBadge();
}
function updateLabels(){if(!state.loaded)return;const zoom=state.map.getZoom();for(const key of ['centros','puntos']){
 const group=state.layerGroups[key];if(!group)continue;group.eachLayer(marker=>{if(!(marker instanceof L.Marker))return;
 const p=marker.feature?.properties||{};let show=key==='centros'?layerVisible('labels-volcanoes'):layerVisible('labels-points');
 if(!show){marker.unbindTooltip();return;}const text=key==='centros'?p.volcan:p.nombre;
 if(text)marker.bindTooltip(String(text).slice(0,90),{permanent:true,direction:'right',offset:[12,0],className:key==='centros'?'volcano-label':'pe-label',opacity:1}).openTooltip();
 });}
}
// Las flechas se basan en el orden geométrico. Ese orden no acredita sentido oficial de evacuación.
function routeSequences(g){if(g?.type==='LineString')return [g.coordinates];if(g?.type==='MultiLineString')return g.coordinates;return []}
function updateArrows(){if(!state.map||!state.loaded)return;if(state.activeArrows)state.map.removeLayer(state.activeArrows);
 const arrows=state.activeArrows=L.layerGroup();if(!layerVisible('routes')||!layerVisible('arrows'))return;
 const map=state.map,zoom=map.getZoom(),bounds=map.getBounds().pad(.2);if(zoom<9)return;
 const spacing=zoom>=12?130:210;let rendered=0;
 for(const f of filtered('vias'))for(const sequence of routeSequences(f.geometry)){
  let walk=0;
  for(let i=1;i<sequence.length;i++){
   const a=sequence[i-1],b=sequence[i];if(!a||!b)continue;
   const la=L.latLng(a[1],a[0]),lb=L.latLng(b[1],b[0]);
   if(!bounds.contains(la)&&!bounds.contains(lb))continue;
   const ap=map.project(la,zoom),bp=map.project(lb,zoom),dx=bp.x-ap.x,dy=bp.y-ap.y,span=Math.hypot(dx,dy);
   if(span<.5)continue;
   let start=spacing-walk;
   while(start<span&&rendered<350){const t=start/span,ll=map.unproject(L.point(ap.x+dx*t,ap.y+dy*t),zoom),ang=Math.atan2(dy,dx)*180/Math.PI;
    const html=`<span class="route-arrow" style="display:block;transform:rotate(${ang}deg)"></span>`;
    const mark=L.marker(ll,{pane:'gv-arrow',interactive:false,keyboard:false,icon:L.divIcon({html,className:'',iconSize:[13,13],iconAnchor:[6,6]})});arrows.addLayer(mark);rendered++;start+=spacing;
   }
   walk=(walk+span)%spacing;
   if(rendered>=350)break;
  }
  if(rendered>=350)break;
 }
 arrows.addTo(map);
}
function makeLegendRow(color,content,kind='square'){const row=document.createElement('div');row.className='legend-row';const i=document.createElement('i');i.className='swatch '+kind;i.style.setProperty('--sw',color);row.append(i,document.createTextNode(content));return row;}
function renderLegend(){const target=$('legend-content');target.replaceChildren();if(layerVisible('hazards'))for(const [cat,color] of Object.entries(MAP_COLOR))if(enabled('haz-'+norm(cat)))target.append(makeLegendRow(color,cat+' · peligro volcánico'));
 if(layerVisible('evac-areas'))target.append(makeLegendRow('#ffa77f','Área de evacuación'));
 if(layerVisible('routes'))target.append(makeLegendRow('#004da8','Vía de evacuación','line'));
 if(layerVisible('arrows')&&layerVisible('routes'))target.append(makeLegendRow('#21b3ff','Flecha: sentido de digitalización NO validado','line'));
 if(layerVisible('points-pe'))target.append(makeLegendRow('#09a66d','PE · Punto de encuentro','dot'));
 if(layerVisible('points-pet'))target.append(makeLegendRow('#e8ae27','PET · Punto de encuentro transitorio','dot'));
 if(layerVisible('volcanoes'))target.append(makeLegendRow('#ba3d3d','Volcán geológicamente activo','dot'));
 if(layerVisible('rings'))for(const [r,color] of Object.entries(RING_COLORS))if(enabled('ring-'+r))target.append(makeLegendRow(color,r+' km · referencia','line'));
 if(enabled('assets'))target.append(makeLegendRow('#ffca4b','Centrales eléctricas · SEN nacional','dot'));
 if(enabled('substations'))target.append(makeLegendRow('#36d9f3','Subestaciones · SEN nacional','dot'));
 if(enabled('power-lines'))for(const [band,color] of Object.entries(VOLTAGE_COLOR))if(enabled('line-'+band))target.append(makeLegendRow(color,band==='500'?'500 kV':band==='220'?'220–345 kV':band==='110'?'110–154 kV':band==='66'?'66–69 kV':'Otras tensiones','line'));
 if(!target.children.length){const p=document.createElement('p');p.className='legend-empty';p.textContent='Activa alguna capa para mostrar la leyenda.';target.append(p)}
}
function showDetail(f,title,key){const p=f.properties||{},where=$('detail-content');where.replaceChildren();const box=document.createElement('div');box.className='detail-card';
 if(key==='electrico'){electricDetail(f,where,box);return;}
 const typ=document.createElement('span');typ.className='type-label';typ.textContent=({peligro:'ÁREA DE PELIGRO',centros:'VOLCÁN',vias:'VÍA DE EVACUACIÓN',puntos:'PUNTO PE / PET',evacuacion:'ÁREA DE EVACUACIÓN',anillos:'DISTANCIA AL CRÁTER',electrico:'INFRAESTRUCTURA'})[key]||'CARTOGRAFÍA';box.append(typ);
 const h=document.createElement('h3');h.textContent=title;box.append(h);
 const dl=document.createElement('div');dl.className='detail-rows';
 const keys={peligro:['peligro','volcan','objectid'],centros:['volcan','categoria','region','objectid'],vias:['volcan','bidireccional','objectid'],puntos:['nombre','tipo','volcan','objectid'],evacuacion:['nombre','clase','objectid'],anillos:['distance','OBJECTID'],electrico:['nombre','categoria','subcategoria','id']};
 for(const field of keys[key]||Object.keys(p).slice(0,6)){const row=document.createElement('div');row.className='detail-row';const name=document.createElement('span');name.textContent=field;const v=document.createElement('strong');v.textContent=String(p[field]??'No informado').slice(0,200);row.append(name,v);dl.append(row)}box.append(dl);
 const caution=document.createElement('div');caution.className='detail-warning';caution.textContent=key==='peligro'?'La capa oficial tiene volcan=NULL. Este polígono no se atribuye de manera exclusiva al volcán seleccionado.':key==='vias'?'La dirección de digitalización de esta línea no equivale necesariamente al sentido oficial de evacuación.':key==='anillos'?'La atribución de esta línea a un volcán específico está pendiente de verificación.':key==='evacuacion'?'Esta cobertura está seleccionada por proximidad regional, no por identificación inequívoca del volcán.':'Dato geoespacial de referencia; no constituye información de alerta en vivo.';box.append(caution);
 const src=document.createElement('p');src.style.cssText='font-size:10px;color:#9cc6da;overflow-wrap:anywhere';src.textContent='Fuente: '+(state.manifest?.capas?.[key]?.servicio||'GridVision · capa local');box.append(src);where.append(box);openDetail(true);
}
const viewBounds=f=>{if(!f)return;try{const layer=L.geoJSON(f);const b=layer.getBounds();if(b?.isValid())state.map.fitBounds(b.pad(.25),{maxZoom:13,animate:true});else if(f.geometry?.coordinates&&f.geometry.type==='Point')state.map.setView([f.geometry.coordinates[1],f.geometry.coordinates[0]],12)}catch(e){console.warn(e)}};
function voltageBand(f){
 const p=f.properties||{};const v=norm(p.subcategoria||p.tension||p.voltage||'');
 if(/(^|[^0-9])500([^0-9]|$)/.test(v))return '500';
 if(/(^|[^0-9])(220|230|345|330)([^0-9]|$)/.test(v))return '220';
 if(/(^|[^0-9])(110|132|154)([^0-9]|$)/.test(v))return '110';
 if(/(^|[^0-9])(66|69)([^0-9]|$)/.test(v))return '66';
 return 'other';
}
const VOLTAGE_COLOR={'500':'#a02bc7','220':'#e32b32','110':'#ef8e31','66':'#3689ee','other':'#718da1'};
/* GV VULCANO 0.6.8.2: SEN NACIONAL INDEPENDIENTE */
// Inventario geográfico completo de GridVision, NO limitado al área volcánica.
// Se descarga una sola vez; permanece al cambiar de volcán o región.
const SEN_FILES={lineas:'data/processed/lineas_validadas.geojson',activos:'data/processed/activos_puntuales_validados.geojson'};
const sen={data:{},pending:{},groups:{},requestId:0,renderers:{}};
function senCategory(feature){
 const category=norm(feature.properties?.categoria||'');
 if(category.includes('subestacion')||category==='s/e'||category.includes('subestacion electrica'))return 'substation';
 if(category.includes('central')||category.includes('generacion'))return 'central';
 return 'other';
}
async function senLoad(key){
 if(sen.data[key])return sen.data[key];
 if(sen.pending[key])return sen.pending[key];
 const url=SEN_FILES[key];
 const pending=(async()=>{
  const response=await fetch(url,{cache:'default'});
  if(!response.ok)throw new Error(url+' · HTTP '+response.status);
  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>35000000)throw new Error('Archivo nacional supera el límite de seguridad: '+url);
  const body=await response.text();
  if(body.length>35000000)throw new Error('Archivo nacional excesivamente grande: '+url);
  const collection=JSON.parse(body);
  if(!isGeo(key,collection))throw new Error('GeoJSON nacional inválido: '+url);
  sen.data[key]=collection;
  return collection;
 })();
 sen.pending[key]=pending;
 try{return await pending;}finally{if(sen.pending[key]===pending)delete sen.pending[key];}
}
function clearSenLayers(){
 for(const layer of Object.values(sen.groups))if(state.map.hasLayer(layer))state.map.removeLayer(layer);
 sen.groups={};
}
function senPopupAndTooltip(f,l){
 const name=electricInfo(f).name;
 if(/LineString/.test(String(f.geometry?.type||''))){
  // Leaflet Canvas prueba por defecto un trazo de solo 1.6-2.7 px.
  // Ampliar el area interactiva SIN alterar el grosor visible.
  const nativeTolerance=typeof l._clickTolerance==='function'?l._clickTolerance.bind(l):null;
  if(nativeTolerance)l._clickTolerance=()=>Math.max(nativeTolerance(),state.map.getZoom()<8?12:9);
  l.on('mouseover',()=>{state.map.getContainer().style.cursor='pointer';});
  l.on('mouseout',()=>{state.map.getContainer().style.cursor='';});
 }
 l.on('click',()=>clickFeature(f,name,'electrico'));
 l.bindPopup(electricPopup(f));
 l.bindTooltip(name,{sticky:true,direction:'top',opacity:.95});
}
function senPointStyle(kind){
 return (f,ll)=>L.circleMarker(ll,{pane:'gv-point',renderer:sen.renderers.points,radius:state.map.getZoom()<7?2.7:4.1,
  color:'#f8fbff',weight:.7,fillColor:kind==='central'?'#ffca4b':'#36d9f3',fillOpacity:.97});
}
function addSenGroup(key,features,options){
 if(!features.length)return;
 sen.groups[key]=L.geoJSON(fc(features),{...options,onEachFeature:senPopupAndTooltip}).addTo(state.map);
}
async function refreshSen(){
 const req=++sen.requestId;
 const linesOn=enabled('power-lines'),centralsOn=enabled('assets'),stationsOn=enabled('substations');
 const showPoints=centralsOn||stationsOn;
 const needed=[...(linesOn?['lineas']:[]),...(showPoints?['activos']:[])];
 if(!needed.length){clearSenLayers();setText('sen-state','Capas eléctricas desactivadas.');renderLegend();updateActiveBadge();return;}
 setText('sen-state','Cargando cobertura eléctrica nacional…');
 try{
  await Promise.all(needed.map(senLoad));
  if(req!==sen.requestId)return;
  clearSenLayers();
  if(linesOn){
   const lines=sen.data.lineas.features.filter(f=>enabled('line-'+voltageBand(f)));
   addSenGroup('lineas',lines,{pane:'gv-power',renderer:sen.renderers.lines,
    style:f=>({color:VOLTAGE_COLOR[voltageBand(f)],weight:state.map.getZoom()<7?1.6:2.7,opacity:.93})});
   setText('n-lines',safeNum(lines.length));
  }else setText('n-lines','0');
  if(showPoints){
   const assets=sen.data.activos.features;
   const centrales=centralsOn?assets.filter(f=>senCategory(f)==='central'):[];
   const subestaciones=stationsOn?assets.filter(f=>senCategory(f)==='substation'):[];
   addSenGroup('centrales',centrales,{pane:'gv-point',pointToLayer:senPointStyle('central')});
   addSenGroup('subestaciones',subestaciones,{pane:'gv-point',pointToLayer:senPointStyle('substation')});
   setText('n-assets',safeNum(centrales.length));setText('n-substations',safeNum(subestaciones.length));
  }else{setText('n-assets','0');setText('n-substations','0');}
  setText('sen-state','SEN nacional · Líneas '+(linesOn?'activas':'ocultas')+' · Centrales '+(centralsOn?'activas':'ocultas')+' · S/E '+(stationsOn?'activas':'ocultas'));
  renderLegend();updateActiveBadge();
 }catch(error){
  if(req!==sen.requestId)return;
  console.error('SEN nacional:',error);
  setText('sen-state','No se pudo cargar inventario SEN: '+error.message);
 }
}
// Solo cambios de filtros eléctricos vuelven a construir estas capas.
/* GV VULCANO v0.6.8.3: IDENTIFICACION DE LINEAS */
// Identificar el trazado mas cercano al clic del mapa cuando un Canvas de una
// capa superior impide que el clic llegue directamente a la linea SEN.
// La búsqueda espacial es local: NO descarga mas datos ni recalcula en zoom/move.
function senLineBounds(f){
 const paths=f.geometry?.type==='MultiLineString'?f.geometry.coordinates:[f.geometry?.coordinates||[]];
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const path of paths)for(const c of path){
  if(!Array.isArray(c)||c.length<2)continue;
  const lon=Number(c[0]),lat=Number(c[1]);
  if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
  west=Math.min(west,lon);east=Math.max(east,lon);
  south=Math.min(south,lat);north=Math.max(north,lat);
 }
 return [west,south,east,north];
}
function senEnsureLineIndex(){
 if(sen.lineIndex||!sen.data.lineas)return;
 sen.lineIndex=sen.data.lineas.features.map(f=>({f,b:senLineBounds(f),band:voltageBand(f)}));
}
function senSegmentDistance2(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
 const ratio=denom?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/denom)):0;
 const x=a.x+ratio*dx,y=a.y+ratio*dy;
 return (p.x-x)**2+(p.y-y)**2;
}
function senPickLine(latlng,tolerance=12){
 if(!enabled('power-lines')||!sen.data.lineas||!state.map)return null;
 senEnsureLineIndex();
 const map=state.map,p=map.latLngToContainerPoint(latlng);
 const a=map.containerPointToLatLng([p.x-tolerance,p.y+tolerance]);
 const b=map.containerPointToLatLng([p.x+tolerance,p.y-tolerance]);
 const west=Math.min(a.lng,b.lng),east=Math.max(a.lng,b.lng);
 const south=Math.min(a.lat,b.lat),north=Math.max(a.lat,b.lat);
 let nearest=null,best=tolerance*tolerance;
 for(const obj of sen.lineIndex){
  if(!enabled('line-'+obj.band))continue;
  const bound=obj.b;
  if(bound[2]<west||bound[0]>east||bound[3]<south||bound[1]>north)continue;
  const geom=obj.f.geometry;
  const paths=geom.type==='MultiLineString'?geom.coordinates:[geom.coordinates];
  for(const path of paths)for(let i=1;i<path.length;i++){
   const x=path[i-1],y=path[i];
   if(Math.max(x[0],y[0])<west||Math.min(x[0],y[0])>east||
      Math.max(x[1],y[1])<south||Math.min(x[1],y[1])>north)continue;
   const p0=map.latLngToContainerPoint([x[1],x[0]]);
   const p1=map.latLngToContainerPoint([y[1],y[0]]);
   const d2=senSegmentDistance2(p,p0,p1);
   if(d2<=best){best=d2;nearest=obj.f;}
  }
 }
 return nearest;
}
function senIdentifyMapClick(e){
 if(state.measureMode||!enabled('power-lines'))return;
 // Dar prioridad a puntos (centrales, S/E, volcanes y PE/PET) seleccionados.
 const source=e.propagatedFrom||e.sourceTarget;
 const feature=source?.feature;
 if(feature?.geometry&&/Point/.test(String(feature.geometry.type)))return;
 // Si una linea fue seleccionada directamente, su evento ya abrio la ficha.
 if(feature?.geometry&&/LineString/.test(String(feature.geometry.type))&&
    feature?.properties?.id&&String(feature.properties.id).startsWith('GV-'))return;
 const nearest=senPickLine(e.latlng,12);
 if(!nearest)return;
 clickFeature(nearest,electricInfo(nearest).name,'electrico');
 L.popup({maxWidth:360,autoPan:true})
  .setLatLng(e.latlng).setContent(electricPopup(nearest)).openOn(state.map);
}

function setupSen(){
 sen.renderers.lines=L.canvas({pane:'gv-power',padding:.25});
 sen.renderers.points=L.canvas({pane:'gv-point',padding:.2});
 for(const id of ['power-lines','assets','substations','line-500','line-220','line-110','line-66','line-other']){
  const input=$(id);if(input)input.addEventListener('change',refreshSen);
 }
 state.map.on('click',senIdentifyMapClick);
 void refreshSen();
}

/* GV VULCANO v0.6.8.4: BUSCADOR UNIFICADO SEN, VOLCANES, LUGARES Y COORDENADAS */
// Inventario SEN cacheado por senLoad: el buscador no descarga capas adicionales en cada pulsación.
let gvSearchIndex=null,gvSearchPending=null,gvSearchOverlay=null,gvGeoSequence=0,gvGeocodeLast=0;
const gvGeocodeCache=new Map();
const gvSearchTypes={linea:'Línea de transmisión',central:'Central eléctrica',se:'Subestación S/E',volcan:'Volcán'};
function gvSearchClass(f){
 if(/LineString/.test(String(f.geometry?.type||'')))return 'linea';
 const category=senCategory(f);return category==='central'?'central':category==='substation'?'se':null;
}
function gvSearchBuildIndex(){
 const entries=[];
 for(const f of sen.data.lineas?.features||[]){
  const info=electricInfo(f);
  entries.push({kind:'linea',name:info.name,sub:info.voltage,id:info.id,feature:f,
   terms:norm([info.name,info.voltage,info.id,'linea transmisión'].join(' '))});
 }
 for(const f of sen.data.activos?.features||[]){
  const kind=gvSearchClass(f);if(kind!=='central'&&kind!=='se')continue;
  const info=electricInfo(f);
  entries.push({kind,name:info.name,sub:info.technology||info.voltage,id:info.id,feature:f,
   terms:norm([info.name,info.technology,info.voltage,info.id,kind==='se'?'s/e subestacion':'central generacion'].join(' '))});
 }
 gvSearchIndex=entries;return entries;
}
async function gvSearchEnsureIndex(){
 if(gvSearchIndex)return gvSearchIndex;
 if(gvSearchPending)return gvSearchPending;
 gvSearchPending=(async()=>{await Promise.all([senLoad('lineas'),senLoad('activos')]);return gvSearchBuildIndex()})();
 try{return await gvSearchPending;}finally{gvSearchPending=null;}
}
function gvSearchSetInfo(message){const box=$('search-results');box.replaceChildren();box.hidden=false;
 const p=document.createElement('div');p.className='gv-search-info';p.textContent=message;box.append(p);}
function gvSearchAddResult(label,meta,choose){
 const b=document.createElement('button');b.type='button';b.className='gv-search-hit';
 const title=document.createElement('strong');title.textContent=label;
 const small=document.createElement('span');small.textContent=meta;
 b.append(title,small);b.addEventListener('click',()=>{gvGeoSequence++;choose();});$('search-results').append(b);
}
function gvSearchClearMarker(){if(gvSearchOverlay){state.map.removeLayer(gvSearchOverlay);gvSearchOverlay=null;}}
function gvSearchFocusFeature(f){
 gvSearchClearMarker();
 const isLine=/LineString/.test(String(f.geometry?.type||''));
 gvSearchOverlay=L.geoJSON(f,{pane:'gv-search',interactive:false,
  style:{color:'#39f4f6',weight:isLine?6:2,opacity:1,fillColor:'#39f4f6',fillOpacity:.7},
  pointToLayer:(_,ll)=>L.circleMarker(ll,{pane:'gv-search',interactive:false,radius:9,color:'#fff',weight:2,fillColor:'#00dbe6',fillOpacity:1})
 }).addTo(state.map);
 const bounds=gvSearchOverlay.getBounds();
 if(bounds?.isValid()){
  if(isLine)state.map.fitBounds(bounds.pad(.15),{padding:[44,44],maxZoom:12,animate:false});
  else state.map.setView(bounds.getCenter(),12,{animate:false});
 }
 return bounds?.isValid()?bounds.getCenter():state.map.getCenter();
}
function gvSearchSelectElectric(entry){
 $('search').value=entry.name;$('search-results').hidden=true;
 const pt=gvSearchFocusFeature(entry.feature);
 clickFeature(entry.feature,entry.name,'electrico');
 L.popup({maxWidth:370,autoPan:true}).setLatLng(pt).setContent(electricPopup(entry.feature)).openOn(state.map);
 status(gvSearchTypes[entry.kind]+': '+entry.name);
}
function gvSearchSelectVolcano(volcano){
 $('auto-viewport').checked=false;
 const region=volcano.regiones[0];
 $('macrozona-selector').value=zoneForRegion(region);updateMacrozone($('macrozona-selector').value);
 $('region-selector').value=region;populateVolcanoSelectors();
 $('volcano-one').value=volcano.id;$('volcano-two').value='';
 $('search').value=volcano.nombre;$('search-results').hidden=true;
 gvSearchClearMarker();selectionChanged(true);
 const f={type:'Feature',geometry:{type:'Point',coordinates:[volcano.lon,volcano.lat]},properties:{volcan:volcano.nombre,region:REGION_NAMES[region]||region}};
 clickFeature(f,volcano.nombre,'centros');
}
function gvSearchCoord(text){
 // Coordenadas decimales: -40.574, -73.135 o -40.574 -73.135 (latitud, longitud).
 const raw=String(text).trim();
 // Separador coma para decimales con punto; punto y coma o espacio para decimales con coma.
 const m=raw.match(/^([+-]?\d{1,3}(?:\.\d+)?)\s*,\s*([+-]?\d{1,3}(?:\.\d+)?)$/)||
  raw.match(/^([+-]?\d{1,3}(?:[.,]\d+)?)\s*[;\s]\s*([+-]?\d{1,3}(?:[.,]\d+)?)$/);
 if(!m)return null;
 let a=Number(m[1].replace(',','.')),b=Number(m[2].replace(',','.'));
 if(!Number.isFinite(a)||!Number.isFinite(b))return null;
 // Reconocer longitud, latitud cuando el orden se invierte en el Chile continental.
 if((Math.abs(a)>90&&Math.abs(b)<=90)||(a<=-66&&a>=-110&&b>=-57&&b<=-17)) [a,b]=[b,a];
 if(a < -90||a > 90||b < -180||b > 180)return null;
 return {lat:a,lon:b};
}
function gvSearchLocation(lat,lon,label,origin){
 gvSearchClearMarker();
 gvSearchOverlay=L.circleMarker([lat,lon],{pane:'gv-search',radius:9,weight:2,color:'#fff',fillColor:'#00dbe6',fillOpacity:1,interactive:false}).addTo(state.map);
 state.map.setView([lat,lon],13,{animate:false});
 const div=document.createElement('div');const name=document.createElement('strong');name.textContent=label;div.append(name);
 const coords=document.createElement('div');coords.textContent=`Latitud ${lat.toFixed(6)} · Longitud ${lon.toFixed(6)}`;div.append(coords);
 const src=document.createElement('small');src.textContent=origin;div.append(src);
 L.popup({maxWidth:370}).setLatLng([lat,lon]).setContent(div).openOn(state.map);
 const where=$('detail-content');where.replaceChildren();const card=document.createElement('div');card.className='detail-card';
 const typ=document.createElement('span');typ.className='type-label';typ.textContent='UBICACIÓN';
 const head=document.createElement('h3');head.textContent=label;
 const detail=document.createElement('p');detail.textContent=`Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)} (WGS84)`;
 const attribution=document.createElement('p');attribution.textContent=origin;
 card.append(typ,head,detail,attribution);where.append(card);openDetail(true);
 $('search').value=label;$('search-results').hidden=true;
 status('Ubicación localizada: '+label);
}
async function gvSearchPlace(query){
 const plain=query.trim();if(plain.length<3)return gvSearchSetInfo('Escribe al menos 3 caracteres para buscar un lugar.');
 const seq=++gvGeoSequence;
 const key=norm(plain);
 if(!gvGeocodeCache.has(key)&&Date.now()-gvGeocodeLast<1200)return gvSearchSetInfo('Espera un segundo antes de otra consulta de lugares.');
 gvSearchSetInfo('Consultando lugares en OpenStreetMap…');
 // Nominatim: petición explícita, nunca autocompletado ni llamadas por pulsación.
 try{
  const u=new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format','jsonv2');u.searchParams.set('q',plain);u.searchParams.set('countrycodes','cl');u.searchParams.set('limit','5');
  let places=gvGeocodeCache.get(key);
  if(!places){
   gvGeocodeLast=Date.now();
   const resp=await fetch(u.toString(),{headers:{Accept:'application/json'}});
   if(seq!==gvGeoSequence||$('search').value.trim()!==plain)return;
   if(!resp.ok)throw new Error('HTTP '+resp.status);
   places=await resp.json();
   if(Array.isArray(places))gvGeocodeCache.set(key,places);
  }
  if(seq!==gvGeoSequence||$('search').value.trim()!==plain)return;
  const box=$('search-results');box.replaceChildren();box.hidden=false;
  if(!Array.isArray(places)||!places.length)return gvSearchSetInfo('No se encontraron lugares en Chile con ese nombre.');
  for(const item of places){const lat=Number(item.lat),lon=Number(item.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
   const name=String(item.display_name||plain);gvSearchAddResult(name,'Lugar · © OpenStreetMap / Nominatim',()=>gvSearchLocation(lat,lon,name,'Geocodificación de OpenStreetMap · posición de referencia'));
  }
 }catch(error){if(seq===gvGeoSequence)gvSearchSetInfo('La búsqueda de lugares requiere internet y el servicio de OpenStreetMap disponible. '+error.message);}
}
function gvSearchRank(entry,needle){const name=norm(entry.name);return name===needle?0:name.startsWith(needle)?1:name.includes(needle)?2:3;}
function search(){
 const box=$('search-results'),input=$('search');const needle=norm(input.value),kind=$('search-type')?.value||'todo';
 ++gvGeoSequence;box.replaceChildren();box.hidden=true;
 if(!needle)return;
 const coord=gvSearchCoord(input.value);
 if((kind==='todo'||kind==='coordenadas')&&coord){
  box.hidden=false;gvSearchAddResult(`${coord.lat.toFixed(6)}, ${coord.lon.toFixed(6)}`,'Coordenadas decimales WGS84 · Ir al punto',()=>gvSearchLocation(coord.lat,coord.lon,'Coordenadas seleccionadas','Coordenadas proporcionadas por el usuario'));
  return;
 }
 if(kind==='coordenadas'){gvSearchSetInfo('Formato: -40.574, -73.135 (latitud, longitud; grados decimales).');return;}
 if(needle.length<2)return;
 let found=[];
 if(kind==='todo'||kind==='volcan'){
  for(const v of state.volcanoIndex?.volcanes||[])if(norm(v.nombre).includes(needle))found.push({kind:'volcan',name:v.nombre,sub:(v.regiones||[]).map(x=>REGION_NAMES[x]||x).join(' / '),volcano:v,terms:norm(v.nombre)});
 }
 if(kind!=='lugar'&&kind!=='volcan'){
  if(gvSearchIndex){for(const e of gvSearchIndex){if(kind!=='todo'&&e.kind!==kind)continue;if(e.terms.includes(needle))found.push(e);}}
  else {void gvSearchEnsureIndex().then(()=>{if(input.value===gvSearchLastInput&&($('search-type')?.value||'todo')===gvSearchLastKind)search();}).catch(err=>{if(input.value===gvSearchLastInput)gvSearchSetInfo('No se pudo cargar el inventario SEN: '+err.message);});}
 }
 gvSearchLastInput=input.value;gvSearchLastKind=kind;
 found.sort((a,b)=>gvSearchRank(a,needle)-gvSearchRank(b,needle)||a.name.localeCompare(b.name,'es'));
 box.hidden=false;
 for(const e of found.slice(0,15))gvSearchAddResult(e.name,(gvSearchTypes[e.kind]||e.kind)+' · '+(e.sub||'Sin detalle adicional'),()=>e.kind==='volcan'?gvSearchSelectVolcano(e.volcano):gvSearchSelectElectric(e));
 if(found.length>15){const note=document.createElement('div');note.className='gv-search-info';note.textContent=`${found.length} coincidencias. Escribe más caracteres para precisar.`;box.append(note);}
 if(kind==='todo'||kind==='lugar')gvSearchAddResult('Buscar lugar: '+input.value,'Consulta manual a OpenStreetMap · requiere internet',()=>gvSearchPlace(input.value));
 else if(!found.length)gvSearchSetInfo(gvSearchIndex||kind==='volcan'?'Sin coincidencias. Prueba otro nombre.':'Cargando inventario SEN…');
}
let gvSearchLastInput='',gvSearchLastKind='todo';
function gvSearchEnter(event){
 if(event.key!=='Enter')return;event.preventDefault();
 const coord=gvSearchCoord($('search').value),kind=$('search-type')?.value||'todo';
 if((kind==='todo'||kind==='coordenadas')&&coord){++gvGeoSequence;gvSearchLocation(coord.lat,coord.lon,'Coordenadas seleccionadas','Coordenadas proporcionadas por el usuario');return;}
 if(kind==='lugar'){void gvSearchPlace($('search').value);return;}
 const first=$('search-results').querySelector('.gv-search-hit');
 if(first)first.click();else if(kind==='todo')void gvSearchPlace($('search').value);
}
function handleMeasurement(e){if(!state.measureMode)return;state.measuring.push(e.latlng);const marks=state.measureGroup;if(state.measuring.length>2){marks.clearLayers();state.measuring=[e.latlng]}
 L.circleMarker(e.latlng,{radius:4,color:'#fff',fillColor:'#55c7f0',fillOpacity:1}).addTo(marks);
 if(state.measuring.length===2){const a=state.measuring[0],b=state.measuring[1];L.polyline([a,b],{color:'#51bde6',dashArray:'6 5',weight:2}).addTo(marks);const d=a.distanceTo(b)/1000;status(`Medición aproximada: ${d.toFixed(2)} km (distancia geodésica) · nueva medición: otro clic`);state.measuring=[];state.measureMode=false;$('measure').classList.remove('active');}}
function updateActiveBadge(){
 const active=['volcanoes','hazards','routes','points-pe','points-pet','evac-areas','rings'].filter(layerVisible).length + ['power-lines','assets','substations'].filter(enabled).length;
 setText('layer-active-count',String(active));
}
function openPanel(on){const p=$('sidebar');p.classList.toggle('open',on);p.setAttribute('aria-hidden',String(!on));$('open-sidebar').setAttribute('aria-expanded',String(on));}
function openDetail(on){$('detail-panel').hidden=!on;$('toggle-detail').setAttribute('aria-expanded',String(on));}
function openLegend(on){$('legend-panel').hidden=!on;$('toggle-legend').setAttribute('aria-expanded',String(on));}
function openBasemap(on){$('basemap-menu').hidden=!on;$('toggle-basemap').setAttribute('aria-expanded',String(on));}
function buttons(){
 for(const id of VOLCANIC){const el=$(id);if(el)el.addEventListener('change',render)}
 for(const distance of [5,10,15,20,40]){const label=document.createElement('label');label.className='layer';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.id='ring-'+distance;input.addEventListener('change',render);const sw=document.createElement('i');sw.className='swatch line';sw.style.setProperty('--sw',RING_COLORS[distance]);label.append(input,sw,document.createTextNode(distance+' km'));$('ring-options').append(label)}
 $('search').addEventListener('input',search);
 $('search').addEventListener('keydown',gvSearchEnter);
 $('search-type').addEventListener('change',search);
 $('region-selector').addEventListener('change',zoneChanged);
 $('macrozona-selector').addEventListener('change',macrozonaChanged);
 $('auto-viewport').addEventListener('change',()=>{if($('auto-viewport').checked){state.autoIds=[];state.lastTier=-1;syncMapScale();}else{selectionChanged(true);}});
 $('volcano-one').addEventListener('change',()=>{$('auto-viewport').checked=false;selectionChanged(true)});
 $('volcano-two').addEventListener('change',()=>{$('auto-viewport').checked=false;selectionChanged(true)});
 $('zoom-sector').addEventListener('click',focusSector);
 $('zoom-calbuco').addEventListener('click',()=>state.map.setView(CALBUCO,11));
 $('show-all').addEventListener('click',()=>{for(const id of VOLCANIC)$(id).checked=id!=='arrows';for(const x of document.querySelectorAll('[id^="ring-"]'))x.checked=true;render()});
 $('hide-all').addEventListener('click',()=>{for(const id of VOLCANIC)$(id).checked=false;render()});
 $('reset').addEventListener('click',()=>{for(const [id,val] of Object.entries(defaults))if($(id))$(id).checked=val;for(const x of document.querySelectorAll('[id^="ring-"]'))x.checked=true;$('region-selector').value=DEFAULT_REGION;$('macrozona-selector').value='sur';updateMacrozone('sur');populateVolcanoSelectors(true);switchBasemap('satelite');$('auto-viewport').checked=false;state.autoIds=[];selectionChanged(false);state.map.fitBounds(BOUNDS,{padding:[14,14],animate:false});void refreshSen()});
 $('measure').addEventListener('click',()=>{state.measureMode=!state.measureMode;state.measuring=[];$('measure').classList.toggle('active',state.measureMode);status(state.measureMode?'Regla: selecciona dos puntos del mapa.':'Medición cancelada.');});
 $('measure-clear').addEventListener('click',()=>{state.measureGroup.clearLayers();state.measuring=[];state.measureMode=false;$('measure').classList.remove('active');status('Medición limpiada.');});
 $('open-sidebar').addEventListener('click',()=>openPanel(!$('sidebar').classList.contains('open')));
 $('close-sidebar').addEventListener('click',()=>openPanel(false));
 $('toggle-detail').addEventListener('click',()=>openDetail($('detail-panel').hidden));
 $('close-detail').addEventListener('click',()=>openDetail(false));
 $('toggle-legend').addEventListener('click',()=>openLegend($('legend-panel').hidden));
 $('close-legend').addEventListener('click',()=>openLegend(false));
 $('toggle-basemap').addEventListener('click',()=>openBasemap($('basemap-menu').hidden));
 for(const input of document.querySelectorAll('input[name="basemap"],input[name="quick-basemap"]'))input.addEventListener('change',()=>{switchBasemap(input.value);openBasemap(false)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){openPanel(false);openBasemap(false);openDetail(false);openLegend(false);$('search-results').hidden=true;}});
 updateActiveBadge();
}
if(initMap()){buttons();setupSen();load()}
})();
