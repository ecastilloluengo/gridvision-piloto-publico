/* GV388A: integración de V3.8.7e, recuperación offline entre cachés. */
/* GridVision V3.8.6 — Sectorized national basemap pilot dentro de GridVision Vulcano.
 * The original GridVisionBaseOfflineInstall is untouched on the operational page.
 * Sin cambios de coordenadas volcánicas ni geometrías de peligro.
 */
(() => {
  'use strict';
  const root = new URL('../../', document.currentScript?.src || location.href);
  const params = new URLSearchParams(location.search);
  const mode = params.get('gv386') === 'original' ? 'original' : 'sectores';
  const presets = {
    osorno: [-40.574, -73.134, 9],
    chaiten: [-42.837, -72.650, 9],
    santiago: [-33.447, -70.673, 9],
    puntaarenas: [-53.163, -70.918, 9]
  };
  const zone = Object.hasOwn(presets, params.get('zona')) ? params.get('zona') : 'osorno';
  const manifestPath = 'data/offline/sectores-v382/manifest-v382.json';
  const originalPath = 'data/offline/base-chile-vulcano-v388.geojson';
  const sectorPrefix = 'data/offline/sectores-v382/';
  const baseCache = 'gridvision-nav-offline-v1';
  const REQUIRED = ['pais','region','lago','rio','camino','localidad'];
  const KINDS = ['pais','region','lago','rio','camino'];
  const MAX_VISIBLE_CELLS = 18;
  const PAD = .15;
  const MAX_MEM_FILES = 12;
  const col = {pais:'#e6e8d7',chile:'#e9edda',region:'#7d8d80',lago:'#9fcad8',rio:'#7db1c8',camino:'#9b937f'};
  const url = path => new URL(path,root).href;
  let manifestPromise=null;
  const memory=new Map();
  window.GV386 = {version:'3.8.6',modo:mode,zona:zone,estado:'PENDIENTE',nota:'Cartografía nacional por sectores; prepara los archivos antes de usarla sin conexión.'};
  const tMetric=(num)=>Math.round(num*10)/10;
  const origInstall=window.GridVisionBaseOfflineInstall;
  if(typeof origInstall!=='function'){
    window.GV386.estado='ERROR: el módulo offline original no está instalado';
    return;
  }
  const map=window.GridVisionVulcanoMap;
  // Both variants start at the SAME view, without changing any volcano coordinates.
  if(map && presets[zone])map.setView(presets[zone].slice(0,2),presets[zone][2],{animate:false});
  if(mode==='original'){
    window.GridVisionBaseOfflineInstall=function(map,button,report){
      origInstall(map,button,report);
      const base=window.GridVisionBaseOfflineV2;
      if(base){
        const oldShow=base.show;
        base.show=async function(){
          const started=performance.now();
          await oldShow();
          window.GV386={version:'3.8.6',modo:'original',zona:zone,estado:base.active()?'ACTIVADO':'ERROR',
            cargaTotalMs:tMetric(performance.now()-started),
            nota:'Tiempo de show() del módulo original; contrastar con GV3801 cuando esté disponible.'};
        };
        window.GV386.estado='LISTO PARA ACTIVAR';
      }
    };
    return;
  }

  function sectorIdx(lon,lat){
    return [Math.min(179,Math.max(0,Math.floor((lon+180)/2))),Math.min(89,Math.max(0,Math.floor((lat+90)/2)))];
  }
  function sectorName(i,j){
    const left=-180+i*2,bottom=-90+j*2;
    const pad=(x,n)=>(x<0?'-':'+')+String(Math.abs(x)).padStart(n,'0');
    return `lat${pad(bottom,3)}_lon${pad(left,4)}`;
  }
  function visibleCells(map){
    const b=map.getBounds().pad(PAD);
    const sw=sectorIdx(b.getWest(),b.getSouth()),ne=sectorIdx(b.getEast(),b.getNorth());
    const count=(ne[0]-sw[0]+1)*(ne[1]-sw[1]+1);
    if(count<1||count>MAX_VISIBLE_CELLS)return null;
    const names=[];
    for(let i=sw[0];i<=ne[0];i++)for(let j=sw[1];j<=ne[1];j++)names.push(sectorName(i,j));
    return names;
  }
  async function fetchDocument(path){
    if(memory.has(path)){
      const item=memory.get(path);memory.delete(path);memory.set(path,item);
      return item;
    }
    const item=(async()=>{
      const started=performance.now();
      // Reusar GeoJSON verificados en las cachés V387c/V387e o en la caché SEN.
      // Buscar por URL exacta, sin borrar ni duplicar archivos grandes.
      let response = ('caches' in window) ? await caches.match(url(path)) : null;
      if(!response){
        try { response=await fetch(url(path),{cache:'default'}); }
        catch(e){ throw new Error('Sector no preparado offline: '+path+' · '+e.message); }
      }
      if(!response.ok)throw new Error('HTTP '+response.status+' · '+path);
      const content=await response.text();
      const downloadedAt=performance.now();
      const data=JSON.parse(content);
      if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('GeoJSON inválido · '+path);
      return {data,bytes:new Blob([content]).size,readingMs:downloadedAt-started,parseMs:performance.now()-downloadedAt};
    })().catch(err=>{memory.delete(path);throw err;});
    memory.set(path,item);
    while(memory.size>MAX_MEM_FILES)memory.delete(memory.keys().next().value);
    return item;
  }
  async function getManifest(){
    if(!manifestPromise)manifestPromise=(async()=>{
      let r=('caches' in window) ? await caches.match(url(manifestPath)) : null;
      if(!r){
        try { r=await fetch(url(manifestPath),{cache:'default'}); }
        catch(e){ throw new Error('Manifiesto sectorizado no preparado offline: '+e.message); }
      }
      if(!r.ok)throw new Error('Falta V3.8.2 (HTTP '+r.status+')');
      const m=await r.json();
      if(m?.schema!=='gv-sectores-v382'||m.estado!=='CANDIDATO_NO_ACTIVADO'||m.resolucion_grados!==2||
        m.total_features!==42112||!m.celdas||!m.compartidas)
        throw new Error('Manifiesto V3.8.2 incompatible');
      return m;
    })().catch(err=>{manifestPromise=null;throw err;});
    return manifestPromise;
  }
  function assemble(docs,infos){
    const out=[],seen=new Set();
    for(let i=0;i<docs.length;i++){
      const features=docs[i].data.features,indices=infos[i].indices;
      if(indices && indices.length!==features.length)throw new Error('Índices y entidades no coinciden en '+infos[i].archivo);
      for(let j=0;j<features.length;j++){
        const n=indices?indices[j]:'original-'+i+'-'+j;
        if(seen.has(n))continue;
        seen.add(n);out.push(features[j]);
      }
    }
    return out;
  }
  const style=f=>{
    const p=f.properties||{},layer=p.capa;
    if(layer==='pais')return {color:'#9ca99e',weight:.7,fillColor:p.chile?col.chile:col.pais,fillOpacity:1};
    if(layer==='region')return {color:col.region,weight:.8,opacity:.7,dashArray:'4 4',fill:false};
    if(layer==='lago')return {color:'#8dbbc9',weight:.6,fillColor:col.lago,fillOpacity:1};
    if(layer==='rio')return {color:col.rio,weight:.9,opacity:.85};
    return {color:col.camino,weight:1.3,opacity:.85};
  };
  function install(map,button,report){
    if(!map||!button||button.dataset.gvBaseInstalled)return;
    button.dataset.gvBaseInstalled='1';
    const container=map.getContainer();
    const originalAdd=map.addLayer,originalRemove=map.removeLayer;
    let suspendedTiles=false,active=false,desired=false,manual=false,generation=0,debounce=null;
    let renderGroup=null,labelGroup=null,features=[],lastKey='',layersRetired=0,changed=0;
    let lastKind='',renderer=null;
    const preservedTiles=new Set();
    const isTile=x=>x instanceof L.TileLayer;
    const credit='Made with Natural Earth · cartografía nacional sectorizada';
    for(const [name,z] of [['gv-base-v2',230],['gv-base-v2-label',260]]){
      const pane=map.getPane(name)||map.createPane(name);
      pane.style.zIndex=String(z);pane.style.pointerEvents='none';
    }
    function guardedAdd(layer){if(suspendedTiles&&isTile(layer)){preservedTiles.add(layer);return this;}return originalAdd.call(this,layer);}
    function guardedRemove(layer){if(suspendedTiles&&isTile(layer))preservedTiles.delete(layer);return originalRemove.call(this,layer);}
    function suspend(){
      if(suspendedTiles)return;
      suspendedTiles=true;map.addLayer=guardedAdd;map.removeLayer=guardedRemove;
      const tiles=[];map.eachLayer(layer=>{if(isTile(layer))tiles.push(layer);});
      for(const t of tiles){preservedTiles.add(t);originalRemove.call(map,t);}
      container.classList.add('gv-base-tiles-paused');
    }
    function resume(){
      if(!suspendedTiles)return;
      suspendedTiles=false;
      if(map.addLayer===guardedAdd)map.addLayer=originalAdd;
      if(map.removeLayer===guardedRemove)map.removeLayer=originalRemove;
      container.classList.remove('gv-base-tiles-paused');
      const tiles=[...preservedTiles];preservedTiles.clear();
      for(const t of tiles)map.addLayer(t);
      map.fire('gv-basemap-restored');
    }
    function renderLabels(){
      if(!active||!labelGroup)return;
      labelGroup.clearLayers();
      const zoom=map.getZoom(),bounds=map.getBounds().pad(.03),used=new Set();
      const points=features.filter(f=>f.geometry?.type==='Point'&&f.properties?.nombre&&
        ['localidad','pais_rotulo','region_rotulo'].includes(f.properties.capa)).filter(f=>{
        const p=f.properties;
        if(p.capa==='pais_rotulo')return zoom<=6;
        if(p.capa==='region_rotulo')return zoom>=6&&zoom<=9;
        return zoom>=5&&(zoom>=9||p.rango<=zoom+1||p.poblacion>=50000);
      }).sort((a,b)=>{
        const p=a.properties,q=b.properties;
        const prior=x=>x.capa==='pais_rotulo'?-100:x.capa==='region_rotulo'?-10:x.rango-(Math.log10(Math.max(1,x.poblacion||1))*.3);
        return prior(p)-prior(q);
      });
      let n=0;
      for(const f of points){
        const [lon,lat]=f.geometry.coordinates,ll=L.latLng(lat,lon);
        if(!bounds.contains(ll))continue;
        const xy=map.latLngToContainerPoint(ll),key=Math.floor(xy.x/100)+':'+Math.floor(xy.y/36);
        if(used.has(key))continue;
        used.add(key);
        const span=document.createElement('span');span.textContent=f.properties.nombre;
        const type=f.properties.capa==='localidad'?'town':f.properties.capa==='region_rotulo'?'region':'country';
        L.marker(ll,{pane:'gv-base-v2-label',interactive:false,keyboard:false,
          icon:L.divIcon({className:'gv-base-label '+type,html:span,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(labelGroup);
        if(++n>=110)break;
      }
    }
    async function refresh(){
      if(!desired)return;
      const token=++generation,t0=performance.now();
      button.disabled=true;button.textContent='Cargando sectores offline…';
      window.GV386.estado='CARGANDO';
      try{
        let infos=[],paths=[],kind='regional',fallbackReason='';
        try{
          const m=await getManifest();
          const names=visibleCells(map);
          if(names){
            infos=[m.compartidas,...names.filter(name=>m.celdas[name]).map(name=>m.celdas[name])];
            paths=infos.map(info=>sectorPrefix+info.archivo);
          }else{fallbackReason='vista demasiado amplia';}
          if(!paths.length){fallbackReason=fallbackReason||'sectores no disponibles';}
        }catch(e){fallbackReason='manifiesto no disponible: '+e.message;}
        if(fallbackReason){kind='respaldo nacional';infos=[{}];paths=[originalPath];}
        const filesKey=paths.join('|');
        if(active&&filesKey===lastKey){
          renderLabels();window.GV386.estado='ACTIVADO';button.disabled=false;button.textContent='Volver al fondo en línea';return;
        }
        let docs;
        try{
          docs=await Promise.all(paths.map(fetchDocument));
        }catch(err){
          if(kind!=='regional')throw err;
          fallbackReason='falló un sector: '+err.message;
          kind='respaldo nacional';infos=[{}];paths=[originalPath];
          docs=await Promise.all(paths.map(fetchDocument));
        }
        if(token!==generation||!desired)return;
        const t1=performance.now();
        const nextFeatures=assemble(docs,infos);
        if(kind==='respaldo nacional' && !REQUIRED.every(k=>nextFeatures.some(f=>f.properties?.capa===k)))
          throw new Error('Base nacional original incompleta');
        const next=L.layerGroup();
        if(!renderer)renderer=L.canvas({pane:'gv-base-v2',padding:.4});
        for(const k of KINDS){
          const list=nextFeatures.filter(f=>f.properties?.capa===k);
          if(list.length)L.geoJSON({type:'FeatureCollection',features:list},{pane:'gv-base-v2',renderer,interactive:false,style}).addTo(next);
        }
        if(token!==generation||!desired){next.clearLayers();return;}
        const t2=performance.now();
        // Keep the previous view until replacement geometry is ready.
        if(renderGroup){map.removeLayer(renderGroup);renderGroup.clearLayers();layersRetired++;}
        renderGroup=next;features=nextFeatures;
        suspend();
        if(!labelGroup)labelGroup=L.layerGroup();
        renderGroup.addTo(map);
        if(!active){labelGroup.addTo(map);map.attributionControl?.addAttribution(credit);}
        active=true;
        container.classList.add('gv-base-v2-active');
        button.setAttribute('aria-pressed','true');
        button.textContent='Volver al fondo en línea';
        renderLabels();
        const t3=performance.now();
        if(lastKey&&lastKey!==filesKey)changed++;
        lastKey=filesKey;lastKind=kind;
        window.GV386={version:'3.8.6',modo:'sectores',zona:zone,estado:'ACTIVADO',tipo:kind,
          sectores:kind==='regional'?paths.length-1:0,geojsonCargados:paths.length,
          entidadesUnicas:nextFeatures.length,trazadosTierra:nextFeatures.filter(f=>f.properties?.capa==='pais').length,
          bytesArchivos:docs.reduce((n,d)=>n+d.bytes,0),
          lecturaParseoMs:tMetric(t1-t0),construirCapasMs:tMetric(t2-t1),agregarAlMapaMs:tMetric(t3-t2),
          cargaTotalMs:tMetric(t3-t0),gruposRetirados:layersRetired,cambiosDeArchivos:changed,
          documentosEnMemoria:memory.size,zoom:map.getZoom(),
          nota:fallbackReason||'Cartografía de referencia por sectores. Descarga previa requerida para el uso offline.'};
        report('V3.8.6 · '+kind+' · '+nextFeatures.length+' entidades · '+window.GV386.cargaTotalMs+' ms','ok');
        console.info('[GV386] Mapa nacional sectorizado:',window.GV386);
      }catch(e){
        if(token!==generation)return;
        console.error('[GV386]',e);
        window.GV386.estado='ERROR';window.GV386.error=String(e.message||e);
        report('V3.8.6: error de sectores. '+window.GV386.error,'warning');
        // Do not remove an already rendered, usable view on an isolated loading error.
        if(!active)resume();
      }finally{
        if(token===generation||!desired){button.disabled=false;button.textContent=active?'Volver al fondo en línea':'Mapa nacional offline';}
      }
    }
    function hide(){
      desired=false;generation++;clearTimeout(debounce);
      if(renderGroup){map.removeLayer(renderGroup);renderGroup.clearLayers();renderGroup=null;}
      if(labelGroup){map.removeLayer(labelGroup);labelGroup.clearLayers();}
      features=[];lastKey='';memory.clear();
      if(active)map.attributionControl?.removeAttribution(credit);
      active=false;container.classList.remove('gv-base-v2-active');
      button.setAttribute('aria-pressed','false');button.textContent='Mapa nacional offline';
      if(navigator.onLine)resume();
      window.GV386.estado='DESACTIVADO';
    }
    function show(){
      desired=true;
      // Do not suspend tiles until ready when online; keep the map visible during parsing.
      return refresh();
    }
    button.addEventListener('click',()=>{
      if(active){if(!navigator.onLine){report('Sin conexión: la cartografía actual sigue visible.','warning');return;}
        manual=false;hide();}
      else{manual=true;void show();}
    });
    function schedule(){
      if(!active||!desired)return;
      clearTimeout(debounce);
      debounce=setTimeout(()=>void refresh(),180);
    }
    map.on('moveend zoomend',schedule);
    window.addEventListener('offline',()=>{suspend();if(!active)void show();});
    window.addEventListener('online',()=>{if(!manual||!active)hide();});
    window.GridVisionBaseOfflineV2={show,hide,ready:()=>!!manifestPromise||!!lastKey,
      active:()=>active,tilesSuspended:()=>suspendedTiles};
    window.GV386.estado='LISTO PARA ACTIVAR';
    if(!navigator.onLine)void show();
  }
  window.GridVisionBaseOfflineInstall=install;
})();
