/*
  GridVision - Medidor de longitud sobre trazado v0.1.0
  Integración: GridVisionLineMeasure.create({ map, lineFilter? })
  Requisitos: Leaflet 1.9.x y trazados como L.Polyline visibles.
  No altera las capas originales ni requiere librerías adicionales.
*/
(function (root) {
  'use strict';

  function isLatLng(p) {
    return !!(p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
      Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  function extractPaths(input, result) {
    result = result || [];
    if (!Array.isArray(input) || !input.length) return result;
    if (isLatLng(input[0])) {
      const p = input.filter(isLatLng);
      if (p.length >= 2) result.push(p);
      return result;
    }
    for (const item of input) extractPaths(item, result);
    return result;
  }

  // Snapping sobre el segmento tal como Leaflet lo presenta en el mapa.
  function closestPointOnPath(map, clickLatLng, path) {
    const p = map.latLngToLayerPoint(clickLatLng);
    let best = null;
    for (let i = 0; i < path.length - 1; i++) {
      const a = map.latLngToLayerPoint(path[i]);
      const b = map.latLngToLayerPoint(path[i + 1]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const projected = { x: a.x + t * dx, y: a.y + t * dy };
      const pixels = Math.hypot(p.x - projected.x, p.y - projected.y);
      if (!best || pixels < best.pixels) {
        best = {
          index: i,
          t,
          latlng: map.layerPointToLatLng(projected),
          pixels
        };
      }
    }
    return best;
  }

  // Distancias terrestres según L.LatLng.distanceTo (proyección sobre superficie).
  function cumulativeDistances(path, map) {
    const arr = [0];
    for (let i = 0; i < path.length - 1; i++) {
      arr.push(arr[i] + map.distance(path[i], path[i + 1]));
    }
    return arr;
  }

  function positionAlong(path, snap, cumulative) {
    const i = snap.index;
    const segmentMeters = cumulative[i + 1] - cumulative[i];
    return cumulative[i] + snap.t * segmentMeters;
  }

  // Retorna los vertices de un subtrazado, aunque A y B caigan en el mismo segmento.
  function slicePath(path, first, second) {
    let a = first, b = second;
    let backwards = false;
    if (a.index + a.t > b.index + b.t) {
      a = second;
      b = first;
      backwards = true;
    }
    const coords = [a.latlng];
    for (let v = a.index + 1; v <= b.index; v++) coords.push(path[v]);
    coords.push(b.latlng);
    return backwards ? coords.reverse() : coords;
  }

  const formatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const kmsFormatter = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function installCss() {
    if (document.getElementById('gridvision-measure-css')) return;
    const style = document.createElement('style');
    style.id = 'gridvision-measure-css';
    style.textContent = `
      .gvlm-panel { background:#fff; color:#1f2937; padding:12px;
        border-radius:9px; box-shadow:0 2px 12px #0003; width:225px;
        font:13px/1.45 Arial,sans-serif; }
      .gvlm-title {font-weight:700; font-size:14px; margin-bottom:8px;}
      .gvlm-actions {display:flex; gap:5px; margin-bottom:9px;}
      .gvlm-actions button {flex:1; border:1px solid #bec7cc; border-radius:5px;
        padding:6px 8px; background:#edf3f6; color:#17324d; cursor:pointer; font:inherit;}
      .gvlm-actions button:first-child {background:#1d647b; color:#fff; border-color:#1d647b;}
      .gvlm-actions button:focus-visible {outline:2px solid #e2a319; outline-offset:2px;}
      .gvlm-status {margin:0; min-height:36px; overflow-wrap:anywhere;}
      .gvlm-distance {font-size:23px; font-weight:700; margin:5px 0 2px;}
      .gvlm-secondary {font-size:12px; color:#555;}
      .gvlm-layer {font-size:12px; color:#555; margin-top:4px; overflow-wrap:anywhere;}
      .gvlm-hint {font-size:11px; color:#666; margin-top:7px;}
      @media(max-width:600px){.gvlm-panel{width:178px;padding:8px}.gvlm-distance{font-size:19px}}
    `;
    document.head.appendChild(style);
  }

  function describeLine(layer) {
    const p = (layer.feature && layer.feature.properties) || {};
    for (const key of ['nombre_linea', 'nombre', 'name', 'Name', 'NAME', 'line_name', 'LINEA', 'id_linea']) {
      if (p[key] !== undefined && p[key] !== null && String(p[key]).trim()) return String(p[key]).trim();
    }
    return (layer.options && layer.options.gridvisionLineName) || 'Línea seleccionada';
  }

  class GridVisionLineMeasure {
    constructor(options) {
      if (!root.L || !options || !options.map) {
        throw new Error('GridVisionLineMeasure requiere Leaflet y { map: instanciaLeaflet }.');
      }
      this.map = options.map;
      this.tolerancePx = options.tolerancePx === undefined ? 22 : options.tolerancePx;
      this.lineFilter = options.lineFilter || (() => true);
      this.position = options.position || 'topright';
      this.state = 'idle';
      this.a = null;
      this.result = null;
      this.graphics = [];
      this._onClick = (e) => this._handleClick(e);
      installCss();
      this._buildPanel();
      this.map.on('click', this._onClick);
    }

    _buildPanel() {
      const self = this;
      const Control = root.L.Control.extend({
        options: { position: this.position },
        onAdd: function () {
          const d = root.L.DomUtil.create('div', 'gvlm-panel');
          d.innerHTML = '<div class="gvlm-title">📏 Medir trazado</div>' +
            '<div class="gvlm-actions"><button type="button" data-action="start">Medir línea</button>' +
            '<button type="button" data-action="clear">Limpiar</button></div>' +
            '<p class="gvlm-status" aria-live="polite"></p>' +
            '<div class="gvlm-distance" aria-live="polite"></div>' +
            '<div class="gvlm-secondary"></div>' +
            '<div class="gvlm-layer"></div>' +
            '<div class="gvlm-hint">Medición sobre la geometría, no en línea recta.</div>';
          root.L.DomEvent.disableClickPropagation(d);
          root.L.DomEvent.disableScrollPropagation(d);
          d.querySelector('[data-action="start"]').addEventListener('click', () => self.start());
          d.querySelector('[data-action="clear"]').addEventListener('click', () => self.clear());
          self.panel = d;
          self.status = d.querySelector('.gvlm-status');
          self.distanceElement = d.querySelector('.gvlm-distance');
          self.secondaryElement = d.querySelector('.gvlm-secondary');
          self.lineElement = d.querySelector('.gvlm-layer');
          self._display('Pulse «Medir línea» para comenzar.');
          return d;
        }
      });
      this.control = new Control();
      this.control.addTo(this.map);
    }

    _display(message, distance, secondary, name) {
      if (!this.panel) return;
      this.status.textContent = message || '';
      this.distanceElement.textContent = distance || '';
      this.secondaryElement.textContent = secondary || '';
      this.lineElement.textContent = name || '';
    }

    _removeGraphics() {
      for (const layer of this.graphics) this.map.removeLayer(layer);
      this.graphics.length = 0;
    }

    start() {
      this._removeGraphics();
      this.result = null;
      this.a = null;
      this.state = 'first';
      this._display('Seleccione el punto A sobre una línea visible.');
      return this;
    }

    clear() {
      this._removeGraphics();
      this.a = null;
      this.result = null;
      this.state = 'idle';
      this._display('Medición borrada. Pulse «Medir línea» para comenzar.');
      return this;
    }

    _candidates() {
      const found = [];
      this.map.eachLayer(layer => {
        if (!(layer instanceof root.L.Polyline) || (layer instanceof root.L.Polygon)) return;
        if (layer._gridvisionMeasurement || !this.lineFilter(layer) || !this.map.hasLayer(layer)) return;
        const paths = extractPaths(layer.getLatLngs());
        paths.forEach((path, pathIndex) => found.push({ layer, path, pathIndex }));
      });
      return found;
    }

    _find(clickLatLng) {
      let best = null;
      for (const candidate of this._candidates()) {
        if (this.state === 'second' &&
          (candidate.layer !== this.a.layer || candidate.pathIndex !== this.a.pathIndex)) continue;
        const snap = closestPointOnPath(this.map, clickLatLng, candidate.path);
        if (snap && (!best || snap.pixels < best.snap.pixels)) best = Object.assign({ snap }, candidate);
      }
      return best && best.snap.pixels <= this.tolerancePx ? best : null;
    }

    _mark(latlng, color, title) {
      const marker = root.L.circleMarker(latlng, {
        radius: 8, color: '#fff', weight: 2.5, fillColor: color,
        fillOpacity: 1, interactive: false, bubblingMouseEvents: false
      }).addTo(this.map);
      marker._gridvisionMeasurement = true;
      marker.bindTooltip(title, { permanent: true, direction: 'top', offset: [0, -7] });
      this.graphics.push(marker);
    }

    _handleClick(event) {
      if (this.state !== 'first' && this.state !== 'second') return;
      const found = this._find(event.latlng);
      if (!found) {
        this._display(this.state === 'first'
          ? 'No se encontró una línea cerca del clic. Acerque el mapa e intente nuevamente.'
          : 'Seleccione el punto B sobre el mismo tramo continuo que A.');
        return;
      }
      const snap = found.snap;
      const { latlng } = snap;
      if (this.state === 'first') {
        this.a = found;
        this.state = 'second';
        this._mark(latlng, '#16865a', 'A · Inicio');
        this._display('Punto A definido. Seleccione el punto B sobre la misma línea.', '', '', describeLine(found.layer));
        return;
      }

      const cum = cumulativeDistances(this.a.path, this.map);
      const posA = positionAlong(this.a.path, this.a.snap, cum);
      const posB = positionAlong(this.a.path, found.snap, cum);
      const meters = Math.abs(posB - posA);
      const coords = slicePath(this.a.path, this.a.snap, found.snap);
      const highlight = root.L.polyline(coords, {
        color: '#f59e0b', opacity: .98, weight: 6, interactive: false,
        bubblingMouseEvents: false, lineJoin: 'round'
      }).addTo(this.map);
      highlight._gridvisionMeasurement = true;
      this.graphics.push(highlight);
      this._mark(latlng, '#cc4932', 'B · Fin');

      const lineName = describeLine(found.layer);
      this.result = {
        meters, kilometers: meters / 1000, lineName,
        a: { lat: this.a.snap.latlng.lat, lng: this.a.snap.latlng.lng },
        b: { lat: latlng.lat, lng: latlng.lng },
        layerId: root.L.stamp(found.layer), pathIndex: found.pathIndex
      };
      this.state = 'done';
      this._display('Longitud del trazado entre A y B:',
        kmsFormatter.format(meters / 1000) + ' km',
        formatter.format(meters) + ' metros · distancia sobre el eje de la línea', lineName);
      this.map.fire('gridvision:line-measured', Object.assign({}, this.result));
    }

    getResult() {
      return this.result ? Object.assign({}, this.result) : null;
    }

    destroy() {
      this.map.off('click', this._onClick);
      this._removeGraphics();
      this.map.removeControl(this.control);
      this.a = null;
      this.result = null;
      this.state = 'idle';
    }
  }

  root.GridVisionLineMeasure = {
    create: (options) => new GridVisionLineMeasure(options),
    geometry: { extractPaths, closestPointOnPath, cumulativeDistances, positionAlong, slicePath }
  };
})(typeof window !== 'undefined' ? window : globalThis);
