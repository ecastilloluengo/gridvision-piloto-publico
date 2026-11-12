/* GridVision V2.1 - modo meteorologico independiente */
(() => {
    'use strict';

    const VERSION = 'gv-modo-clima-v21-20261112';
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

        const boton = document.getElementById('gv-modo-clima');
        if (!boton) return;

        boton.textContent = !navigator.onLine
            ? 'Sin clima · Offline'
            : habilitado() ? 'Con clima' : 'Sin clima';

        boton.dataset.modo = habilitado() ? 'con' : 'sin';
        boton.setAttribute('aria-pressed', String(habilitado()));

        boton.disabled = !navigator.onLine;
        boton.title = !navigator.onLine
            ? 'Meteorologia pausada sin conexion'
            : habilitado()
                ? 'Cambiar a navegacion sin meteorologia'
                : 'Activar pronosticos y monitoreo meteorologico';
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

    document.getElementById('gv-modo-clima')
        ?.addEventListener('click', () => {
            seleccionar(preferencia === 'con' ? 'sin' : 'con');
        });

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
