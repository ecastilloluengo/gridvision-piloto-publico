/* GridVision V2: national reference vector basemap, Natural Earth, public domain. */
(() => {
  'use strict';
  const src = document.currentScript?.src;
  const url = new URL('../../data/offline/base-chile-v2.geojson',src).href;
  const REQUIRED = ['pais','region','lago','rio','camino','localidad'];
  const colors = {pais:'#e6e8d7',chile:'#e9edda',region:'#7d8d80',lago:'#9fcad8',rio:'#7db1c8',camino:'#9b937f'};
  function install(map, button, report) {
    if (!map || !button || button.dataset.gvBaseInstalled) return;
    button.dataset.gvBaseInstalled='1';
    const container=map.getContainer();
    let data=null, loading=null, active=false, desired=false, generation=0, layers=null, labels=null, frame=0;
    let manual=false, tilesSuspended=false;
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
    const credit='Made with Natural Earth · mapa general (1:10m)';
    for (const [name,z] of [['gv-base-v2',230],['gv-base-v2-label',260]]) {
      const pane=map.getPane(name)||map.createPane(name);pane.style.zIndex=z;pane.style.pointerEvents='none';
    }
    async function getData(){
      if (data) return data;
      if (!loading) loading=(async()=>{
        let response;
        if(!navigator.onLine && 'caches' in window){
          const cache=await caches.open('gridvision-nav-offline-v1');
          response=await cache.match(url);
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
      const candidates=data.features.filter(f=>f.geometry?.type==='Point'&&f.properties?.nombre&&['localidad','pais_rotulo','region_rotulo'].includes(f.properties.capa)).filter(f=>{
        const p=f.properties;if(p.capa==='pais_rotulo')return zoom<=6;
        if(p.capa==='region_rotulo')return zoom>=6&&zoom<=9;
        return zoom>=5&&(zoom>=9||p.rango<=zoom+1||p.poblacion>=50000);
      }).sort((a,b)=>{const p=a.properties,q=b.properties;const priority=x=>x.capa==='pais_rotulo'? -100:x.capa==='region_rotulo'?-10:x.rango-(Math.log10(Math.max(1,x.poblacion||1))*.3);return priority(p)-priority(q);});
      let n=0;
      for(const f of candidates){
        const [lon,lat]=f.geometry.coordinates, ll=L.latLng(lat,lon);if(!bounds.contains(ll))continue;
        const xy=map.latLngToContainerPoint(ll), key=Math.floor(xy.x/100)+':'+Math.floor(xy.y/36);if(used.has(key))continue;
        used.add(key);const p=f.properties, span=document.createElement('span');span.textContent=p.nombre;
        const type=p.capa==='localidad'?'town':p.capa==='region_rotulo'?'region':'country';
        L.marker(ll,{pane:'gv-base-v2-label',interactive:false,keyboard:false,icon:L.divIcon({className:'gv-base-label '+type,html:span,iconSize:[0,0],iconAnchor:[0,0]})}).addTo(labels);
        if(++n>=110)break;
      }
    }
    function queueLabels(){if(!frame)frame=requestAnimationFrame(renderLabels);}
    function createLayers(){
      if(layers)return;
      const renderer=L.canvas({pane:'gv-base-v2',padding:.4});
      layers=L.layerGroup();labels=L.layerGroup();
      // Separate groups ensure country fills cannot cover rivers or roads.
      for(const kind of ['pais','region','lago','rio','camino']) {
        L.geoJSON({type:'FeatureCollection',features:data.features.filter(f=>f.properties.capa===kind)}, {pane:'gv-base-v2',renderer,interactive:false,style}).addTo(layers);
      }
    }
    function hide(){
      desired=false;++generation;
      if(active){map.removeLayer(layers);map.removeLayer(labels);map.attributionControl?.removeAttribution(credit);}
      active=false;container.classList.remove('gv-base-v2-active');button.setAttribute('aria-pressed','false');button.textContent='Mapa nacional offline';
      if(navigator.onLine)resumeTiles();
    }
    async function show(){
      desired=true;const token=++generation;
      if(!navigator.onLine)suspendTiles();
      button.disabled=true;button.textContent='Cargando mapa nacional…';
      try{
        await getData();if(token!==generation||!desired)return;
        createLayers();suspendTiles();if(!active){layers.addTo(map);labels.addTo(map);map.attributionControl?.addAttribution(credit);}
        active=true;container.classList.add('gv-base-v2-active');button.setAttribute('aria-pressed','true');button.textContent='Volver al fondo en línea';queueLabels();
        report('Mapa nacional de referencia · Natural Earth · sin detalle rural.','ok');
      }catch(e){if(token===generation){hide();report('Mapa nacional no disponible. Descárgalo conectado: '+e.message,'warning');}}
      finally{button.disabled=false;}
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
