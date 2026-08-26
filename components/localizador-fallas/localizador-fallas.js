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

function construirDatosCompartirFalla(resultado) {
    if (!resultado?.coordenadas) {
        return null;
    }

    const [longitudFalla, latitudFalla] = resultado.coordenadas;

    // Igual al formato que ya usa GridVision al compartir un activo:
    // latitud,longitud sin espacios para que WhatsApp mantenga el enlace limpio.
    const coordenadasQuery =
        `${latitudFalla.toFixed(14)},${longitudFalla.toFixed(14)}`;

    const urlMapa =
        `https://www.google.com/maps/search/?api=1&query=`
        + encodeURIComponent(coordenadasQuery);

    const idActivo = obtenerIdActivoCompartirFalla();
    const urlActivo = idActivo
        ? `https://ecastilloluengo.github.io/gridvision-piloto-publico/?activo=${encodeURIComponent(idActivo)}`
        : null;

    const lineas = [
        'Ver ubicación en Google Maps:',
        urlMapa
    ];

    if (urlActivo) {
        lineas.push(
            '',
            'Abrir activo en GridVision:',
            urlActivo
        );
    }

    const texto = lineas.join('\n');

    return {
        titulo: 'Ubicación GridVision',
        texto,
        coordenadasTexto:
            `${latitudFalla.toFixed(6)}, ${longitudFalla.toFixed(6)}`,
        urlMapa,
        urlActivo,
        idActivo
    };
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

    return `GV-FLT-${fecha}-${hora}`;
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

                <div class="gv-editor-evidencia-pendiente">
                    <strong>📎 Evidencia</strong>
                    <span>Fotos, SER, oscilografías, COMTRADE y PDF se incorporarán en la fase de almacenamiento de archivos.</span>
                </div>

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
        Number.isFinite(Number(registro.distanciaIndicadaKm))
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
}

function actualizarResumenEstimacionEditor(fondo, registro) {
    const latitud = Number(registro?.latitud);
    const longitud = Number(registro?.longitud);
    const precision = Number(registro?.precisionKm || 0);

    fondo.querySelector("#editor-falla-estimada").textContent =
        Number.isFinite(latitud) && Number.isFinite(longitud)
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

    const coordenadas =
        obtenerGeometriaLineaParaRegistro(registroBase);

    if (!coordenadas) {
        estado.textContent =
            "No hay geometría de esta línea disponible para recalcular. Abre la línea en el mapa y vuelve a editar el registro.";
        estado.dataset.tipo = "error";
        return false;
    }

    const distancia = Number(
        fondo.querySelector("#editor-falla-distancia-km").value
    );
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

function guardarDesdeEditorFalla() {
    const fondo = asegurarEditorFalla();
    const registroBase = fondo._registroTemporal;
    const error = fondo.querySelector("#editor-falla-error");

    if (!registroBase) {
        return;
    }

    const distanciaEditor = Number(
        fondo.querySelector("#editor-falla-distancia-km").value
    );
    const extremoEditor = fondo.querySelector(
        "#editor-falla-extremo-referencia"
    ).value;
    const cambioLocalizacion =
        Math.abs(
            distanciaEditor
            - Number(registroBase.distanciaIndicadaKm || 0)
        ) > 0.000001
        || extremoEditor !== (registroBase.extremoReferencia || "A");

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
            !Number.isFinite(latitud)
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

    escribirFallasGuardadas(registros);

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

    fondo.hidden = true;
    fondo._registroTemporal = null;
    datosGpsEditorFalla = null;

    actualizarAccesoFallasGuardadas();
    renderizarFallasGuardadas();
    limpiarMarcadoresTemporalesDeRegistro(actualizado.id);
    sincronizarMarcadoresFallasActivas();

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
    const distancia = Number.isFinite(Number(registro.distanciaIndicadaKm))
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
            <p><strong>Coordenadas:</strong> ${Number(registro.latitud).toFixed(6)}, ${Number(registro.longitud).toFixed(6)}</p>
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
    const latitud = Number(registro.latitud);
    const longitud = Number(registro.longitud);

    if (
        !Number.isFinite(latitud)
        || !Number.isFinite(longitud)
    ) {
        return null;
    }

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
            && Number.isFinite(Number(registro.latitud))
            && Number.isFinite(Number(registro.longitud))
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
        const latitud = Number(registro.latitud);
        const longitud = Number(registro.longitud);

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
            abrirPanelFallasGuardadas
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

function abrirPanelFallasGuardadas() {
    const panel = asegurarPanelFallasGuardadas();
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
    if (
        !registro
        || !Number.isFinite(Number(registro.latitud))
        || !Number.isFinite(Number(registro.longitud))
    ) {
        return null;
    }

    const latitud = Number(registro.latitud);
    const longitud = Number(registro.longitud);
    const urlMapa =
        "https://www.google.com/maps/search/?api=1&query="
        + encodeURIComponent(
            `${latitud.toFixed(14)},${longitud.toFixed(14)}`
        );

    const urlActivo = registro.idActivo
        ? `https://ecastilloluengo.github.io/gridvision-piloto-publico/?activo=${encodeURIComponent(registro.idActivo)}`
        : null;

    const estado = estadoRegistroFalla(registro);
    const lineas = [
        `Falla GridVision: ${registro.id}`,
        `Estado: ${estado === "cerrada" ? "CERRADA" : "ACTIVA"}`,
        `Línea: ${registro.nombreLinea || "Línea sin nombre"}`,
        `Inicio: ${formatearFechaHoraFalla(registro.fechaHoraInicio || registro.fechaHora)}`
    ];

    if (registro.fechaHoraFin) {
        lineas.push(
            `Fin: ${formatearFechaHoraFalla(registro.fechaHoraFin)}`,
            `Duración: ${formatearDuracionFalla(registro)}`
        );
    }

    if (registro.afectacionOperacional) {
        lineas.push(
            "",
            "Afectación operacional:",
            registro.afectacionOperacional
        );
    }

    lineas.push(
        "",
        "Ubicación estimada por protección:",
        urlMapa
    );

    const confirmada = registro.ubicacionConfirmada;

    if (
        confirmada
        && Number.isFinite(Number(confirmada.latitud))
        && Number.isFinite(Number(confirmada.longitud))
    ) {
        const urlConfirmada =
            "https://www.google.com/maps/search/?api=1&query="
            + encodeURIComponent(
                `${Number(confirmada.latitud).toFixed(14)},${Number(confirmada.longitud).toFixed(14)}`
            );

        lineas.push(
            "",
            "Ubicación confirmada en terreno:",
            urlConfirmada
        );
    }

    if (registro.observaciones) {
        lineas.push(
            "",
            "Observaciones:",
            registro.observaciones
        );
    }

    if (urlActivo) {
        lineas.push(
            "",
            "Abrir activo en GridVision:",
            urlActivo
        );
    }

    return {
        titulo: "Falla guardada · GridVision",
        texto: lineas.join("\n")
    };
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

    mapaLocalizador = mapa;
    ultimoResultadoFalla = construirResultadoDesdeRegistro(registro);

    dibujarMarcadorFalla(ultimoResultadoFalla);

    if (marcadorFallaConfirmada) {
        mapa.removeLayer(marcadorFallaConfirmada);
        marcadorFallaConfirmada = null;
    }

    const confirmada = registro.ubicacionConfirmada;

    if (
        confirmada
        && Number.isFinite(Number(confirmada.latitud))
        && Number.isFinite(Number(confirmada.longitud))
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
                [Number(registro.latitud), Number(registro.longitud)],
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
        const distancia = Number.isFinite(Number(registro.distanciaIndicadaKm))
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
        const textoConfirmada = confirmada
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
                <p class="gv-falla-meta">⚡ Estimada: ${Number(registro.latitud).toFixed(6)}, ${Number(registro.longitud).toFixed(6)} · ± ${Number(registro.precisionKm || 0).toFixed(1)} km</p>
                ${textoConfirmada}
                ${afectacion}
                <div class="gv-falla-acciones">
                    <button type="button" data-accion="ver">📍 Ver en mapa</button>
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
        !Number.isFinite(distanciaInformadaKm)
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

    panel.hidden = false;
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
                ${resultado.nombreLinea}
            </p>

            <p>
                <strong>
                    Desde ${resultado.nombreExtremoA}:
                </strong>
                ${resultado.distanciaDesdeAKm.toFixed(1)} km
            </p>

            <p>
                <strong>
                    Desde ${resultado.nombreExtremoB}:
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