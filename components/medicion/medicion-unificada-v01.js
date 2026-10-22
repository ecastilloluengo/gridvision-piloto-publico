/* GridVision - menú unificado v0.4: resultados bajo los filtros, distancia multipunto. */
(() => {
  'use strict';
  if (window.GridVisionMedicionUnificada) return;

  const STYLES = `
    body.gvmx-unificada #medicion-resultado { display:none !important; }
    .gvmx-modo { cursor:crosshair !important; }
    .gvmx-modo .leaflet-interactive { cursor:crosshair !important; }
    .gvmx-menu { position:fixed; width:268px; z-index:12000; box-sizing:border-box;
      background:#fff; color:#192b3e; border:1px solid #cbd5e1; border-radius:9px;
      padding:6px; box-shadow:0 5px 20px #0003; font:12px/1.4 Arial,sans-serif; }
    .gvmx-menu-title { padding:5px 9px 7px; font-weight:700; font-size:12px; }
    .gvmx-menu button { display:flex; width:100%; align-items:center; gap:9px;
      border:0; background:transparent; color:inherit; text-align:left;
      padding:9px 8px; border-radius:6px; cursor:pointer; font:inherit; }
    .gvmx-menu button:hover,.gvmx-menu button:focus-visible { background:#e8f2f7; outline:0; }
    .gvmx-menu button[data-selected="true"] { background:#dbeafe; font-weight:700; }
    .gvmx-menu .gvmx-icon { width:21px; text-align:center; font-size:15px; }
    .gvmx-menu-rule { margin:5px 0; border-top:1px solid #e2e8f0; }
    .gvmx-result { position:fixed; z-index:11999; width:268px; box-sizing:border-box;
      padding:9px 10px; border:1px solid #d1dbe4; border-radius:8px;
      color:#17283d; background:#fff; box-shadow:0 4px 14px #0003;
      font:12px/1.4 Arial,sans-serif; overflow-wrap:anywhere; }
    .gvmx-result-head { display:flex; align-items:center; justify-content:space-between; gap:6px; font-weight:700; }
    .gvmx-result-head button { border:0; background:transparent; cursor:pointer;
      font-size:16px; padding:0 2px; line-height:1; color:#64748b; }
    .gvmx-result-value { font-size:16px; font-weight:700; margin-top:5px; color:#0f506a; }
    .gvmx-result-detail { margin-top:7px; font-size:11px; color:#516172; line-height:1.5; }
    .gvmx-result-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px;
      padding:3px 0; border-bottom:1px solid #edf2f5; }
    .gvmx-result-row:last-child { border-bottom:0; }
    .gvmx-result-row span:first-child { flex:1; }
    .gvmx-result-row strong { color:#233f55; text-align:right; flex:0 0 auto; font-size:11px; }
    .gvmx-result-tip { margin-top:6px; color:#607080; font-size:10.5px; line-height:1.4; }
    .gvmx-result-tip:empty { display:none; }
    .gvmx-menu[hidden],.gvmx-result[hidden] { display:none!important; }
    .gvmx-menu:not([hidden]) + .gvmx-result { display:none!important; }
    .gvmx-menu,.gvmx-result { max-height:65vh; overflow-y:auto; }
    @media(max-width:400px) { .gvmx-menu,.gvmx-result { width:240px; } }
  `;

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      if (mount()) clearInterval(timer);
      else if (++tries > 60) {
        clearInterval(timer);
        console.warn('GridVision: no se activó menú unificado (falta botón, mapa o medidor de trazado).');
      }
    }, 150);
  }

  function mount() {
    const map = window.GridVisionMapa;
    const engine = window.medidorGridVision;
    const btn = document.querySelector('.control-medicion-boton');
    if (!window.L || !map || !(map instanceof L.Map) || !engine || !btn) return false;
    if (window.GridVisionMedicionUnificada) return true;

    const css = document.createElement('style');
    css.id = 'gvmx-estilos-medicion-unificada';
    css.textContent = STYLES;
    document.head.appendChild(css);

    // Retira exclusivamente el PANEL del medidor de trazados; el motor sigue escuchando al mapa.
    if (engine.control && typeof engine.control.remove === 'function') engine.control.remove();
    document.body.classList.add('gvmx-unificada');
    btn.title = 'Herramientas de medición';
    btn.setAttribute('aria-label', 'Herramientas de medición');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'true');

    let mode = null;
    let points = [];
    let graphics = [];
    let preview = null;
    let distanceLine = null;

    const menu = document.createElement('div');
    menu.className = 'gvmx-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<div class="gvmx-menu-title">Herramientas de medición</div>' +
      '<button type="button" data-mode="distancia"><span class="gvmx-icon">↔</span>Distancia entre puntos</button>' +
      '<button type="button" data-mode="trazado"><span class="gvmx-icon">⌁</span>Longitud del trazado</button>' +
      '<button type="button" data-mode="radio"><span class="gvmx-icon">◉</span>Radio, diámetro y área</button>' +
      '<div class="gvmx-menu-rule"></div>' +
      '<button type="button" data-action="clear"><span class="gvmx-icon">⌫</span>Limpiar medición</button>' +
      '<button type="button" data-action="exit"><span class="gvmx-icon">×</span>Salir</button>';
    document.body.appendChild(menu);
    L.DomEvent.disableClickPropagation(menu);
    L.DomEvent.disableScrollPropagation(menu);

    const result = document.createElement('div');
    result.className = 'gvmx-result';
    result.hidden = true;
    result.innerHTML = '<div class="gvmx-result-head"><span></span>' +
      '<button type="button" aria-label="Cerrar medición" title="Salir">×</button></div>' +
      '<div class="gvmx-result-value"></div><div class="gvmx-result-detail"></div>' +
      '<div class="gvmx-result-tip"></div>';
    document.body.appendChild(result);
    L.DomEvent.disableClickPropagation(result);
    L.DomEvent.disableScrollPropagation(result);

    const heading = result.querySelector('.gvmx-result-head span');
    const value = result.querySelector('.gvmx-result-value');
    const detail = result.querySelector('.gvmx-result-detail');
    const tip = result.querySelector('.gvmx-result-tip');

    // Se alinea al borde izquierdo del buscador/filtros y se sitúa POR DEBAJO
    // de ambos. No cubre los botones «Restablecer» ni «Filtros del mapa».
    function position(el) {
      const elements = ['.panel-busqueda', '#panel-filtros']
        .map(s => document.querySelector(s)).filter(Boolean);
      const visible = elements.map(e => e.getBoundingClientRect())
        .filter(r => r.width > 0 && r.height > 0);
      const reference = visible[0] || btn.getBoundingClientRect();
      const bottom = visible.length ? Math.max(...visible.map(r => r.bottom)) :
        btn.getBoundingClientRect().bottom;
      const width = Math.max(180, Math.min(284, reference.width, window.innerWidth - 16));
      let x = Math.max(8, Math.min(reference.left, window.innerWidth - width - 8));
      let y = bottom + 10;
      // Si no cabe debajo (ventana muy baja), pasar al lado derecho de filtros.
      if (window.innerHeight - y < 105 && visible.length &&
          reference.right + width + 15 < window.innerWidth) {
        x = Math.min(window.innerWidth - width - 8, reference.right + 10);
        y = Math.max(8, visible[0].top);
      }
      el.style.width = width + 'px';
      el.style.left = x + 'px';
      el.style.top = Math.max(8, y) + 'px';
      el.style.maxHeight = Math.max(70, window.innerHeight - Math.max(8,y) - 10) + 'px';
    }
    function showResult(label, number, info, note='') {
      heading.textContent = label;
      value.textContent = number || '';
      value.hidden = !number;
      detail.replaceChildren();
      if (Array.isArray(info)) {
        for (const item of info) {
          const row = document.createElement('div');
          row.className = 'gvmx-result-row';
          const name = document.createElement('span');
          const val = document.createElement('strong');
          name.textContent = item.label;
          val.textContent = item.value;
          row.append(name, val);
          detail.append(row);
        }
      } else {
        detail.textContent = info || '';
      }
      detail.hidden = !detail.textContent.trim();
      tip.textContent = note || '';
      result.hidden = false;
      position(result);
    }
    function hideMenu() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function refreshSelection() {
      menu.querySelectorAll('[data-mode]').forEach(b => {
        b.dataset.selected = b.dataset.mode === mode ? 'true' : 'false';
      });
      btn.classList.toggle('activo', !!mode);
      map.getContainer().classList.toggle('gvmx-modo', !!mode);
    }
    function removeDrawings() {
      for (const item of graphics) if (map.hasLayer(item)) map.removeLayer(item);
      graphics = [];
      points = [];
      distanceLine = null;
      if (preview && map.hasLayer(preview)) map.removeLayer(preview);
      preview = null;
    }
    function clear() {
      removeDrawings();
      engine.clear();
      if (mode === 'trazado') engine.start();
      if (!mode) result.hidden = true;
      else showResult(
        mode === 'trazado' ? 'Trazado' : mode === 'radio' ? 'Radio' : 'Distancia',
        '', mode === 'trazado' ? 'Seleccione el punto A de una línea visible.' :
          'Seleccione el primer punto en el mapa.'
      );
    }
    function choose(next) {
      removeDrawings();
      engine.clear();
      mode = next;
      if (mode === 'trazado') engine.start();
      refreshSelection();
      hideMenu();
      showResult(mode === 'trazado' ? 'Trazado' : mode === 'radio' ? 'Radio' : 'Distancia',
        '', mode === 'trazado' ? 'Seleccione A sobre una línea visible.' :
          'Seleccione el punto inicial en el mapa.');
    }
    function exit() {
      mode = null;
      removeDrawings();
      engine.clear();
      refreshSelection();
      hideMenu();
      result.hidden = true;
    }
    function dot(ll, label, fill) {
      const m = L.circleMarker(ll, { radius:6, color:'#fff', weight:2,
        fillColor:fill, fillOpacity:1, interactive:false }).addTo(map);
      m.bindTooltip(label, { permanent:true, direction:'top', offset:[0,-4] });
      graphics.push(m);
      return m;
    }
    function meters(m) { return Math.round(m).toLocaleString('es-CL') + ' m'; }
    function km(m) { return (m/1000).toLocaleString('es-CL', {minimumFractionDigits:3, maximumFractionDigits:3}) + ' km'; }
    function km2(n) { return n.toLocaleString('es-CL', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' km²'; }

    function onMapClick(evt) {
      if (!mode) return;
      if (mode === 'trazado') {
        const measured = engine.getResult();
        if (measured) {
          showResult('Longitud del trazado', km(measured.meters), [
            {label:'Distancia en metros', value:meters(measured.meters)},
            {label:'Línea', value:measured.lineName || 'Sin nombre'}
          ], 'Tramo A–B sobre la geometría registrada. Pulsa Limpiar para medir otro tramo.');
        } else {
          showResult('Longitud del trazado', '',
            engine.status?.textContent || 'Seleccione A y B sobre la misma línea.');
        }
        return;
      }
      // Radio sigue siendo una medición de 2 puntos; al hacer otro clic reinicia.
      // Distancia permite A→B→C→D... sin límite predeterminado.
      if (mode === 'radio' && points.length >= 2) removeDrawings();
      points.push(evt.latlng);
      const i = points.length - 1;
      const tag = i < 26 ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] : 'P' + (i + 1);
      dot(evt.latlng, tag, i === 0 ? '#16865a' : '#ce4d39');
      if (points.length === 1) {
        showResult(mode === 'radio' ? 'Radio de cobertura' : 'Distancia acumulada', '',
          'Punto A definido. Seleccione el punto B.',
          mode === 'distancia' ? 'Después de B puedes añadir C, D, E y más puntos.' : 'El segundo punto define el radio.');
        if (mode === 'radio') {
          preview = L.circle(evt.latlng, { radius:0, color:'#f59e0b', weight:2,
            dashArray:'5 4', fillColor:'#fbbf24', fillOpacity:0.08, interactive:false }).addTo(map);
        }
        return;
      }
      if (mode === 'distancia') {
        if (!distanceLine) {
          distanceLine = L.polyline(points, { color:'#f59e0b', weight:3,
            dashArray:'6 5', interactive:false }).addTo(map);
          graphics.push(distanceLine);
        } else {
          distanceLine.setLatLngs(points);
        }
        const previous = points[i - 1];
        const segment = map.distance(previous, points[i]);
        let total = 0;
        for (let j = 1; j < points.length; j++) {
          total += map.distance(points[j - 1], points[j]);
        }
        const prevTag = i - 1 < 26 ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i - 1] : 'P' + i;
        showResult('Distancia acumulada', km(total), [
          {label:'Total en metros', value:meters(total)},
          {label:'Último tramo ' + prevTag + '–' + tag, value:km(segment)},
          {label:'Puntos marcados', value:String(points.length)}
        ], 'Haz clic para añadir otro punto. Limpiar inicia una medición nueva.');
      } else {
        const distance = map.distance(points[0], points[1]);
        if (preview && map.hasLayer(preview)) map.removeLayer(preview);
        preview = null;
        graphics.push(L.circle(points[0], { radius:distance, color:'#f59e0b',
          weight:2, fillColor:'#fbbf24', fillOpacity:0.09, interactive:false }).addTo(map));
        const diam = distance * 2;
        const area = Math.PI * (distance/1000) ** 2;
        const perimeter = 2 * Math.PI * (distance/1000);
        showResult('Radio de cobertura', km(distance), [
          {label:'Radio en metros', value:meters(distance)},
          {label:'Diámetro', value:km(diam)},
          {label:'Área aprox.', value:km2(area)},
          {label:'Perímetro aprox.', value:km(perimeter*1000)}
        ], 'Área y perímetro calculados suponiendo un círculo sobre el plano.');
      }
    }
    function onMapMove(evt) {
      if (mode === 'radio' && points.length === 1 && preview) {
        preview.setRadius(map.distance(points[0], evt.latlng));
      }
    }

    // Se captura el clic ANTES del listener original para reutilizar el botón
    // sin activar el medidor antiguo (que permanecerá inactivo).
    btn.addEventListener('click', evt => {
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) position(menu);
    }, true);
    menu.addEventListener('click', evt => {
      const b = evt.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) choose(b.dataset.mode);
      else if (b.dataset.action === 'clear') { clear(); hideMenu(); }
      else if (b.dataset.action === 'exit') exit();
    });
    result.querySelector('button').addEventListener('click', exit);
    document.addEventListener('click', evt => {
      if (!menu.hidden && !menu.contains(evt.target) && !btn.contains(evt.target)) hideMenu();
    });
    document.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') {
        if (!menu.hidden) hideMenu();
        else if (mode) exit();
      }
    });
    function reposition() {
      if (!menu.hidden) position(menu);
      if (!result.hidden) position(result);
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(reposition);
      ['.panel-busqueda', '#panel-filtros'].forEach(s => {
        const p = document.querySelector(s);
        if (p) observer.observe(p);
      });
    }
    map.on('click', onMapClick);
    map.on('mousemove', onMapMove);
    refreshSelection();
    window.GridVisionMedicionUnificada = { choose, clear, exit, getMode:() => mode };
    console.info('GridVision: mediciones unificadas disponibles; control existente reutilizado.');
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
