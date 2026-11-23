/* GridVision V2: national reference vector basemap, Natural Earth, public domain. */
(() => {
  'use strict';
  const src = document.currentScript?.src;
  // Respaldo nacional exclusivo de Vulcano; no altera el mapa de otros visores.
  const gv3801bCandidato = false;
  const url = new URL('../../data/offline/base-chile-vulcano-v388.geojson', src).href;
  const gv3801b = {
    prueba: 'GridVision V3.8.1b',
    variante: gv3801bCandidato ? 'CANDIDATO' : 'ORIGINAL',
    estado: 'PENDIENTE DE ACTIVACIÓN',
    lecturaParseoMs: null, construirCapasMs: null,
    agregarAlMapaMs: null, cargaTotalMs: null,
    trazadosTierra: null,
    aviso: 'Medición local, sin cronometrar todo el repintado asíncrono del navegador'
  };
  window.GV3801 = gv3801b;
  const REQUIRED = ['pais','region','lago','rio','camino','localidad'];
  const colors = {pais:'#e6e8d7',chile:'#e9edda',region:'#7d8d80',lago:'#9fcad8',rio:'#7db1c8',camino:'#9b937f'};
  function install(map, button, report) {
    if (!map || !button || button.dataset.gvBaseInstalled) return;
    button.dataset.gvBaseInstalled='1';
    const container=map.getContainer();
    let data=null, loading=null, active=false, desired=false, generation=0, layers=null, labels=null, frame=0;
    let manual=false, tilesSuspended=false;
    let hydro=null, hydroIndex=[], hydroRenderer=null, surfaces=null, surfaceIndex=[], surfaceRenderer=null; const hydroVisible=new Map(), surfaceVisible=new Map();
    const suspended=new Set();
    const originalAdd=map.addLayer, originalRemove=map.removeLayer;
    const isTile=layer=>layer instanceof L.TileLayer;
    // Pause tile layers, not vector overlays; preserve the selected base group.
    function guardedAdd(layer){
      if(tilesSuspended&&isTile(layer)){suspended.add(layer);return this;}
      return originalAdd.call(this,layer);
    }
    function guardedRemove(layer){
      if(tilesSuspended&&isTile(layer)){suspended.delete(layer);}
      return originalRemove.call(this,layer);
    }
    function suspendTiles(){
      if(tilesSuspended)return;
      tilesSuspended=true;
      map.addLayer=guardedAdd;map.removeLayer=guardedRemove;
      const list=[];map.eachLayer(layer=>{if(isTile(layer))list.push(layer);});
      for(const layer of list){suspended.add(layer);originalRemove.call(map,layer);}
      container.classList.add('gv-base-tiles-paused');
    }
    function resumeTiles(){
      if(!tilesSuspended)return;
      tilesSuspended=false;
      if(map.addLayer===guardedAdd)map.addLayer=originalAdd;
      if(map.removeLayer===guardedRemove)map.removeLayer=originalRemove;
      container.classList.remove('gv-base-tiles-paused');
      const list=Array.from(suspended);suspended.clear();
      for(const layer of list)map.addLayer(layer);
      map.fire('gv-basemap-restored');
    }
    const credit='Natural Earth · DGA/IGM · GSHHG · © OpenStreetMap contributors (<a href="https://www.openstreetmap.org/copyright">ODbL</a>)';
    for (const [name,z] of [['gv-base-v2',230],['gv-base-v2-cauces',231],['gv-base-v2-rio-detalle',232],['gv-base-v2-label',260]]) {
      const pane=map.getPane(name)||map.createPane(name);pane.style.zIndex=z;pane.style.pointerEvents='none';
    }
    async function getData(){
      if (data) return data;
      if (!loading) loading=(async()=>{
        let response;
        if(!navigator.onLine && 'caches' in window){
          response=await caches.match(url);
        }
        if(!response){response=await fetch(url,{cache:'default'});}
        if(!response.ok)throw new Error('HTTP '+response.status);
        const result=await response.json();
        if(result.type!=='FeatureCollection'||result.metadata?.schema!=='gv-base-chile-v2'||!Array.isArray(result.features)||!REQUIRED.every(x=>result.features.some(f=>f.properties?.capa===x)))throw new Error('Base incompleta o incompatible');
        data=result;return result;
      })().finally(()=>{loading=null;});
      return loading;
    }
    const style=f=>{
      const p=f.properties||{}, layer=p.capa;
      if(layer==='pais')return {color:'#9ca99e',weight:.7,fillColor:p.chile?colors.chile:colors.pais,fillOpacity:1};
      if(layer==='region')return {color:colors.region,weight:.8,opacity:.7,dashArray:'4 4',fill:false};
      if(layer==='lago')return {color:'#8dbbc9',weight:.6,fillColor:colors.lago,fillOpacity:1};
      if(layer==='rio')return {color:colors.rio,weight:.9,opacity:.85};
      return {color:colors.camino,weight:1.3,opacity:.85};
    };
    function renderLabels(){
      frame=0;if(!active||!data||!labels)return;
      labels.clearLayers();const zoom=map.getZoom(), bounds=map.getBounds().pad(.03), used=new Set();
      const candidates=data.features.filter(f=>f.geometry?.type==='Point'&&f.properties?.nombre&&['localidad','pais_rotulo','region_rotulo','lago_rotulo','rio_rotulo'].includes(f.properties.capa)).filter(f=>{
        const p=f.properties;if(p.capa==='lago_rotulo')return zoom>=p.rango;
        if(p.capa==='rio_rotulo')return zoom>=Math.max(11,Number(p.rango)||11);
        if(p.capa==='pais_rotulo')return zoom<=6;
        if(p.capa==='region_rotulo')return zoom>=6&&zoom<=9;
        return zoom>=5&&(zoom>=9||p.rango<=zoom+1||p.poblacion>=50000);
      }).sort((a,b)=>{const p=a.properties,q=b.properties;const priority=x=>x.capa==='rio_rotulo'? 20:x.capa==='lago_rotulo'? -5:x.capa==='pais_rotulo'? -100:x.capa==='region_rotulo'?-10:x.rango-(Math.log10(Math.max(1,x.poblacion||1))*.3);return priority(p)-priority(q);});
      let n=0;
      for(const f of candidates){
        const [lon,lat]=f.geometry.coordinates, ll=L.latLng(lat,lon);if(!bounds.contains(ll))continue;
        const p0=f.properties; if(p0.capa==='rio_rotulo'){const rk='river:'+p0.nombre.toLocaleLowerCase();if(used.has(rk))continue;used.add(rk);}
        const xy=map.latLngToContainerPoint(ll), key=Math.floor(xy.x/100)+':'+Math.floor(xy.y/36);if(used.has(key))continue;
        used.add(key);const p=f.properties, span=document.createElement('span');span.textContent=p.nombre;
        const type=['lago_rotulo','rio_rotulo'].includes(p.capa)?'water':p.capa==='localidad'?'town':p.capa==='region_rotulo'?'region':'country';
        L.marker(ll,{pane:'gv-base-v2-label',interactive:false,keyboard:false,icon:L.divIcon({className:'gv-base-label '+type,html:span,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(labels);
        if(++n>=110)break;
      }
    }
    function updateHydro(){
      if(!active||!hydro)return;
      const zoom=map.getZoom(), b=map.getBounds().pad(.20);
      const west=b.getWest(),east=b.getEast(),south=b.getSouth(),north=b.getNorth();
      const wanted=new Set();
      if(zoom>=9){
        const hits=hydroIndex.filter(e=>zoom>=e.z&&e.x1>=west&&e.x0<=east&&e.y1>=south&&e.y0<=north);
        // Bound the number of Leaflet paths on low-memory devices.
        hits.sort((a,b)=>a.z-b.z||b.len-a.len);
        for(const e of hits.slice(0,1800)){
          wanted.add(e.i);
          if(!hydroVisible.has(e.i)){
            const layer=L.geoJSON(e.f,{pane:'gv-base-v2-rio-detalle',renderer:hydroRenderer,interactive:false,style:()=>({color:colors.rio,weight:e.f.properties.tipo==='river'?1.25:.8,opacity:.85})});
            hydroVisible.set(e.i,layer);hydro.addLayer(layer);
          }
        }
      }
      for(const [i,layer] of hydroVisible){if(!wanted.has(i)){hydro.removeLayer(layer);hydroVisible.delete(i);}}
    }
    function updateSurfaces(){
      if(!active||!surfaces)return;
      const zoom=map.getZoom(), b=map.getBounds().pad(.20), wanted=new Set();
      if(zoom>=10){
        const hits=surfaceIndex.filter(e=>zoom>=e.z&&e.x1>=b.getWest()&&e.x0<=b.getEast()&&e.y1>=b.getSouth()&&e.y0<=b.getNorth());
        hits.sort((a,b)=>b.area-a.area||a.i-b.i);
        for(const e of hits.slice(0,450)){
          wanted.add(e.i);
          if(!surfaceVisible.has(e.i)){
            const layer=L.geoJSON(e.f,{pane:'gv-base-v2-cauces',renderer:surfaceRenderer,interactive:false,style:()=>({stroke:false,fill:true,fillColor:colors.lago,fillOpacity:1})});
            surfaceVisible.set(e.i,layer);surfaces.addLayer(layer);
          }
        }
      }
      for(const [i,layer] of surfaceVisible){if(!wanted.has(i)){surfaces.removeLayer(layer);surfaceVisible.delete(i);}}
    }
    function queueLabels(){if(!frame)frame=requestAnimationFrame(()=>{updateSurfaces();updateHydro();renderLabels();});}
    function createLayers(){
      const gv3801bInicioCapas = performance.now();

      if(layers)return;
      const renderer=L.canvas({pane:'gv-base-v2',padding:.4});
      layers=L.layerGroup();labels=L.layerGroup();
      hydro=L.layerGroup();hydroRenderer=L.canvas({pane:'gv-base-v2-rio-detalle',padding:.4});
      surfaces=L.layerGroup();surfaceRenderer=L.canvas({pane:'gv-base-v2-cauces',padding:.4});
      surfaceIndex=data.features.filter(f=>f.properties?.capa==='rio_superficie').map((f,i)=>{
        let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
        const scan=c=>{if(typeof c[0]==='number'){x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);}else for(const p of c)scan(p);};
        scan(f.geometry.coordinates);return {f,i,x0,y0,x1,y1,z:Math.max(10,Number(f.properties.zoom_min)||12),area:(x1-x0)*(y1-y0)};
      });
      hydroIndex=data.features.filter(f=>f.properties?.capa==='rio_detalle').map((f,i)=>{
        let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
        const scan=c=>{if(typeof c[0]==='number'){x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);}else for(const p of c)scan(p);};
        scan(f.geometry.coordinates);return {f,i,x0,y0,x1,y1,z:Number(f.properties.zoom_min)||13,len:Number(f.properties.longitud_m_aprox)||0};
      });
      // Separate groups ensure country fills cannot cover rivers or roads.
      for(const kind of ['pais','region','lago','rio','camino']) {
        L.geoJSON({type:'FeatureCollection',features:data.features.filter(f=>f.properties.capa===kind)}, {pane:'gv-base-v2',renderer,interactive:false,style}).addTo(layers);
      }
      surfaces.addTo(layers);hydro.addTo(layers);

      gv3801b.construirCapasMs = Math.round((performance.now() - gv3801bInicioCapas) * 10) / 10;
}
    function hide(){
      desired=false;++generation;
      if(active){map.removeLayer(layers);map.removeLayer(labels);map.attributionControl?.removeAttribution(credit);}
      if(hydro){hydro.clearLayers();hydroVisible.clear();}
      if(surfaces){surfaces.clearLayers();surfaceVisible.clear();}
      active=false;container.classList.remove('gv-base-v2-active');button.setAttribute('aria-pressed','false');button.textContent='Mapa nacional offline';
      if(navigator.onLine)resumeTiles();
    }
    async function show(){
      const gv3801bInicioTotal = performance.now();
      let gv3801bInicioMontaje = null;

      desired=true;const token=++generation;
      if(!navigator.onLine)suspendTiles();
      button.disabled=true;button.textContent='Cargando mapa nacional…';
      try{
        await getData();
        gv3801b.lecturaParseoMs = Math.round((performance.now() - gv3801bInicioTotal) * 10) / 10;if(token!==generation||!desired)return;
        createLayers();suspendTiles();if(!active){gv3801bInicioMontaje = performance.now(); layers.addTo(map);labels.addTo(map);map.attributionControl?.addAttribution(credit);}
        active=true;
        gv3801b.agregarAlMapaMs = gv3801bInicioMontaje == null ? null
          : Math.round((performance.now() - gv3801bInicioMontaje) * 10) / 10;container.classList.add('gv-base-v2-active');button.setAttribute('aria-pressed','true');button.textContent='Volver al fondo en línea';queueLabels();
        report('Mapa nacional offline · Hidrografía por zoom · datos de referencia.','ok');
      }catch(e){if(token===generation){hide();report('Mapa nacional no disponible. Descárgalo conectado: '+e.message,'warning');}}
      finally{button.disabled=false;}

      gv3801b.cargaTotalMs = Math.round((performance.now() - gv3801bInicioTotal) * 10) / 10;
      gv3801b.estado = active ? 'ACTIVADO' : 'NO ACTIVADO';
      gv3801b.trazadosTierra = data?.features?.filter(f => f.properties?.capa === 'pais').length ?? null;
      console.info('[GridVision V3.8.1b] Prueba A/B del mapa offline');
      console.table(gv3801b);
}
    button.addEventListener('click',()=>{if(active){if(!navigator.onLine){report('Sin conexion: el mapa nacional sigue activo.','warning');return;}manual=false;hide();}else{manual=true;void show();}});
    map.on('moveend zoomend',queueLabels);
    window.addEventListener('offline',()=>{suspendTiles();if(!active)void show();});
    window.addEventListener('online',()=>{if(!manual||!active)hide();});
    if(!navigator.onLine)void show();
    window.GridVisionBaseOfflineV2={show,hide,ready:()=>!!data,active:()=>active,tilesSuspended:()=>tilesSuspended};
  }
  window.GridVisionBaseOfflineInstall=install;
})();

// GV_HIDRO_ROTULOS_V3

// GV_HIDRO_RENDER_V351

// GV_CAUCE_RENDER_V353

// Respaldo nacional sin servidor MVT experimental
