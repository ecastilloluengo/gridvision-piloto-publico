
/* GridVision Portal Offline V2.1.5 */
(() => {
    'use strict';

    const CACHE = 'gridvision-nav-offline-v1';

    const raiz = new URL('./', location.href);

    const recursos = [
        'portal.html',
        'portal.css',
        'portal.js',
        'portal-offline.js',
        'buscador-activos.html', // GV_PORTAL_EQM_OFFLINE_V1
        'portal-solax-diagnostico-potencias.js',
        'portal-alertas-pfv.js',
        'fusionsolar-detalle-v1.css',
        'fusionsolar-detalle-v1.js',
        'components/alertas/activos-meteorologicos.js',
        'components/alertas/estado-alertas.js',
        'assets/logo-pecket-energy.png',
        'portal-fondo-control-renovable.png',
        'data/processed/pfv_netbilling.geojson'
    ];

    // Verifica el catalogo completo, no solo un HTTP 200.
    function catalogoEQMValido(texto) {
        return texto.includes('<script id="embeddedCatalog"') &&
               texto.includes('<script id="offlineApp"');
    }

    async function verificarBuscadorEQM() {
        const enlace = document.getElementById('nav-buscador-activos');
        let descargado = false;
        if ('caches' in window) {
            try {
                const cache = await caches.open(CACHE);
                const copia = await cache.match(new URL('buscador-activos.html', raiz).href);
                descargado = !!copia?.ok && catalogoEQMValido(await copia.text());
            } catch (_) {}
        }
        window.GVPortalBuscadorEQMOffline = {descargado,
            controlado: !!navigator.serviceWorker?.controller};
        if (enlace) {
            enlace.dataset.offlineEqm = descargado ? 'listo' : 'pendiente';
            enlace.title = descargado
                ? 'Buscador de Activos Pecket · catálogo EQM descargado'
                : 'Buscador de Activos Pecket · pendiente de descargar para uso offline';
        }
        return descargado;
    }

    async function preparar() {
        if (!navigator.onLine) return;
        if (!('serviceWorker' in navigator)) return;
        if (!('caches' in window)) return;

        try {
            await navigator.serviceWorker.register(
                new URL('gridvision-sw.js', raiz),
                {scope: raiz.pathname}
            );

            await navigator.serviceWorker.ready;

            const cache = await caches.open(CACHE);

            let guardados = 0;
            const pendientes = [];

            for (const recurso of recursos) {
                try {
                    const url = new URL(recurso, raiz).href;
                    let copia = await cache.match(url);

                    // El catalogo EQM se actualiza al abrir el Portal conectado.
                    // Si falla la red, conservamos una copia anterior valida.
                    if (recurso === 'buscador-activos.html') {
                        let anteriorValido = false;
                        try { anteriorValido = !!copia?.ok && catalogoEQMValido(await copia.clone().text()); } catch (_) {}
                        try {
                            const respuesta = await fetch(url, {cache: 'no-store'});
                            if (!respuesta.ok || !catalogoEQMValido(await respuesta.clone().text())) {
                                throw Error('Catálogo EQM inválido o no disponible');
                            }
                            await cache.put(url, respuesta);
                            copia = await cache.match(url);
                        } catch (error) {
                            if (!anteriorValido) throw error;
                        }
                        if (!copia?.ok || !catalogoEQMValido(await copia.clone().text())) {
                            throw Error('Catálogo EQM sin respaldo verificable');
                        }
                    } else if (!copia || !copia.ok) {
                        const respuesta = await fetch(
                            url,
                            {cache: 'no-store'}
                        );

                        if (!respuesta.ok) {
                            throw Error('HTTP ' + respuesta.status);
                        }

                        await cache.put(url, respuesta.clone());
                        copia = await cache.match(url);
                    }

                    if (!copia?.ok) {
                        throw Error('Sin respaldo verificable');
                    }

                    guardados++;

                } catch (error) {
                    pendientes.push(recurso);
                }
            }

            window.GVPortalOfflinePreparacion = {
                guardados,
                total: recursos.length,
                pendientes,
                listo: pendientes.length === 0
            };

            await verificarBuscadorEQM();

            console.info(
                'GridVision Portal Offline:',
                window.GVPortalOfflinePreparacion
            );

            if (navigator.storage?.persist) {
                try {
                    await navigator.storage.persist();
                } catch (_) {}
            }

        } catch (error) {
            console.warn('Portal offline:', error);
        }
    }

    function estadoConexion() {
        const tarjeta = document.querySelector('.system-card');
        if (!tarjeta) return;

        const indicador = tarjeta.querySelector('strong');
        const punto = tarjeta.querySelector('.status-dot');
        const pulso = tarjeta.querySelector('.heartbeat');

        const conectado = navigator.onLine;

        if (indicador) {
            indicador.textContent = conectado
                ? 'Normal'
                : 'Offline';

            indicador.style.color = conectado
                ? ''
                : '#ffbf47';
        }

        if (punto) {
            punto.style.background = conectado
                ? ''
                : '#ffbf47';

            punto.style.boxShadow = conectado
                ? ''
                : '0 0 10px #ffbf47';
        }

        if (pulso) {
            pulso.style.stroke = conectado
                ? ''
                : '#ffbf47';
        }
    }

    window.addEventListener('offline', () => {
        estadoConexion();
        void verificarBuscadorEQM();
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
        void verificarBuscadorEQM();
    });

    window.addEventListener('online', () => {
        estadoConexion();
        preparar();
    });

    estadoConexion();
    void verificarBuscadorEQM();
    preparar();

})();
