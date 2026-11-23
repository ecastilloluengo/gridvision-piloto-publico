/* GridVision Vulcano V3.8.8d: preparación voluntaria de recursos volcánicos offline.
 * No modifica el SW, no consulta APIs en vivo ni borra cachés existentes.
 */
(() => {
  'use strict';

  const scriptUrl = document.currentScript && document.currentScript.src;
  if (!scriptUrl) return;
  const ROOT = new URL('../../', scriptUrl);
  const MANIFEST = new URL('data/vulcano/manifest-offline-v388d.json', ROOT).href;
  // Usar exactamente la caché consultada por gridvision-sw.js al estar sin red.
  const CACHE_NAME = 'gridvision-nav-offline-v1';
  const SCHEMA = 'gv-volcanes-offline-v388d-1';
  const MAX_BYTES = 500 * 1024 * 1024;
  const MAX_SINGLE_BYTES = 100 * 1024 * 1024;
  const state = {
    version: '3.8.8d', listo: false, documentos: 0,
    faltantes: [], errores: [], descargados: 0, preparando: false,
    cache: CACHE_NAME
  };
  window.GV388VolcanesOffline = state;

  let missing = [];
  let manifest = null;
  let aborter = null;
  let verifying = false;

  function resourceUrl(item) {
    const path = item && item.path;
    if (typeof path !== 'string' ||
        !/^data\/vulcano\/[a-z0-9_-]+\.(geojson|json)$/i.test(path)) {
      throw new Error('Ruta no autorizada en manifiesto volcánico');
    }
    const url = new URL(path, ROOT);
    if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) {
      throw new Error('Recurso fuera del origen de GridVision');
    }
    return url.href;
  }

  async function readManifest() {
    if (!('caches' in window)) throw new Error('CacheStorage no disponible');
    let response = await caches.match(MANIFEST);
    if (!response || !response.ok) {
      if (!navigator.onLine) throw new Error('Sin manifiesto offline. Conéctate y verifica primero.');
      response = await fetch(MANIFEST, {cache: 'no-store'});
      if (!response.ok) throw new Error('Manifiesto HTTP ' + response.status);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(MANIFEST, response.clone());
    }
    const data = await response.json();
    if (data.schema !== SCHEMA || !Array.isArray(data.files) ||
        data.files.length !== data.total || data.total < 100 || data.total > 1000) {
      throw new Error('Manifiesto volcánico incompatible');
    }
    const seen = new Set();
    let sizeTotal = 0;
    for (const item of data.files) {
      const href = resourceUrl(item);
      if (seen.has(href)) throw new Error('Archivo duplicado en manifiesto');
      seen.add(href);
      if (!Number.isSafeInteger(item.size) || item.size <= 0 || item.size > MAX_SINGLE_BYTES) {
        throw new Error('Tamaño no válido: ' + item.path);
      }
      sizeTotal += item.size;
    }
    if (sizeTotal !== data.total_bytes || sizeTotal > MAX_BYTES) {
      throw new Error('Tamaño total inesperado en manifiesto');
    }
    return data;
  }

  async function cached(href) {
    const workerCache = await caches.open(CACHE_NAME);
    const response = await workerCache.match(href);
    return !!(response && response.ok);
  }

  function mount() {
    const panel = document.getElementById('gv-nav-dialog');
    if (!panel) return false;
    if (panel.querySelector('#gv388-volcanes-offline')) return true;

    const section = document.createElement('section');
    section.id = 'gv388-volcanes-offline';
    section.style.cssText = 'border-top:1px solid #517b8a;margin-top:8px;padding-top:9px;display:grid;gap:6px';

    const heading = document.createElement('strong');
    heading.textContent = 'Volcanes: datos completos offline';
    heading.style.cssText = 'font-size:12px;color:#e9f5fc';

    const hint = document.createElement('div');
    hint.textContent = 'Preparar los datos históricos de volcanes, peligros, evacuación y puntos. La información offline es una copia de referencia, no una alerta en vivo.';
    hint.style.cssText = 'font-size:11px;line-height:1.4;color:#d0e4ee';

    const verifyButton = document.createElement('button');
    verifyButton.type = 'button';
    verifyButton.textContent = 'Verificar volcanes offline';
    verifyButton.className = 'gv-nav-download';

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.textContent = 'Descargar archivos faltantes';
    downloadButton.className = 'gv-nav-download';
    downloadButton.hidden = true;
    downloadButton.style.display = 'none';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Detener descarga';
    cancelButton.className = 'gv-nav-download';
    cancelButton.hidden = true;
    cancelButton.style.display = 'none';

    const label = document.createElement('div');
    label.textContent = 'Sin verificar. La preparación requiere conexión una sola vez por navegador y origen.';
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    label.style.cssText = 'font-size:11px;line-height:1.4;overflow-wrap:anywhere;color:#d0e4ee';

    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progress.hidden = true;
    progress.style.cssText = 'width:100%;height:12px';

    section.append(heading, hint, verifyButton, downloadButton, cancelButton, progress, label);
    const cartografia = panel.querySelector('#gv388-sectores-offline');
    const fallback = panel.querySelector('.gv-nav-base-choice');
    if (cartografia) cartografia.insertAdjacentElement('afterend', section);
    else if (fallback) fallback.insertAdjacentElement('afterend', section);
    else panel.appendChild(section);

    function setBusy(on) {
      state.preparando = !!on;
      verifyButton.disabled = !!on;
      downloadButton.disabled = !!on;
      cancelButton.hidden = !on;
      cancelButton.style.display = on ? '' : 'none';
      progress.hidden = !on;
      if (!on) progress.value = 0;
    }

    async function verify() {
      if (verifying || state.preparando) return;
      verifying = true;
      verifyButton.disabled = true;
      downloadButton.hidden = true;
      downloadButton.style.display = 'none';
      label.textContent = 'Leyendo inventario volcánico…';
      try {
        manifest = await readManifest();
        missing = [];
        state.errores = [];
        state.documentos = manifest.files.length;
        for (let i = 0; i < manifest.files.length; i++) {
          const entry = manifest.files[i];
          if (!(await cached(resourceUrl(entry)))) missing.push(entry);
          if (i % 25 === 0) {
            label.textContent = 'Verificando recursos ' + (i + 1) + '/' + manifest.files.length + '…';
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        state.faltantes = missing.map(item => item.path);
        state.listo = missing.length === 0;
        if (state.listo) {
          label.textContent = 'Volcanes offline listos · ' + manifest.files.length + '/' + manifest.files.length + ' archivos en caché. Copia de referencia.';
        } else {
          const bytes = missing.reduce((sum, item) => sum + item.size, 0);
          const mb = (bytes / 1048576).toFixed(1);
          label.textContent = 'Faltan ' + missing.length + ' de ' + manifest.files.length + ' archivos (aprox. ' + mb + ' MiB). Conéctate para prepararlos.';
          if (navigator.onLine) {
            downloadButton.textContent = 'Descargar ' + missing.length + ' archivos faltantes';
            downloadButton.hidden = false;
            downloadButton.style.display = '';
          }
        }
      } catch (error) {
        state.listo = false;
        state.errores = [String(error && error.message || error)];
        label.textContent = 'No se pudo verificar: ' + state.errores[0];
      } finally {
        verifying = false;
        verifyButton.disabled = false;
      }
    }

    async function download() {
      if (state.preparando || verifying || !manifest || missing.length === 0) return;
      if (!navigator.onLine) {
        label.textContent = 'Sin internet. Reconéctate para descargar lo que falta.';
        return;
      }
      const bytes = missing.reduce((sum, item) => sum + item.size, 0);
      if (bytes > MAX_BYTES) {
        label.textContent = 'Descarga demasiado grande. No se inició.';
        return;
      }
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) &&
              estimate.quota - estimate.usage < bytes * 1.15) {
            label.textContent = 'Espacio de caché insuficiente. No se inició la descarga.';
            return;
          }
        }
      } catch (_) { /* Algunos navegadores no permiten estimar la cuota. */ }

      const work = missing.slice();
      const cache = await caches.open(CACHE_NAME);
      aborter = new AbortController();
      let next = 0;
      let done = 0;
      let added = 0;
      const errors = [];
      state.descargados = 0;
      setBusy(true);
      downloadButton.hidden = true;
      downloadButton.style.display = 'none';
      progress.max = work.length;
      progress.value = 0;

      async function worker() {
        while (next < work.length && !aborter.signal.aborted) {
          const item = work[next++];
          try {
            const href = resourceUrl(item);
            if (!(await cached(href))) {
              const response = await fetch(href, {cache: 'no-store', signal: aborter.signal});
              if (!response.ok || response.type === 'opaque') {
                throw new Error('HTTP ' + response.status);
              }
              await cache.put(href, response.clone());
              if (!(await cached(href))) throw new Error('No quedó almacenado');
              added++;
            }
          } catch (error) {
            if (!aborter.signal.aborted) errors.push(item.path + ': ' + String(error && error.message || error));
          } finally {
            done++;
            progress.value = done;
            state.descargados = added;
            label.textContent = 'Descarga volcánica ' + done + '/' + work.length +
              ' · Nuevos ' + added + ' · Errores ' + errors.length;
          }
        }
      }

      try {
        await Promise.all(Array.from({length: Math.min(3, work.length)}, worker));
        state.errores = errors;
        if (aborter.signal.aborted) {
          label.textContent = 'Descarga detenida. Se conservaron ' + added +
            ' archivos nuevos. Pulsa Verificar para continuar después.';
        } else if (errors.length) {
          label.textContent = 'Terminó con ' + errors.length + ' errores. Pulsa Verificar para reintentar.';
          console.warn('Vulcano offline: primeros errores', errors.slice(0, 10));
        } else {
          label.textContent = 'Descarga terminada. Comprobando cobertura…';
        }
      } finally {
        setBusy(false);
        aborter = null;
      }
      // La nueva verificación comprueba todos los recursos; nunca declara éxito por sólo contar descargas.
      if (!errors.length) await verify();
    }

    verifyButton.addEventListener('click', verify);
    downloadButton.addEventListener('click', download);
    cancelButton.addEventListener('click', () => {if (aborter) aborter.abort();});
    return true;
  }

  function init() {
    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    // El observador se desconecta al instalar el control o al abandonar la página.
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else init();
})();
