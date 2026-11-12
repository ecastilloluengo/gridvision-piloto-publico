/* GridVision Navigation + offline SEN V1 (no modifica las APIs ni las capas actuales). */
(() => {
  'use strict';
  const scriptURL = document.currentScript?.src || location.href;
  function iniciarNavegacion() {
  const VERSION = 'gv-nav-v21-20261112';
  const CACHE = 'gridvision-nav-offline-v1';
  const METADATA = '__gv-nav-offline-ready-v1.json';
  const ROOT = new URL('../../', scriptURL);
  const viewId = document.getElementById('mapa') ? 'mapa' :
    document.getElementById('fire-map') ? 'fire-map' :
    document.getElementById('vulcano-map') ? 'vulcano-map' : null;
  const globals = {mapa:'GridVisionMapa', 'fire-map':'GridVisionFireMap', 'vulcano-map':'GridVisionVulcanoMap'};
  const map = viewId ? window[globals[viewId]] : null;
  if (!map || !window.L) {
    console.warn('GridVision navegación: mapa no disponible; no se instaló el control.');
    return;
  }
  if (window.GridVisionNavigationV1) return;

  const GPS_OPTS = {enableHighAccuracy:true, maximumAge:0, timeout:20000};
  // GV GPS V1.3: mutually exclusive modes; stale callbacks are ignored.
  let watchId = null;
  let gpsMode = 'off';
  let gpsGeneration = 0;
  let marker = null;
  let accuracyCircle = null;
  let lastFix = null;
  let statusEl, followBtn, locateBtn, downloadBtn, offlineMenuBtn, baseBtn;
  const absolute = name => new URL(name, ROOT).href;
  const clean = href => {const url = new URL(href, ROOT); url.search=''; url.hash=''; return url.href;};
  const inScope = url => url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
  function status(message, kind='normal') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    if (offlineMenuBtn) {
      offlineMenuBtn.dataset.kind = kind;
      offlineMenuBtn.title = 'Navegación y SEN offline · ' + message;
    }
  }
  function oldGpsHide() {
    const gps = Array.from(document.querySelectorAll('.leaflet-control a')).filter(el => {
      if (el.closest('.gv-nav-panel')) return false;
      return el.id === 'boton-seguimiento-ubicacion' ||
        /^(Mostrar mi ubicaci[oó]n actual|Activar mi ubicacion actual|Activar mi ubicacion GPS)$/i.test(el.title || '');
    });
    for (const el of gps) {
      const box = el.closest('.leaflet-control');
      if (box) box.style.display = 'none';
    }
  }
  function drawFix(pos, center=false, initial=false) {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const accuracy = Math.max(0, Number(pos.coords.accuracy)||0);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    lastFix = {lat,lon,accuracy,at:pos.timestamp};
    const latlng = L.latLng(lat,lon);
    if (!marker) {
      marker = L.circleMarker(latlng, {radius:8,color:'#fff',weight:3,
        fillColor:'#1976d2',fillOpacity:1,interactive:true}).addTo(map);
    } else marker.setLatLng(latlng);
    if (!accuracyCircle) {
      accuracyCircle = L.circle(latlng,{radius:accuracy,interactive:false,
        color:'#1976d2',weight:1,fillColor:'#1976d2',fillOpacity:.10}).addTo(map);
    } else { accuracyCircle.setLatLng(latlng); accuracyCircle.setRadius(accuracy); }
    marker.bindPopup('<strong>'+(gpsMode === 'locate' ? 'Ubicación puntual' : 'Seguimiento GPS')+'</strong><br>Latitud: '+lat.toFixed(6)+
      '<br>Longitud: '+lon.toFixed(6)+'<br>Precisión aproximada: '+Math.round(accuracy)+' m',
      {autoPan:false});
    // Solo "Mi ubicación" cambia el zoom. Seguimiento conserva el zoom del usuario.
    if (initial) map.setView(latlng, Math.min(17,map.getMaxZoom()), {animate:false});
    else if (center) map.panTo(latlng,{animate:false});
    status('GPS activo · precisión ±'+Math.round(accuracy)+' m'+(!navigator.onLine?' · sin internet':''),'ok');
  }
  function updateGpsButtons() {
    const located = gpsMode === 'locate';
    const following = gpsMode === 'follow';
    if (locateBtn) {
      locateBtn.setAttribute('aria-pressed', String(located));
      locateBtn.textContent = located ? '◎ Ocultar ubicación' : '◎ Mi ubicación';
      locateBtn.title = located ? 'Desactivar mi ubicación' : 'Mostrar ubicación actual';
      locateBtn.setAttribute('aria-label', locateBtn.title);
    }
    if (followBtn) {
      followBtn.setAttribute('aria-pressed', String(following));
      followBtn.textContent = following ? '■ Detener' : '▶ Seguir';
      followBtn.title = following ? 'Detener seguimiento GPS' : 'Seguir el GPS sin cambiar el zoom';
      followBtn.setAttribute('aria-label', followBtn.title);
    }
  }
  function clearGps() {
    ++gpsGeneration;
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (marker) { map.removeLayer(marker); marker = null; }
    if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    lastFix = null;
    gpsMode = 'off';
    updateGpsButtons();
  }
  function gpsError(err, generation, follow=false) {
    if (generation !== gpsGeneration) return;
    const denied = err?.code === 1;
    if (denied || !follow) clearGps();
    status(denied ? 'Ubicación denegada. Revisa permisos del navegador.' :
      follow ? 'GPS sin posición reciente. Esperando una nueva lectura.' :
      'No se obtuvo ubicación. Pulsa Mi ubicación para reintentar.', 'warning');
  }
  function locateOnce() {
    if (gpsMode === 'locate') {
      clearGps(); status('Ubicación desactivada.'); return;
    }
    if (!navigator.geolocation) return status('Este dispositivo no ofrece ubicación GPS.','warning');
    clearGps();
    gpsMode = 'locate'; updateGpsButtons();
    const generation = gpsGeneration;
    status('Buscando ubicación actual…');
    navigator.geolocation.getCurrentPosition(pos=>{
      if (generation !== gpsGeneration || gpsMode !== 'locate') return;
      drawFix(pos,false,true);
      if (lastFix) status('Ubicación puntual · precisión ±'+Math.round(lastFix.accuracy)+' m · pulsa para ocultar','ok');
    }, err=>gpsError(err,generation), GPS_OPTS);
  }
  function stopFollow() {
    clearGps(); status('GPS desactivado.');
  }
  function toggleFollow() {
    if (gpsMode === 'follow') return stopFollow();
    if (!navigator.geolocation) return status('Este dispositivo no ofrece ubicación GPS.','warning');
    clearGps();
    gpsMode = 'follow'; updateGpsButtons();
    const generation = gpsGeneration;
    status('Iniciando seguimiento GPS…');
    // panTo conserva el zoom seleccionado.
    watchId = navigator.geolocation.watchPosition(pos=>{
      if (generation !== gpsGeneration || gpsMode !== 'follow') return;
      drawFix(pos,true,false);
    }, err=>gpsError(err,generation,true), GPS_OPTS);
  }
  function offlineStyle() {
    document.body.classList.toggle('gv-nav-offline',!navigator.onLine);
    if(!navigator.onLine)document.body.classList.add('gv-nav-live-stale');
  }
  // Do not allow historical/empty live counters to be interpreted as a current zero.
  function markLiveUnavailable(){
    if(!document.body.classList.contains('gv-nav-live-stale'))return;
    for(const id of ['abrir-senapred','abrir-dmc','boton-centro-alertas']){
      const el=document.getElementById(id);if(!el)continue;
      el.disabled=true;
      el.title='Datos no actualizados. Conectate y recarga GridVision.';
      el.setAttribute('aria-label',el.title);
    }
    for(const id of ['kpi-total','kpi-critical','kpi-attention','kpi-watch','map-status']){
      const el=document.getElementById(id);if(el)el.setAttribute('aria-label','Datos de incendios no actualizados');
    }
  }
  async function readyState() {
    if (!('caches' in window)) return false;
    const cache=await caches.open(CACHE);
    const response=await cache.match(absolute(METADATA));
    if (!response?.ok) return false;
    const meta=await response.json();
    if (meta.version!==VERSION || !(await cache.match(absolute('data/offline/base-chile-v2.geojson')))?.ok) return false;
    return meta;
  }
  async function gatherFiles() {
    const pages=['index.html','gridvision-fire.html','gridvision-vulcano.html'];
    const targets=new Set([
      ...pages,'vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css',
      'components/gridvision-nav/gridvision-nav.js','components/gridvision-nav/gridvision-nav.css',
      'gridvision-sw.js','data/offline/base-chile-v2.geojson',
      'components/localizador-fallas/localizador-fallas.html',
      'components/panel-operacional.html',
      'components/gridvision-nav/gridvision-modo-clima.js',
      'components/gridvision-nav/gridvision-modo-clima.css',
      'data/processed/activos_puntuales_validados.geojson',
      'data/processed/lineas_validadas.geojson',
      'data/processed/pfv_netbilling.geojson',
      'data/vulcano/catalogo_vulcano_v06.json','data/vulcano/volcanes_v068.json'
    ]);
    for (const page of pages) {
      const r=await fetch(absolute(page),{cache:'no-store'});
      if (!r.ok) throw new Error('No fue posible cargar '+page+' ('+r.status+')');
      const doc=new DOMParser().parseFromString(await r.text(),'text/html');
      for (const el of doc.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="icon"][href]')) {
        const raw=el.getAttribute('src')||el.getAttribute('href');
        if (!raw || raw.startsWith('data:')) continue;
        const url=new URL(raw,absolute(page));
        if (!inScope(url)) continue;
        const local=url.pathname.slice(ROOT.pathname.length);
        if (local && !/^(api\/|data\/alertas_senapred\.json|data\/dmc\/)/.test(local)) targets.add(local);
      }
    }
    return Array.from(targets);
  }
  async function prepareOffline() {
    if (!navigator.onLine) {status('Conéctate a internet para preparar la descarga.','warning');return;}
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
      status('El navegador no permite almacenamiento offline en este contexto.','warning');return;
    }
    downloadBtn.disabled=true;
    try {
      await navigator.serviceWorker.register(absolute('gridvision-sw.js'),{scope:ROOT.pathname});
      await navigator.serviceWorker.ready;
      const files=await gatherFiles();
      const cache=await caches.open(CACHE);
      let complete=0;
      const failed=[];
      // Secuencial: evita sobrecargar el móvil y permite mostrar progreso real.
      for (const name of files) {
        try {
          const url=absolute(name);
          const response=await fetch(url,{cache:'no-store'});
          if (!response.ok) throw new Error('HTTP '+response.status);
          if(name==='data/offline/base-chile-v2.geojson'){
            const baseData=await response.clone().json();
            if(baseData.metadata?.schema!=='gv-base-chile-v2'||baseData.type!=='FeatureCollection'||!baseData.features?.length)throw new Error('Cartografía nacional inválida');
          }
          await cache.put(clean(url),response.clone());
          const saved=await cache.match(clean(url));
          if (!saved?.ok) throw new Error('No se verificó en almacenamiento');
          complete++;
        } catch (err) { failed.push(name+' ('+err.message+')'); }
        status('Preparando SEN y mapa offline: '+(complete+failed.length)+'/'+files.length+' archivos…');
      }
      const required=['index.html','gridvision-fire.html','gridvision-vulcano.html',
        'vendor/leaflet/leaflet.js','data/processed/activos_puntuales_validados.geojson',
        'data/processed/lineas_validadas.geojson','data/offline/base-chile-v2.geojson'];
      const critical=required.filter(x=>failed.some(f=>f.startsWith(x+' (')));
      if (failed.length) {
        // Nunca registrar como listo si falta un archivo JS, CSS o geográfico.
        await cache.delete(absolute(METADATA));
        status('Descarga incompleta: '+failed.length+' archivo(s). Reintenta conectado.','warning');
        console.warn('GridVision offline: descargas fallidas',failed,critical);
      } else {
        const meta={version:VERSION,fecha:new Date().toISOString(),archivos:complete,
          alcance:'Visores, librerías, SEN y mapa nacional Natural Earth; sin detalle rural ni alertas en vivo'};
        await cache.put(absolute(METADATA),new Response(JSON.stringify(meta),
          {headers:{'Content-Type':'application/json'}}));
        if (navigator.storage?.persist) {
          try { await navigator.storage.persist(); } catch (_) { /* best effort */ }
        }
        status('SEN y mapa nacional preparados · '+complete+' archivos · prueba en modo avión.','ok');
      }
    } catch(err) {
      console.error('GridVision offline',err);
      status('No se pudo preparar offline: '+String(err.message||err),'warning');
    } finally {downloadBtn.disabled=false;}
  }
  // V2.0.2: separate explicit download for the original volcanic reference geometries.
  // No live EAV, no external tile downloads, no change to electrical data.
  function installVulcanoOffline(wrapper) {
    const INDEX='data/vulcano/volcanes_v068.json';
    const MANIFEST='data/vulcano/catalogo_vulcano_v06.json';
    const READY='__gv-vulcano-reference-v202.json';
    const PARTIAL='__gv-vulcano-partial-v202.json';
    let busy=false;
    const btn=makeButton(wrapper,'⬇ Descargar Vulcano offline','Guardar las capas originales de peligro, evacuación y volcanes para todo Chile',prepare);
    btn.className='gv-nav-download';
    const info=document.createElement('div');info.className='gv-nav-status';info.setAttribute('role','status');wrapper.append(info);
    const report=(msg,kind='normal')=>{info.textContent=msg;info.dataset.kind=kind;};
    const metaResponse=obj=>new Response(JSON.stringify(obj),{headers:{'Content-Type':'application/json'}});
    async function signature(text){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    }
    function catalog(index){
      if(index.schema!==68||index.ambito!=='VOLCANES_COMPLETOS_1_O_2'||!Array.isArray(index.volcanes)||index.volcanes.length!==104)throw new Error('Índice volcánico incompatible');
      const files=new Set(),specs=[];
      for(const v of index.volcanes){
        if(!v.capas||typeof v.capas!=='object')throw new Error('Volcán sin catálogo: '+v.id);
        for(const spec of Object.values(v.capas)){
          if(!Array.isArray(spec.archivos)||!Number.isInteger(spec.conteo)||spec.conteo<0)throw new Error('Capa inválida: '+v.id);
          for(const p of spec.archivos){if(typeof p!=='string'||!/^data\/vulcano\/[a-z0-9_\-]+\.geojson$/i.test(p))throw new Error('Ruta inválida: '+p);files.add(p);}
          specs.push(spec);
        }
      }
      if(files.size!==537)throw new Error('Cantidad inesperada de archivos: '+files.size);
      return {files:[...files],specs};
    }
    async function fetchChecked(name){const r=await fetch(absolute(name),{cache:'no-store'});if(!r.ok)throw new Error(name+' · HTTP '+r.status);return r;}
    async function featureCount(r,p){const d=await r.clone().json();if(d.type!=='FeatureCollection'||!Array.isArray(d.features)||!d.features.every(f=>f.type==='Feature'&&f.geometry&&f.properties))throw new Error('GeoJSON inválido: '+p);return d.features.length;}
    async function verify(){
      if(!('caches' in window))return false;
      const cache=await caches.open(CACHE), m=await cache.match(absolute(READY)), i=await cache.match(absolute(INDEX)), c=await cache.match(absolute(MANIFEST));
      if(!m?.ok||!i?.ok||!c?.ok)return false;
      const meta=await m.json(), raw=await i.text();
      if(meta.version!=='gv-vulcano-v202'||meta.sha!==await signature(raw))return false;
      const list=catalog(JSON.parse(raw)).files;
      if(meta.archivos!==list.length)return false;
      for(let n=0;n<list.length;n+=24){const responses=await Promise.all(list.slice(n,n+24).map(p=>cache.match(absolute(p))));if(responses.some(r=>!r?.ok))return false;}
      return meta;
    }
    async function showState(){
      if(busy)return;
      try {const meta=await verify();
        if(busy)return;
        if(meta)report('Vulcano offline listo · 104 volcanes · '+meta.archivos+' archivos de referencia. No es alerta en vivo.','ok');
        else report('Vulcano: capas de peligro y evacuación pendientes de descarga. No disponible offline.','warning');
      } catch(e){if(!busy)report('Vulcano: no se pudo verificar la descarga.','warning');}
    }
    async function prepare(){
      if(busy||downloadBtn.disabled)return;
      if(!navigator.onLine){report('Conéctate para descargar las capas de Vulcano.','warning');return;}
      if(!('caches' in window)||!window.crypto?.subtle){report('Almacenamiento offline no disponible en este navegador.','warning');return;}
      if(!window.confirm('Descargar cartografía volcánica nacional de referencia: aproximadamente 157 MB en 537 archivos. Usa Wi-Fi. No incluye alertas EAV en vivo. ¿Continuar?'))return;
      busy=true;btn.disabled=true;downloadBtn.disabled=true;
      let cache;
      try{
        cache=await caches.open(CACHE);
        // Fetch and validate the current index before reusing any partial download.
        const ir=await fetchChecked(INDEX), raw=await ir.clone().text(), sha=await signature(raw), data=catalog(JSON.parse(raw));
        const mr=await fetchChecked(MANIFEST), manifest=await mr.clone().json();
        if(manifest.schema!==60||manifest.ambito!=='NACIONAL_CHILE')throw new Error('Manifiesto volcánico incompatible');
        const saved=await cache.match(absolute(PARTIAL)), old=saved?.ok?await saved.json():null;
        const resume=old?.sha===sha;
        await cache.delete(absolute(READY));
        await cache.put(absolute(PARTIAL),metaResponse({sha}));
        await cache.put(absolute(INDEX),ir.clone());await cache.put(absolute(MANIFEST),mr.clone());
        const counts=new Map();let done=0;
        for(const p of data.files){
          if(!navigator.onLine)throw new Error('Conexión perdida');
          let r=resume?await cache.match(absolute(p)):null;
          let count;
          if(r?.ok){try{count=await featureCount(r,p);}catch(_){r=null;}}
          if(!r?.ok){r=await fetchChecked(p);count=await featureCount(r,p);await cache.put(absolute(p),r.clone());}
          if(!(await cache.match(absolute(p)))?.ok)throw new Error('No se guardó '+p);
          counts.set(p,count);done++;
          report('Descargando Vulcano: '+done+'/'+data.files.length+' archivos…');
        }
        for(const spec of data.specs){const actual=spec.archivos.reduce((n,p)=>n+counts.get(p),0);if(actual!==spec.conteo){await cache.delete(absolute(PARTIAL));throw new Error('Conteo de geometrías no coincide con el índice');}}
        await cache.put(absolute(READY),metaResponse({version:'gv-vulcano-v202',sha,archivos:done,fecha:new Date().toISOString()}));
        try{await navigator.storage?.persist?.();}catch(_){}
      }catch(e){report('Descarga Vulcano incompleta: '+String(e.message||e)+'. Reintenta conectado.','warning');console.warn('Vulcano offline:',e);return;}
      finally{busy=false;btn.disabled=false;downloadBtn.disabled=false;}
      await showState();
    }
    window.GridVisionVulcanoOffline={version:'gv-vulcano-v202',verify,prepare};
    report('Verificando cartografía volcánica descargada…');void showState();
  }

  function makeButton(container,label,title,fn) {
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.title=title;button.setAttribute('aria-label',title);
    button.addEventListener('click', e=>{e.stopPropagation();fn();});
    container.appendChild(button);return button;
  }
  const ctrl=L.control({position:'topleft'});
  ctrl.onAdd=function(){
    const wrapper=L.DomUtil.create('div','gv-nav-panel leaflet-control');
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
    const actions=document.createElement('div');actions.className='gv-nav-actions';wrapper.append(actions);
    locateBtn=makeButton(actions,'◎ Mi ubicación','Mostrar ubicación actual',locateOnce);
    followBtn=makeButton(actions,'▶ Seguir','Seguir el GPS sin cambiar el zoom',toggleFollow);
    updateGpsButtons();
    downloadBtn=makeButton(wrapper,'⬇ Preparar SEN + mapa offline','Guardar los tres visores, el SEN y el mapa nacional',prepareOffline);
    downloadBtn.className='gv-nav-download';
    statusEl=document.createElement('div');statusEl.className='gv-nav-status';
    statusEl.setAttribute('role','status');statusEl.textContent='GPS listo · Internet '+(navigator.onLine?'conectado':'no disponible');
    wrapper.append(statusEl);
    baseBtn=makeButton(wrapper,'Mapa nacional offline','Activar el mapa vectorial nacional de referencia',()=>{});
    baseBtn.className='gv-nav-base-choice';baseBtn.setAttribute('aria-pressed','false');
    if(viewId==='vulcano-map')installVulcanoOffline(wrapper);
    // GV NAV V1.2 compact rail: solo GridVision Chile. Fire y Vulcano conservan sus controles.
    if (viewId === 'mapa') {
      wrapper.classList.add('gv-nav-compact');
      locateBtn.dataset.action='locate';
      followBtn.dataset.action='follow';
      const dialog=document.createElement('dialog');
      dialog.className='gv-nav-dialog';
      dialog.id='gv-nav-dialog';
      dialog.setAttribute('aria-labelledby','gv-nav-dialog-title');
      const head=document.createElement('div');head.className='gv-nav-dialog-head';
      const title=document.createElement('h2');title.id='gv-nav-dialog-title';title.textContent='Navegación y SEN offline';
      const close=makeButton(head,'×','Cerrar panel de navegación',()=>dialog.close());
      close.className='gv-nav-dialog-close';head.prepend(title);
      const note=document.createElement('p');note.textContent='Descarga el SEN y el mapa nacional de referencia antes de salir. Caminos principales, localidades, hidrografía y límites generales; sin detalle rural ni alertas en vivo.';
      dialog.append(head,note,statusEl,downloadBtn,baseBtn);
      document.body.append(dialog);
      offlineMenuBtn=makeButton(actions,'SEN offline','Navegación y SEN offline',()=>{
        if (!dialog.open) dialog.showModal();
      });
      offlineMenuBtn.dataset.action='offline';
      offlineMenuBtn.setAttribute('aria-haspopup','dialog');
      offlineMenuBtn.setAttribute('aria-controls',dialog.id);
      dialog.addEventListener('close',()=>offlineMenuBtn.focus());
      dialog.addEventListener('click',e=>{if(e.target===dialog) { const b=dialog.getBoundingClientRect(); if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close(); }});
      status(statusEl.textContent);
    }
    return wrapper;
  };
  ctrl.addTo(map);
  oldGpsHide();
  offlineStyle();
  markLiveUnavailable();
  // Components may create their header buttons after the map is ready.
  const liveObserver=new MutationObserver(markLiveUnavailable);
  liveObserver.observe(document.body,{childList:true,subtree:true});
  if(window.GridVisionBaseOfflineInstall)window.GridVisionBaseOfflineInstall(map,baseBtn,status);
  window.addEventListener('offline',()=>{
    offlineStyle();markLiveUnavailable();status('Sin internet · consulta datos descargados; clima y alertas NO son en vivo.','warning');
  });
  window.addEventListener('online',()=>{offlineStyle();status('Conexion recuperada. Recarga para actualizar clima y alertas.','warning');});
  window.addEventListener('pagehide',()=>{clearGps();liveObserver.disconnect();});
  window.GridVisionNavigationV1={version:VERSION,prepareOffline,stopFollow};
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(absolute('gridvision-sw.js'),{scope:ROOT.pathname})
      .then(()=>readyState()).then(meta=>{
        if (meta) status('SEN + mapa offline descargados: '+new Date(meta.fecha).toLocaleDateString('es-CL'),'ok');
        else if(navigator.onLine)status('Prepara SEN + mapa offline para uso sin conexión.');
      }).catch(err=>console.warn('GridVision SW no disponible:',err));
  }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarNavegacion, {once:true});
  } else iniciarNavegacion();
})();
