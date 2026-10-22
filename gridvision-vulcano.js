/* GridVision Vulcano 0.6 · Visor nacional compacto · copias cartográficas oficiales, sin alerta en vivo */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const DIR='data/vulcano/';
const MAP_COLOR={Alto:'#ff0000',Medio:'#ffaa00',Bajo:'#ffff00'};
const RING_COLORS={5:'#a80000',10:'#e60000',15:'#e64c00',20:'#e69800',40:'#e6e600'};
const ALL=['hazards','haz-alto','haz-medio','haz-bajo','volcanoes','labels-volcanoes','routes','arrows','points-pe','points-pet','labels-points','evac-areas','rings','assets','power-lines'];
const ELECTRIC=['assets','power-lines','line-500','line-220','line-110','line-66','line-other'];
const VOLCANIC=['hazards','haz-alto','haz-medio','haz-bajo','volcanoes','labels-volcanoes','routes','arrows','points-pe','points-pet','labels-points','evac-areas','rings'];
const defaults={hazards:false,'haz-alto':true,'haz-medio':true,'haz-bajo':true,volcanoes:true,'labels-volcanoes':false,routes:false,arrows:false,'points-pe':false,'points-pet':false,'labels-points':false,'evac-areas':false,rings:false,assets:false,'power-lines':true,'line-500':true,'line-220':true,'line-110':true,'line-66':true,'line-other':true};
const classes={peligro:['Polygon','MultiPolygon'],centros:['Point','MultiPoint'],vias:['LineString','MultiLineString'],puntos:['Point','MultiPoint'],evacuacion:['Polygon','MultiPolygon'],anillos:['LineString','MultiLineString']};
const BOUNDS=[[-56.1,-75.8],[-17.5,-66.0]],CHILE_CENTER=[-34.1,-70.7],CALBUCO=[-41.329,-72.614];
const state={map:null,manifest:null,raw:{},current:{},layerGroups:{},activeArrows:null,measuring:[],measureGroup:null,loaded:false,measureMode:false,selected:null,baseLayers:{},baseName:'satelite',renderId:0};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const enabled=id=>!!$(id)?.checked;
const setText=(id,value)=>{if($(id))$(id).textContent=value;};
const safeNum=(n)=>Number.isFinite(Number(n))?Number(n).toLocaleString('es-CL'):'—';
const fc=features=>({type:'FeatureCollection',features});
const isGeo=(key,d)=>d?.type==='FeatureCollection'&&Array.isArray(d.features)&&d.features.length<=4500&&d.features.every(f=>f?.type==='Feature'&&classes[key].includes(f.geometry?.type)&&f.properties&&typeof f.properties==='object');
function status(msg,error=false){const el=$('map-state');if(!el)return;el.textContent=msg;el.classList.toggle('error',error);}
function makePane(name,z){if(!state.map.getPane(name))state.map.createPane(name);state.map.getPane(name).style.zIndex=String(z);}
function initMap(){
 if(!window.L){status('No se ha cargado Leaflet. Compruebe vendor/leaflet/leaflet.js',true);return false;}
 const m=state.map=L.map('vulcano-map',{preferCanvas:true,zoomControl:false,maxZoom:18,minZoom:3}).fitBounds(BOUNDS,{padding:[18,18]});
 L.control.zoom({position:'bottomright'}).addTo(m);L.control.scale({position:'bottomleft',imperial:false}).addTo(m);
 const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri, Maxar, Earthstar Geographics y colaboradores GIS',maxZoom:18});
 const labels=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri Reference',maxZoom:18,opacity:.85});
 const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18});
 const light=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap contributors · © CARTO',maxZoom:18});
 state.baseLayers={satelite:[sat,labels],osm:[osm],claro:[light],'satellite-only':[sat]};sat.addTo(m);labels.addTo(m);
 for(const [n,z] of [['danger',360],['area',376],['distance',393],['power',403],['route',424],['arrow',432],['volcano',452],['point',464],['label',475]])makePane('gv-'+n,z);
 m.on('zoomend moveend',()=>{updateArrows();updateLabels()});m.on('click',handleMeasurement);
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
async function fetchJSON(path,max=20e6){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status}: ${path}`);const n=Number(r.headers.get('content-length')||0);if(n>max)throw new Error(`Archivo demasiado grande: ${path}`);const text=await r.text();if(text.length>max)throw new Error(`Límite de descarga excedido: ${path}`);return JSON.parse(text);}
async function readLayer(key,spec){const a=spec?.archivos;if(!Array.isArray(a)||!a.length||a.length>90)throw new Error('Catálogo inválido: '+key);
 let result=[];for(const path of a){if(typeof path!=='string'||!/^data\/vulcano\/[a-z0-9_\-]+\.geojson$/i.test(path))throw new Error('Ruta fuera del módulo volcánico');
 const d=await fetchJSON(path);if(!isGeo(key,d))throw new Error('GeoJSON no válido: '+path);result.push(...d.features);}
 if(result.length!==spec.conteo)throw new Error(`Cantidad inconsistente en ${key}: ${result.length} ≠ ${spec.conteo}`);
 const ids=new Set();for(const f of result){const id=f.properties.objectid??f.properties.OBJECTID; if(id!=null){if(ids.has(id))throw new Error('Identificador repetido en '+key);ids.add(id)}}
 return fc(result);
}
async function load(){
 status('Preparando visor nacional…');
 let manifest=null,legacy=false;
 try {manifest=await fetchJSON(DIR+'catalogo_vulcano_v06.json',2e6);}
 catch(e){try{manifest=await fetchJSON(DIR+'catalogo_vulcano_v05.json',2e6);legacy=true;}catch(e2){/* La vista de líneas funciona sin descarga volcánica */}}
 const blank=()=>fc([]);
 const all={};for(const k of Object.keys(classes))all[k]=blank();
 if(manifest){
  try{
   if(!manifest.capas || !(manifest.schema===60&&manifest.ambito==='NACIONAL_CHILE'||legacy&&manifest.schema===50))throw new Error('Catálogo no reconocido');
   for(const k of Object.keys(classes)){if(!manifest.capas[k])throw new Error('Falta capa '+k);all[k]=await readLayer(k,manifest.capas[k]);}
   state.manifest=manifest;
   setText('source-date',String(manifest.descargadoEn||'Fecha no registrada'));
  }catch(e){console.error('Vulcano, datos de referencia:',e);state.manifest=null;for(const k of Object.keys(classes))all[k]=blank();status('Capa volcánica pendiente de importar: '+e.message,true);}
 }
 state.raw=all;state.loaded=true;bindCounts();await render();
 if(!state.manifest){status('Infraestructura eléctrica disponible. Para cartografía volcánica nacional ejecute el importador v0.6.',true);}
 else if(legacy){status('Modo de compatibilidad: cobertura volcánica REGIONAL v0.5. Importe v0.6 para Chile completo.');}
 else{status('Cobertura volcánica nacional cargada · No representa una alerta vigente');}
}
function byScope(key,features){return features; /* Vista nacional: sin recorte por nombre de volcán */}
function getType(f){return norm(f.properties?.tipo).replace(/[^a-z]/g,'')==='pet'?'PET':'PE';}
function filtered(key){return byScope(key,state.raw[key]?.features||[]);}
function bindCounts(){const hazard=state.raw.peligro?.features||[];
 for(const cat of Object.keys(MAP_COLOR))setText('n-'+norm(cat),safeNum(hazard.filter(f=>String(f.properties?.peligro).trim()===cat).length));
 setText('total-hazards',safeNum(hazard.length));
 setText('n-areas',safeNum(state.raw.evacuacion?.features.length));setText('n-rings',safeNum(state.raw.anillos?.features.length));
 scopeCounts();
}
function scopeCounts(){let cen=filtered('centros').length,routes=filtered('vias').length,pts=filtered('puntos');
 setText('n-volcanoes',safeNum(cen));setText('n-routes',safeNum(routes));setText('n-pe',safeNum(pts.filter(f=>getType(f)==='PE').length));setText('n-pet',safeNum(pts.filter(f=>getType(f)==='PET').length));
 setText('kpi-volcanoes',safeNum(cen));setText('kpi-routes',safeNum(routes));setText('kpi-points',safeNum(pts.length));
 setText('scope-note',state.manifest?.ambito==='NACIONAL_CHILE'?'Nacional':'Cobertura regional');}
function clickFeature(feature,title,key){state.selected={feature,title,key};showDetail(feature,title,key);}
function itemLabel(f,key){const p=f.properties||{};if(key==='centros')return String(p.volcan||p.nombre||'Volcán');if(key==='puntos')return String(p.nombre||'Punto de encuentro');if(key==='vias')return String(p.volcan||p.nombre||'Vía de evacuación');if(key==='evacuacion')return String(p.nombre||'Área de evacuación');if(key==='anillos')return `${p.distance??'?'} km del cráter`;return `Peligro ${p.peligro||'sin categoría'}`;}
function makeTooltip(feature,label,key){const div=document.createElement('div');const b=document.createElement('strong');b.textContent=label;div.append(b);const p=document.createElement('p');p.textContent=key==='vias'?'Vía oficial. Sentido de trazado NO acreditado como dirección de evacuación.':'Cartografía de referencia, no alerta en vivo.';div.append(p);return div;}
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
async function render(){if(!state.loaded)return;const epoch=++state.renderId;clearGroups();scopeCounts();
 redrawGroup('peligro',enabled('hazards'),[],{});
 if(enabled('hazards')){state.layerGroups.peligro=drawHazards();state.layerGroups.peligro.addTo(state.map);}
 redrawGroup('evacuacion',enabled('evac-areas'),filtered('evacuacion'),{pane:'gv-area',renderer:L.canvas({pane:'gv-area'}),style:{color:'#161c22',weight:.6,fillColor:'#ffa77f',fillOpacity:.47},onEachFeature:each('evacuacion')});
 redrawGroup('anillos',enabled('rings'),filtered('anillos').filter(f=>enabled('ring-'+f.properties?.distance)),{pane:'gv-distance',renderer:L.canvas({pane:'gv-distance'}),style:decorateRing,onEachFeature:each('anillos')});
 redrawGroup('vias',enabled('routes'),filtered('vias'),{pane:'gv-route',renderer:L.canvas({pane:'gv-route'}),style:{color:'#004da8',weight:3.4,opacity:.96},onEachFeature:each('vias')});
 redrawGroup('centros',enabled('volcanoes'),filtered('centros'),{pane:'gv-volcano',pointToLayer:markerVolcano,onEachFeature:each('centros')});
 const pts=filtered('puntos').filter(f=>enabled('points-'+getType(f).toLowerCase()));
 redrawGroup('puntos',pts.length>0,pts,{pane:'gv-point',pointToLayer:markerPoint,onEachFeature:each('puntos')});
 await drawElectrical(epoch);if(epoch!==state.renderId)return;updateLabels();updateArrows();renderLegend();updateActiveBadge();
}
function updateLabels(){if(!state.loaded)return;const zoom=state.map.getZoom();for(const key of ['centros','puntos']){
 const group=state.layerGroups[key];if(!group)continue;group.eachLayer(marker=>{if(!(marker instanceof L.Marker))return;
 const p=marker.feature?.properties||{};let show=key==='centros'?enabled('labels-volcanoes')&&zoom>=9:enabled('labels-points')&&zoom>=9;
 if(!show){marker.unbindTooltip();return;}const text=key==='centros'?p.volcan:p.nombre;
 if(text)marker.bindTooltip(String(text).slice(0,90),{permanent:true,direction:'right',offset:[12,0],className:key==='centros'?'volcano-label':'pe-label',opacity:1}).openTooltip();
 });}
}
// Las flechas se basan en el orden geométrico. Ese orden no acredita sentido oficial de evacuación.
function routeSequences(g){if(g?.type==='LineString')return [g.coordinates];if(g?.type==='MultiLineString')return g.coordinates;return []}
function updateArrows(){if(!state.map||!state.loaded)return;if(state.activeArrows)state.map.removeLayer(state.activeArrows);
 const arrows=state.activeArrows=L.layerGroup();if(!enabled('routes')||!enabled('arrows'))return;
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
function renderLegend(){const target=$('legend-content');target.replaceChildren();if(enabled('hazards'))for(const [cat,color] of Object.entries(MAP_COLOR))if(enabled('haz-'+norm(cat)))target.append(makeLegendRow(color,cat+' · peligro volcánico'));
 if(enabled('evac-areas'))target.append(makeLegendRow('#ffa77f','Área de evacuación'));
 if(enabled('routes'))target.append(makeLegendRow('#004da8','Vía de evacuación','line'));
 if(enabled('arrows')&&enabled('routes'))target.append(makeLegendRow('#21b3ff','Flecha: sentido de digitalización NO validado','line'));
 if(enabled('points-pe'))target.append(makeLegendRow('#09a66d','PE · Punto de encuentro','dot'));
 if(enabled('points-pet'))target.append(makeLegendRow('#e8ae27','PET · Punto de encuentro transitorio','dot'));
 if(enabled('volcanoes'))target.append(makeLegendRow('#ba3d3d','Volcán geológicamente activo','dot'));
 if(enabled('rings'))for(const [r,color] of Object.entries(RING_COLORS))if(enabled('ring-'+r))target.append(makeLegendRow(color,r+' km · referencia','line'));
 if(enabled('assets'))target.append(makeLegendRow('#53dbff','Activo eléctrico','dot'));
 if(enabled('power-lines'))for(const [band,color] of Object.entries(VOLTAGE_COLOR))if(enabled('line-'+band))target.append(makeLegendRow(color,band==='500'?'500 kV':band==='220'?'220–345 kV':band==='110'?'110–154 kV':band==='66'?'66–69 kV':'Otras tensiones','line'));
 if(!target.children.length){const p=document.createElement('p');p.className='legend-empty';p.textContent='Activa alguna capa para mostrar la leyenda.';target.append(p)}
}
function showDetail(f,title,key){const p=f.properties||{},where=$('detail-content');where.replaceChildren();const box=document.createElement('div');box.className='detail-card';
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
async function drawElectrical(epoch){
 if(!enabled('assets')&&!enabled('power-lines'))return;
 const services=[['power-lines','data/processed/lineas_validadas.geojson','lineas'],['assets','data/processed/activos_puntuales_validados.geojson','activos']];
 for(const [id,path,key] of services){
  if(!enabled(id))continue;
  try{
   let collection=state.current[key];if(!collection){collection=await fetchJSON(path,9e6);state.current[key]=collection;}
   if(epoch!==state.renderId)return;
   if(!Array.isArray(collection.features))throw new Error('No es FeatureCollection');
   let features=collection.features;
   if(key==='lineas')features=features.filter(f=>enabled('line-'+voltageBand(f)));
   setText(key==='activos'?'n-assets':'n-lines',safeNum(features.length));
   const cfg=key==='activos'?{pane:'gv-point',pointToLayer:(f,ll)=>L.circleMarker(ll,{pane:'gv-point',radius:3,color:'#fff',weight:.5,fillColor:'#52dbff',fillOpacity:.94})}:{pane:'gv-power',renderer:L.canvas({pane:'gv-power',padding:.3}),style:f=>({color:VOLTAGE_COLOR[voltageBand(f)],weight:state.map.getZoom()>=9?2.2:1.25,opacity:.85})};
   state.layerGroups[key]=L.geoJSON(fc(features),{...cfg,onEachFeature:each('electrico')}).addTo(state.map);
  }catch(e){console.warn('GridVision eléctrico:',e);status('No se pudo cargar infraestructura eléctrica: '+e.message,true);}
 }
}
function search(){const text=norm($('search').value);const box=$('search-results');box.replaceChildren();box.hidden=true;if(!state.loaded||text.length<2)return;
 const result=[];for(const key of ['centros','puntos','vias'])for(const f of filtered(key)){
  const n=itemLabel(f,key);if(norm(n).includes(text)||norm(f.properties?.volcan).includes(text))result.push({key,feature:f,title:n});if(result.length>=25)break;
 }if(!result.length)return;
 for(const item of result.slice(0,20)){const b=document.createElement('button');b.type='button';b.textContent=({centros:'▲ ',puntos:'◎ ',vias:'➤ '})[item.key]+item.title;b.addEventListener('click',()=>{viewBounds(item.feature);clickFeature(item.feature,item.title,item.key);box.hidden=true;});box.append(b)}box.hidden=false;
}
function handleMeasurement(e){if(!state.measureMode)return;state.measuring.push(e.latlng);const marks=state.measureGroup;if(state.measuring.length>2){marks.clearLayers();state.measuring=[e.latlng]}
 L.circleMarker(e.latlng,{radius:4,color:'#fff',fillColor:'#55c7f0',fillOpacity:1}).addTo(marks);
 if(state.measuring.length===2){const a=state.measuring[0],b=state.measuring[1];L.polyline([a,b],{color:'#51bde6',dashArray:'6 5',weight:2}).addTo(marks);const d=a.distanceTo(b)/1000;status(`Medición aproximada: ${d.toFixed(2)} km (distancia geodésica) · nueva medición: otro clic`);state.measuring=[];state.measureMode=false;$('measure').classList.remove('active');}}
function updateActiveBadge(){
 const active=['power-lines','assets','volcanoes','hazards','routes','points-pe','points-pet','evac-areas','rings'].filter(enabled).length;
 setText('layer-active-count',String(active));
}
function openPanel(on){const p=$('sidebar');p.classList.toggle('open',on);p.setAttribute('aria-hidden',String(!on));$('open-sidebar').setAttribute('aria-expanded',String(on));}
function openDetail(on){$('detail-panel').hidden=!on;$('toggle-detail').setAttribute('aria-expanded',String(on));}
function openLegend(on){$('legend-panel').hidden=!on;$('toggle-legend').setAttribute('aria-expanded',String(on));}
function openBasemap(on){$('basemap-menu').hidden=!on;$('toggle-basemap').setAttribute('aria-expanded',String(on));}
function buttons(){
 for(const id of [...ALL,'line-500','line-220','line-110','line-66','line-other']){const el=$(id);if(el)el.addEventListener('change',render)}
 for(const distance of [5,10,15,20,40]){const label=document.createElement('label');label.className='layer';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.id='ring-'+distance;input.addEventListener('change',render);const sw=document.createElement('i');sw.className='swatch line';sw.style.setProperty('--sw',RING_COLORS[distance]);label.append(input,sw,document.createTextNode(distance+' km'));$('ring-options').append(label)}
 $('search').addEventListener('input',search);
 $('zoom-sector').addEventListener('click',()=>state.map.fitBounds(BOUNDS,{padding:[18,18]}));
 $('zoom-calbuco').addEventListener('click',()=>state.map.setView(CALBUCO,11));
 $('show-all').addEventListener('click',()=>{for(const id of VOLCANIC)$(id).checked=id!=='arrows';for(const x of document.querySelectorAll('[id^="ring-"]'))x.checked=true;render()});
 $('hide-all').addEventListener('click',()=>{for(const id of VOLCANIC)$(id).checked=false;render()});
 $('reset').addEventListener('click',()=>{for(const [id,val] of Object.entries(defaults))if($(id))$(id).checked=val;for(const x of document.querySelectorAll('[id^="ring-"]'))x.checked=true;state.map.fitBounds(BOUNDS,{padding:[18,18]});switchBasemap('satelite');render()});
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
if(initMap()){buttons();load()}
})();
