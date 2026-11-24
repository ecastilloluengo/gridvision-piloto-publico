/* GridVision Chile V3.7.4 — Etiquetas de localidades OSM discretas para el mapa offline. */
(function () {
  'use strict';
  if (window.__gvLocalidadesV374Loaded) return;
  window.__gvLocalidadesV374Loaded = true;

  const script = document.currentScript;
  const dataUrl = script && script.src
    ? new URL('../../data/offline/localidades-v374.json', script.src).href
    : 'data/offline/localidades-v374.json';

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('es').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  const priorities = {
    national_capital: 0, city: 1, town: 2, village: 3,
    suburb: 4, hamlet: 5, locality: 6, farm: 7
  };
  function priority(item) { return priorities[item[3]] ?? 9; }

  function install(map) {
    let records = [], ready = false, revision = 0, scheduled = false;
    const paneName = 'gv-localidades-v374';
    if (!map.getPane(paneName)) map.createPane(paneName);
    const pane = map.getPane(paneName);
    pane.style.zIndex = '525';
    pane.style.pointerEvents = 'none';
    const group = L.layerGroup().addTo(map);
    const state = {count: 0, displayed: 0, ready: false, error: null};
    window.GVLocalidadesV374 = state;

    function update() {
      ++revision;
      group.clearLayers();
      state.displayed = 0;
      if (!ready) return;
      // No duplicar las etiquetas de fondos online o satelitales.
      const element = map.getContainer();
      if (!element.classList.contains('gv-base-v2-active')) return;
      const zoom = map.getZoom();
      if (zoom < 5) return;
      const bounds = map.getBounds();
      const size = map.getSize();
      const maxLabels = zoom < 9 ? 10 : zoom < 12 ? 18 : zoom < 15 ? 28 : 36;
      const eligible = [];
      for (const item of records) {
        if (zoom < item[4]) continue;
        if (item[0] < bounds.getSouth() || item[0] > bounds.getNorth() ||
            item[1] < bounds.getWest() || item[1] > bounds.getEast()) continue;
        eligible.push(item);
      }
      eligible.sort((a, b) => priority(a) - priority(b) || b[5] - a[5] ||
        String(a[2]).localeCompare(String(b[2]), 'es'));
      const used = [];
      for (const item of eligible) {
        if (state.displayed >= maxLabels) break;
        const name = String(item[2] || '');
        if (!name || name.length > 55) continue;
        const pt = map.latLngToContainerPoint([item[0], item[1]]);
        const width = Math.min(215, Math.max(46, name.length * 6.5 + 13));
        if (pt.x < width / 2 + 10 || pt.x > size.x - width / 2 - 10 ||
            pt.y < 16 || pt.y > size.y - 18) continue;
        const norm = normalize(name);
        const overlap = used.some(prev =>
          Math.abs(pt.x - prev.x) < (width + prev.w) / 2 + 16 &&
          Math.abs(pt.y - prev.y) < 21);
        const repeat = used.some(prev => prev.name === norm &&
          Math.hypot(pt.x - prev.x, pt.y - prev.y) < 170);
        if (overlap || repeat) continue;
        used.push({x: pt.x, y: pt.y, w: width, name: norm});
        const label = document.createElement('span');
        label.className = 'gv-place-label-v374 gv-place-' + item[3];
        label.textContent = name;
        const marker = L.marker([item[0], item[1]], {
          pane: paneName,
          icon: L.divIcon({
            className: 'gv-place-wrapper-v374',
            html: label.outerHTML,
            iconSize: [width, 20],
            iconAnchor: [width / 2, 10]
          }),
          interactive: false,
          keyboard: false
        });
        group.addLayer(marker);
        state.displayed++;
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {scheduled = false; update();});
    }
    map.on('moveend zoomend', schedule);
    new MutationObserver(schedule).observe(map.getContainer(),
      {attributes: true, attributeFilter: ['class']});
    (async () => {
      // Cache-first: la etiqueta de localidad también funciona sin servidor ni Internet.
      const saved = 'caches' in window ? await caches.match(dataUrl) : null;
      if (saved?.ok) return saved.json();
      const response = await fetch(dataUrl, {cache:'default'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      try {
        if ('caches' in window) {
          const cache = await caches.open('gridvision-nav-offline-v1');
          await cache.put(dataUrl, response.clone());
        }
      } catch (e) { console.warn('No se pudo guardar etiquetas offline:', e); }
      return response.json();
    })()
      .then(data => {
        if (data.version !== '3.7.4' || !Array.isArray(data.localidades))
          throw new Error('Formato de localidades incorrecto');
        records = data.localidades;
        ready = true;
        state.ready = true;
        state.count = records.length;
        schedule();
      })
      .catch(error => {
        state.error = error.message;
        console.warn('GridVision V3.7.4 localidades no disponibles:', error);
      });
  }
  let attempts = 0;
  const wait = setInterval(() => {
    attempts++;
    if (window.L && L.Map) {
      const map = Object.values(window).find(value =>
        value instanceof L.Map && value._container);
      if (map) { clearInterval(wait); install(map); return; }
    }
    if (attempts > 120) {
      clearInterval(wait);
      console.warn('GridVision V3.7.4: no se encontró el mapa Leaflet');
    }
  }, 500);
})();
