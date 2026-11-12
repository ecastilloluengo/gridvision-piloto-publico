/* GridVision V2.1 - modo meteorologico independiente */
(() => {
    'use strict';

    const VERSION = 'gv-modo-clima-v212-20261112';
    const KEY = 'gridvision-modo-clima-v21';

    let preferencia = 'con';
    try {
        if (localStorage.getItem(KEY) === 'sin') preferencia = 'sin';
    } catch (_) {}

    let activo = preferencia === 'con' && navigator.onLine;
    let controlador = new AbortController();
    let solicitudes = 0;
    let bloqueadas = 0;
    let generacion = 0;

    const habilitado = () => activo && navigator.onLine;

    function render() {
        document.documentElement.classList.toggle(
            'gv-clima-pausado', !habilitado()
        );

        const con = document.getElementById('gv-modo-clima');
        const sin = document.getElementById('gv-modo-sin-clima');
        if (!con || !sin) return;
        for (const [b, activo] of [[con, habilitado()], [sin, !habilitado()]]) {
            b.setAttribute('aria-pressed', String(activo));
            b.disabled = !navigator.onLine;
        }
        const aviso = document.getElementById('gv-modo-estado');
        if (aviso) aviso.hidden = navigator.onLine;
    }

    function sincronizar() {
        const siguiente = preferencia === 'con' && navigator.onLine;

        if (siguiente !== activo) {
            controlador.abort();
            controlador = new AbortController();
            generacion++;
            activo = siguiente;

            render();

            window.dispatchEvent(new CustomEvent(
                'gridvision:modo-clima', {
                    detail: {
                        habilitado: activo,
                        preferencia,
                        generacion
                    }
                }
            ));
        } else {
            render();
        }
    }

    function seleccionar(modo) {
        if (!['con', 'sin'].includes(modo)) return;

        preferencia = modo;

        try {
            localStorage.setItem(KEY, modo);
        } catch (_) {}

        sincronizar();
    }

    async function consultar(input, init = {}) {
        if (!habilitado()) {
            bloqueadas++;
            throw new DOMException(
                'Meteorologia pausada',
                'AbortError'
            );
        }

        const signals = [controlador.signal];

        if (init.signal) signals.push(init.signal);

        let signal;

        if (typeof AbortSignal.any === 'function') {
            signal = AbortSignal.any(signals);
        } else {
            const combinado = new AbortController();

            for (const s of signals) {
                if (s.aborted) combinado.abort();
                else s.addEventListener(
                    'abort',
                    () => combinado.abort(),
                    {once: true}
                );
            }

            signal = combinado.signal;
        }

        solicitudes++;

        return window.fetch(input, {
            ...init,
            signal
        });
    }

    window.GridVisionModoClima = {
        version: VERSION,
        enabled: habilitado,
        setMode: seleccionar,
        fetch: consultar,
        get preferencia() { return preferencia; },
        get modo() { return habilitado() ? 'con' : 'sin'; },
        get solicitudes() { return solicitudes; },
        get bloqueadas() { return bloqueadas; },
        get generacion() { return generacion; }
    };

    const con = document.getElementById('gv-modo-clima');
    const sin = document.createElement('button');
    sin.id = 'gv-modo-sin-clima';
    sin.type = 'button';
    sin.textContent = 'Sin clima';
    sin.title = 'Pausar meteorologia';
    con.textContent = 'Con clima';
    con.title = 'Activar meteorologia';
    con.after(sin);
    con.addEventListener('click', () => seleccionar('con'));
    sin.addEventListener('click', () => seleccionar('sin'));

    // GV V212: layout responsive; same buttons, same mode API.
    function montarInterfaz() {
        const header = document.querySelector('body > header');
        const acciones = header.querySelector('.estado-aplicacion');
        const titulo = header.querySelector('.titulo');
        const media = matchMedia('(max-width: 700px)');
        const mapa = window.GridVisionMapa;
        const enlaces = ['portal.html','gridvision-fire.html','gridvision-vulcano.html']
            .map(href => acciones.querySelector('a[href="' + href + '"]'));
        if (enlaces.some(e => !e) || !mapa || !window.L) return;

        const menu = document.createElement('details');
        menu.id = 'gv-menu-visor';
        const resumen = document.createElement('summary');
        resumen.textContent = '☰ Menu';
        const lista = document.createElement('div');
        lista.className = 'gv-menu-enlaces';
        menu.append(resumen, lista);
        acciones.insertBefore(menu, enlaces[0]);
        enlaces.forEach(e => lista.append(e));

        const slot = document.createElement('div');
        slot.id = 'gv-modo-mobile';
        titulo.after(slot);
        const selector = document.createElement('div');
        selector.id = 'gv-selector-clima';
        selector.setAttribute('role','group');
        selector.setAttribute('aria-label','Modo de navegacion');
        const label = document.createElement('span');
        label.className = 'gv-modo-label';
        label.textContent = 'Modo de navegacion';
        const botones = document.createElement('div');
        botones.className = 'gv-modo-botones';
        botones.append(con, sin);
        const aviso = document.createElement('span');
        aviso.id = 'gv-modo-estado';
        aviso.textContent = 'Sin conexion';
        aviso.setAttribute('role','status');
        selector.append(label, botones, aviso);
        L.DomEvent.disableClickPropagation(selector);
        L.DomEvent.disableScrollPropagation(selector);
        const control = L.control({position:'topright'});
        control.onAdd = () => selector;

        function moverFallas() {
            const b = document.getElementById('abrir-fallas-guardadas-gridvision');
            if (!b) return;
            if (media.matches && b.parentNode !== lista) lista.append(b);
            if (!media.matches && b.parentNode === lista) {
                acciones.insertBefore(b, document.getElementById('alternar-filtros'));
            }
        }
        function adaptar() {
            menu.open = !media.matches;
            if (media.matches) {
                control.remove();
                selector.classList.remove('leaflet-control');
                slot.append(selector);
            } else {
                control.addTo(mapa);
            }
            moverFallas();
            render();
            requestAnimationFrame(() => mapa.invalidateSize({pan:false}));
        }
        const observer = new MutationObserver(moverFallas);
        observer.observe(acciones,{childList:true,subtree:true});
        menu.addEventListener('click', e => {
            if (media.matches && e.target.closest('a,button')) menu.open = false;
        });
        document.addEventListener('click', e => {
            if (media.matches && !menu.contains(e.target)) menu.open = false;
        });
        document.addEventListener('keydown', e => {
            if (media.matches && e.key === 'Escape') menu.open = false;
        });
        media.addEventListener('change', adaptar);
        adaptar();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', montarInterfaz, {once:true});
    } else montarInterfaz();

    window.addEventListener('offline', sincronizar);
    window.addEventListener('online', sincronizar);

    window.addEventListener('storage', e => {
        if (e.key === KEY) {
            preferencia = e.newValue === 'sin' ? 'sin' : 'con';
            sincronizar();
        }
    });

    render();
})();
