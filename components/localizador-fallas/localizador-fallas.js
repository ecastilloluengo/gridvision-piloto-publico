(() => {
    "use strict";

    const RADIO_TIERRA_KM = 6371.0088;

    function convertirRadianes(grados) {
        return grados * Math.PI / 180;
    }

    function distanciaKm(puntoA, puntoB) {
        const [longitudA, latitudA] = puntoA;
        const [longitudB, latitudB] = puntoB;

        const diferenciaLatitud =
            convertirRadianes(latitudB - latitudA);

        const diferenciaLongitud =
            convertirRadianes(longitudB - longitudA);

        const latitudARadianes =
            convertirRadianes(latitudA);

        const latitudBRadianes =
            convertirRadianes(latitudB);

        const termino =
            Math.sin(diferenciaLatitud / 2) ** 2
            + Math.cos(latitudARadianes)
            * Math.cos(latitudBRadianes)
            * Math.sin(diferenciaLongitud / 2) ** 2;

        return (
            2
            * RADIO_TIERRA_KM
            * Math.atan2(
                Math.sqrt(termino),
                Math.sqrt(1 - termino)
            )
        );
    }

    function calcularLongitudLinea(coordenadas = []) {
        let longitudTotalKm = 0;

        for (
            let indice = 1;
            indice < coordenadas.length;
            indice += 1
        ) {
            longitudTotalKm += distanciaKm(
                coordenadas[indice - 1],
                coordenadas[indice]
            );
        }

        return longitudTotalKm;
    }

    function interpolarPunto(
        puntoInicial,
        puntoFinal,
        proporcion
    ) {
        const [longitudInicial, latitudInicial] =
            puntoInicial;

        const [longitudFinal, latitudFinal] =
            puntoFinal;

        return [
            longitudInicial
                + (
                    longitudFinal
                    - longitudInicial
                ) * proporcion,

            latitudInicial
                + (
                    latitudFinal
                    - latitudInicial
                ) * proporcion
        ];
    }

    function obtenerPuntoPorDistancia(
        coordenadas = [],
        distanciaObjetivoKm = 0
    ) {
        if (!Array.isArray(coordenadas)) {
            return null;
        }

        if (coordenadas.length === 0) {
            return null;
        }

        if (coordenadas.length === 1) {
            return coordenadas[0];
        }

        const longitudTotalKm =
            calcularLongitudLinea(coordenadas);

        const distanciaLimitadaKm = Math.min(
            Math.max(0, distanciaObjetivoKm),
            longitudTotalKm
        );

        let distanciaAcumuladaKm = 0;

        for (
            let indice = 1;
            indice < coordenadas.length;
            indice += 1
        ) {
            const puntoInicial =
                coordenadas[indice - 1];

            const puntoFinal =
                coordenadas[indice];

            const longitudSegmentoKm =
                distanciaKm(
                    puntoInicial,
                    puntoFinal
                );

            const siguienteAcumuladoKm =
                distanciaAcumuladaKm
                + longitudSegmentoKm;

            if (
                distanciaLimitadaKm
                <= siguienteAcumuladoKm
            ) {
                const distanciaDentroSegmentoKm =
                    distanciaLimitadaKm
                    - distanciaAcumuladaKm;

                const proporcion =
                    longitudSegmentoKm > 0
                        ? (
                            distanciaDentroSegmentoKm
                            / longitudSegmentoKm
                        )
                        : 0;

                return interpolarPunto(
                    puntoInicial,
                    puntoFinal,
                    proporcion
                );
            }

            distanciaAcumuladaKm =
                siguienteAcumuladoKm;
        }

        return coordenadas.at(-1);
    }

    function invertirCoordenadas(coordenadas = []) {
        return [...coordenadas].reverse();
    }

    function localizarFalla({
        nombreLinea = "Línea sin nombre",
        extremoReferencia = "A",
        nombreExtremoA = "Extremo A",
        nombreExtremoB = "Extremo B",
        coordenadas = [],
        distanciaKm: distanciaInformadaKm = 0,
        precisionKm = 1
    } = {}) {
        const longitudTotalKm =
            calcularLongitudLinea(coordenadas);

        const distanciaValidadaKm = Math.min(
            Math.max(
                0,
                Number(distanciaInformadaKm) || 0
            ),
            longitudTotalKm
        );

        const desdeExtremoB =
            String(extremoReferencia)
                .toUpperCase() === "B";

        const coordenadasRecorrido =
            desdeExtremoB
                ? invertirCoordenadas(coordenadas)
                : coordenadas;

        const puntoFalla =
            obtenerPuntoPorDistancia(
                coordenadasRecorrido,
                distanciaValidadaKm
            );

        const distanciaDesdeAKm =
            desdeExtremoB
                ? longitudTotalKm
                    - distanciaValidadaKm
                : distanciaValidadaKm;

        const distanciaDesdeBKm =
            longitudTotalKm
            - distanciaDesdeAKm;

        return {
            disponible: Boolean(puntoFalla),
            nombreLinea,
            nombreExtremoA,
            nombreExtremoB,
            extremoReferencia:
                desdeExtremoB ? "B" : "A",
            longitudTotalKm,
            distanciaDesdeAKm,
            distanciaDesdeBKm,
            coordenadas: puntoFalla,
            precisionKm:
                Math.max(
                    0,
                    Number(precisionKm) || 0
                )
        };
    }
let panelLocalizadorCargado = false;
let lineaSeleccionadaLocalizador = null;
let mapaLocalizador = null;
let marcadorFalla = null;
let marcadorFallaConfirmada = null;
let ultimoResultadoFalla = null;
let datosGpsEditorFalla = null;
let gvRegistroDesdeHistorial = false;

// Distingue un dato desconocido de un cero válido (km 0).
function numeroFallaDisponible(valor) {
    return valor !== null && valor !== undefined
        && String(valor).trim() !== "" && Number.isFinite(Number(valor));
}
function coordenadasFallaValidas(registro) {
    return numeroFallaDisponible(registro?.latitud)
        && numeroFallaDisponible(registro?.longitud)
        && Math.abs(Number(registro.latitud)) <= 90
        && Math.abs(Number(registro.longitud)) <= 180;
}
function posicionFallaActiva(registro) {
    const ubicacion = coordenadasFallaValidas(registro) ? registro
        : coordenadasFallaValidas(registro?.ubicacionConfirmada) ? registro.ubicacionConfirmada : null;
    return ubicacion ? [Number(ubicacion.latitud), Number(ubicacion.longitud)] : null;
}
function abrirRegistroSinDistancia() {
    const linea = lineaSeleccionadaLocalizador;
    if (!linea || !Array.isArray(linea.coordenadas) || linea.coordenadas.length < 2) {
        window.alert("Selecciona una línea eléctrica con geometría válida.");
        return;
    }
    const ahora = new Date().toISOString();
    const registro = {
        id: generarIdFalla(), fechaHora: ahora, fechaHoraInicio: ahora,
        fechaHoraFin: null, estado: "activa", idActivo: obtenerIdActivoCompartirFalla(),
        nombreLinea: linea.nombreLinea, extremoReferencia: "A",
        nombreExtremoA: linea.nombreExtremoA, nombreExtremoB: linea.nombreExtremoB,
        distanciaIndicadaKm: null, distanciaDesdeAKm: null, distanciaDesdeBKm: null,
        longitudTotalKm: calcularLongitudLinea(linea.coordenadas),
        precisionKm: 1, latitud: null, longitud: null,
        afectacionOperacional: "", observaciones: "", ubicacionConfirmada: null,
        fechaCreacion: ahora, fechaActualizacion: ahora
    };
    guardarGeometriaLineaParaFalla(registro);
    eliminarMarcadorFalla();
    cerrarPanelLocalizador();
    cerrarPanelFallasGuardadas();
    abrirEditorRegistroFalla(registro, true);
    asegurarEditorFalla().dataset.desdeHistorial = "true";
}
function iniciarRegistroDesdeHistorial() {
    const catalogo = typeof indiceBusqueda !== 'undefined' ? indiceBusqueda : [];
    const normal = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

    const lineas = catalogo.filter(r =>
        ['LineString','MultiLineString'].includes(r.feature?.geometry?.type)
        && r.feature?.properties?.nombre
        && obtenerCoordenadasFeature(r.feature).length >= 2
    ).map(r => {
        const p = r.feature.properties;
        return {
            r,
            nombre:p.nombre,
            id:p.id || p.ID || p.id_gridvision || p.idGridVision || p.gv_id || p.asset_id || p.codigo || r.feature.id || '',
            kv:p.subcategoria || p.tension || p.kv || ''
        };
    }).sort((a,b) => String(a.nombre).localeCompare(String(b.nombre),'es'));

    document.getElementById('gv-selector-falla-v21')?.remove();

    const d = document.createElement('dialog');
    d.id = 'gv-selector-falla-v21';
    d.style.cssText = 'width:min(550px,92vw);max-height:85vh;border:1px solid #cbd5e1;border-radius:16px;padding:18px;color:#0f172a;background:white;box-sizing:border-box;';

    d.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:18px">Registrar nueva falla</strong>
            <button type="button" data-cerrar>X</button>
        </div>
        <p style="font-size:13px;color:#475569">
            Selecciona la linea electrica. La distancia es opcional.
        </p>
        <input type="search" aria-label="Buscar linea"
            placeholder="Nombre, ID o tension..."
            style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit">
        <p data-resumen aria-live="polite" style="font-size:12px;color:#64748b"></p>
        <div data-lista style="display:grid;gap:7px;max-height:52vh;overflow:auto"></div>
    `;

    document.body.appendChild(d);

    const input = d.querySelector('input');
    const lista = d.querySelector('[data-lista]');
    const resumen = d.querySelector('[data-resumen]');

    d.querySelector('[data-cerrar]').onclick = () => d.close();
    d.addEventListener('close', () => d.remove(), {once:true});

    function render() {
        const tokens = normal(input.value).split(' ').filter(Boolean);
        const matches = lineas.filter(l =>
            tokens.every(t => normal([l.nombre,l.id,l.kv].join(' ')).includes(t))
        );

        lista.replaceChildren();

        resumen.textContent = matches.length
            ? `${matches.length} lineas - mostrando ${Math.min(80,matches.length)}`
            : (lineas.length ? 'Sin coincidencias' : 'Espera que cargue el mapa y vuelve a abrir.');

        for (const l of matches.slice(0,80)) {
            const b = document.createElement('button');
            b.type = 'button';
            b.style.cssText = 'text-align:left;padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;color:#0f172a;cursor:pointer;';

            const titulo = document.createElement('strong');
            titulo.textContent = l.nombre;

            const detalle = document.createElement('small');
            detalle.style.cssText = 'display:block;margin-top:4px;color:#64748b;';
            detalle.textContent = [l.kv,l.id].filter(Boolean).join(' - ');

            b.append(titulo,detalle);
            lista.append(b);

            b.onclick = async () => {
                const mapa = obtenerMapaGridVision();

                if (!mapa) {
                    resumen.textContent = 'Mapa no disponible.';
                    return;
                }

                for (const boton of lista.querySelectorAll('button'))
                    boton.disabled = true;

                try {
                    gvRegistroDesdeHistorial = true;

                    await abrirPanelLocalizador({
                        nombreLinea:l.nombre,
                        longitudTotalKm:calcularLongitudLinea(
                            obtenerCoordenadasFeature(l.r.feature)
                        ),
                        feature:l.r.feature,
                        mapa
                    });

                    d.close();
                } catch(e) {
                    gvRegistroDesdeHistorial = false;
                    resumen.textContent = 'Error: ' + e.message;
                    for (const boton of lista.querySelectorAll('button'))
                        boton.disabled = false;
                }
            };
        }
    }

    input.addEventListener('input', render);
    render();
    d.showModal();
    input.focus();
}
let capaFallasActivas = null;
const marcadoresFallasActivas = new Map();

const CLAVE_FALLAS_GUARDADAS =
    "gridvision_fallas_guardadas_v1";
const CLAVE_GEOMETRIAS_FALLA =
    "gridvision_geometrias_falla_v1";

function elementoLocalizador(id) {
    return document.getElementById(id);
}

function obtenerIdActivoCompartirFalla() {
    const feature = lineaSeleccionadaLocalizador?.feature;
    const props = feature?.properties || {};

    const candidatos = [
        props.id,
        props.ID,
        props.id_gridvision,
        props.idGridVision,
        props.gv_id,
        props.asset_id,
        props.codigo,
        feature?.id
    ];

    const id = candidatos.find((valor) =>
        typeof valor === 'string'
        && /^GV-\d+$/i.test(valor.trim())
    );

    return id ? id.trim().toUpperCase() : null;
}

function gv232EnlaceFalla({latitud,longitud,nombreLinea,idActivo,idEvento,tipo='estimada'}={}) {
    const valido=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));
    if(!valido(latitud)||!valido(longitud)||Math.abs(Number(latitud))>90||Math.abs(Number(longitud))>180) return null;
    const local=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
    const url=new URL(local?'./index.html':'https://ecastilloluengo.github.io/gridvision-piloto-publico/',window.location.href);
    url.search=''; url.hash='';
    url.searchParams.set('falla','1');
    url.searchParams.set('lat',Number(latitud).toFixed(14));
    url.searchParams.set('lng',Number(longitud).toFixed(14));
    url.searchParams.set('zoom','17');
    url.searchParams.set('ubicacion',tipo==='confirmada'?'confirmada':'estimada');
    if(nombreLinea)url.searchParams.set('linea',String(nombreLinea).slice(0,240));
    if(idActivo)url.searchParams.set('activo',String(idActivo).slice(0,80));
    if(idEvento)url.searchParams.set('evento',String(idEvento).slice(0,80));
    return url.href;
}

function construirDatosCompartirFalla(resultado) {
    if(!Array.isArray(resultado?.coordenadas)||resultado.coordenadas.length<2)return null;
    const [longitudFalla,latitudFalla]=resultado.coordenadas;
    const idActivo=resultado._idActivoGuardado||obtenerIdActivoCompartirFalla();
    const urlActivo=gv232EnlaceFalla({latitud:latitudFalla,longitud:longitudFalla,nombreLinea:resultado.nombreLinea,idActivo,idEvento:resultado._registroGuardadoId});
    if(!urlActivo)return null;
    const lat=Number(latitudFalla),lng=Number(longitudFalla);
    const urlMapa='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(`${lat.toFixed(14)},${lng.toFixed(14)}`);
    const lineas=['Ubicacion estimada de falla'+(resultado.nombreLinea?' · '+resultado.nombreLinea:''),'Ver ubicacion en Google Maps:',urlMapa,'','Ver pin de falla en GridVision:',urlActivo];
    return {titulo:'Ubicacion GridVision',texto:lineas.join('\n'),coordenadasTexto:`${lat.toFixed(6)}, ${lng.toFixed(6)}`,urlMapa,urlActivo,idActivo};
}

async function copiarTexto(texto) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return;
    }

    const temporal = document.createElement('textarea');
    temporal.value = texto;
    temporal.style.position = 'fixed';
    temporal.style.opacity = '0';
    document.body.appendChild(temporal);
    temporal.select();
    document.execCommand('copy');
    temporal.remove();
}

function mostrarMensajeLocalizador(texto, ocultarAutomaticamente = true) {
    const mensaje = elementoLocalizador('localizador-fallas-mensaje');

    if (!mensaje) {
        return;
    }

    mensaje.textContent = texto;
    mensaje.hidden = false;

    if (ocultarAutomaticamente) {
        window.setTimeout(() => {
            if (mensaje.textContent === texto) {
                mensaje.hidden = true;
            }
        }, 2200);
    }
}

async function compartirUbicacionFalla() {
    const datos = construirDatosCompartirFalla(ultimoResultadoFalla);

    if (!datos) {
        mostrarMensajeLocalizador(
            'Primero localiza una falla para poder compartir su ubicación.',
            false
        );
        return;
    }

    const boton = elementoLocalizador('compartir-falla');

    try {
        if (boton) {
            boton.disabled = true;
        }

        if (navigator.share) {
            await navigator.share({
                title: datos.titulo,
                text: datos.texto
            });
            return;
        }

        await copiarTexto(datos.texto);
        mostrarMensajeLocalizador(
            'Ubicación de la falla copiada al portapapeles.'
        );
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }

        try {
            await copiarTexto(datos.texto);
            mostrarMensajeLocalizador(
                'No se pudo abrir Compartir; la ubicación quedó copiada.'
            );
        } catch {
            mostrarMensajeLocalizador(
                'No fue posible compartir ni copiar la ubicación.',
                false
            );
        }
    } finally {
        if (boton) {
            boton.disabled = false;
        }
    }
}

function asegurarBotonCompartirFalla() {
    const coordenadasElemento = elementoLocalizador(
        'resultado-coordenadas'
    );

    if (!coordenadasElemento) {
        return;
    }

    if (coordenadasElemento.querySelector('#compartir-falla')) {
        return;
    }

    const boton = document.createElement('button');
    boton.id = 'compartir-falla';
    boton.type = 'button';
    boton.title = 'Compartir coordenadas de la falla';
    boton.setAttribute(
        'aria-label',
        'Compartir coordenadas de la falla'
    );

    boton.style.display = 'inline-flex';
    boton.style.alignItems = 'center';
    boton.style.justifyContent = 'center';
    boton.style.width = '30px';
    boton.style.height = '30px';
    boton.style.marginLeft = '8px';
    boton.style.padding = '0';
    boton.style.border = 'none';
    boton.style.borderRadius = '50%';
    boton.style.background = '#2563eb';
    boton.style.color = '#ffffff';
    boton.style.cursor = 'pointer';
    boton.style.verticalAlign = 'middle';
    boton.style.boxShadow = '0 1px 3px rgba(0,0,0,.22)';

    boton.innerHTML = `
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M12 3v12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
            <path
                d="M7.5 7.5 12 3l4.5 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            <path
                d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;

    boton.addEventListener('mouseenter', () => {
        boton.style.background = '#1d4ed8';
    });

    boton.addEventListener('mouseleave', () => {
        boton.style.background = '#2563eb';
    });

    boton.addEventListener('click', compartirUbicacionFalla);

    coordenadasElemento.appendChild(boton);
}


function leerFallasGuardadas() {
    try {
        const valor = localStorage.getItem(
            CLAVE_FALLAS_GUARDADAS
        );

        if (!valor) {
            return [];
        }

        const registros = JSON.parse(valor);

        if (!Array.isArray(registros)) {
            return [];
        }

        let requiereMigracion = false;

        const normalizados = registros.map((registro) => {
            const copia = { ...registro };

            if (!copia.fechaHoraInicio) {
                copia.fechaHoraInicio =
                    copia.fechaHora || new Date().toISOString();
                requiereMigracion = true;
            }

            // Compatibilidad con registros de la fase anterior:
            // si se cerraron manualmente, conservamos ese cierre
            // asignando como fin la última actualización disponible.
            if (
                !copia.fechaHoraFin
                && copia.estado === "cerrada"
            ) {
                copia.fechaHoraFin =
                    copia.fechaActualizacion
                    || copia.fechaHora
                    || copia.fechaHoraInicio;
                requiereMigracion = true;
            }

            copia.estado = copia.fechaHoraFin
                ? "cerrada"
                : "activa";

            copia.afectacionOperacional =
                copia.afectacionOperacional || "";
            copia.observaciones =
                copia.observaciones || "";
            copia.ubicacionConfirmada =
                copia.ubicacionConfirmada || null;

            return copia;
        });

        if (requiereMigracion) {
            escribirFallasGuardadas(normalizados);
        }

        return normalizados;
    } catch {
        return [];
    }
}

function escribirFallasGuardadas(registros = []) {
    localStorage.setItem(
        CLAVE_FALLAS_GUARDADAS,
        JSON.stringify(registros)
    );
}

function generarIdFalla() {
    const ahora = new Date();

    const fecha = [
        ahora.getFullYear(),
        String(ahora.getMonth() + 1).padStart(2, "0"),
        String(ahora.getDate()).padStart(2, "0")
    ].join("");

    const hora = [
        String(ahora.getHours()).padStart(2, "0"),
        String(ahora.getMinutes()).padStart(2, "0"),
        String(ahora.getSeconds()).padStart(2, "0")
    ].join("");

    const base = `GV-FLT-${fecha}-${hora}`;
    const ids = new Set(leerFallasGuardadas().map(r => r.id));
    let id = base, secuencia = 2;
    while (ids.has(id)) id = `${base}-${secuencia++}`;
    return id;
}

function claveGeometriaRegistro(registro = {}) {
    return String(
        registro.idActivo
        || registro.nombreLinea
        || ""
    ).trim();
}

function leerGeometriasFalla() {
    try {
        const bruto = localStorage.getItem(
            CLAVE_GEOMETRIAS_FALLA
        );

        const datos = bruto ? JSON.parse(bruto) : {};

        return datos && typeof datos === "object"
            ? datos
            : {};
    } catch {
        return {};
    }
}

function guardarGeometriaLineaParaFalla(registro = {}) {
    const coordenadas =
        lineaSeleccionadaLocalizador?.coordenadas;

    if (
        !Array.isArray(coordenadas)
        || coordenadas.length < 2
    ) {
        return;
    }

    const clave = claveGeometriaRegistro(registro);

    if (!clave) {
        return;
    }

    try {
        const geometrias = leerGeometriasFalla();
        geometrias[clave] = coordenadas;
        localStorage.setItem(
            CLAVE_GEOMETRIAS_FALLA,
            JSON.stringify(geometrias)
        );
    } catch (error) {
        console.warn(
            "No fue posible guardar la geometría de la línea para recalcular fallas:",
            error
        );
    }
}

function obtenerGeometriaLineaParaRegistro(registro = {}) {
    const claveRegistro = claveGeometriaRegistro(registro);
    const claveSeleccionada = claveGeometriaRegistro({
        idActivo: obtenerIdActivoCompartirFalla(),
        nombreLinea:
            lineaSeleccionadaLocalizador?.nombreLinea
    });

    if (
        claveRegistro
        && claveRegistro === claveSeleccionada
        && Array.isArray(
            lineaSeleccionadaLocalizador?.coordenadas
        )
        && lineaSeleccionadaLocalizador.coordenadas.length >= 2
    ) {
        return lineaSeleccionadaLocalizador.coordenadas;
    }

    const geometrias = leerGeometriasFalla();
    const coordenadas = geometrias[claveRegistro];

    return Array.isArray(coordenadas)
        && coordenadas.length >= 2
        ? coordenadas
        : null;
}

function construirRegistroFalla(resultado) {
    if (!resultado?.coordenadas) {
        return null;
    }

    const [longitudFalla, latitudFalla] =
        resultado.coordenadas;

    const entradaDistancia = elementoLocalizador(
        "localizador-fallas-distancia"
    );

    const registro = {
        id: generarIdFalla(),
        fechaHora: new Date().toISOString(),
        fechaHoraInicio: new Date().toISOString(),
        fechaHoraFin: null,
        estado: "activa",
        idActivo: obtenerIdActivoCompartirFalla(),
        nombreLinea: resultado.nombreLinea,
        extremoReferencia: resultado.extremoReferencia,
        nombreExtremoA: resultado.nombreExtremoA,
        nombreExtremoB: resultado.nombreExtremoB,
        distanciaIndicadaKm:
            Number(entradaDistancia?.value) || 0,
        distanciaDesdeAKm: resultado.distanciaDesdeAKm,
        distanciaDesdeBKm: resultado.distanciaDesdeBKm,
        longitudTotalKm: resultado.longitudTotalKm,
        precisionKm: resultado.precisionKm,
        latitud: latitudFalla,
        longitud: longitudFalla,
        afectacionOperacional: "",
        observaciones: "",
        ubicacionConfirmada: null,
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString()
    };

    guardarGeometriaLineaParaFalla(registro);

    return registro;
}

function actualizarBotonGuardarFalla() {
    const boton = elementoLocalizador(
        "guardar-falla-local"
    );

    if (!boton) {
        return;
    }

    const registroId =
        ultimoResultadoFalla?._registroGuardadoId;

    boton.textContent = registroId
        ? "✓ Falla guardada"
        : "💾 Guardar falla";

    boton.disabled = Boolean(registroId);
}

function guardarFallaActual() {
    if (!ultimoResultadoFalla?.coordenadas) {
        mostrarMensajeLocalizador(
            "Primero localiza una falla para poder guardarla.",
            false
        );
        return;
    }

    if (ultimoResultadoFalla._registroGuardadoId) {
        abrirEditorFallaGuardada(
            ultimoResultadoFalla._registroGuardadoId
        );
        return;
    }

    const registro = construirRegistroFalla(
        ultimoResultadoFalla
    );

    if (!registro) {
        mostrarMensajeLocalizador(
            "No fue posible preparar el registro de la falla.",
            false
        );
        return;
    }

    abrirEditorRegistroFalla(registro, true);
}


function partesFechaHoraLocal(fechaIso) {
    const fecha = fechaIso ? new Date(fechaIso) : new Date();

    if (Number.isNaN(fecha.getTime())) {
        return { fecha: "", hora: "" };
    }

    const pad = (valor) => String(valor).padStart(2, "0");

    return {
        fecha: `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`,
        hora: `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
    };
}

function isoDesdePartesFechaHora(fechaValor, horaValor) {
    const fechaTexto = String(fechaValor || "").trim();
    const horaTexto = String(horaValor || "").trim();

    if (!fechaTexto && !horaTexto) {
        return null;
    }

    if (!fechaTexto || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaTexto)) {
        return null;
    }

    const fecha = new Date(`${fechaTexto}T${horaTexto}:00`);

    return Number.isNaN(fecha.getTime())
        ? null
        : fecha.toISOString();
}

function estadoRegistroFalla(registro) {
    return registro?.fechaHoraFin
        ? "cerrada"
        : "activa";
}

function formatearDuracionFalla(registro) {
    const inicio = new Date(
        registro?.fechaHoraInicio || registro?.fechaHora
    );

    if (Number.isNaN(inicio.getTime())) {
        return "Duración no disponible";
    }

    const fin = registro?.fechaHoraFin
        ? new Date(registro.fechaHoraFin)
        : new Date();

    if (Number.isNaN(fin.getTime()) || fin < inicio) {
        return "Duración no disponible";
    }

    const minutos = Math.floor(
        (fin.getTime() - inicio.getTime()) / 60000
    );

    const dias = Math.floor(minutos / 1440);
    const horas = Math.floor((minutos % 1440) / 60);
    const mins = minutos % 60;

    const partes = [];

    if (dias) partes.push(`${dias} d`);
    if (horas || dias) partes.push(`${horas} h`);
    partes.push(`${mins} min`);

    return partes.join(" ");
}

function asegurarEditorFalla() {
    asegurarEstilosFallasGuardadas();

    let fondo = document.getElementById(
        "fondo-editor-falla-gridvision"
    );

    if (fondo) {
        return fondo;
    }

    fondo = document.createElement("div");
    fondo.id = "fondo-editor-falla-gridvision";
    fondo.hidden = true;

    fondo.innerHTML = `
        <section id="editor-falla-gridvision" role="dialog" aria-modal="true" aria-labelledby="titulo-editor-falla">
            <div class="gv-editor-cabecera">
                <div>
                    <small id="editor-falla-id">Nueva falla</small>
                    <h2 id="titulo-editor-falla">⚡ Registro operacional de falla</h2>
                </div>
                <button type="button" id="cerrar-editor-falla" aria-label="Cerrar">×</button>
            </div>

            <div class="gv-editor-cuerpo">
                <div class="gv-editor-resumen">
                    <strong id="editor-falla-linea">Línea</strong>
                    <span id="editor-falla-estimada">Ubicación estimada</span>
                </div>

                <div class="gv-editor-ubicacion gv-editor-proteccion">
                    <div class="gv-editor-seccion-titulo">
                        <div>
                            <strong>⚡ Localización por protección</strong>
                            <small>Edita la distancia indicada y GridVision recalculará las coordenadas estimadas sobre la geometría GIS de la línea.</small>
                        </div>
                    </div>

                    <div class="gv-editor-grid-dos">
                        <label>
                            <span>Extremo de referencia</span>
                            <select id="editor-falla-extremo-referencia">
                                <option value="A">Extremo A</option>
                                <option value="B">Extremo B</option>
                            </select>
                        </label>
                        <label>
                            <span>Distancia indicada por la protección</span>
                            <div class="gv-input-unidad">
                                <input id="editor-falla-distancia-km" type="number" min="0" step="0.01" inputmode="decimal">
                                <span>km</span>
                            </div>
                            <small id="editor-falla-longitud-gis">Longitud GIS: —</small>
                        </label>
                    </div>

                    <div class="gv-editor-acciones-secundarias">
                        <button type="button" id="recalcular-editor-falla">⚡ Recalcular coordenadas</button>
                    </div>
                    <small id="editor-falla-recalculo-estado" class="gv-recalculo-estado"></small>
                </div>

                <div class="gv-editor-grid-dos gv-editor-grid-fechas">
                    <label>
                        <span>Fecha y hora de inicio *</span>
                        <div class="gv-fecha-hora-24">
                            <input id="editor-falla-inicio-fecha" type="date" lang="es-CL" required aria-label="Fecha de inicio">
                            <input id="editor-falla-inicio-hora" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" maxlength="5" pattern="(?:[01]\d|2[0-3]):[0-5]\d" required aria-label="Hora de inicio en formato 24 horas">
                        </div>
                        <small>Hora en formato 24 h · Ej.: 17:30</small>
                    </label>
                    <label>
                        <span>Fecha y hora de fin</span>
                        <div class="gv-fecha-hora-24">
                            <input id="editor-falla-fin-fecha" type="date" lang="es-CL" aria-label="Fecha de fin">
                            <input id="editor-falla-fin-hora" type="text" inputmode="numeric" autocomplete="off" placeholder="HH:mm" maxlength="5" pattern="(?:[01]\d|2[0-3]):[0-5]\d" aria-label="Hora de fin en formato 24 horas">
                        </div>
                        <small>Vacío = 🔴 activa · fecha/hora completa = 🟢 cerrada</small>
                    </label>
                </div>

                <label class="gv-editor-bloque">
                    <span>Afectación operacional</span>
                    <textarea id="editor-falla-afectacion" rows="4" placeholder="Ej.: Operación de la línea provoca salida de PEVP; WTG01/02/03 fuera de servicio; interruptor S/E Tres Puentes abierto..."></textarea>
                </label>

                <label class="gv-editor-bloque">
                    <span>Observaciones / novedades</span>
                    <textarea id="editor-falla-observaciones" rows="4" placeholder="Maniobras, comunicaciones, condiciones encontradas, recorrido, causa preliminar, etc."></textarea>
                </label>

                <div class="gv-editor-ubicacion">
                    <div class="gv-editor-seccion-titulo">
                        <div>
                            <strong>📍 Ubicación confirmada en terreno</strong>
                            <small>Opcional. No reemplaza la ubicación estimada por la protección.</small>
                        </div>
                        <span id="editor-falla-gps-estado"></span>
                    </div>

                    <div class="gv-editor-grid-dos">
                        <label>
                            <span>Latitud</span>
                            <input id="editor-falla-lat-confirmada" type="number" step="any" placeholder="-53.123456">
                        </label>
                        <label>
                            <span>Longitud</span>
                            <input id="editor-falla-lng-confirmada" type="number" step="any" placeholder="-70.123456">
                        </label>
                    </div>

                    <div class="gv-editor-acciones-secundarias">
                        <button type="button" id="usar-gps-editor-falla">📍 Usar mi ubicación actual</button>
                        <button type="button" id="limpiar-ubicacion-editor-falla">✕ Limpiar ubicación confirmada</button>
                    </div>
                </div>

                <div class="gv-editor-evidencia-pendiente" id="gv23-editor-evidencias"></div>

                <div id="editor-falla-error" class="gv-editor-error" hidden></div>
            </div>

            <div class="gv-editor-pie">
                <button type="button" id="cancelar-editor-falla">Cancelar</button>
                <button type="button" id="guardar-editor-falla">💾 Guardar registro</button>
            </div>
        </section>
    `;

    document.body.appendChild(fondo);

    const cerrar = () => {
        if (fondo._gv23Guardando) return;
        if (fondo._gv23Pendientes?.length && !window.confirm("¿Cancelar el registro y descartar los archivos pendientes?")) return;
        fondo._gv23Pendientes = [];
        fondo._gv23RenderPendientes?.();
        fondo.hidden = true;
        fondo.dataset.registro = "";
        fondo.dataset.nuevo = "false";
        datosGpsEditorFalla = null;
    };

    fondo.querySelector("#cerrar-editor-falla")
        ?.addEventListener("click", cerrar);
    fondo.querySelector("#cancelar-editor-falla")
        ?.addEventListener("click", cerrar);

    fondo.addEventListener("click", (evento) => {
        if (evento.target === fondo) {
            cerrar();
        }
    });

    fondo.querySelector("#usar-gps-editor-falla")
        ?.addEventListener("click", obtenerGpsParaEditorFalla);

    fondo.querySelector("#limpiar-ubicacion-editor-falla")
        ?.addEventListener("click", () => {
            fondo.querySelector("#editor-falla-lat-confirmada").value = "";
            fondo.querySelector("#editor-falla-lng-confirmada").value = "";
            fondo.querySelector("#editor-falla-gps-estado").textContent = "";
            datosGpsEditorFalla = null;
        });

    fondo.querySelector("#recalcular-editor-falla")
        ?.addEventListener("click", () => {
            recalcularDesdeEditorFalla(true);
        });

    fondo.querySelector("#editor-falla-extremo-referencia")
        ?.addEventListener("change", () => {
            recalcularDesdeEditorFalla(false);
        });

    fondo.querySelector("#editor-falla-distancia-km")
        ?.addEventListener("change", () => {
            recalcularDesdeEditorFalla(false);
        });

    fondo.querySelector("#guardar-editor-falla")
        ?.addEventListener("click", guardarDesdeEditorFalla);

    return fondo;
}

function abrirEditorRegistroFalla(registro, esNuevo = false) {
    const fondo = asegurarEditorFalla();

    fondo.dataset.registro = registro.id;
    fondo.dataset.nuevo = esNuevo ? "true" : "false";
    fondo.dataset.desdeHistorial = "false";
    fondo._registroTemporal = { ...registro };
    datosGpsEditorFalla = registro.ubicacionConfirmada || null;

    fondo.querySelector("#editor-falla-id").textContent = registro.id;
    fondo.querySelector("#editor-falla-linea").textContent =
        registro.nombreLinea || "Línea sin nombre";
    actualizarResumenEstimacionEditor(fondo, registro);

    const selectorExtremo = fondo.querySelector(
        "#editor-falla-extremo-referencia"
    );
    selectorExtremo.innerHTML = "";

    const opcionA = document.createElement("option");
    opcionA.value = "A";
    opcionA.textContent = registro.nombreExtremoA || "Extremo A";
    const opcionB = document.createElement("option");
    opcionB.value = "B";
    opcionB.textContent = registro.nombreExtremoB || "Extremo B";
    selectorExtremo.append(opcionA, opcionB);
    selectorExtremo.value = registro.extremoReferencia || "A";

    fondo.querySelector("#editor-falla-distancia-km").value =
        numeroFallaDisponible(registro.distanciaIndicadaKm)
            ? Number(registro.distanciaIndicadaKm)
            : "";
    fondo.querySelector("#editor-falla-longitud-gis").textContent =
        `Longitud GIS: ${Number(registro.longitudTotalKm || 0).toFixed(1)} km`;
    fondo.querySelector("#editor-falla-recalculo-estado").textContent = "";

    const inicioPartes = partesFechaHoraLocal(
        registro.fechaHoraInicio || registro.fechaHora
    );
    const finPartes = registro.fechaHoraFin
        ? partesFechaHoraLocal(registro.fechaHoraFin)
        : { fecha: "", hora: "" };

    fondo.querySelector("#editor-falla-inicio-fecha").value =
        inicioPartes.fecha;
    fondo.querySelector("#editor-falla-inicio-hora").value =
        inicioPartes.hora;
    fondo.querySelector("#editor-falla-fin-fecha").value =
        finPartes.fecha;
    fondo.querySelector("#editor-falla-fin-hora").value =
        finPartes.hora;
    fondo.querySelector("#editor-falla-afectacion").value =
        registro.afectacionOperacional || "";
    fondo.querySelector("#editor-falla-observaciones").value =
        registro.observaciones || "";

    const ubicacion = registro.ubicacionConfirmada;
    fondo.querySelector("#editor-falla-lat-confirmada").value =
        ubicacion?.latitud ?? "";
    fondo.querySelector("#editor-falla-lng-confirmada").value =
        ubicacion?.longitud ?? "";

    fondo.querySelector("#editor-falla-gps-estado").textContent =
        ubicacion?.precisionM
            ? `Precisión GPS ±${Math.round(ubicacion.precisionM)} m`
            : (ubicacion ? "Ubicación confirmada registrada" : "");

    const error = fondo.querySelector("#editor-falla-error");
    error.hidden = true;
    error.textContent = "";

    fondo.hidden = false;
    gv23Editor(fondo, registro, esNuevo);
}

function actualizarResumenEstimacionEditor(fondo, registro) {
    const latitud = Number(registro?.latitud);
    const longitud = Number(registro?.longitud);
    const precision = Number(registro?.precisionKm || 0);

    fondo.querySelector("#editor-falla-estimada").textContent =
        coordenadasFallaValidas(registro)
            ? `Estimación protección: ${latitud.toFixed(6)}, ${longitud.toFixed(6)} · ± ${precision.toFixed(1)} km`
            : "Estimación protección pendiente";
}

function recalcularDesdeEditorFalla(mostrarConfirmacion = false) {
    const fondo = asegurarEditorFalla();
    const registroBase = fondo._registroTemporal;
    const estado = fondo.querySelector(
        "#editor-falla-recalculo-estado"
    );

    if (!registroBase) {
        return false;
    }

    const textoDistancia = fondo.querySelector("#editor-falla-distancia-km").value.trim();
    if (!textoDistancia) {
        // La ubicación pendiente se guarda como null, nunca como km 0.
        fondo._registroTemporal = {
            ...registroBase, distanciaIndicadaKm: null, distanciaDesdeAKm: null,
            distanciaDesdeBKm: null, latitud: null, longitud: null,
            extremoReferencia: fondo.querySelector("#editor-falla-extremo-referencia").value
        };
        actualizarResumenEstimacionEditor(fondo, fondo._registroTemporal);
        estado.textContent = "Distancia y ubicación estimada pendientes.";
        estado.dataset.tipo = "ok";
        return true;
    }
    const coordenadas =
        obtenerGeometriaLineaParaRegistro(registroBase);

    if (!coordenadas) {
        estado.textContent =
            "No hay geometría de esta línea disponible para recalcular. Abre la línea en el mapa y vuelve a editar el registro.";
        estado.dataset.tipo = "error";
        return false;
    }

    const distancia = Number(textoDistancia);
    const extremo = fondo.querySelector(
        "#editor-falla-extremo-referencia"
    ).value;
    const longitudTotalKm = calcularLongitudLinea(coordenadas);

    if (!Number.isFinite(distancia) || distancia < 0) {
        estado.textContent = "Ingresa una distancia válida en km.";
        estado.dataset.tipo = "error";
        return false;
    }

    if (distancia > longitudTotalKm) {
        estado.textContent =
            `La distancia supera la longitud GIS (${longitudTotalKm.toFixed(1)} km).`;
        estado.dataset.tipo = "error";
        return false;
    }

    const recalculado = localizarFalla({
        nombreLinea: registroBase.nombreLinea,
        extremoReferencia: extremo,
        nombreExtremoA:
            registroBase.nombreExtremoA || "Extremo A",
        nombreExtremoB:
            registroBase.nombreExtremoB || "Extremo B",
        coordenadas,
        distanciaKm: distancia,
        precisionKm: registroBase.precisionKm || 0
    });

    if (!recalculado.disponible || !recalculado.coordenadas) {
        estado.textContent =
            "No fue posible recalcular la ubicación estimada.";
        estado.dataset.tipo = "error";
        return false;
    }

    const [longitud, latitud] = recalculado.coordenadas;

    fondo._registroTemporal = {
        ...registroBase,
        extremoReferencia: extremo,
        distanciaIndicadaKm: distancia,
        distanciaDesdeAKm: recalculado.distanciaDesdeAKm,
        distanciaDesdeBKm: recalculado.distanciaDesdeBKm,
        longitudTotalKm: recalculado.longitudTotalKm,
        latitud,
        longitud
    };

    fondo.querySelector("#editor-falla-longitud-gis").textContent =
        `Longitud GIS: ${recalculado.longitudTotalKm.toFixed(1)} km`;
    actualizarResumenEstimacionEditor(
        fondo,
        fondo._registroTemporal
    );

    estado.textContent = mostrarConfirmacion
        ? `Coordenadas recalculadas: ${latitud.toFixed(6)}, ${longitud.toFixed(6)}`
        : "Coordenadas actualizadas automáticamente.";
    estado.dataset.tipo = "ok";

    return true;
}

function abrirEditorFallaGuardada(idRegistro) {
    const registro = leerFallasGuardadas()
        .find((item) => item.id === idRegistro);

    if (!registro) {
        window.alert("Esta falla ya no existe en el registro local.");
        renderizarFallasGuardadas();
        return;
    }

    abrirEditorRegistroFalla(registro, false);
}

function obtenerGpsParaEditorFalla() {
    const fondo = asegurarEditorFalla();
    const estado = fondo.querySelector("#editor-falla-gps-estado");

    if (!navigator.geolocation) {
        estado.textContent = "GPS no disponible en este navegador";
        return;
    }

    estado.textContent = "Obteniendo ubicación…";

    navigator.geolocation.getCurrentPosition(
        (posicion) => {
            const latitud = posicion.coords.latitude;
            const longitud = posicion.coords.longitude;
            const precisionM = posicion.coords.accuracy;

            fondo.querySelector("#editor-falla-lat-confirmada").value =
                latitud.toFixed(7);
            fondo.querySelector("#editor-falla-lng-confirmada").value =
                longitud.toFixed(7);

            datosGpsEditorFalla = {
                latitud,
                longitud,
                precisionM,
                fuente: "gps",
                fechaHora: new Date().toISOString()
            };

            estado.textContent =
                `GPS registrado · precisión ±${Math.round(precisionM)} m`;
        },
        (error) => {
            console.error("Error GPS en registro de falla:", error);
            estado.textContent =
                "No fue posible obtener la ubicación actual";
        },
        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

async function guardarDesdeEditorFalla() {
    const fondo = asegurarEditorFalla();
    if (fondo._gv23Guardando) return;
    const registroBase = fondo._registroTemporal;
    const error = fondo.querySelector("#editor-falla-error");

    if (!registroBase) {
        return;
    }

    const textoDistanciaEditor = fondo.querySelector("#editor-falla-distancia-km").value.trim();
    const distanciaEditor = textoDistanciaEditor === "" ? null : Number(textoDistanciaEditor);
    const extremoEditor = fondo.querySelector("#editor-falla-extremo-referencia").value;
    const distanciaAnterior = numeroFallaDisponible(registroBase.distanciaIndicadaKm)
        ? Number(registroBase.distanciaIndicadaKm) : null;
    const cambioLocalizacion = distanciaEditor !== distanciaAnterior
        || extremoEditor !== (registroBase.extremoReferencia || "A")
        || (distanciaEditor !== null && !coordenadasFallaValidas(registroBase));

    if (cambioLocalizacion && !recalcularDesdeEditorFalla(false)) {
        error.textContent =
            "No se puede guardar el cambio de distancia hasta recalcular correctamente la ubicación estimada.";
        error.hidden = false;
        return;
    }

    const registroRecalculado = fondo._registroTemporal;

    const inicioFecha = fondo.querySelector(
        "#editor-falla-inicio-fecha"
    ).value;
    const inicioHora = fondo.querySelector(
        "#editor-falla-inicio-hora"
    ).value;
    const finFecha = fondo.querySelector(
        "#editor-falla-fin-fecha"
    ).value;
    const finHora = fondo.querySelector(
        "#editor-falla-fin-hora"
    ).value;

    const inicio = isoDesdePartesFechaHora(
        inicioFecha,
        inicioHora
    );

    const finIncompleto =
        Boolean(finFecha) !== Boolean(finHora);

    if (!inicio) {
        error.textContent =
            "Ingresa fecha de inicio y hora válida en formato 24 h (HH:mm).";
        error.hidden = false;
        return;
    }

    if (finIncompleto) {
        error.textContent =
            "Para cerrar la falla debes completar fecha y hora de fin.";
        error.hidden = false;
        return;
    }

    const fin = (finFecha || finHora)
        ? isoDesdePartesFechaHora(finFecha, finHora)
        : null;

    if ((finFecha || finHora) && !fin) {
        error.textContent =
            "La hora de fin debe usar formato 24 h (HH:mm), por ejemplo 18:45.";
        error.hidden = false;
        return;
    }

    if (fin && new Date(fin) < new Date(inicio)) {
        error.textContent =
            "La fecha y hora de fin no puede ser anterior al inicio.";
        error.hidden = false;
        return;
    }

    const latTexto = fondo.querySelector(
        "#editor-falla-lat-confirmada"
    ).value.trim();
    const lngTexto = fondo.querySelector(
        "#editor-falla-lng-confirmada"
    ).value.trim();

    let ubicacionConfirmada = null;

    if (latTexto || lngTexto) {
        const latitud = Number(latTexto);
        const longitud = Number(lngTexto);

        if (
            !latTexto || !lngTexto
            || !Number.isFinite(latitud)
            || !Number.isFinite(longitud)
            || latitud < -90
            || latitud > 90
            || longitud < -180
            || longitud > 180
        ) {
            error.textContent =
                "Revisa las coordenadas de la ubicación confirmada.";
            error.hidden = false;
            return;
        }

        const mismaGps =
            datosGpsEditorFalla
            && Math.abs(Number(datosGpsEditorFalla.latitud) - latitud) < 0.0000002
            && Math.abs(Number(datosGpsEditorFalla.longitud) - longitud) < 0.0000002;

        ubicacionConfirmada = {
            latitud,
            longitud,
            precisionM: mismaGps
                ? datosGpsEditorFalla.precisionM
                : null,
            fuente: mismaGps ? "gps" : "manual",
            fechaHora: mismaGps
                ? datosGpsEditorFalla.fechaHora
                : new Date().toISOString()
        };
    }

    const actualizado = {
        ...registroRecalculado,
        fechaHoraInicio: inicio,
        fechaHoraFin: fin,
        estado: fin ? "cerrada" : "activa",
        afectacionOperacional:
            fondo.querySelector("#editor-falla-afectacion").value.trim(),
        observaciones:
            fondo.querySelector("#editor-falla-observaciones").value.trim(),
        ubicacionConfirmada,
        fechaActualizacion: new Date().toISOString()
    };

    const registros = leerFallasGuardadas();
    const indice = registros.findIndex(
        (item) => item.id === actualizado.id
    );

    if (indice >= 0) {
        registros[indice] = actualizado;
    } else {
        registros.unshift(actualizado);
    }

    try { escribirFallasGuardadas(registros); } catch (e) {
        error.textContent = "No se pudo guardar la falla. No se han guardado las evidencias. " + e.message;
        error.hidden = false;
        return;
    }

    if (
        ultimoResultadoFalla
        && (
            fondo.dataset.nuevo === "true"
            || ultimoResultadoFalla._registroGuardadoId === actualizado.id
        )
    ) {
        ultimoResultadoFalla._registroGuardadoId = actualizado.id;
        actualizarBotonGuardarFalla();
    }

    const volverHistorial = fondo.dataset.desdeHistorial === "true";
    if (fondo._gv23Pendientes?.length) {
        // El ID de la falla debe existir antes de asociar archivos. Ante un fallo
        // de IndexedDB se conserva el registro y se permite reintentar sin duplicarlo.
        fondo._registroTemporal = actualizado;
        fondo.dataset.nuevo = "false";
        try { await gv231GuardarPendientes(fondo, actualizado); }
        catch (e) {
            actualizarAccesoFallasGuardadas();
            renderizarFallasGuardadas();
            limpiarMarcadoresTemporalesDeRegistro(actualizado.id);
            sincronizarMarcadoresFallasActivas();
            error.textContent = "La falla quedó guardada, pero las evidencias no. Conserva el formulario abierto y vuelve a intentar, o quita archivos. " + e.message;
            error.hidden = false;
            return;
        }
    }
    fondo.hidden = true;
    fondo._registroTemporal = null;
    datosGpsEditorFalla = null;

    actualizarAccesoFallasGuardadas();
    renderizarFallasGuardadas();
    limpiarMarcadoresTemporalesDeRegistro(actualizado.id);
    sincronizarMarcadoresFallasActivas();
    if (volverHistorial) abrirPanelFallasGuardadas();

    mostrarMensajeLocalizador(
        actualizado.fechaHoraFin
            ? `Falla guardada y cerrada: ${actualizado.id}`
            : `Falla guardada como activa: ${actualizado.id}`
    );
}

function crearBotonAccionFalla({
    id,
    texto,
    fondo,
    color = "#ffffff",
    borde = "transparent",
    onClick
}) {
    const boton = document.createElement("button");

    boton.id = id;
    boton.type = "button";
    boton.textContent = texto;

    boton.style.flex = "1 1 0";
    boton.style.minHeight = "40px";
    boton.style.padding = "9px 10px";
    boton.style.borderRadius = "10px";
    boton.style.border = `1px solid ${borde}`;
    boton.style.background = fondo;
    boton.style.color = color;
    boton.style.fontWeight = "700";
    boton.style.cursor = "pointer";
    boton.style.fontSize = "0.88rem";

    boton.addEventListener("click", onClick);

    return boton;
}

function asegurarAccionesFalla() {
    const resultadoPanel = elementoLocalizador(
        "localizador-fallas-resultado"
    );

    if (!resultadoPanel) {
        return;
    }

    if (
        resultadoPanel.querySelector(
            "#acciones-falla-localizador"
        )
    ) {
        actualizarBotonGuardarFalla();
        return;
    }

    const acciones =
        document.createElement("div");

    acciones.id =
        "acciones-falla-localizador";

    acciones.style.display = "flex";
    acciones.style.gap = "8px";
    acciones.style.flexWrap = "wrap";
    acciones.style.marginTop = "14px";
    acciones.style.paddingTop = "12px";
    acciones.style.borderTop =
        "1px solid rgba(148, 163, 184, .35)";

    const guardar = crearBotonAccionFalla({
        id: "guardar-falla-local",
        texto: "💾 Guardar falla",
        fondo: "#0f766e",
        onClick: guardarFallaActual
    });

    const compartir = crearBotonAccionFalla({
        id: "compartir-falla-principal",
        texto: "📤 Compartir",
        fondo: "#2563eb",
        onClick: compartirUbicacionFalla
    });

    const borrar = crearBotonAccionFalla({
        id: "borrar-falla-mapa",
        texto: "🗑 Borrar del mapa",
        fondo: "#ffffff",
        color: "#b91c1c",
        borde: "#fecaca",
        onClick: eliminarMarcadorFalla
    });

    acciones.append(
        guardar,
        compartir,
        borrar
    );

    resultadoPanel.appendChild(acciones);

    actualizarBotonGuardarFalla();

    // Evita duplicar la acción de borrado si el panel antiguo
    // todavía contiene el botón "eliminar-falla".
    const botonEliminarAntiguo =
        elementoLocalizador("eliminar-falla");

    if (botonEliminarAntiguo) {
        botonEliminarAntiguo.hidden = true;
    }
}



// ======================================================
// FASE 2 · PANEL DE FALLAS GUARDADAS
// ======================================================

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatearFechaHoraFalla(fechaHora) {
    const fecha = new Date(fechaHora);

    if (Number.isNaN(fecha.getTime())) {
        return "Fecha no disponible";
    }

    return fecha.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function asegurarEstilosFallasGuardadas() {
    if (document.getElementById("estilos-fallas-guardadas")) {
        return;
    }

    const estilo = document.createElement("style");
    estilo.id = "estilos-fallas-guardadas";
    estilo.textContent = `
        #panel-fallas-guardadas-gridvision {
            position: fixed;
            top: 86px;
            right: 18px;
            width: min(410px, calc(100vw - 36px));
            max-height: calc(100vh - 110px);
            overflow: hidden;
            z-index: 2200;
            background: #ffffff;
            border: 1px solid rgba(148, 163, 184, .42);
            border-radius: 16px;
            box-shadow: 0 18px 50px rgba(15, 23, 42, .22);
            color: #0f172a;
        }
        #panel-fallas-guardadas-gridvision[hidden] {
            display: none !important;
        }
        .gv-fallas-cabecera {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 15px 16px 11px;
            border-bottom: 1px solid #e2e8f0;
        }
        .gv-fallas-cabecera h2 {
            margin: 0;
            font-size: 1.04rem;
        }
        .gv-fallas-cabecera small {
            display: block;
            margin-top: 3px;
            color: #64748b;
        }
        .gv-fallas-cerrar {
            border: 0;
            background: transparent;
            font-size: 1.45rem;
            line-height: 1;
            cursor: pointer;
            color: #475569;
        }
        .gv-fallas-nueva { padding: 10px 14px 0; }
        #registrar-nueva-falla-gv {
            width: 100%; min-height: 40px; border: 0; border-radius: 9px;
            background: #0f766e; color: white; font-weight: 800; cursor: pointer;
        }
        .gv-falla-acciones button:disabled { opacity: .45; cursor: not-allowed; }
        .gv-fallas-filtros {
            display: flex;
            gap: 6px;
            padding: 10px 14px;
            border-bottom: 1px solid #e2e8f0;
        }
        .gv-fallas-filtro {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            border-radius: 999px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: .79rem;
            font-weight: 700;
        }
        .gv-fallas-filtro[data-activo="true"] {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }
        #lista-fallas-guardadas-gridvision {
            overflow-y: auto;
            max-height: calc(100vh - 270px);
            padding: 10px;
            background: #f8fafc;
        }
        .gv-falla-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 11px;
            margin-bottom: 9px;
        }
        .gv-falla-card:last-child {
            margin-bottom: 0;
        }
        .gv-falla-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
        }
        .gv-falla-id {
            font-size: .76rem;
            color: #64748b;
            font-weight: 700;
        }
        .gv-falla-estado {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 7px;
            border-radius: 999px;
            font-size: .72rem;
            font-weight: 800;
        }
        .gv-falla-estado.activa {
            background: #fee2e2;
            color: #991b1b;
        }
        .gv-falla-estado.cerrada {
            background: #dcfce7;
            color: #166534;
        }
        .gv-falla-linea {
            margin: 8px 0 4px;
            font-size: .94rem;
            font-weight: 800;
            line-height: 1.25;
        }
        .gv-falla-meta {
            margin: 3px 0;
            color: #475569;
            font-size: .79rem;
            line-height: 1.35;
        }
        .gv-falla-acciones {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
            margin-top: 10px;
        }
        .gv-falla-acciones button {
            min-height: 34px;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #0f172a;
            font-weight: 700;
            cursor: pointer;
            font-size: .77rem;
        }
        .gv-falla-acciones button:hover {
            background: #f1f5f9;
        }
        .gv-fallas-vacio {
            padding: 30px 18px;
            text-align: center;
            color: #64748b;
            line-height: 1.45;
        }
        .gv-fallas-pie {
            padding: 10px 14px 13px;
            border-top: 1px solid #e2e8f0;
            background: #ffffff;
        }
        #borrar-todas-fallas-guardadas {
            width: 100%;
            min-height: 36px;
            border-radius: 9px;
            border: 1px solid #fecaca;
            background: #ffffff;
            color: #b91c1c;
            font-weight: 800;
            cursor: pointer;
        }
        #abrir-fallas-guardadas-gridvision {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 40px;
            padding: 0 18px;
            border: 1px solid #4a6785;
            border-radius: 999px;
            background: #10233d;
            color: #ffffff;
            font: inherit;
            font-size: 14px;
            font-weight: 600;
            white-space: nowrap;
            cursor: pointer;
            transition:
                background 0.2s ease,
                border-color 0.2s ease,
                color 0.2s ease;
        }
        #abrir-fallas-guardadas-gridvision:hover,
        #abrir-fallas-guardadas-gridvision:focus-visible {
            background: #1d4ed8;
            border-color: #60a5fa;
            outline: none;
        }
        #fondo-editor-falla-gridvision {
            position: fixed;
            inset: 0;
            z-index: 2600;
            display: grid;
            place-items: center;
            padding: 18px;
            background: rgba(15, 23, 42, .58);
        }
        #fondo-editor-falla-gridvision[hidden] {
            display: none !important;
        }
        #editor-falla-gridvision {
            width: min(720px, calc(100vw - 28px));
            max-height: calc(100vh - 36px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-radius: 16px;
            background: #ffffff;
            box-shadow: 0 24px 70px rgba(15, 23, 42, .34);
            color: #0f172a;
        }
        .gv-editor-cabecera,
        .gv-editor-pie {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 16px;
            border-bottom: 1px solid #e2e8f0;
        }
        .gv-editor-pie {
            justify-content: flex-end;
            border-top: 1px solid #e2e8f0;
            border-bottom: 0;
        }
        .gv-editor-cabecera h2 {
            margin: 2px 0 0;
            font-size: 1.08rem;
        }
        .gv-editor-cabecera small {
            color: #64748b;
            font-weight: 700;
        }
        #cerrar-editor-falla {
            border: 0;
            background: transparent;
            color: #475569;
            font-size: 1.55rem;
            cursor: pointer;
        }
        .gv-editor-cuerpo {
            overflow-y: auto;
            padding: 16px;
        }
        .gv-editor-resumen {
            display: grid;
            gap: 4px;
            margin-bottom: 14px;
            padding: 11px 12px;
            border-radius: 10px;
            background: #eff6ff;
            color: #1e3a8a;
        }
        .gv-editor-resumen span {
            font-size: .8rem;
        }
        .gv-editor-grid-dos {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            align-items: start;
        }
        .gv-fecha-hora-24 {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 88px;
            gap: 8px;
            align-items: center;
        }
        .gv-fecha-hora-24 input[type="text"] {
            text-align: center;
            font-variant-numeric: tabular-nums;
            letter-spacing: .02em;
        }
        .gv-editor-bloque,
        .gv-editor-grid-dos label {
            display: grid;
            gap: 5px;
            margin-bottom: 12px;
            align-content: start;
            color: #334155;
            font-size: .82rem;
            font-weight: 700;
        }
        .gv-editor-bloque textarea,
        .gv-editor-grid-dos input {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            padding: 9px 10px;
            background: #ffffff;
            color: #0f172a;
            font: inherit;
            font-weight: 500;
        }
        .gv-editor-bloque textarea {
            resize: vertical;
            min-height: 88px;
        }
        .gv-editor-grid-dos small,
        .gv-editor-seccion-titulo small {
            color: #64748b;
            font-weight: 500;
            line-height: 1.35;
        }
        .gv-editor-ubicacion {
            margin-top: 4px;
            padding: 12px;
            border: 1px solid #dbeafe;
            border-radius: 11px;
            background: #f8fbff;
        }
        .gv-editor-seccion-titulo {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
        }
        .gv-editor-seccion-titulo strong,
        .gv-editor-seccion-titulo small {
            display: block;
        }
        .gv-editor-grid-dos select {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            padding: 9px 10px;
            background: #ffffff;
            color: #0f172a;
            font: inherit;
            font-weight: 500;
        }
        .gv-input-unidad {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
        }
        .gv-input-unidad > span {
            color: #475569;
            font-size: .8rem;
            font-weight: 700;
        }
        .gv-recalculo-estado {
            display: block;
            min-height: 16px;
            margin-top: 6px;
            color: #047857;
            font-size: .74rem;
            font-weight: 700;
        }
        .gv-recalculo-estado[data-tipo="error"] {
            color: #b91c1c;
        }
        #editor-falla-gps-estado {
            color: #047857;
            font-size: .72rem;
            font-weight: 700;
            text-align: right;
        }
        .gv-editor-acciones-secundarias {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
        }
        .gv-editor-acciones-secundarias button,
        .gv-editor-pie button {
            min-height: 38px;
            padding: 8px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            background: #ffffff;
            color: #0f172a;
            font-weight: 700;
            cursor: pointer;
        }
        #guardar-editor-falla {
            border-color: #1d4ed8;
            background: #2563eb;
            color: #ffffff;
        }
        .gv-editor-evidencia-pendiente {
            display: grid;
            gap: 4px;
            margin-top: 12px;
            padding: 10px 12px;
            border: 1px dashed #cbd5e1;
            border-radius: 10px;
            color: #64748b;
            background: #f8fafc;
            font-size: .78rem;
        }
        .gv-editor-error {
            margin-top: 12px;
            padding: 9px 11px;
            border-radius: 9px;
            background: #fef2f2;
            color: #b91c1c;
            font-size: .8rem;
            font-weight: 700;
        }
        .gv-falla-afectacion {
            margin: 7px 0 3px;
            padding: 7px 8px;
            border-left: 3px solid #2563eb;
            border-radius: 5px;
            background: #eff6ff;
            color: #1e3a8a;
            font-size: .76rem;
            line-height: 1.4;
        }
        .gv-falla-confirmada {
            color: #047857;
            font-weight: 700;
        }
        .gv-marcador-falla-persistente {
            position: relative;
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            border: 3px solid #ffffff;
            border-radius: 50%;
            background: #dc2626;
            color: #ffffff;
            box-shadow: 0 3px 12px rgb(0 0 0 / 35%);
            font-size: 21px;
            line-height: 1;
        }
        .gv-falla-activa-pulso {
            position: absolute;
            inset: -7px;
            border: 2px solid rgb(220 38 38 / 50%);
            border-radius: 50%;
            animation: gvPulsoFallaActiva 1.8s ease-out infinite;
            pointer-events: none;
        }
        @keyframes gvPulsoFallaActiva {
            0% { transform: scale(.78); opacity: .9; }
            70%, 100% { transform: scale(1.32); opacity: 0; }
        }
        .gv-popup-falla-activa h3 {
            color: #b91c1c;
        }
        .gv-popup-falla-activa-acciones {
            display: flex;
            gap: 7px;
            margin-top: 10px;
        }
        .gv-popup-falla-activa-acciones button {
            flex: 1;
            padding: 7px 8px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #ffffff;
            color: #0f172a;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }
        .gv-popup-falla-activa-acciones button:hover {
            background: #f1f5f9;
        }
        @media (max-width: 700px) {
            #panel-fallas-guardadas-gridvision {
                top: 70px;
                right: 10px;
                width: calc(100vw - 20px);
                max-height: calc(100vh - 85px);
            }
            #lista-fallas-guardadas-gridvision {
                max-height: calc(100vh - 250px);
            }
        }
    `;

    document.head.appendChild(estilo);
}

function obtenerMapaGridVision() {
    return window.GridVisionMapa || mapaLocalizador || null;
}

function escaparAtributoHtml(valor) {
    return escaparHtml(String(valor ?? ""))
        .replace(/`/g, "&#96;");
}

function asegurarCapaFallasActivas() {
    const mapa = obtenerMapaGridVision();

    if (!mapa || typeof L === "undefined") {
        return null;
    }

    if (!capaFallasActivas) {
        capaFallasActivas = L.layerGroup().addTo(mapa);
    } else if (!mapa.hasLayer(capaFallasActivas)) {
        capaFallasActivas.addTo(mapa);
    }

    return capaFallasActivas;
}

function crearIconoFallaActiva() {
    return L.divIcon({
        className: "gv-icono-falla gv-icono-falla-activa",
        html: `
            <div class="gv-marcador-falla gv-marcador-falla-persistente" title="Falla activa">
                ⚡
                <span class="gv-falla-activa-pulso" aria-hidden="true"></span>
            </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
        popupAnchor: [0, -22]
    });
}

function contenidoPopupFallaActiva(registro) {
    const inicio = formatearFechaHoraFalla(
        registro.fechaHoraInicio || registro.fechaHora
    );
    const referencia = registro.extremoReferencia === "B"
        ? (registro.nombreExtremoB || "Extremo B")
        : (registro.nombreExtremoA || "Extremo A");
    const distancia = numeroFallaDisponible(registro.distanciaIndicadaKm)
        ? `${Number(registro.distanciaIndicadaKm).toFixed(1)} km desde ${referencia}`
        : "Distancia no disponible";
    const afectacion = registro.afectacionOperacional
        ? `<p><strong>Afectación:</strong><br>${escaparHtml(registro.afectacionOperacional)}</p>`
        : "";

    return `
        <div class="popup-gridvision gv-popup-falla-activa" data-falla-activa="${escaparAtributoHtml(registro.id)}">
            <h3>🔴 FALLA ACTIVA</h3>
            <p><strong>${escaparHtml(registro.id)}</strong></p>
            <p><strong>Línea:</strong> ${escaparHtml(registro.nombreLinea || "Línea sin nombre")}</p>
            <p><strong>Inicio:</strong> ${escaparHtml(inicio)}</p>
            <p><strong>Protección:</strong> ${escaparHtml(distancia)}</p>
            <p><strong>${coordenadasFallaValidas(registro) ? "Coordenadas estimadas" : "Coordenadas confirmadas"}:</strong> ${posicionFallaActiva(registro)?.map(v => v.toFixed(6)).join(", ") || "Pendiente"}</p>
            ${afectacion}
            <div class="gv-popup-falla-activa-acciones">
                <button type="button" data-accion-falla="editar">✏️ Editar</button>
                <button type="button" data-accion-falla="compartir">📤 Compartir</button>
            </div>
        </div>
    `;
}

function conectarAccionesPopupFallaActiva(marcador, idRegistro) {
    marcador.on("popupopen", () => {
        const popup = marcador.getPopup()?.getElement();

        if (!popup) {
            return;
        }

        popup.querySelector('[data-accion-falla="editar"]')
            ?.addEventListener("click", () => {
                marcador.closePopup();
                abrirEditorFallaGuardada(idRegistro);
            }, { once: true });

        popup.querySelector('[data-accion-falla="compartir"]')
            ?.addEventListener("click", () => {
                compartirRegistroFalla(idRegistro);
            }, { once: true });
    });
}

function crearMarcadorFallaActiva(registro, capa) {
    const posicion = posicionFallaActiva(registro);
    if (!posicion) return null;
    const [latitud, longitud] = posicion;

    const marcador = L.marker(
        [latitud, longitud],
        {
            icon: crearIconoFallaActiva(),
            title: `Falla activa · ${registro.id}`,
            zIndexOffset: 1700,
            riseOnHover: true
        }
    ).addTo(capa);

    marcador.bindPopup(
        contenidoPopupFallaActiva(registro),
        { maxWidth: 330 }
    );
    conectarAccionesPopupFallaActiva(
        marcador,
        registro.id
    );
    marcador._gridVisionRegistroFalla = registro;

    return marcador;
}

function quitarMarcadorFallaActiva(idRegistro) {
    const marcador = marcadoresFallasActivas.get(idRegistro);

    if (!marcador) {
        return;
    }

    const capa = capaFallasActivas;

    if (capa?.hasLayer(marcador)) {
        capa.removeLayer(marcador);
    } else {
        const mapa = obtenerMapaGridVision();
        if (mapa?.hasLayer(marcador)) {
            mapa.removeLayer(marcador);
        }
    }

    marcadoresFallasActivas.delete(idRegistro);
}

function limpiarMarcadoresTemporalesDeRegistro(idRegistro) {
    if (
        !idRegistro
        || ultimoResultadoFalla?._registroGuardadoId !== idRegistro
    ) {
        return;
    }

    const mapa = obtenerMapaGridVision();

    if (marcadorFalla && mapa?.hasLayer(marcadorFalla)) {
        mapa.removeLayer(marcadorFalla);
    }
    marcadorFalla = null;

    if (
        marcadorFallaConfirmada
        && mapa?.hasLayer(marcadorFallaConfirmada)
    ) {
        mapa.removeLayer(marcadorFallaConfirmada);
    }
    marcadorFallaConfirmada = null;
}

function sincronizarMarcadoresFallasActivas() {
    const capa = asegurarCapaFallasActivas();

    if (!capa) {
        return;
    }

    const activas = leerFallasGuardadas()
        .filter((registro) =>
            estadoRegistroFalla(registro) === "activa"
            && posicionFallaActiva(registro) !== null
        );
    const idsActivas = new Set(
        activas.map((registro) => registro.id)
    );

    for (const id of [...marcadoresFallasActivas.keys()]) {
        if (!idsActivas.has(id)) {
            quitarMarcadorFallaActiva(id);
        }
    }

    for (const registro of activas) {
        const existente = marcadoresFallasActivas.get(registro.id);
        const [latitud, longitud] = posicionFallaActiva(registro);

        if (!existente) {
            const nuevo = crearMarcadorFallaActiva(
                registro,
                capa
            );
            if (nuevo) {
                marcadoresFallasActivas.set(
                    registro.id,
                    nuevo
                );
            }
            continue;
        }

        const posicion = existente.getLatLng();
        if (
            Math.abs(posicion.lat - latitud) > 0.0000001
            || Math.abs(posicion.lng - longitud) > 0.0000001
        ) {
            existente.setLatLng([latitud, longitud]);
        }

        existente.setPopupContent(
            contenidoPopupFallaActiva(registro)
        );
        existente.options.title =
            `Falla activa · ${registro.id}`;
        existente._gridVisionRegistroFalla = registro;
    }
}

function asegurarAccesoFallasGuardadas() {
    asegurarEstilosFallasGuardadas();

    let boton = document.getElementById(
        "abrir-fallas-guardadas-gridvision"
    );

    if (!boton) {
        boton = document.createElement("button");
        boton.id = "abrir-fallas-guardadas-gridvision";
        boton.type = "button";
        boton.title = "Ver fallas guardadas";
        boton.addEventListener(
            "click",
            () => {
                const panel =
                    document.getElementById(
                        "panel-fallas-guardadas-gridvision"
                    );

                if (!panel || panel.hidden) {
                    abrirPanelFallasGuardadas();
                } else {
                    cerrarPanelFallasGuardadas();
                }
            }
        );

        const referencia =
            document.getElementById("alternar-filtros");

        const contenedor =
            referencia?.parentElement
            || document.querySelector(".estado-aplicacion")
            || document.querySelector("header")
            || document.body;

        if (referencia?.parentElement === contenedor) {
            contenedor.insertBefore(boton, referencia);
        } else {
            contenedor.appendChild(boton);
        }
    }

    actualizarAccesoFallasGuardadas();
    asegurarPanelFallasGuardadas();
}

function actualizarAccesoFallasGuardadas() {
    const boton = document.getElementById(
        "abrir-fallas-guardadas-gridvision"
    );

    if (!boton) {
        return;
    }

    const registros = leerFallasGuardadas();
    const activas = registros.filter(
        (registro) => estadoRegistroFalla(registro) === "activa"
    ).length;

    boton.textContent = activas > 0
        ? `⚡ Fallas (${activas})`
        : "⚡ Fallas";
}

function asegurarPanelFallasGuardadas() {
    let panel = document.getElementById(
        "panel-fallas-guardadas-gridvision"
    );

    if (panel) {
        return panel;
    }

    panel = document.createElement("section");
    panel.id = "panel-fallas-guardadas-gridvision";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Fallas guardadas");

    panel.innerHTML = `
        <div class="gv-fallas-cabecera">
            <div>
                <h2>⚡ Fallas guardadas</h2>
                <small id="resumen-fallas-guardadas"></small>
            </div>
            <button
                type="button"
                class="gv-fallas-cerrar"
                id="cerrar-fallas-guardadas"
                aria-label="Cerrar fallas guardadas"
                title="Cerrar"
            >×</button>
        </div>
        <div class="gv-fallas-nueva">
            <button type="button" id="registrar-nueva-falla-gv">＋ Registrar nueva falla</button>
        </div>
        <div class="gv-fallas-filtros">
            <button type="button" class="gv-fallas-filtro" data-filtro="todas" data-activo="true">Todas</button>
            <button type="button" class="gv-fallas-filtro" data-filtro="activa">Activas</button>
            <button type="button" class="gv-fallas-filtro" data-filtro="cerrada">Cerradas</button>
        </div>
        <div id="lista-fallas-guardadas-gridvision"></div>
        <div class="gv-fallas-pie">
            <button type="button" id="borrar-todas-fallas-guardadas">
                🧹 Borrar todas las fallas guardadas
            </button>
        </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#cerrar-fallas-guardadas")
        ?.addEventListener("click", cerrarPanelFallasGuardadas);

    panel.querySelector("#registrar-nueva-falla-gv")
        ?.addEventListener("click", iniciarRegistroDesdeHistorial);

    panel.querySelectorAll(".gv-fallas-filtro")
        .forEach((boton) => {
            boton.addEventListener("click", () => {
                panel.querySelectorAll(".gv-fallas-filtro")
                    .forEach((otro) => {
                        otro.dataset.activo = "false";
                    });

                boton.dataset.activo = "true";
                panel.dataset.filtro = boton.dataset.filtro;
                renderizarFallasGuardadas();
            });
        });

    panel.querySelector("#borrar-todas-fallas-guardadas")
        ?.addEventListener("click", borrarTodasFallasGuardadas);

    return panel;
}


    function gv22Leer() {
        const raw = localStorage.getItem(CLAVE_FALLAS_GUARDADAS);
        const geo = localStorage.getItem(CLAVE_GEOMETRIAS_FALLA);
        const registros = raw === null ? [] : JSON.parse(raw);
        const geometrias = geo === null ? {} : JSON.parse(geo);
        if (!Array.isArray(registros) || !geometrias || typeof geometrias !== 'object' || Array.isArray(geometrias))
            throw new Error('El almacenamiento local tiene un formato inesperado. No se modificara.');
        return { registros, geometrias };
    }
    const gv22Numero = n => (typeof n === 'number' || (typeof n === 'string' && n.trim() !== '')) && Number.isFinite(Number(n));
    const gv22Fecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
    const gv22Texto = v => typeof v === 'string' ? v : '';
    const gv22Obj = v => v && typeof v === 'object' && !Array.isArray(v);
    const gv22Red = v => Math.round(v * 100) / 100;
    function gv22Horas(r, ahora) {
        const inicio = Date.parse(r.fechaHoraInicio || r.fechaHora);
        const fin = r.fechaHoraFin ? Date.parse(r.fechaHoraFin) : ahora;
        return Number.isFinite(inicio) && Number.isFinite(fin) && fin >= inicio ? (fin - inicio) / 3600000 : null;
    }
    function gv22FechaVisible(v) {
        if (!gv22Fecha(v)) return '';
        return new Intl.DateTimeFormat('es-CL', {timeZone:'America/Santiago', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
    }
    function gv22Indicadores(registros, ahora = Date.now()) {
        const grupos = new Map();
        const total = {nombre:'TOTAL',id:'',eventos:0,activas:0,cerradas:0,horasC:0,horasA:0,validasC:0,validasA:0,invalidas:0};
        function sumar(g,r) {
            g.eventos++;
            const cerrada = Boolean(r.fechaHoraFin);
            const h = gv22Horas(r,ahora);
            if(cerrada) {g.cerradas++; if(h !== null){g.horasC+=h;g.validasC++;}}
            else {g.activas++; if(h !== null){g.horasA+=h;g.validasA++;}}
            if(h === null) g.invalidas++;
        }
        for(const r of registros) {
            const nombre=gv22Texto(r.nombreLinea)||'Linea sin nombre';
            const id=gv22Texto(r.idActivo);
            const clave=id ? 'id:'+id.toUpperCase() : 'nombre:'+nombre.trim().toLowerCase();
            if(!grupos.has(clave)) grupos.set(clave,{nombre,id,eventos:0,activas:0,cerradas:0,horasC:0,horasA:0,validasC:0,validasA:0,invalidas:0});
            sumar(grupos.get(clave),r);sumar(total,r);
        }
        const filas=[...grupos.values()].sort((a,b)=>b.eventos-a.eventos || a.nombre.localeCompare(b.nombre,'es'));
        return {total,filas};
    }
    function gv22Descargar(blob,nombre) {
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=nombre;
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    function gv22Nombre(prefijo,ext) {
        return prefijo+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext;
    }
    function gv22Respaldo() {
        const datos=gv22Leer();
        const respaldo={formato:'gridvision-fallas',version:1,exportadoEn:new Date().toISOString(),...datos};
        gv22Descargar(new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'}),gv22Nombre('GridVision-respaldo-fallas','json'));
        return datos.registros.length;
    }
    // Validacion estricta de respaldos; nunca se ejecuta codigo del archivo.
    function gv22ValidarRespaldo(datos) {
        if(!gv22Obj(datos)||datos.formato!=='gridvision-fallas'||datos.version!==1||!Array.isArray(datos.registros)||!gv22Obj(datos.geometrias))
            throw new Error('Archivo incompatible: utiliza un respaldo JSON de GridVision Fallas V2.2.');
        if(datos.registros.length>100000) throw new Error('Demasiados registros.');
        const ids=new Set();
        const numericos=['distanciaIndicadaKm','distanciaDesdeAKm','distanciaDesdeBKm','longitudTotalKm','precisionKm'];
        const textos=['idActivo','nombreLinea','nombreExtremoA','nombreExtremoB','afectacionOperacional','observaciones'];
        const registros=datos.registros.map((r,i)=>{
            const fallo=()=>{throw new Error('Registro '+(i+1)+' invalido: '+(typeof r?.id==='string'?r.id:'sin ID'));};
            if(!gv22Obj(r)||typeof r.id!=='string'||!/^GV-FLT-\d{8}-\d{6}(?:-\d+)?$/.test(r.id)||ids.has(r.id)) fallo();
            const inicio=r.fechaHoraInicio||r.fechaHora;
            if(!gv22Fecha(inicio)|| (r.fechaHoraFin!=null&&r.fechaHoraFin!==''&&(!gv22Fecha(r.fechaHoraFin)||Date.parse(r.fechaHoraFin)<Date.parse(inicio)))) fallo();
            if(typeof r.nombreLinea!=='string'||!r.nombreLinea.trim()) fallo();
            const limpio={id:r.id,fechaHoraInicio:inicio,fechaHoraFin:r.fechaHoraFin||null,estado:r.fechaHoraFin?'cerrada':'activa'};
            for(const k of textos){if(r[k]!=null&&typeof r[k]!=='string')fallo(); limpio[k]=r[k]??(k==='idActivo'?null:'');}
            for(const k of ['fechaHora','fechaCreacion','fechaActualizacion']) {if(r[k]!=null&&r[k]!==''&&!gv22Fecha(r[k]))fallo();limpio[k]=r[k]||inicio;}
            if(r.extremoReferencia!=null&&!['A','B'].includes(r.extremoReferencia))fallo();
            limpio.extremoReferencia=r.extremoReferencia||'A';
            for(const k of numericos){if(r[k]!=null&&r[k]!==''&&(!gv22Numero(r[k])||Number(r[k])<0))fallo();limpio[k]=gv22Numero(r[k])?Number(r[k]):null;}
            function coords(obj) {
                const lat=obj.latitud,lon=obj.longitud;
                if(!gv22Numero(lat)&&!gv22Numero(lon)&&[lat,lon].every(v=>v==null||v===''))return null;
                if(!gv22Numero(lat)||!gv22Numero(lon)||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)fallo();
                return {latitud:Number(lat),longitud:Number(lon)};
            }
            const c=coords(r);limpio.latitud=c?.latitud??null;limpio.longitud=c?.longitud??null;
            limpio.ubicacionConfirmada=null;
            if(r.ubicacionConfirmada!=null){const u=r.ubicacionConfirmada;if(!gv22Obj(u))fallo();const p=coords(u);if(!p)fallo();if(u.precisionM!=null&&(!gv22Numero(u.precisionM)||Number(u.precisionM)<0))fallo();if(u.fechaHora!=null&&!gv22Fecha(u.fechaHora))fallo();limpio.ubicacionConfirmada={...p,precisionM:gv22Numero(u.precisionM)?Number(u.precisionM):null,fuente:u.fuente==='gps'?'gps':'manual',fechaHora:u.fechaHora||inicio};}
            ids.add(r.id);return limpio;
        });
        const geometrias=Object.create(null);
        for(const [k,coords] of Object.entries(datos.geometrias)){
            if(!k||['__proto__','constructor','prototype'].includes(k)||!Array.isArray(coords)||coords.length<2||!coords.every(p=>Array.isArray(p)&&p.length>=2&&typeof p[0]==='number'&&typeof p[1]==='number'&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))throw new Error('Geometria invalida en el respaldo: '+k);
            geometrias[k]=coords.map(p=>[p[0],p[1]]);
        }
        return {registros,geometrias};
    }
    function gv22Fusion(actual,entrada){
        const ids=new Set(actual.registros.map(r=>r.id));
        const nuevos=entrada.registros.filter(r=>!ids.has(r.id));
        const geometrias=Object.assign(Object.create(null),actual.geometrias);
        let nuevasGeometrias=0;
        for(const [k,v] of Object.entries(entrada.geometrias)) if(!Object.hasOwn(geometrias,k)){geometrias[k]=v;nuevasGeometrias++;}
        return {registros:[...actual.registros,...nuevos],geometrias,nuevos:nuevos.length,omitidos:entrada.registros.length-nuevos.length,nuevasGeometrias};
    }
    function gv22GuardarFusion(fusion){
        const anteriorG=localStorage.getItem(CLAVE_GEOMETRIAS_FALLA);
        const anteriorR=localStorage.getItem(CLAVE_FALLAS_GUARDADAS);
        try{
            localStorage.setItem(CLAVE_GEOMETRIAS_FALLA,JSON.stringify(fusion.geometrias));
            localStorage.setItem(CLAVE_FALLAS_GUARDADAS,JSON.stringify(fusion.registros));
        }catch(e){
            try{if(anteriorG===null)localStorage.removeItem(CLAVE_GEOMETRIAS_FALLA);else localStorage.setItem(CLAVE_GEOMETRIAS_FALLA,anteriorG);if(anteriorR===null)localStorage.removeItem(CLAVE_FALLAS_GUARDADAS);else localStorage.setItem(CLAVE_FALLAS_GUARDADAS,anteriorR);}catch{}
            throw new Error('No se pudo guardar la importacion. Revisa el espacio local y conserva tu respaldo. '+e.message);
        }
    }
    async function gv22Importar(archivo,estado){
        if(!archivo)return;
        if(archivo.size>30*1024*1024) throw new Error('El respaldo supera 30 MB.');
        const entrada=gv22ValidarRespaldo(JSON.parse((await archivo.text()).replace(/^\uFEFF/,'')));
        const actual=gv22Leer();const fusion=gv22Fusion(actual,entrada);
        if(!fusion.nuevos&&!fusion.nuevasGeometrias){estado.textContent='No hay cambios: '+fusion.omitidos+' ID ya existentes.';return;}
        if(!window.confirm('Importar '+fusion.nuevos+' fallas nuevas y '+fusion.nuevasGeometrias+' geometrias.\nOmitir '+fusion.omitidos+' ID existentes (no se sobrescriben).\n\nConfirma solo si ya descargaste un respaldo del historial actual.')){estado.textContent='Importacion cancelada.';return;}
        gv22GuardarFusion(fusion);
        actualizarAccesoFallasGuardadas();renderizarFallasGuardadas();sincronizarMarcadoresFallasActivas();
        estado.textContent='Importadas: '+fusion.nuevos+' | ID omitidos: '+fusion.omitidos+' | Geometrias nuevas: '+fusion.nuevasGeometrias;
    }
    // XLSX nativo: OpenXML + ZIP sin compresion. Sin CDN ni bibliotecas externas.
    function gv22Xml(v){return String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
    function gv22Col(n){let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
    function gv22Hoja(filas,anchos){
        const cols=anchos.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
        const contenido=filas.map((fila,i)=>`<row r="${i+1}">${fila.map((v,j)=>{
            const ref=gv22Col(j)+(i+1),estilo=i===0?' s="1"':(typeof v==='number'?' s="2"':'');
            if(v===null||v===undefined)return '';
            if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${gv22Xml(String(v).slice(0,32767))}</t></is></c>`;
        }).join('')}</row>`).join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${contenido}</sheetData><autoFilter ref="A1:${gv22Col(filas[0].length-1)}${filas.length}"/></worksheet>`;
    }
    function gv22Zip(archivos){
        const enc=new TextEncoder(),chunks=[],centro=[];let offset=0,centralSize=0;
        function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
        function cab(n){const b=new Uint8Array(n),v=new DataView(b.buffer);return[b,(p,x)=>v.setUint16(p,x,true),(p,x)=>v.setUint32(p,x,true)];}
        for(const [nombre,contenido] of Object.entries(archivos)){
            const n=enc.encode(nombre),d=enc.encode(contenido),crc=crc32(d);
            const [h,u16,u32]=cab(30);u32(0,0x04034b50);u16(4,20);u16(6,0x800);u16(12,33);u32(14,crc);u32(18,d.length);u32(22,d.length);u16(26,n.length);
            const [c,s16,s32]=cab(46);s32(0,0x02014b50);s16(4,20);s16(6,20);s16(8,0x800);s16(14,33);s32(16,crc);s32(20,d.length);s32(24,d.length);s16(28,n.length);s32(42,offset);
            chunks.push(h,n,d);centro.push(c,n);offset+=h.length+n.length+d.length;centralSize+=c.length+n.length;
        }
        const [e,u16,u32]=cab(22);u32(0,0x06054b50);u16(8,Object.keys(archivos).length);u16(10,Object.keys(archivos).length);u32(12,centralSize);u32(16,offset);
        return new Blob([...chunks,...centro,e],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }
    function gv22ExcelBlob(registros,ahora=Date.now()){
        const historia=[['ID falla','Linea','ID activo','Estado','Inicio (Chile continental)','Fin (Chile continental)','Duracion h (al corte)','Inicio UTC','Fin UTC','Distancia km','Extremo referencia','Distancia desde A km','Distancia desde B km','Longitud GIS km','Precision km','Latitud estimada','Longitud estimada','Latitud confirmada','Longitud confirmada','Afectacion operacional','Observaciones']];
        const num=v=>gv22Numero(v)?Number(v):null;
        for(const r of [...registros].sort((a,b)=>Date.parse(b.fechaHoraInicio||b.fechaHora)-Date.parse(a.fechaHoraInicio||a.fechaHora))){const h=gv22Horas(r,ahora);historia.push([r.id,r.nombreLinea,r.idActivo||'',r.fechaHoraFin?'Cerrada':'Activa',gv22FechaVisible(r.fechaHoraInicio||r.fechaHora),gv22FechaVisible(r.fechaHoraFin),h===null?null:gv22Red(h),r.fechaHoraInicio||r.fechaHora,r.fechaHoraFin||'',num(r.distanciaIndicadaKm),r.extremoReferencia==='B'?(r.nombreExtremoB||'B'):(r.nombreExtremoA||'A'),num(r.distanciaDesdeAKm),num(r.distanciaDesdeBKm),num(r.longitudTotalKm),num(r.precisionKm),num(r.latitud),num(r.longitud),num(r.ubicacionConfirmada?.latitud),num(r.ubicacionConfirmada?.longitud),r.afectacionOperacional||'',r.observaciones||'']);}
        const {total,filas}=gv22Indicadores(registros,ahora);
        const estad=[['Linea','ID activo','Eventos','Activas','Cerradas','Horas cerradas acumuladas','Horas activas al corte','Duracion media cerradas h (MTTR op.)','Eventos adicionales','Duraciones invalidas']];
        for(const g of [total,...filas]) estad.push([g.nombre,g.id,g.eventos,g.activas,g.cerradas,gv22Red(g.horasC),gv22Red(g.horasA),g.validasC?gv22Red(g.horasC/g.validasC):null,g===total?null:Math.max(0,g.eventos-1),g.invalidas]);
        const notas=[['Concepto','Definicion'],['Corte UTC',new Date(ahora).toISOString()],['Alcance','Todos los registros guardados en este navegador, sin aplicar filtros.'],['Horas cerradas','Suma de duraciones validas de eventos cerrados; no descuenta simultaneidad.'],['Horas activas','Tiempo transcurrido hasta el corte, separado de las horas cerradas.'],['MTTR operacional','Promedio inicio-fin de eventos cerrados con duracion valida. No es necesariamente tiempo efectivo de reparacion.'],['Eventos adicionales','Numero de eventos posteriores al primero en cada grupo; no acredita misma causa.'],['Agrupacion','Por ID de activo; si no existe, por nombre de linea. Un mismo nombre con ID faltante puede quedar separado.'],['Fechas','Chile continental (America/Santiago) y UTC ISO 8601.'],['Duraciones invalidas','Excluidas del calculo de horas y promedios.']];
        const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
        return gv22Zip({
            '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+[1,2,3].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
            '_rels/.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
            'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Historial" sheetId="1" r:id="rId1"/><sheet name="Indicadores" sheetId="2" r:id="rId2"/><sheet name="Criterios" sheetId="3" r:id="rId3"/></sheets></workbook>`,
            'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1,2,3].map(i=>`<Relationship Id="rId${i}" Type="${rel}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId4" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
            'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14334F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
            'xl/worksheets/sheet1.xml':gv22Hoja(historia,[28,42,17,14,30,30,24,30,30,16,28,23,23,20,15,20,20,20,20,55,65]),
            'xl/worksheets/sheet2.xml':gv22Hoja(estad,[42,18,12,12,12,30,26,38,23,24]),
            'xl/worksheets/sheet3.xml':gv22Hoja(notas,[28,110])
        });
    }
    function gv22AbrirEstadisticas(){
        const {registros}=gv22Leer();const ahora=Date.now();const {total,filas}=gv22Indicadores(registros,ahora);
        document.getElementById('gv22-estadisticas')?.remove();
        const d=document.createElement('dialog');d.id='gv22-estadisticas';d.style.cssText='width:min(980px,94vw);max-height:85vh;padding:18px;border:1px solid #cbd5e1;border-radius:14px;background:white;color:#0f172a;box-sizing:border-box;';
        d.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font-size:18px">Estadisticas de fallas</strong><button type="button" data-cerrar aria-label="Cerrar">X</button></div><p data-resumen></p><div style="overflow:auto;max-height:55vh"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead></thead><tbody></tbody></table></div><p style="font-size:12px;color:#475569">MTTR operacional: promedio inicio-fin de fallas cerradas. Las horas activas se muestran por separado. No se descuentan eventos simultaneos. Eventos adicionales no implican repeticion de la misma causa. Historial completo local.</p>';
        const fmt=v=>v.toLocaleString('es-CL',{maximumFractionDigits:2});
        d.querySelector('[data-resumen]').textContent=`${total.eventos} eventos | ${total.activas} activas | ${total.cerradas} cerradas | ${fmt(total.horasC)} h cerradas | ${fmt(total.horasA)} h activas al corte`;
        const encabezado=document.createElement('tr');
        for(const t of ['Linea / ID','Eventos','Activas','Cerradas','Horas cerradas','Horas activas','MTTR op. h','Adicionales','Sin duracion']){const th=document.createElement('th');th.textContent=t;th.style.cssText='background:#14334f;color:white;padding:9px;text-align:left;position:sticky;top:0';encabezado.append(th);}
        d.querySelector('thead').append(encabezado);
        for(const g of filas){const tr=document.createElement('tr');for(const v of [g.nombre+(g.id?' / '+g.id:''),g.eventos,g.activas,g.cerradas,fmt(g.horasC),fmt(g.horasA),g.validasC?fmt(g.horasC/g.validasC):'—',Math.max(0,g.eventos-1),g.invalidas]){const td=document.createElement('td');td.textContent=v;td.style.cssText='padding:9px;border-bottom:1px solid #e2e8f0';tr.append(td);}d.querySelector('tbody').append(tr);}
        d.querySelector('[data-cerrar]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();
    }
    function gv22InstalarPanel(panel){
        if(panel.querySelector('#gv22-herramientas'))return;
        const tools=document.createElement('div');tools.id='gv22-herramientas';tools.style.cssText='padding:8px 14px;border-bottom:1px solid #e2e8f0;';
        tools.innerHTML='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px"><button type="button" data-xlsx>Exportar Excel</button><button type="button" data-stats>Estadisticas</button><button type="button" data-backup>Crear respaldo</button><button type="button" data-import>Importar respaldo</button></div><input type="file" accept=".json,application/json" hidden><small data-estado role="status" aria-live="polite" style="display:block;color:#475569;font-size:11px;margin-top:6px;overflow-wrap:anywhere">Historial local. Exporta o respalda todos los registros.</small>';
        for(const b of tools.querySelectorAll('button'))b.style.cssText='min-height:32px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#14334f;font-weight:700;font-size:11px;cursor:pointer;';
        const estado=tools.querySelector('[data-estado]');const file=tools.querySelector('input');
        const ejecutar=f=>{try{f();}catch(e){estado.textContent='Error: '+e.message;}};
        tools.querySelector('[data-xlsx]').onclick=()=>ejecutar(()=>{const {registros}=gv22Leer();gv22Descargar(gv22ExcelBlob(registros),gv22Nombre('GridVision-historial-fallas','xlsx'));estado.textContent='Excel generado: '+registros.length+' registros.';});
        tools.querySelector('[data-backup]').onclick=()=>ejecutar(()=>{estado.textContent='Respaldo generado: '+gv22Respaldo()+' registros y geometrias.';});
        tools.querySelector('[data-stats]').onclick=()=>ejecutar(gv22AbrirEstadisticas);
        tools.querySelector('[data-import]').onclick=()=>{file.value='';file.click();};
        file.onchange=async()=>{try{await gv22Importar(file.files[0],estado);}catch(e){estado.textContent='Error: '+e.message;}finally{file.value='';}};
        const filtros=panel.querySelector('.gv-fallas-filtros');if(!filtros)throw new Error('Panel de fallas incompatible');panel.insertBefore(tools,filtros);
        panel.style.display='flex';panel.style.flexDirection='column';
        for(const child of panel.children)child.style.flexShrink='0';
        const historial=panel.querySelector('#lista-fallas-guardadas-gridvision');
        if(historial){historial.style.flex='1 1 auto';historial.style.minHeight='0';historial.style.maxHeight='none';}
    }
    // Marcador de version para evitar instalaciones duplicadas.
    // GV_FALLAS_V22_INSTALADO

    const gv23DB = 'gridvision_evidencias_fallas_v1';
    const gv23Store = 'archivos';
    const gv23MiB = 1024 * 1024;
    const gv23MaxFile = 20 * gv23MiB;
    const gv23MaxTotal = 60 * gv23MiB;
    const gv23MaxCount = 500;
    const gv23Ext = /\.(jpe?g|png|webp|gif|heic|heif|pdf|ser|txt|log|csv|cfg|dat|hdr|inf|cff|comtrade|zip|xlsx)$/i;
    const gv23RecordId = /^GV-FLT-\d{8}-\d{6}(?:-\d+)?$/;
    const gv23FileId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    let gv23DBPromise;

    function gv23Open() {
        if (!gv23DBPromise) {
            gv23DBPromise = new Promise((resolve,reject) => {
                if (!window.indexedDB) {reject(new Error('IndexedDB no disponible en este navegador.'));return;}
                const req = indexedDB.open(gv23DB,1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(gv23Store)) db.createObjectStore(gv23Store,{keyPath:'id'});
                };
                req.onerror = () => reject(req.error || new Error('No fue posible abrir las evidencias.'));
                req.onblocked = () => reject(new Error('Cierra otras pestañas de GridVision y vuelve a intentar.'));
                req.onsuccess = () => {
                    const db=req.result;
                    db.onversionchange=()=>{db.close();gv23DBPromise=null;};
                    resolve(db);
                };
            }).catch(e=>{gv23DBPromise=null;throw e;});
        }
        return gv23DBPromise;
    }
    async function gv23All() {
        const db=await gv23Open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction(gv23Store,'readonly');
            const req=tx.objectStore(gv23Store).getAll();
            tx.oncomplete=()=>resolve(req.result);
            tx.onabort=tx.onerror=()=>reject(tx.error || req.error || new Error('No se pudieron leer los archivos.'));
        });
    }
    function gv23NombreSeguro(nombre) {
        return String(nombre??'').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').trim().slice(0,220);
    }
    function gv23Identidad(r) {
        return {nombreLinea:String(r?.nombreLinea||''),idActivo:String(r?.idActivo||''),inicio:String(r?.fechaHoraInicio||r?.fechaHora||'')};
    }
    function gv23Coincide(a,b) {
        if (!a || !b) return false;
        if (a.idActivo && b.idActivo ? a.idActivo!==b.idActivo : a.nombreLinea!==b.nombreLinea) return false;
        // La fecha permite detectar colisiones de ID entre computadores.
        return a.inicio===b.inicio;
    }
    function gv23Id() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const bytes=crypto.getRandomValues(new Uint8Array(16));
        bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const h=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
        return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
    async function gv23Add(items) {
        const db=await gv23Open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction(gv23Store,'readwrite');
            const store=tx.objectStore(gv23Store);
            const req=store.getAll();let resultado={nuevos:0,omitidos:0},error=null;
            req.onsuccess=()=>{
                try {
                    const existentes=req.result;
                    const ids=new Set(existentes.map(x=>x.id));
                    const nuevos=[];
                    for(const item of items){if(ids.has(item.id)){resultado.omitidos++;continue;}ids.add(item.id);nuevos.push(item);}
                    const total=existentes.reduce((s,x)=>s+x.blob.size,0)+nuevos.reduce((s,x)=>s+x.blob.size,0);
                    if(total>gv23MaxTotal || existentes.length+nuevos.length>gv23MaxCount)
                        throw new Error('Límite local de evidencias: 60 MiB o 500 archivos. Descarga un respaldo y libera espacio.');
                    for(const item of nuevos) store.add(item);
                    resultado.nuevos=nuevos.length;
                } catch(e){error=e;tx.abort();}
            };
            tx.oncomplete=()=>resolve(resultado);
            tx.onabort=()=>reject(error||tx.error||new Error('No se pudieron guardar los archivos. Revisa el espacio disponible.'));
            tx.onerror=()=>{};
        });
    }
    async function gv23Delete(id) {
        const db=await gv23Open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction(gv23Store,'readwrite');
            tx.objectStore(gv23Store).delete(id);
            tx.oncomplete=()=>resolve();
            tx.onabort=()=>reject(tx.error||new Error('No se pudo eliminar.'));
        });
    }
    function gv23Size(n){return n<1024?`${n} B`:n<gv23MiB?`${(n/1024).toFixed(1)} KiB`:`${(n/gv23MiB).toFixed(2)} MiB`;}
    function gv23Boton(titulo,fn){
        const b=document.createElement('button');b.type='button';b.textContent=titulo;
        b.style.cssText='padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#14334f;font:inherit;font-weight:650;cursor:pointer;';
        b.addEventListener('click',fn);return b;
    }
    function gv23DescargarArchivo(item){
        // Nunca ejecutar ni abrir un documento técnico como HTML.
        gv22Descargar(new Blob([item.blob],{type:'application/octet-stream'}),item.nombre);
    }
    function gv23Fila(item,estado,recargar,global,registro){
        const box=document.createElement('div');box.style.cssText='display:grid;gap:6px;padding:8px;border:1px solid #dbe3ee;border-radius:8px;background:white;color:#14334f;';
        const t=document.createElement('strong');t.textContent=item.nombre;t.style.overflowWrap='anywhere';
        const m=document.createElement('small');
        m.textContent=[gv23Size(item.blob.size),gv22FechaVisible(item.creado),...(global?[item.fallaId,registro?registro.nombreLinea:'Registro no disponible · evidencia conservada']:[])].filter(Boolean).join(' · ');
        const acciones=document.createElement('div');acciones.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
        if(/\.(jpe?g|png|webp|gif)$/i.test(item.nombre)){
            const vista=gv23Boton('Ver foto',()=>{
                if(box.querySelector('img')){const img=box.querySelector('img');URL.revokeObjectURL(img.src);img.remove();vista.textContent='Ver foto';return;}
                const ext=item.nombre.split('.').pop().toLowerCase();
                const mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':`image/${ext}`;
                const img=document.createElement('img');img.alt=item.nombre;
                img.style.cssText='max-height:220px;max-width:100%;object-fit:contain;border-radius:6px;';
                const url=URL.createObjectURL(new Blob([item.blob],{type:mime}));img.src=url;
                img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>{URL.revokeObjectURL(url);img.remove();vista.textContent='Ver foto';estado.textContent='No se pudo visualizar esta imagen.';};
                box.append(img);vista.textContent='Ocultar foto';
            });acciones.append(vista);
        }
        acciones.append(gv23Boton('Descargar',()=>gv23DescargarArchivo(item)));
        const borrar=gv23Boton('Eliminar',async()=>{
            if(!window.confirm(`¿Eliminar la evidencia ${item.nombre}? Descarga una copia si la necesitas.`))return;
            borrar.disabled=true;
            try{await gv23Delete(item.id);await recargar();estado.textContent='Evidencia eliminada.';}
            catch(e){estado.textContent='Error: '+e.message;borrar.disabled=false;}
        });borrar.style.color='#b91c1c';acciones.append(borrar);
        box.append(t,m,acciones);return box;
    }
    async function gv23Adjuntar(registro,archivos){
        if(!gv23RecordId.test(registro?.id||'') || !leerFallasGuardadas().some(r=>r.id===registro.id))throw new Error('Guarda primero el registro operacional.');
        const seleccion=[...archivos];
        if(!seleccion.length)return {nuevos:0,omitidos:0};
        const items=[];
        for(const f of seleccion){
            const nombre=gv23NombreSeguro(f.name);
            if(!gv23Ext.test(nombre))throw new Error(`Formato no admitido: ${nombre}. Para otros formatos, utiliza ZIP.`);
            if(!f.size||f.size>gv23MaxFile)throw new Error(`Archivo vacío o superior a 20 MiB: ${nombre}.`);
            items.push({id:gv23Id(),fallaId:registro.id,nombre,creado:new Date().toISOString(),identidad:gv23Identidad(registro),blob:f.slice(0,f.size,'application/octet-stream')});
        }
        return gv23Add(items);
    }
    async function gv23Editor(fondo,registro,esNuevo){
        const host=fondo.querySelector('#gv23-editor-evidencias');if(!host)return;
        host.replaceChildren();const clave=Symbol();host._gv23Clave=clave;
        fondo._gv23Pendientes=[];fondo._gv23Guardando=false;
        const guardar=fondo.querySelector('#guardar-editor-falla');
        const titulo=document.createElement('strong');titulo.textContent='📎 Evidencias técnicas';host.append(titulo);
        const nota=document.createElement('small');nota.textContent='Adjunta fotografías, PDF, SER, COMTRADE o ZIP. Los archivos nuevos se guardan al confirmar el registro. Máximo 20 MiB por archivo.';host.append(nota);
        const estado=document.createElement('div');estado.setAttribute('role','status');
        const lista=document.createElement('div');lista.style.cssText='display:grid;gap:6px;';
        const pendientes=document.createElement('div');pendientes.style.cssText='display:grid;gap:6px;';
        const input=document.createElement('input');input.type='file';input.multiple=true;input.hidden=true;
        input.accept='.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.ser,.txt,.log,.csv,.cfg,.dat,.hdr,.inf,.cff,.comtrade,.zip,.xlsx';
        const adjuntar=gv23Boton('＋ Adjuntar archivos',()=>{if(!fondo._gv23Guardando){input.value='';input.click();}});
        const renderPendientes=()=>{
            if(host._gv23Clave!==clave)return;
            pendientes.replaceChildren();
            const seleccion=fondo._gv23Pendientes||[];
            if(guardar)guardar.textContent=seleccion.length?'💾 Guardar registro y evidencias':'💾 Guardar registro';
            for(const f of seleccion){
                const fila=document.createElement('div');fila.style.cssText='display:flex;gap:8px;justify-content:space-between;align-items:center;padding:8px;border:1px dashed #0f766e;border-radius:8px;background:#f0fdfa;color:#134e4a;';
                const info=document.createElement('div');info.style.cssText='min-width:0;overflow-wrap:anywhere;';
                const nombre=document.createElement('strong');nombre.textContent=f.name;
                const detalle=document.createElement('small');detalle.style.display='block';detalle.textContent=gv23Size(f.size)+' · Pendiente de guardar';info.append(nombre,detalle);
                const quitar=gv23Boton('Quitar',()=>{if(fondo._gv23Guardando)return;fondo._gv23Pendientes=fondo._gv23Pendientes.filter(x=>x!==f);renderPendientes();estado.textContent='Selección actualizada.';});
                fila.append(info,quitar);pendientes.append(fila);
            }
        };
        fondo._gv23RenderPendientes=renderPendientes;
        const recargar=async()=>{
            const archivos=esNuevo?[]:(await gv23All()).filter(x=>x.fallaId===registro.id);
            if(host._gv23Clave!==clave)return;
            lista.replaceChildren();
            for(const a of archivos.sort((a,b)=>b.creado.localeCompare(a.creado)))lista.append(gv23Fila(a,estado,recargar,false,registro));
            if(!archivos.length){const sin=document.createElement('small');sin.textContent='Sin evidencias guardadas.';lista.append(sin);}
        };
        input.onchange=()=>{
            const archivos=[...input.files];input.value='';if(!archivos.length)return;
            if(host._gv23Clave!==clave||fondo.hidden||fondo.dataset.registro!==registro.id||fondo._gv23Guardando)return;
            try{
                const seleccion=[...(fondo._gv23Pendientes||[])];
                for(const f of archivos){
                    const nombre=gv23NombreSeguro(f.name);
                    if(!gv23Ext.test(nombre))throw new Error(`Formato no admitido: ${nombre}. Para otros formatos, utiliza ZIP.`);
                    if(!f.size||f.size>gv23MaxFile)throw new Error(`Archivo vacío o superior a 20 MiB: ${nombre}.`);
                    if(!seleccion.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))seleccion.push(f);
                }
                if(seleccion.length>gv23MaxCount||seleccion.reduce((s,f)=>s+f.size,0)>gv23MaxTotal)throw new Error('La selección supera 60 MiB o 500 archivos.');
                fondo._gv23Pendientes=seleccion;renderPendientes();estado.textContent=`${seleccion.length} archivo(s) pendiente(s) de guardar.`;
            }catch(e){estado.textContent='Error: '+e.message;}
        };
        host.append(adjuntar,input,estado,pendientes,lista);renderPendientes();
        try{await recargar();}catch(e){estado.textContent='No se pudieron leer evidencias guardadas: '+e.message;}
    }
    async function gv231GuardarPendientes(fondo,registro){
        const archivos=[...(fondo._gv23Pendientes||[])];
        if(!archivos.length)return 0;
        if(fondo._gv23Guardando)throw new Error('Ya se están guardando evidencias.');
        fondo._gv23Guardando=true;
        const controles=[...fondo.querySelectorAll('button,input,textarea,select')].map(c=>[c,c.disabled]);
        for(const [c] of controles)c.disabled=true;
        const boton=fondo.querySelector('#guardar-editor-falla');
        if(boton)boton.textContent='Guardando evidencias…';
        try{
            const r=await gv23Adjuntar(registro,archivos);
            fondo._gv23Pendientes=[];
            return r.nuevos;
        }finally{
            fondo._gv23Guardando=false;
            for(const [c,anterior] of controles)c.disabled=anterior;
            fondo._gv23RenderPendientes?.();
        }
    }
    // GV_FALLAS_V231_EDICION_INTEGRADA
    function gv23Base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
    function gv23Decodificar(base64,tamano){
        if(typeof base64!=='string'||!Number.isInteger(tamano)||tamano<1||tamano>gv23MaxFile||base64.length!==4*Math.ceil(tamano/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('Contenido de archivo inválido.');
        const bin=atob(base64);if(bin.length!==tamano)throw new Error('Tamaño de archivo incorrecto.');
        const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        return new Blob([bytes],{type:'application/octet-stream'});
    }
    async function gv23Exportar(){
        const archivos=await gv23All();const registros=new Map(leerFallasGuardadas().map(r=>[r.id,r]));
        const salida={formato:'gridvision-evidencias',version:1,exportadoEn:new Date().toISOString(),archivos:[]};
        for(const a of archivos){const actual=registros.get(a.fallaId);salida.archivos.push({id:a.id,fallaId:a.fallaId,nombre:a.nombre,creado:a.creado,identidad:actual?gv23Identidad(actual):a.identidad,tamano:a.blob.size,base64:await gv23Base64(a.blob)});}
        gv22Descargar(new Blob([JSON.stringify(salida)],{type:'application/json'}),gv22Nombre('GridVision-respaldo-evidencias','json'));
        return archivos.length;
    }
    async function gv23Importar(file){
        if(!file)return null;
        if(file.size>90*gv23MiB)throw new Error('Respaldo superior a 90 MiB.');
        const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
        if(data?.formato!=='gridvision-evidencias'||data.version!==1||!Array.isArray(data.archivos)||data.archivos.length>gv23MaxCount)throw new Error('Archivo incompatible: utiliza el respaldo de evidencias V2.3.');
        const registros=new Map(leerFallasGuardadas().map(r=>[r.id,r]));
        const items=[],ids=new Set();let sinRegistro=0,conflictos=0,tamano=0;
        for(const a of data.archivos){
            if(!a||typeof a.id!=='string'||!gv23FileId.test(a.id)||ids.has(a.id)||typeof a.fallaId!=='string'||!gv23RecordId.test(a.fallaId)||typeof a.nombre!=='string'||gv23NombreSeguro(a.nombre)!==a.nombre||!gv23Ext.test(a.nombre)||!gv22Fecha(a.creado)||typeof a.identidad?.nombreLinea!=='string'||typeof a.identidad?.idActivo!=='string'||typeof a.identidad?.inicio!=='string')throw new Error('Metadatos de evidencia inválidos.');
            if(!Number.isInteger(a.tamano)||a.tamano<1||a.tamano>gv23MaxFile)throw new Error('Tamaño de evidencia inválido.');
            ids.add(a.id);tamano+=a.tamano;if(tamano>gv23MaxTotal)throw new Error('El respaldo supera 60 MiB de archivos.');
            const r=registros.get(a.fallaId);
            if(!r){sinRegistro++;continue;}
            if(!gv23Coincide(a.identidad,gv23Identidad(r))){conflictos++;continue;}
            items.push({id:a.id,fallaId:a.fallaId,nombre:a.nombre,creado:a.creado,identidad:gv23Identidad(r),blob:gv23Decodificar(a.base64,a.tamano)});
        }
        if(!window.confirm(`Importar hasta ${items.length} evidencia(s).\nSin falla asociada: ${sinRegistro}. Identidad de falla distinta: ${conflictos}.\nLos ID de archivo existentes no se sobrescriben. ¿Continuar?`))return null;
        return {...await gv23Add(items),sinRegistro,conflictos};
    }
    function gv23AbrirGestor(){
        if(document.getElementById('gv23-gestor'))return;
        const d=document.createElement('dialog');d.id='gv23-gestor';d.style.cssText='width:min(700px,94vw);max-height:86vh;border:1px solid #cbd5e1;border-radius:14px;padding:16px;box-sizing:border-box;color:#0f172a;background:white;';
        const cab=document.createElement('div');cab.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;';
        const h=document.createElement('strong');h.textContent='📎 Evidencias técnicas';h.style.fontSize='18px';cab.append(h,gv23Boton('Cerrar',()=>d.close()));
        const p=document.createElement('p');p.style.cssText='font-size:13px;color:#475569;';p.textContent='Archivos locales de todas las fallas. El respaldo de evidencias es independiente del JSON histórico: conserva ambos. Los archivos de fallas eliminadas se conservan aquí hasta que los elimines expresamente.';
        const estado=document.createElement('p');estado.setAttribute('role','status');estado.style.fontSize='12px';
        const lista=document.createElement('div');lista.style.cssText='display:grid;gap:7px;overflow:auto;max-height:48vh;';
        const barra=document.createElement('div');barra.style.cssText='display:flex;flex-wrap:wrap;gap:6px;';
        const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
        const recargar=async()=>{
            const archivos=await gv23All();const registros=new Map(leerFallasGuardadas().map(r=>[r.id,r]));
            lista.replaceChildren();for(const a of archivos.sort((a,b)=>b.creado.localeCompare(a.creado)))lista.append(gv23Fila(a,estado,recargar,true,registros.get(a.fallaId)));
            if(!archivos.length){const sin=document.createElement('p');sin.textContent='No hay evidencias guardadas.';lista.append(sin);}
            estado.textContent=`${archivos.length} archivo(s) · ${gv23Size(archivos.reduce((s,x)=>s+x.blob.size,0))} / 60 MiB.`;
        };
        const respaldo=gv23Boton('Descargar respaldo',async()=>{
            respaldo.disabled=true;estado.textContent='Preparando respaldo…';
            try{estado.textContent=`Respaldo descargado: ${await gv23Exportar()} archivo(s).`;}catch(e){estado.textContent='Error: '+e.message;}finally{respaldo.disabled=false;}
        });
        const importar=gv23Boton('Importar evidencias',()=>{input.value='';input.click();});
        input.onchange=async()=>{
            if(!input.files.length)return;importar.disabled=true;estado.textContent='Validando respaldo…';
            try{const r=await gv23Importar(input.files[0]);await recargar();estado.textContent=r?`Importadas: ${r.nuevos}; repetidas: ${r.omitidos}; sin falla: ${r.sinRegistro}; conflicto de identidad: ${r.conflictos}.`:'Importación cancelada.';}
            catch(e){estado.textContent='Error: '+e.message;}finally{importar.disabled=false;input.value='';}
        };
        barra.append(respaldo,importar,input);d.append(cab,p,barra,estado,lista);document.body.append(d);
        d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();recargar().catch(e=>estado.textContent='Error: '+e.message);
    }
    function gv23InstalarPanel(panel){
        const tools=panel.querySelector('#gv22-herramientas');if(!tools||tools.querySelector('#gv23-evidencias'))return;
        const b=gv23Boton('📎 Evidencias técnicas',gv23AbrirGestor);b.id='gv23-evidencias';b.style.cssText+='width:100%;margin-top:6px;font-size:12px;min-height:33px;';
        tools.append(b);
    }
    // GV_FALLAS_V23_INSTALADO

function abrirPanelFallasGuardadas() {
    gvRegistroDesdeHistorial = false;
    const panel = asegurarPanelFallasGuardadas();
    gv22InstalarPanel(panel);
    gv23InstalarPanel(panel);
    panel.hidden = false;
    renderizarFallasGuardadas();
}

function cerrarPanelFallasGuardadas() {
    const panel = document.getElementById(
        "panel-fallas-guardadas-gridvision"
    );

    if (panel) {
        panel.hidden = true;
    }
}

function construirDatosCompartirRegistro(registro) {
    if(!registro)return null;
    const estado=estadoRegistroFalla(registro);
    const lineas=[`Falla GridVision: ${registro.id}`,`Estado: ${estado==='cerrada'?'CERRADA':'ACTIVA'}`,`Linea: ${registro.nombreLinea||'Linea sin nombre'}`,`Inicio: ${formatearFechaHoraFalla(registro.fechaHoraInicio||registro.fechaHora)}`];
    if(registro.fechaHoraFin)lineas.push(`Fin: ${formatearFechaHoraFalla(registro.fechaHoraFin)}`,`Duracion: ${formatearDuracionFalla(registro)}`);
    if(registro.afectacionOperacional)lineas.push('','Afectacion operacional:',registro.afectacionOperacional);
    function agregarUbicacion(punto,tipo){
        const url=gv232EnlaceFalla({latitud:punto?.latitud,longitud:punto?.longitud,nombreLinea:registro.nombreLinea,idActivo:registro.idActivo,idEvento:registro.id,tipo});
        if(!url)return false;
        const coord=`${Number(punto.latitud).toFixed(14)},${Number(punto.longitud).toFixed(14)}`;
        lineas.push('',tipo==='confirmada'?'Ubicacion confirmada en terreno:':'Ubicacion estimada por proteccion:','Google Maps:','https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coord),'GridVision (pin de falla):',url);
        return true;
    }
    const estimada=agregarUbicacion(registro,'estimada');
    if(!estimada)lineas.push('','Ubicacion estimada por proteccion: pendiente de localizacion');
    const confirmada=agregarUbicacion(registro.ubicacionConfirmada,'confirmada');
    if(registro.observaciones)lineas.push('','Observaciones:',registro.observaciones);
    if(!estimada&&!confirmada&&registro.idActivo){
        const local=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
        const url=new URL(local?'./index.html':'https://ecastilloluengo.github.io/gridvision-piloto-publico/',window.location.href);
        url.search='';url.hash='';url.searchParams.set('activo',registro.idActivo);
        lineas.push('','Abrir linea en GridVision (sin punto de falla):',url.href);
    }
    return {titulo:'Falla guardada · GridVision',texto:lineas.join('\n')};
}

async function compartirRegistroFalla(idRegistro) {
    const registro = leerFallasGuardadas()
        .find((item) => item.id === idRegistro);

    const datos = construirDatosCompartirRegistro(registro);

    if (!datos) {
        mostrarMensajeLocalizador(
            "No fue posible preparar esta falla para compartir.",
            false
        );
        return;
    }

    try {
        if (navigator.share) {
            await navigator.share({
                title: datos.titulo,
                text: datos.texto
            });
            return;
        }

        await copiarTexto(datos.texto);
        window.alert("Ubicación de la falla copiada al portapapeles.");
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }

        try {
            await copiarTexto(datos.texto);
            window.alert("Ubicación de la falla copiada al portapapeles.");
        } catch {
            window.alert("No fue posible compartir esta falla.");
        }
    }
}

function construirResultadoDesdeRegistro(registro) {
    return {
        disponible: true,
        nombreLinea: registro.nombreLinea || "Línea sin nombre",
        nombreExtremoA: registro.nombreExtremoA || "Extremo A",
        nombreExtremoB: registro.nombreExtremoB || "Extremo B",
        extremoReferencia: registro.extremoReferencia || "A",
        longitudTotalKm: Number(registro.longitudTotalKm) || 0,
        distanciaDesdeAKm: Number(registro.distanciaDesdeAKm) || 0,
        distanciaDesdeBKm: Number(registro.distanciaDesdeBKm) || 0,
        precisionKm: Number(registro.precisionKm) || 0,
        coordenadas: [
            Number(registro.longitud),
            Number(registro.latitud)
        ],
        _registroGuardadoId: registro.id,
        _idActivoGuardado: registro.idActivo || null,
        _estadoGuardado: registro.estado || "activa"
    };
}

function verFallaGuardadaEnMapa(idRegistro) {
    const registro = leerFallasGuardadas()
        .find((item) => item.id === idRegistro);

    if (!registro) {
        window.alert("Esta falla ya no existe en el registro local.");
        renderizarFallasGuardadas();
        return;
    }

    const mapa = obtenerMapaGridVision();

    if (!mapa) {
        window.alert("El mapa de GridVision todavía no está disponible.");
        return;
    }

    if (!posicionFallaActiva(registro)) {
        window.alert("La ubicación de esta falla sigue pendiente. Edita el registro para agregarla.");
        return;
    }
    eliminarMarcadorFalla();
    mapaLocalizador = mapa;
    if (coordenadasFallaValidas(registro)) {
        ultimoResultadoFalla = construirResultadoDesdeRegistro(registro);
        dibujarMarcadorFalla(ultimoResultadoFalla);
    }

    if (marcadorFallaConfirmada) {
        mapa.removeLayer(marcadorFallaConfirmada);
        marcadorFallaConfirmada = null;
    }

    const confirmada = registro.ubicacionConfirmada;

    if (
        coordenadasFallaValidas(confirmada)
    ) {
        const latConfirmada = Number(confirmada.latitud);
        const lngConfirmada = Number(confirmada.longitud);

        const iconoConfirmado = L.divIcon({
            className: "gv-icono-falla-confirmada",
            html: `
                <div style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#059669;color:white;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.28);font-size:18px;">✓</div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -20]
        });

        marcadorFallaConfirmada = L.marker(
            [latConfirmada, lngConfirmada],
            {
                icon: iconoConfirmado,
                title: "Ubicación confirmada en terreno",
                zIndexOffset: 1600
            }
        ).addTo(mapa);

        marcadorFallaConfirmada.bindPopup(`
            <div class="popup-gridvision">
                <h3>✓ Falla confirmada en terreno</h3>
                <p><strong>${escaparHtml(registro.id)}</strong></p>
                <p>Coordenadas: ${latConfirmada.toFixed(6)}, ${lngConfirmada.toFixed(6)}</p>
                ${confirmada.precisionM ? `<p>Precisión GPS: ± ${Math.round(confirmada.precisionM)} m</p>` : ""}
            </div>
        `);

        mapa.fitBounds(
            L.latLngBounds([
                posicionFallaActiva(registro),
                [latConfirmada, lngConfirmada]
            ]),
            {
                padding: [45, 45],
                maxZoom: 17
            }
        );
    } else {
        mapa.setView(
            [Number(registro.latitud), Number(registro.longitud)],
            Math.max(15, mapa.getZoom?.() || 15)
        );
    }

    cerrarPanelFallasGuardadas();
}

function cambiarEstadoFallaGuardada(idRegistro) {
    const registros = leerFallasGuardadas();
    const registro = registros.find(
        (item) => item.id === idRegistro
    );

    if (!registro) {
        return;
    }

    registro.estado = registro.estado === "cerrada"
        ? "activa"
        : "cerrada";

    registro.fechaActualizacion = new Date().toISOString();

    escribirFallasGuardadas(registros);
    actualizarAccesoFallasGuardadas();
    renderizarFallasGuardadas();
}

function eliminarFallaGuardada(idRegistro) {
    const registros = leerFallasGuardadas();
    const registro = registros.find(
        (item) => item.id === idRegistro
    );

    if (!registro) {
        return;
    }

    const confirmar = window.confirm(
        `¿Eliminar definitivamente ${registro.id}?\n\n`
        + "Esto borra el registro guardado en este navegador."
    );

    if (!confirmar) {
        return;
    }

    const nuevos = registros.filter(
        (item) => item.id !== idRegistro
    );

    escribirFallasGuardadas(nuevos);

    if (
        ultimoResultadoFalla?._registroGuardadoId
        === idRegistro
    ) {
        ultimoResultadoFalla._registroGuardadoId = null;
        actualizarBotonGuardarFalla();
    }

    actualizarAccesoFallasGuardadas();
    renderizarFallasGuardadas();
    limpiarMarcadoresTemporalesDeRegistro(idRegistro);
    sincronizarMarcadoresFallasActivas();
}

function borrarTodasFallasGuardadas() {
    const registros = leerFallasGuardadas();

    if (registros.length === 0) {
        return;
    }

    const confirmar = window.confirm(
        `¿Borrar las ${registros.length} fallas guardadas?\n\n`
        + "Úsalo para limpiar fallas de prueba. Esta acción no se puede deshacer."
    );

    if (!confirmar) {
        return;
    }

    localStorage.removeItem(CLAVE_FALLAS_GUARDADAS);

    if (ultimoResultadoFalla?._registroGuardadoId) {
        ultimoResultadoFalla._registroGuardadoId = null;
        actualizarBotonGuardarFalla();
    }

    actualizarAccesoFallasGuardadas();
    renderizarFallasGuardadas();

    for (const id of [...marcadoresFallasActivas.keys()]) {
        quitarMarcadorFallaActiva(id);
    }
}

function renderizarFallasGuardadas() {
    const panel = document.getElementById(
        "panel-fallas-guardadas-gridvision"
    );

    if (!panel) {
        return;
    }

    const lista = panel.querySelector(
        "#lista-fallas-guardadas-gridvision"
    );
    const resumen = panel.querySelector(
        "#resumen-fallas-guardadas"
    );
    const borrarTodas = panel.querySelector(
        "#borrar-todas-fallas-guardadas"
    );

    if (!lista) {
        return;
    }

    const registros = leerFallasGuardadas();
    const activas = registros.filter(
        (registro) => estadoRegistroFalla(registro) === "activa"
    ).length;
    const cerradas = registros.length - activas;

    if (resumen) {
        resumen.textContent =
            `${registros.length} registro(s) · ${activas} activa(s) · ${cerradas} cerrada(s)`;
    }

    if (borrarTodas) {
        borrarTodas.hidden = registros.length === 0;
    }

    const filtro = panel.dataset.filtro || "todas";
    const visibles = registros
        .filter((registro) => {
            const estado = estadoRegistroFalla(registro);

            if (filtro === "todas") {
                return true;
            }

            return estado === filtro;
        })
        .sort((a, b) =>
            new Date(
                b.fechaHoraInicio || b.fechaHora
            ).getTime()
            - new Date(
                a.fechaHoraInicio || a.fechaHora
            ).getTime()
        );

    if (visibles.length === 0) {
        lista.innerHTML = `
            <div class="gv-fallas-vacio">
                ${registros.length === 0
                    ? "Aún no hay fallas guardadas en este navegador."
                    : "No hay fallas para este filtro."}
            </div>
        `;
        return;
    }

    lista.innerHTML = visibles.map((registro) => {
        const estado = estadoRegistroFalla(registro);
        const cerrada = estado === "cerrada";
        const distancia = numeroFallaDisponible(registro.distanciaIndicadaKm)
            ? `${Number(registro.distanciaIndicadaKm).toFixed(1)} km desde ${registro.extremoReferencia === "B" ? (registro.nombreExtremoB || "Extremo B") : (registro.nombreExtremoA || "Extremo A")}`
            : "Distancia no disponible";

        const inicio = formatearFechaHoraFalla(
            registro.fechaHoraInicio || registro.fechaHora
        );
        const fin = registro.fechaHoraFin
            ? formatearFechaHoraFalla(registro.fechaHoraFin)
            : "—";

        const afectacion = registro.afectacionOperacional
            ? `<div class="gv-falla-afectacion">${escaparHtml(registro.afectacionOperacional)}</div>`
            : "";

        const confirmada = registro.ubicacionConfirmada;
        const textoConfirmada = coordenadasFallaValidas(confirmada)
            ? `<p class="gv-falla-meta gv-falla-confirmada">✓ Ubicación confirmada: ${Number(confirmada.latitud).toFixed(6)}, ${Number(confirmada.longitud).toFixed(6)}</p>`
            : `<p class="gv-falla-meta">Ubicación confirmada: pendiente</p>`;

        return `
            <article class="gv-falla-card" data-id="${escaparHtml(registro.id)}">
                <div class="gv-falla-top">
                    <div class="gv-falla-id">${escaparHtml(registro.id)}</div>
                    <span class="gv-falla-estado ${cerrada ? "cerrada" : "activa"}">
                        ${cerrada ? "🟢 Cerrada" : "🔴 Activa"}
                    </span>
                </div>
                <div class="gv-falla-linea">${escaparHtml(registro.nombreLinea || "Línea sin nombre")}</div>
                <p class="gv-falla-meta"><strong>Inicio:</strong> ${escaparHtml(inicio)}</p>
                <p class="gv-falla-meta"><strong>Fin:</strong> ${escaparHtml(fin)} · <strong>Duración:</strong> ${escaparHtml(formatearDuracionFalla(registro))}</p>
                <p class="gv-falla-meta">📏 ${escaparHtml(distancia)}</p>
                <p class="gv-falla-meta">⚡ ${coordenadasFallaValidas(registro) ? `Estimada: ${Number(registro.latitud).toFixed(6)}, ${Number(registro.longitud).toFixed(6)} · ± ${Number(registro.precisionKm || 0).toFixed(1)} km` : "Ubicación estimada: pendiente"}</p>
                ${textoConfirmada}
                ${afectacion}
                <div class="gv-falla-acciones">
                    <button type="button" data-accion="ver" ${posicionFallaActiva(registro) ? "" : 'disabled title="Ubicación pendiente"'}>📍 Ver en mapa</button>
                    <button type="button" data-accion="compartir">📤 Compartir</button>
                    <button type="button" data-accion="editar">✏️ Editar</button>
                    <button type="button" data-accion="eliminar">🗑 Eliminar</button>
                </div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll(".gv-falla-card")
        .forEach((tarjeta) => {
            const id = tarjeta.dataset.id;

            tarjeta.querySelector('[data-accion="ver"]')
                ?.addEventListener("click", () =>
                    verFallaGuardadaEnMapa(id)
                );

            tarjeta.querySelector('[data-accion="compartir"]')
                ?.addEventListener("click", () =>
                    compartirRegistroFalla(id)
                );

            tarjeta.querySelector('[data-accion="editar"]')
                ?.addEventListener("click", () =>
                    abrirEditorFallaGuardada(id)
                );

            tarjeta.querySelector('[data-accion="eliminar"]')
                ?.addEventListener("click", () =>
                    eliminarFallaGuardada(id)
                );
        });
}

function inicializarGestorFallasGuardadas() {
    const iniciar = () => {
        asegurarAccesoFallasGuardadas();
        actualizarAccesoFallasGuardadas();
        sincronizarMarcadoresFallasActivas();
    };

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

    window.addEventListener("storage", (evento) => {
        if (evento.key === CLAVE_FALLAS_GUARDADAS) {
            actualizarAccesoFallasGuardadas();
            renderizarFallasGuardadas();
            sincronizarMarcadoresFallasActivas();
        }
    });
}

async function cargarPanelLocalizador() {
    if (panelLocalizadorCargado) {
        return;
    }

    const contenedor = elementoLocalizador(
        "contenedor-localizador-fallas"
    );

    if (!contenedor) {
        throw new Error(
            "No existe el contenedor del localizador de fallas."
        );
    }

    const respuesta = await fetch(
    "components/localizador-fallas/localizador-fallas.html",
    {
        cache: "no-store"
    }
);

    if (!respuesta.ok) {
        throw new Error(
            "No fue posible cargar el panel del localizador."
        );
    }

    contenedor.innerHTML = await respuesta.text();
    panelLocalizadorCargado = true;
    asegurarBotonCompartirFalla();
    asegurarAccionesFalla();
    const botonSinDistancia = document.createElement("button");
    botonSinDistancia.type = "button";
    botonSinDistancia.className = "localizador-fallas-boton-secundario";
    botonSinDistancia.textContent = "＋ Registrar falla sin distancia";
    botonSinDistancia.addEventListener("click", abrirRegistroSinDistancia);
    elementoLocalizador("localizar-falla")?.after(botonSinDistancia);

    elementoLocalizador(
        "cerrar-localizador-fallas"
    )?.addEventListener(
        "click",
        cerrarPanelLocalizador
    );
    elementoLocalizador(
    "localizar-falla"
)?.addEventListener(
    "click",
    ejecutarLocalizacion
);
elementoLocalizador(
    "eliminar-falla"
)?.addEventListener(
    "click",
    eliminarMarcadorFalla
);
}
function ejecutarLocalizacion() {
    const mensaje = elementoLocalizador(
        "localizador-fallas-mensaje"
    );
    const resultadoPanel = elementoLocalizador(
        "localizador-fallas-resultado"
    );
    if (
        !lineaSeleccionadaLocalizador
        || !lineaSeleccionadaLocalizador.coordenadas.length
    ) {
        mensaje.textContent =
            "La línea seleccionada no tiene una geometría válida.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const selectorExtremo = elementoLocalizador(
        "localizador-fallas-extremo"
    );

    const entradaDistancia = elementoLocalizador(
        "localizador-fallas-distancia"
    );

    const entradaPrecision = elementoLocalizador(
        "localizador-fallas-precision"
    );

    const extremoReferencia =
        selectorExtremo.value;

    const distanciaInformadaKm =
        Number(entradaDistancia.value);

    const precisionKm =
        Number(entradaPrecision.value);

    if (
        entradaDistancia.value.trim() === ""
        || !Number.isFinite(distanciaInformadaKm)
        || distanciaInformadaKm < 0
    ) {
        mensaje.textContent =
            "Ingresa una distancia de falla válida.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const longitudTotalKm =
        lineaSeleccionadaLocalizador.longitudTotalKm;

    if (distanciaInformadaKm > longitudTotalKm) {
        mensaje.textContent =
            `La distancia ingresada supera la longitud `
            + `GIS de la línea (${longitudTotalKm.toFixed(1)} km).`;

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const resultado = localizarFalla({
        nombreLinea:
            lineaSeleccionadaLocalizador.nombreLinea,

        extremoReferencia,

        nombreExtremoA:
            lineaSeleccionadaLocalizador.nombreExtremoA,

        nombreExtremoB:
            lineaSeleccionadaLocalizador.nombreExtremoB,

        coordenadas:
            lineaSeleccionadaLocalizador.coordenadas,

        distanciaKm:
            distanciaInformadaKm,

        precisionKm
    });

    if (
        !resultado.disponible
        || !resultado.coordenadas
    ) {
        mensaje.textContent =
            "No fue posible calcular la ubicación de la falla.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    mensaje.hidden = true;
    resultadoPanel.hidden = false;

    const [
        longitudFalla,
        latitudFalla
    ] = resultado.coordenadas;

    elementoLocalizador(
        "resultado-falla-linea"
    ).textContent =
        resultado.nombreLinea;

    elementoLocalizador(
        "resultado-distancia-a"
    ).textContent =
        `${resultado.distanciaDesdeAKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-distancia-b"
    ).textContent =
        `${resultado.distanciaDesdeBKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-longitud-total"
    ).textContent =
        `${resultado.longitudTotalKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-coordenadas"
    ).textContent =
        `${latitudFalla.toFixed(6)}, `
        + `${longitudFalla.toFixed(6)}`;

    elementoLocalizador(
        "resultado-precision"
    ).textContent =
        `± ${resultado.precisionKm.toFixed(1)} km`;

    const posicionPorcentaje =
        resultado.longitudTotalKm > 0
            ? (
                resultado.distanciaDesdeAKm
                / resultado.longitudTotalKm
            ) * 100
            : 0;

    elementoLocalizador(
        "resultado-marcador-falla"
    ).style.left =
        `${Math.min(
            100,
            Math.max(0, posicionPorcentaje)
        )}%`;

    ultimoResultadoFalla = resultado;
    asegurarBotonCompartirFalla();
    asegurarAccionesFalla();
    actualizarBotonGuardarFalla();
    dibujarMarcadorFalla(resultado);
}

function cerrarPanelLocalizador() {
    const panel = elementoLocalizador(
        "panel-localizador-fallas"
    );

    if (panel) {
        panel.hidden = true;
    }
}
function obtenerCoordenadasFeature(feature) {
    const geometria = feature?.geometry;

    if (!geometria) {
        return [];
    }

    if (geometria.type === "LineString") {
        return geometria.coordinates || [];
    }

    if (geometria.type === "MultiLineString") {
        const lineas = geometria.coordinates || [];

        return lineas
            .map((coordenadas) => ({
                coordenadas,
                longitudKm:
                    calcularLongitudLinea(coordenadas)
            }))
            .sort(
                (a, b) =>
                    b.longitudKm - a.longitudKm
            )[0]?.coordenadas || [];
    }

    return [];
}

function obtenerNombresExtremos(nombreLinea = "") {

    const nombreOriginal =
        String(nombreLinea).trim().toUpperCase();

    if (
        nombreOriginal === "LTVP"
        || nombreOriginal.includes("_LTVP")
    ) {
        return {
            extremoA: "S/E VIENTOS PATAG\u00D3NICOS",
            extremoB: "S/E TRES PUENTES"
        };
    }

    const nombreLimpio = String(nombreLinea)
        .replace(/^\d+_/, "")
        .replace(
            /\s+\d+(?:[.,]\d+)?\s*KV.*$/i,
            ""
        )
        .trim();

    const partes = nombreLimpio
        .split(/\s+(?:-|\u2013|\u2014)\s+/)
        .map((parte) => parte.trim())
        .filter(Boolean);

    return {
        extremoA:
            partes[0]
                ? `S/E ${partes[0]}`
                : "Extremo inicial",

        extremoB:
            partes[1]
                ? `S/E ${partes[1]}`
                : "Extremo final"
    };
}
async function abrirPanelLocalizador({
    nombreLinea = "Línea sin nombre",
    longitudTotalKm = null,
    feature = null,
    mapa = null
} = {}) {
    await cargarPanelLocalizador();

    const coordenadas =
        obtenerCoordenadasFeature(feature);

    const extremos =
        obtenerNombresExtremos(nombreLinea);

    lineaSeleccionadaLocalizador = {
        nombreLinea,
        longitudTotalKm:
            Number(longitudTotalKm),
        coordenadas,
        nombreExtremoA:
            extremos.extremoA,
        nombreExtremoB:
            extremos.extremoB,
        feature
    };

    mapaLocalizador = mapa;
    ultimoResultadoFalla = null;
    actualizarBotonGuardarFalla();

    const panel = elementoLocalizador(
        "panel-localizador-fallas"
    );

    elementoLocalizador(
        "localizador-fallas-linea-nombre"
    ).textContent = nombreLinea;

    elementoLocalizador(
        "localizador-fallas-linea-longitud"
    ).textContent =
        Number.isFinite(Number(longitudTotalKm))
            ? `${Number(longitudTotalKm).toFixed(1)} km`
            : "Longitud pendiente";

    const selectorExtremo = elementoLocalizador(
        "localizador-fallas-extremo"
    );

    selectorExtremo.innerHTML = "";

    const opcionA =
        document.createElement("option");

    opcionA.value = "A";
    opcionA.textContent =
        extremos.extremoA;

    const opcionB =
        document.createElement("option");

    opcionB.value = "B";
    opcionB.textContent =
        extremos.extremoB;

    selectorExtremo.appendChild(opcionA);
    selectorExtremo.appendChild(opcionB);

    elementoLocalizador(
        "resultado-extremo-a"
    ).textContent =
        extremos.extremoA;

    elementoLocalizador(
        "resultado-extremo-b"
    ).textContent =
        extremos.extremoB;
        elementoLocalizador(
    "resultado-etiqueta-distancia-a"
).textContent =
    `Distancia desde ${extremos.extremoA}`;

elementoLocalizador(
    "resultado-etiqueta-distancia-b"
).textContent =
    `Distancia desde ${extremos.extremoB}`;

    elementoLocalizador(
        "localizador-fallas-resultado"
    ).hidden = true;

    elementoLocalizador(
        "localizador-fallas-mensaje"
    ).hidden = true;

    elementoLocalizador("localizador-fallas-distancia").value = "";
    panel.hidden = false;
    if (gvRegistroDesdeHistorial) {
        gvRegistroDesdeHistorial = false;
        abrirRegistroSinDistancia();
    }
}
  function dibujarMarcadorFalla(resultado) {
    if (
        !mapaLocalizador
        || typeof L === "undefined"
        || !resultado?.coordenadas
    ) {
        return;
    }

    if (marcadorFalla) {
        mapaLocalizador.removeLayer(
            marcadorFalla
        );
    }

    const [
        longitudFalla,
        latitudFalla
    ] = resultado.coordenadas;

    const iconoFalla = L.divIcon({
        className: "gv-icono-falla",
        html: `
            <div class="gv-marcador-falla">
                ⚡
            </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
    });

    marcadorFalla = L.marker(
        [latitudFalla, longitudFalla],
        {
            icon: iconoFalla,
            title: "Ubicación estimada de falla",
            zIndexOffset: 1500
        }
    ).addTo(mapaLocalizador);

    marcadorFalla.bindPopup(`
        <div class="popup-gridvision">
            <h3>⚡ Falla estimada</h3>

            <p>
                <strong>Línea:</strong>
                ${escaparHtml(resultado.nombreLinea)}
            </p>

            <p>
                <strong>
                    Desde ${escaparHtml(resultado.nombreExtremoA)}:
                </strong>
                ${resultado.distanciaDesdeAKm.toFixed(1)} km
            </p>

            <p>
                <strong>
                    Desde ${escaparHtml(resultado.nombreExtremoB)}:
                </strong>
                ${resultado.distanciaDesdeBKm.toFixed(1)} km
            </p>

            <p>
                <strong>Coordenadas:</strong>
                ${latitudFalla.toFixed(6)},
                ${longitudFalla.toFixed(6)}
            </p>

            <p>
                <a
                    href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitudFalla.toFixed(6)}, ${longitudFalla.toFixed(6)}`)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    📍 Abrir ubicación en Google Maps
                </a>
            </p>

            <p>
                <strong>Precisión declarada:</strong>
                ± ${resultado.precisionKm.toFixed(1)} km
            </p>
        </div>
    `);

    marcadorFalla.openPopup();

    mapaLocalizador.panTo(
        [latitudFalla, longitudFalla]
    );
 const botonEliminar = elementoLocalizador(
    "eliminar-falla"
);

if (botonEliminar) {
    botonEliminar.hidden = true;
}
}
function eliminarMarcadorFalla() {
    if (marcadorFalla && mapaLocalizador) {
        mapaLocalizador.removeLayer(
            marcadorFalla
        );

        marcadorFalla = null;
    }

    if (marcadorFallaConfirmada && mapaLocalizador) {
        mapaLocalizador.removeLayer(
            marcadorFallaConfirmada
        );

        marcadorFallaConfirmada = null;
    }

    ultimoResultadoFalla = null;
    actualizarBotonGuardarFalla();

    const botonEliminar = elementoLocalizador(
        "eliminar-falla"
    );

    if (botonEliminar) {
        botonEliminar.hidden = true;
    }

    const resultadoPanel = elementoLocalizador(
        "localizador-fallas-resultado"
    );

    if (resultadoPanel) {
        resultadoPanel.hidden = true;
    }
}
    inicializarGestorFallasGuardadas();

    window.GridVisionLocalizadorFallas = {
        distanciaKm,
        calcularLongitudLinea,
        obtenerPuntoPorDistancia,
        localizarFalla,
        cargarPanelLocalizador,
        abrirPanelLocalizador,
        cerrarPanelLocalizador,
        compartirUbicacionFalla,
        construirDatosCompartirFalla,
        guardarFallaActual,
        leerFallasGuardadas,
        abrirPanelFallasGuardadas,
        cerrarPanelFallasGuardadas,
        verFallaGuardadaEnMapa,
        abrirEditorFallaGuardada,
        eliminarFallaGuardada,
        borrarTodasFallasGuardadas,
        sincronizarMarcadoresFallasActivas
    };
})();