/* GridVision Navigation + offline SEN V1 (no modifica las APIs ni las capas actuales). */
(() => {
  'use strict';
  const scriptURL = document.currentScript?.src || location.href;
  function iniciarNavegacion() {
  const VERSION = 'gv-nav-v1-20261111';
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
  let watchId = null;
  let marker = null;
  let accuracyCircle = null;
  let lastFix = null;
  let statusEl, followBtn, locateBtn, downloadBtn;
  const absolute = name => new URL(name, ROOT).href;
  const clean = href => {const url = new URL(href, ROOT); url.search=''; url.hash=''; return url.href;};
  const inScope = url => url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
  function status(message, kind='normal') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
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
    marker.bindPopup('<strong>Mi ubicación GPS</strong><br>Latitud: '+lat.toFixed(6)+
      '<br>Longitud: '+lon.toFixed(6)+'<br>Precisión aproximada: '+Math.round(accuracy)+' m',
      {autoPan:false});
    // Solo "Mi ubicación" cambia el zoom. Seguimiento conserva el zoom del usuario.
    if (initial) map.setView(latlng, Math.min(17,map.getMaxZoom()), {animate:false});
    else if (center) map.panTo(latlng,{animate:false});
    status('GPS activo · precisión ±'+Math.round(accuracy)+' m'+(!navigator.onLine?' · sin internet':''),'ok');
  }
  function gpsError(err, follow=false) {
    const denied = err?.code === 1;
    status(denied?'Ubicación denegada. Revisa permisos del navegador.':
      'GPS sin posición reciente. Se conserva la última ubicación.', 'warning');
    if (denied && follow) stopFollow();
    if (locateBtn) locateBtn.disabled=false;
  }
  function locateOnce() {
    if (!navigator.geolocation) return status('Este dispositivo no ofrece ubicación GPS.','warning');
    locateBtn.disabled = true;
    status('Buscando ubicación actual…');
    navigator.geolocation.getCurrentPosition(pos=>{drawFix(pos,false,true);locateBtn.disabled=false;},
      err=>gpsError(err), GPS_OPTS);
  }
  function stopFollow() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (followBtn) {followBtn.setAttribute('aria-pressed','false');followBtn.textContent='▶ Seguir';}
    status(lastFix?'Seguimiento detenido · ubicación disponible':'Seguimiento detenido.');
  }
  function toggleFollow() {
    if (watchId !== null) return stopFollow();
    if (!navigator.geolocation) return status('Este dispositivo no ofrece ubicación GPS.','warning');
    status('Iniciando seguimiento GPS…');
    followBtn.setAttribute('aria-pressed','true');followBtn.textContent='■ Detener';
    // Nunca usamos setView en modo seguimiento; así el zoom se mantiene.
    watchId = navigator.geolocation.watchPosition(pos=>drawFix(pos,true,false),
      err=>gpsError(err,true),GPS_OPTS);
  }
  function offlineStyle() {document.body.classList.toggle('gv-nav-offline',!navigator.onLine);}
  async function readyState() {
    if (!('caches' in window)) return false;
    const cache=await caches.open(CACHE);
    const response=await cache.match(absolute(METADATA));
    return response?.ok ? await response.json() : false;
  }
  async function gatherFiles() {
    const pages=['index.html','gridvision-fire.html','gridvision-vulcano.html'];
    const targets=new Set([
      ...pages,'vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css',
      'components/gridvision-nav/gridvision-nav.js','components/gridvision-nav/gridvision-nav.css',
      'gridvision-sw.js',
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
          await cache.put(clean(url),response.clone());
          const saved=await cache.match(clean(url));
          if (!saved?.ok) throw new Error('No se verificó en almacenamiento');
          complete++;
        } catch (err) { failed.push(name+' ('+err.message+')'); }
        status('Preparando SEN offline: '+(complete+failed.length)+'/'+files.length+' archivos…');
      }
      const required=['index.html','gridvision-fire.html','gridvision-vulcano.html',
        'vendor/leaflet/leaflet.js','data/processed/activos_puntuales_validados.geojson',
        'data/processed/lineas_validadas.geojson'];
      const critical=required.filter(x=>failed.some(f=>f.startsWith(x+' (')));
      if (failed.length) {
        // Nunca registrar como listo si falta un archivo JS, CSS o geográfico.
        await cache.delete(absolute(METADATA));
        status('Descarga incompleta: '+failed.length+' archivo(s). Reintenta conectado.','warning');
        console.warn('GridVision offline: descargas fallidas',failed,critical);
      } else {
        const meta={version:VERSION,fecha:new Date().toISOString(),archivos:complete,
          alcance:'Visores, librerías y catálogo SEN; sin fondo detallado ni alertas en vivo'};
        await cache.put(absolute(METADATA),new Response(JSON.stringify(meta),
          {headers:{'Content-Type':'application/json'}}));
        if (navigator.storage?.persist) {
          try { await navigator.storage.persist(); } catch (_) { /* best effort */ }
        }
        status('SEN offline preparado · '+complete+' archivos · prueba en modo avión.','ok');
      }
    } catch(err) {
      console.error('GridVision offline',err);
      status('No se pudo preparar offline: '+String(err.message||err),'warning');
    } finally {downloadBtn.disabled=false;}
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
    followBtn.setAttribute('aria-pressed','false');
    downloadBtn=makeButton(wrapper,'⬇ Preparar SEN offline','Guardar los tres visores y el inventario SEN',prepareOffline);
    downloadBtn.className='gv-nav-download';
    statusEl=document.createElement('div');statusEl.className='gv-nav-status';
    statusEl.setAttribute('role','status');statusEl.textContent='GPS listo · Internet '+(navigator.onLine?'conectado':'no disponible');
    wrapper.append(statusEl);
    return wrapper;
  };
  ctrl.addTo(map);
  oldGpsHide();
  offlineStyle();
  window.addEventListener('offline',()=>{
    offlineStyle();status('Sin internet · el SEN descargado sigue disponible; clima y alertas NO son en vivo.','warning');
  });
  window.addEventListener('online',()=>{offlineStyle();status('Conexión recuperada.','ok');});
  window.addEventListener('pagehide',()=>{if(watchId!=null) navigator.geolocation.clearWatch(watchId);});
  window.GridVisionNavigationV1={version:VERSION,prepareOffline,stopFollow};
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(absolute('gridvision-sw.js'),{scope:ROOT.pathname})
      .then(()=>readyState()).then(meta=>{
        if (meta) status('SEN offline descargado: '+new Date(meta.fecha).toLocaleDateString('es-CL'),'ok');
      }).catch(err=>console.warn('GridVision SW no disponible:',err));
  }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarNavegacion, {once:true});
  } else iniciarNavegacion();
})();
