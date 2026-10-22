/* GridVision / Medidor de trazados: integración local v0.2 (no publica nada). */
(function () {
  'use strict';
  try {
    if (window.medidorGridVision) return; // evitar una segunda instancia
    if (typeof L === 'undefined' || typeof GridVisionLineMeasure === 'undefined') {
      console.warn('GridVision Medidor: falta Leaflet o el módulo del medidor.');
      return;
    }
    if (typeof mapa === 'undefined' || !(mapa instanceof L.Map)) {
      console.warn('GridVision Medidor: no se encontró la instancia Leaflet mapa.');
      return;
    }
    window.medidorGridVision = GridVisionLineMeasure.create({
      map: mapa,
      position: 'topright',
      tolerancePx: 22,
      // Se consideran polilíneas visibles; no se alteran las capas originales.
      // Los tramos separados (por ejemplo en STLL E22) NO se conectan artificialmente.
      lineFilter: function (layer) {
        return layer.options.gridvisionMedible !== false;
      }
    });
    console.info('GridVision Medidor: herramienta disponible (solo interfaz local).');
  } catch (err) {
    console.error('GridVision Medidor: fallo de inicialización', err);
  }
})();
