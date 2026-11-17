/* GridVision - identificacion electrica uniforme, sin consultas externas. */
(() => {
  'use strict';
  const maps = new WeakMap();
  const css = document.createElement('style');
  css.textContent = '.leaflet-tooltip.gv-electric-hover{font:600 13px/1.35 system-ui,sans-serif;color:#142c42;background:#fff;border:1px solid #a9bdcf;border-radius:6px;padding:6px 9px;white-space:normal;max-width:min(420px,80vw);pointer-events:none;box-shadow:0 2px 8px #0003}';
  document.head.appendChild(css);

  function controller(map) {
    if (maps.has(map)) return maps.get(map);
    const container = map.getContainer();
    const active = new Set();
    const registered = new WeakSet();
    const tooltip = L.tooltip({ direction:'top', offset:[0,-11], opacity:1,
      className:'gv-electric-hover', interactive:false });
    let selected = null, frame = 0, pending = null, moving = false, revision = 0;

    function hide() {
      selected = null;
      if (map.hasLayer(tooltip)) map.removeLayer(tooltip);
    }
    function reset() {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      hide();
    }
    function nearest(p) {
      // Points take precedence over lines. Only mounted layers are considered.
      let point = null, pd = Infinity;
      for (const e of active) {
        if (e.line || !map.hasLayer(e.layer)) continue;
        if (e.revision !== revision) {
          e.pixel = map.latLngToLayerPoint(e.layer.getLatLng());
          e.revision = revision;
        }
        const d = Math.hypot(p.x-e.pixel.x,p.y-e.pixel.y);
        const radius = typeof e.layer.getRadius === 'function' ? e.layer.getRadius() : 12;
        if (d <= Math.max(9,radius+3) && d < pd) { point=e; pd=d; }
      }
      if (point) return point;
      let line = null, best = map.getZoom()<8 ? 12 : 9;
      for (const e of active) {
        if (!e.line || !map.hasLayer(e.layer)) continue;
        // Leaflet's rendered, clipped and simplified pixel geometry avoids
        // projecting the entire national inventory on each pointer movement.
        const bounds=e.layer._pxBounds, parts=e.layer._parts;
        if (!bounds || !Array.isArray(parts) || !parts.length) continue;
        if (p.x<bounds.min.x-best || p.x>bounds.max.x+best ||
            p.y<bounds.min.y-best || p.y>bounds.max.y+best) continue;
        for (const part of parts) for (let i=1;i<part.length;i++) {
          const a=part[i-1], b=part[i];
          if (p.x<Math.min(a.x,b.x)-best || p.x>Math.max(a.x,b.x)+best ||
              p.y<Math.min(a.y,b.y)-best || p.y>Math.max(a.y,b.y)+best) continue;
          const d=L.LineUtil.pointToSegmentDistance(p,a,b);
          if (d<=best) { best=d; line=e; }
        }
      }
      return line;
    }
    function render() {
      frame=0;
      const event=pending; pending=null;
      if (!event || moving) return hide();
      const p=map.mouseEventToLayerPoint(event);
      const hit=nearest(p);
      if (!hit) return hide();
      if (hit!==selected) {
        const label=document.createElement('span');
        label.textContent=hit.name;
        tooltip.setContent(label);
        selected=hit;
      }
      tooltip.setLatLng(map.layerPointToLatLng(p));
      if (!map.hasLayer(tooltip)) tooltip.addTo(map);
    }
    function pointer(event) {
      if (event.pointerType==='touch' || event.buttons || moving ||
          event.target?.closest?.('.leaflet-control,.leaflet-popup,.leaflet-tooltip,button,input,select,textarea')) {
        reset(); return;
      }
      pending=event;
      if (!frame) frame=requestAnimationFrame(render);
    }
    // Capture sees the pointer even when a volcanic/fire overlay is above SEN.
    container.addEventListener('pointermove',pointer,{capture:true,passive:true});
    container.addEventListener('pointerleave',reset,{passive:true});
    container.addEventListener('pointerdown',reset,{capture:true,passive:true});
    map.on('movestart zoomstart',()=>{moving=true;reset();});
    map.on('moveend zoomend',()=>{moving=false;revision++;reset();});
    map.on('viewreset resize',()=>{revision++;reset();});
    map.on('popupopen',reset);
    const result={register(layer,name){
      if (registered.has(layer)) return;
      const line=layer instanceof L.Polyline && !(layer instanceof L.Polygon);
      if (!line && typeof layer.getLatLng!=='function') return;
      registered.add(layer);
      const e={layer,line,name:String(name??'').trim() || (line?'Línea eléctrica sin nombre':'Activo eléctrico sin nombre'),revision:-1,pixel:null};
      const add=()=>{e.revision=-1;active.add(e);};
      const remove=()=>{active.delete(e);if(selected===e)reset();};
      layer.on('add',add);
      layer.on('remove',remove);
      if (map.hasLayer(layer)) add();
    }};
    maps.set(map,result);
    return result;
  }
  window.GridVisionElectricHover={register(map,layer,name){controller(map).register(layer,name);}};
})();
