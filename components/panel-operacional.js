function numeroPanel(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function formatoPanel(valor, decimales = 1) {
    const numero = numeroPanel(valor);

    if (numero === null) {
        return "—";
    }

    return numero.toLocaleString("es-CL", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales
    });
}

function sumaPanel(valores, horas) {
    return (valores || [])
        .slice(0, horas)
        .reduce(
            (total, valor) => total + (numeroPanel(valor) || 0),
            0
        );
}

function maximoPanel(valores) {
    let indice = -1;
    let valor = null;

    (valores || []).forEach((dato, posicion) => {
        const numero = numeroPanel(dato);

        if (numero !== null && (valor === null || numero > valor)) {
            valor = numero;
            indice = posicion;
        }
    });

    return { indice, valor };
}

function rangoPanel(valores) {
    const numeros = (valores || [])
        .map(numeroPanel)
        .filter((valor) => valor !== null);

    if (!numeros.length) {
        return { minimo: null, maximo: null };
    }

    return {
        minimo: Math.min(...numeros),
        maximo: Math.max(...numeros)
    };
}

function horaPanel(fechaIso) {
    if (!fechaIso) {
        return "—";
    }

    const [fecha, hora] = fechaIso.split("T");
    const [anio, mes, dia] = fecha.split("-");

    return `${dia}-${mes}-${anio} ${(hora || "").slice(0, 5)}`;
}

function evaluarRiesgoPanel(horario) {
    const rafaga = maximoPanel(
        (horario.wind_gusts_10m || []).slice(0, 24)
    ).valor;

    const viento = maximoPanel(
        (horario.wind_speed_10m || []).slice(0, 24)
    ).valor;

    const lluvia24h = sumaPanel(
        horario.precipitation,
        24
    );

    if (
        (rafaga !== null && rafaga >= 100)
        || (viento !== null && viento >= 80)
        || lluvia24h >= 80
    ) {
        return {
            nivel: "critico",
            etiqueta: "CRÍTICO",
            motivo: "Condiciones meteorológicas críticas durante las próximas 24 horas."
        };
    }

    if (
        (rafaga !== null && rafaga >= 80)
        || (viento !== null && viento >= 60)
        || lluvia24h >= 50
    ) {
        return {
            nivel: "alerta",
            etiqueta: "ALERTA",
            motivo: "Se recomienda seguimiento operacional permanente."
        };
    }

    if (
        (rafaga !== null && rafaga >= 60)
        || (viento !== null && viento >= 40)
        || lluvia24h >= 20
    ) {
        return {
            nivel: "precaucion",
            etiqueta: "PRECAUCIÓN",
            motivo: "Existen condiciones que requieren atención operacional."
        };
    }

    return {
        nivel: "normal",
        etiqueta: "NORMAL",
        motivo: "No se identifican condiciones meteorológicas críticas."
    };
}
function riesgoPorHoraPanel(rafaga, viento, lluvia) {
    const valorRafaga = numeroPanel(rafaga) || 0;
    const valorViento = numeroPanel(viento) || 0;
    const valorLluvia = numeroPanel(lluvia) || 0;

    if (
        valorRafaga >= 100
        || valorViento >= 80
        || valorLluvia >= 20
    ) {
        return {
            nivel: "critico",
            etiqueta: "CRÍTICO"
        };
    }

    if (
        valorRafaga >= 80
        || valorViento >= 60
        || valorLluvia >= 10
    ) {
        return {
            nivel: "alerta",
            etiqueta: "ALERTA"
        };
    }

    if (
        valorRafaga >= 60
        || valorViento >= 40
        || valorLluvia >= 5
    ) {
        return {
            nivel: "precaucion",
            etiqueta: "PRECAUCIÓN"
        };
    }

    return {
        nivel: "normal",
        etiqueta: "NORMAL"
    };
}

function construirTimelineOperacional(horario, unidades) {
    const contenedor = document.getElementById(
        "timeline-operacional-contenido"
    );

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = "";

    const tiempos = horario.time || [];

    for (let indice = 0; indice < 24; indice += 3) {
        const fechaIso = tiempos[indice];

        if (!fechaIso) {
            continue;
        }

        const hora = fechaIso.split("T")[1]?.slice(0, 5) || "—";

        const rafaga = horario.wind_gusts_10m?.[indice];
        const viento = horario.wind_speed_10m?.[indice];
        const lluvia = horario.precipitation?.[indice];
        const temperatura = horario.temperature_2m?.[indice];

        const riesgo = riesgoPorHoraPanel(
            rafaga,
            viento,
            lluvia
        );

        const tarjeta = document.createElement("article");
        tarjeta.className = "timeline-operacional-item";

        tarjeta.innerHTML = `
            <strong class="timeline-operacional-hora">
                ${hora}
            </strong>

            <div class="timeline-operacional-dato">
                <span>Ráfaga</span>
                <strong>
                    ${formatoPanel(rafaga, 0)}
                    ${unidades.wind_gusts_10m || "km/h"}
                </strong>
            </div>

            <div class="timeline-operacional-dato">
                <span>Viento</span>
                <strong>
                    ${formatoPanel(viento, 0)}
                    ${unidades.wind_speed_10m || "km/h"}
                </strong>
            </div>

            <div class="timeline-operacional-dato">
                <span>Lluvia</span>
                <strong>
                    ${formatoPanel(lluvia, 1)}
                    ${unidades.precipitation || "mm"}
                </strong>
            </div>

            <div class="timeline-operacional-dato">
                <span>Temp.</span>
                <strong>
                    ${formatoPanel(temperatura, 1)}
                    ${unidades.temperature_2m || "°C"}
                </strong>
            </div>

            <div
                class="
                    timeline-riesgo
                    timeline-riesgo-${riesgo.nivel}
                "
            >
                ${riesgo.etiqueta}
            </div>
        `;

        contenedor.appendChild(tarjeta);
    }
}
function actualizarPanelOperacional(evento) {
    document.getElementById(
        "operacional-tipo-seleccion"
    ).textContent = "Activo seleccionado";

    const detalle = evento.detail || {};
    const datos = detalle.datos || {};
    const horario = datos.hourly || {};
    const unidades = datos.hourly_units || {};
    const tiempos = horario.time || [];

    const rafaga = maximoPanel(horario.wind_gusts_10m);
    const temperaturas = rangoPanel(horario.temperature_2m);
    const riesgo = evaluarRiesgoPanel(horario);

    document.getElementById(
        "panel-operacional-vacio"
    ).hidden = true;

    document.getElementById(
        "panel-operacional-resumen"
    ).hidden = false;
    document.getElementById(
    "operacional-tipo-seleccion"
).textContent = "Activo seleccionado";

document.getElementById(
    "operacional-activo"
).textContent =
    detalle.nombre || "Activo sin nombre";

document.getElementById(
    "operacional-etiqueta-1"
).textContent = "Ráfaga máxima";

document.getElementById(
    "operacional-etiqueta-2"
).textContent = "Lluvia 24 h";

document.getElementById(
    "operacional-detalle-2"
).textContent = "Acumulada";

document.getElementById(
    "operacional-etiqueta-3"
).textContent = "Lluvia 72 h";

document.getElementById(
    "operacional-detalle-3"
).textContent = "Acumulada";

document.getElementById(
    "operacional-etiqueta-4"
).textContent = "Temperatura 72 h";

document.getElementById(
    "operacional-detalle-4"
).textContent = "Mínima a máxima";

    document.getElementById(
        "operacional-timeline-etiqueta"
    ).textContent = "Evolución horaria";

    document.getElementById(
        "operacional-timeline-titulo"
    ).textContent = "Próximas 24 horas";

    document.getElementById(
        "operacional-timeline-detalle"
    ).textContent = "Intervalos cada 3 horas";
        detalle.nombre || "Activo sin nombre";

    document.getElementById("operacional-rafaga").textContent =
        `${formatoPanel(rafaga.valor)} `
        + `${unidades.wind_gusts_10m || "km/h"}`;

    document.getElementById("operacional-hora-rafaga").textContent =
        horaPanel(tiempos[rafaga.indice]);

    document.getElementById("operacional-lluvia-24h").textContent =
        `${formatoPanel(sumaPanel(horario.precipitation, 24))} `
        + `${unidades.precipitation || "mm"}`;

    document.getElementById("operacional-lluvia-72h").textContent =
        `${formatoPanel(sumaPanel(horario.precipitation, 72))} `
        + `${unidades.precipitation || "mm"}`;

    document.getElementById("operacional-temperatura").textContent =
        `${formatoPanel(temperaturas.minimo)} a `
        + `${formatoPanel(temperaturas.maximo)} `
        + `${unidades.temperature_2m || "°C"}`;

    const indicador = document.getElementById("operacional-riesgo");

    indicador.className =
        `operacional-riesgo riesgo-${riesgo.nivel}`;

    indicador.textContent = riesgo.etiqueta;

    document.getElementById("operacional-motivo").textContent =
        riesgo.motivo;
        construirTimelineOperacional(
    horario,
    unidades
);
}
function claseRiesgoLineaPanel(nivel) {
    const texto = String(nivel || "").toUpperCase();

    if (
        texto.includes("CRÍT")
        || texto.includes("ROJO")
    ) {
        return {
            clase: "critico",
            etiqueta: "CRÍTICO"
        };
    }

    if (
        texto.includes("ALERTA")
        || texto.includes("ALTO")
        || texto.includes("NARAN")
    ) {
        return {
            clase: "alerta",
            etiqueta: "ALERTA"
        };
    }

    if (
        texto.includes("PRECAU")
        || texto.includes("AMAR")
    ) {
        return {
            clase: "precaucion",
            etiqueta: "PRECAUCIÓN"
        };
    }

    return {
        clase: "normal",
        etiqueta: "NORMAL"
    };
}
function iconoClimaPanel(codigo) {
    const valor = Number(codigo);

    if ([95, 96, 99].includes(valor)) {
        return "⛈️";
    }

    if ([71, 73, 75, 77, 85, 86].includes(valor)) {
        return "🌨️";
    }

    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(valor)) {
        return "🌧️";
    }

    if ([45, 48].includes(valor)) {
        return "🌫️";
    }

    if (valor === 3) {
        return "☁️";
    }

    if ([1, 2].includes(valor)) {
        return "⛅";
    }

    return "☀️";
}

function transversalPorHoraPanel(rafaga, direccion, rumbo) {
    const valorRafaga = numeroPanel(rafaga);
    const valorDireccion = numeroPanel(direccion);
    const valorRumbo = numeroPanel(rumbo);

    if (
        valorRafaga === null
        || valorDireccion === null
        || valorRumbo === null
    ) {
        return null;
    }

    const diferenciaRadianes =
        (valorDireccion - valorRumbo) * Math.PI / 180;

    return Math.abs(
        valorRafaga * Math.sin(diferenciaRadianes)
    );
}
let ultimoMeteogramaLinea = null;

function construirMeteogramaLinea(horario, detalle) {
    const contenedor = document.getElementById(
        "meteograma-contenido"
    );

    if (!contenedor) {
        return;
    }

    ultimoMeteogramaLinea = {
        horario,
        detalle
    };

    contenedor.innerHTML = "";

    const tiempos = horario.time || [];

    if (!tiempos.length) {
        contenedor.textContent =
            "No hay datos horarios disponibles para el tramo crítico.";
        return;
    }

    const selectorHorizonte = document.getElementById(
        "meteograma-horizonte"
    );

    const selectorResolucion = document.getElementById(
        "meteograma-resolucion"
    );

    const horizonteSolicitado =
        Number(selectorHorizonte?.value) || 24;

    const resolucionHoras =
        Number(selectorResolucion?.value) || 3;

    const horizonteDisponible = Math.min(
        horizonteSolicitado,
        tiempos.length
    );

    document.getElementById(
        "meteograma-etiqueta"
    ).textContent =
        "Evolución meteorológica del tramo crítico";

    document.getElementById(
        "meteograma-titulo"
    ).textContent =
        detalle.tramoCritico || "Tramo crítico";

    document.getElementById(
        "meteograma-detalle"
    ).textContent =
        `${horizonteDisponible} h · datos cada `
        + `${resolucionHoras} h`;

    const indices = [];

    for (
        let indice = 0;
        indice < horizonteDisponible;
        indice += resolucionHoras
    ) {
        indices.push(indice);
    }

    const tabla = document.createElement("div");
    tabla.className = "meteograma-tabla";

    tabla.style.gridTemplateColumns =
        `115px repeat(${indices.length}, minmax(90px, 1fr))`;

    function agregarFila(
    etiqueta,
    valores,
    claseExtra = "",
    marcarDias = true
) {
    const celdaEtiqueta = document.createElement("div");

    celdaEtiqueta.className =
        "meteograma-celda meteograma-celda-etiqueta";

    celdaEtiqueta.textContent = etiqueta;
    tabla.appendChild(celdaEtiqueta);

    valores.forEach((valor, posicion) => {
        const celda = document.createElement("div");

        celda.className =
            `meteograma-celda ${claseExtra}`.trim();

        if (
            marcarDias
            && posicion > 0
        ) {
            const indiceActual = indices[posicion];
            const indiceAnterior = indices[posicion - 1];

            const fechaActual =
                tiempos[indiceActual]?.split("T")[0];

            const fechaAnterior =
                tiempos[indiceAnterior]?.split("T")[0];

            if (
                fechaActual
                && fechaAnterior
                && fechaActual !== fechaAnterior
            ) {
                celda.classList.add(
                    "meteograma-inicio-dia"
                );
            }
        }

        if (valor instanceof Node) {
            celda.appendChild(valor);
        } else {
            celda.innerHTML = valor;
        }

        tabla.appendChild(celda);
    });
}
            agregarFila(
        "Fecha",
        indices.map((indice) => {
            const fechaIso = tiempos[indice];

            if (!fechaIso) {
                return "—";
            }

            const fecha = fechaIso.split("T")[0];
            const [, mes, dia] = fecha.split("-");

            return `<strong>${dia}-${mes}</strong>`;
        }),
        "meteograma-celda-hora",
         true
    );

    agregarFila(
        "Hora",
        indices.map((indice) => {
            const hora =
                tiempos[indice]?.split("T")[1]?.slice(0, 5)
                || "—";

            return `<strong>${hora}</strong>`;
        }),
        "meteograma-celda-hora",
         true
    );

    agregarFila(
        "Condición",
        indices.map((indice) =>
            iconoClimaPanel(
                horario.weather_code?.[indice]
            )
        ),
        "meteograma-celda-condicion",
    true
    );

    agregarFila(
        "Temperatura",
        indices.map((indice) =>
            `${formatoPanel(
                horario.temperature_2m?.[indice],
                0
            )} °C`
        )
    );

    agregarFila(
        "Lluvia",
        indices.map((indice) =>
            `${formatoPanel(
                horario.precipitation?.[indice],
                1
            )} mm`
        )
    );

    agregarFila(
        "Viento",
        indices.map((indice) =>
            `${formatoPanel(
                horario.wind_speed_10m?.[indice],
                0
            )} km/h`
        )
    );

    agregarFila(
        "Ráfaga",
        indices.map((indice) =>
            `${formatoPanel(
                horario.wind_gusts_10m?.[indice],
                0
            )} km/h`
        )
    );

    const rumbo =
        detalle.rumboTramoCritico
        ?? detalle.rumbo
        ?? null;

    agregarFila(
        "Transversal",
        indices.map((indice) => {
            const transversal = transversalPorHoraPanel(
                horario.wind_gusts_10m?.[indice],
                horario.wind_direction_10m?.[indice],
                rumbo
            );

            return transversal === null
                ? "—"
                : `${formatoPanel(transversal, 0)} km/h`;
        })
    );

    agregarFila(
        "Riesgo",
        indices.map((indice) => {
            const transversal = transversalPorHoraPanel(
                horario.wind_gusts_10m?.[indice],
                horario.wind_direction_10m?.[indice],
                rumbo
            );

            const riesgo = riesgoPorHoraPanel(
                horario.wind_gusts_10m?.[indice],
                horario.wind_speed_10m?.[indice],
                horario.precipitation?.[indice]
            );

            const indicador = document.createElement("span");

            indicador.className =
                `meteograma-riesgo `
                + `meteograma-riesgo-${riesgo.nivel}`;

            indicador.textContent = riesgo.etiqueta;

            if (transversal !== null) {
                indicador.title =
                    "Ráfaga transversal estimada: "
                    + `${formatoPanel(
                        transversal,
                        0
                    )} km/h`;
            }

            return indicador;
        })
    );

    
    contenedor.appendChild(tabla);
}
function construirRankingLineaPanel(ranking) {
    const contenedor = document.getElementById(
        "timeline-operacional-contenido"
    );

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = "";

    (ranking || [])
        .filter((resultado) => resultado.disponible !== false)
        .slice(0, 8)
        .forEach((resultado) => {
            const riesgo = claseRiesgoLineaPanel(
                resultado.nivel?.etiqueta
                || resultado.nivel?.nombre
                || resultado.nivel
            );

            const tarjeta = document.createElement("article");
            tarjeta.className = "timeline-operacional-item";

            tarjeta.innerHTML = `
                <strong class="timeline-operacional-hora">
                    ${typeof resultado.tramo === "string"
    ? resultado.tramo
    : resultado.tramo?.nombre
        || resultado.tramo?.etiqueta
        || "Tramo"}
                    }
                </strong>

                <div class="timeline-operacional-dato">
                    <span>Ráfaga</span>
                    <strong>
                        ${formatoPanel(resultado.rafaga)}
                        km/h
                    </strong>
                </div>

                <div class="timeline-operacional-dato">
                    <span>Transversal</span>
                    <strong>
                        ${formatoPanel(resultado.transversal)}
                        km/h
                    </strong>
                </div>

                <div class="timeline-operacional-dato">
                    <span>Hora</span>
                    <strong>
                        ${horaPanel(resultado.hora)}
                    </strong>
                </div>

                <div
                    class="
                        timeline-riesgo
                        timeline-riesgo-${riesgo.clase}
                    "
                >
                    ${riesgo.etiqueta}
                </div>
            `;

            contenedor.appendChild(tarjeta);
        });
}

function actualizarPanelOperacionalLinea(evento) {
    document.getElementById(
        "operacional-tipo-seleccion"
    ).textContent = "Línea seleccionada";

    const detalle = evento.detail || {};

    const pronosticoTramoCritico =
        detalle.pronosticoTramoCritico || {};

    const horarioTramoCritico =
        pronosticoTramoCritico.hourly || {};

    const riesgo = claseRiesgoLineaPanel(
        detalle.nivel
    );

    document.getElementById(
        "panel-operacional-vacio"
    ).hidden = true;

    document.getElementById(
        "panel-operacional-resumen"
    ).hidden = false;

    document.getElementById(
        "operacional-activo"
    ).textContent =
        detalle.nombre || "Línea sin nombre";

    document.getElementById(
        "operacional-etiqueta-1"
    ).textContent = "Longitud aproximada";

    document.getElementById(
        "operacional-rafaga"
    ).textContent =
        `${formatoPanel(detalle.longitudTotalKm)} km`;

    document.getElementById(
        "operacional-hora-rafaga"
    ).textContent =
        `Horizonte: ${detalle.horizonte || 24} h`;

    document.getElementById(
        "operacional-etiqueta-2"
    ).textContent = "Tramo crítico";

    document.getElementById(
        "operacional-lluvia-24h"
    ).textContent =
        detalle.tramoCritico || "—";

    document.getElementById(
        "operacional-detalle-2"
    ).textContent = "Mayor exposición";

    document.getElementById(
        "operacional-etiqueta-3"
    ).textContent = "Ráfaga crítica";

    document.getElementById(
        "operacional-lluvia-72h"
    ).textContent =
        `${formatoPanel(detalle.rafagaCritica)} km/h`;

    document.getElementById(
        "operacional-detalle-3"
    ).textContent =
        horaPanel(detalle.horaCritica);

    document.getElementById(
        "operacional-etiqueta-4"
    ).textContent = "Ráfaga transversal";

    document.getElementById(
        "operacional-temperatura"
    ).textContent =
        `${formatoPanel(
            detalle.transversalCritica
        )} km/h`;

    document.getElementById(
        "operacional-detalle-4"
    ).textContent =
        "Componente estimada sobre la línea";

    const indicador = document.getElementById(
        "operacional-riesgo"
    );

    indicador.className =
        `operacional-riesgo riesgo-${riesgo.clase}`;

    indicador.textContent = riesgo.etiqueta;

    document.getElementById(
        "operacional-motivo"
    ).textContent =
        detalle.motivo || "Sin evaluación";

    construirRankingLineaPanel(
        detalle.ranking
    );
    construirMeteogramaLinea(
    horarioTramoCritico,
    detalle
);
}
async function cargarPanelOperacional() {
    const contenedor = document.getElementById(
        "contenedor-panel-operacional"
    );

    if (!contenedor) {
        return;
    }

    try {
        const respuesta = await fetch(
            "components/panel-operacional.html"
        );

        if (!respuesta.ok) {
            throw new Error(
                `No se pudo cargar el panel: ${respuesta.status}`
            );
        }

        contenedor.innerHTML = await respuesta.text();

        const panel = document.getElementById("panel-operacional");
        const boton = document.getElementById(
            "alternar-panel-operacional"
        );
        const contenido = document.getElementById(
            "contenido-panel-operacional"
        );

        boton.addEventListener("click", () => {
            const estaAbierto =
                boton.getAttribute("aria-expanded") === "true";

            boton.setAttribute(
                "aria-expanded",
                String(!estaAbierto)
            );

            contenido.hidden = estaAbierto;

            panel.classList.toggle(
                "panel-operacional-colapsado",
                estaAbierto
            );

            if (
                typeof mapa !== "undefined"
                && mapa.invalidateSize
            ) {
                window.setTimeout(
                    () => mapa.invalidateSize(),
                    200
                );
            }
        });

        window.addEventListener(
            "gridvision:pronostico-activo",
            actualizarPanelOperacional
        );
        window.addEventListener(
    "gridvision:pronostico-linea",
    actualizarPanelOperacionalLinea
);
const selectorHorizonte = document.getElementById(
    "meteograma-horizonte"
);

const selectorResolucion = document.getElementById(
    "meteograma-resolucion"
);

function actualizarMeteogramaDesdeControles() {
    if (!ultimoMeteogramaLinea) {
        return;
    }

    construirMeteogramaLinea(
        ultimoMeteogramaLinea.horario,
        ultimoMeteogramaLinea.detalle
    );
}

selectorHorizonte?.addEventListener(
    "change",
    actualizarMeteogramaDesdeControles
);

selectorResolucion?.addEventListener(
    "change",
    actualizarMeteogramaDesdeControles
);
    } catch (error) {
        console.error(
            "Error al inicializar el Panel Operacional:",
            error
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    cargarPanelOperacional
);
