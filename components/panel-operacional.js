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
function riesgoPorHoraPanel(
    rafaga,
    viento,
    lluvia,
    transversal
) {
    const valorRafaga = numeroPanel(rafaga) || 0;
    const valorViento = numeroPanel(viento) || 0;
    const valorLluvia = numeroPanel(lluvia) || 0;
    const valorTransversal =
    numeroPanel(transversal) || 0;

    const condiciones = [
    {
        tipo: "rafaga",
        icono: "💨",
        descripcion: "Ráfaga",
        valor: valorRafaga,
        unidad: "km/h",
        precaucion: 60,
        alerta: 80,
        critico: 100
    },
    {
        tipo: "transversal",
        icono: "↔️",
        descripcion: "Ráfaga transversal",
        valor: valorTransversal,
        unidad: "km/h",
        precaucion: 50,
        alerta: 70,
        critico: 90
    },
    {
        tipo: "viento",
        icono: "🌬️",
        descripcion: "Viento sostenido",
        valor: valorViento,
        unidad: "km/h",
        precaucion: 40,
        alerta: 60,
        critico: 80
    },
    {
        tipo: "lluvia",
        icono: "🌧️",
        descripcion: "Lluvia horaria",
        valor: valorLluvia,
        unidad: "mm/h",
        precaucion: 5,
        alerta: 10,
        critico: 20
    }
];

    function nivelCondicion(condicion) {
        if (condicion.valor >= condicion.critico) {
            return {
                prioridad: 3,
                nivel: "critico",
                etiqueta: "CRÍTICO"
            };
        }

        if (condicion.valor >= condicion.alerta) {
            return {
                prioridad: 2,
                nivel: "alerta",
                etiqueta: "ALERTA"
            };
        }

        if (condicion.valor >= condicion.precaucion) {
            return {
                prioridad: 1,
                nivel: "precaucion",
                etiqueta: "PRECAUCIÓN"
            };
        }

        return {
            prioridad: 0,
            nivel: "normal",
            etiqueta: "NORMAL"
        };
    }

    const evaluadas = condiciones.map((condicion) => ({
        ...condicion,
        ...nivelCondicion(condicion)
    }));

    const dominante = evaluadas.sort((a, b) => {
        if (b.prioridad !== a.prioridad) {
            return b.prioridad - a.prioridad;
        }

        const proporcionA =
            a.precaucion > 0
                ? a.valor / a.precaucion
                : 0;

        const proporcionB =
            b.precaucion > 0
                ? b.valor / b.precaucion
                : 0;

        return proporcionB - proporcionA;
    })[0];

    if (!dominante || dominante.prioridad === 0) {
        return {
            nivel: "normal",
            etiqueta: "NORMAL",
            causa: {
                tipo: "sin-riesgo",
                icono: "",
                descripcion: "Sin condición dominante",
                valor: ""
            }
        };
    }

    return {
        nivel: dominante.nivel,
        etiqueta: dominante.etiqueta,
        causa: {
            tipo: dominante.tipo,
            icono: dominante.icono,
            descripcion: dominante.descripcion,
            valor:
                `${formatoPanel(dominante.valor, 1)} `
                + dominante.unidad
        }
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
construirMeteogramaActivo(
    horario,
    {
        nombre: detalle.nombre,
        latitud: detalle.latitud,
        longitud: detalle.longitud
    },
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
            etiqueta: "ALTO"
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
let ultimoMeteograma = {
    tipo: null,
    horario: null,
    detalle: null,
    unidades: null
};
function diaSemanaCortoPanel(fechaTexto) {
    if (!fechaTexto) {
        return "";
    }

    const [anio, mes, dia] =
        fechaTexto.split("-").map(Number);

    const fecha = new Date(
        Date.UTC(anio, mes - 1, dia)
    );

    const dias = [
        "dom",
        "lun",
        "mar",
        "mié",
        "jue",
        "vie",
        "sáb"
    ];

    return dias[fecha.getUTCDay()] || "";
    }
    function etiquetaDiaPanel(fechaTexto) {
    if (!fechaTexto) {
        return "—";
    }

    const [anio, mes, dia] =
        fechaTexto.split("-").map(Number);

    const fecha = new Date(
        Date.UTC(anio, mes - 1, dia)
    );

    const dias = [
        "Domingo",
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado"
    ];

    return `${dias[fecha.getUTCDay()]} ${dia}`;
}
function construirMeteograma(
    tipo,
    horario,
    detalle = {},
    unidades = {}
) {
    const contenedor = document.getElementById(
        "meteograma-contenido"
    );

    if (!contenedor) {
        return;
    }

    const esLinea = tipo === "linea";

    ultimoMeteograma = {
        tipo,
        horario,
        detalle,
        unidades
    };

    contenedor.innerHTML = "";

    const tiempos = horario.time || [];

    if (!tiempos.length) {
        contenedor.textContent = esLinea
            ? "No hay datos horarios disponibles para el tramo crítico."
            : "No hay datos horarios disponibles para el activo.";
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
        Number(selectorResolucion?.value) || 1;

    const horizonteDisponible = Math.min(
        horizonteSolicitado,
        tiempos.length
    );

    const etiqueta = document.getElementById(
        "meteograma-etiqueta"
    );

    const titulo = document.getElementById(
        "meteograma-titulo"
    );

    const descripcion = document.getElementById(
        "meteograma-detalle"
    );

    if (etiqueta) {
        etiqueta.textContent = esLinea
            ? "Evolución meteorológica del tramo crítico"
            : "Evolución meteorológica del activo";
    }

    if (titulo) {
        titulo.textContent = esLinea
            ? detalle.tramoCritico || "Tramo crítico"
            : detalle.nombre || "Activo seleccionado";
    }

    if (descripcion) {
        descripcion.textContent =
            `${horizonteDisponible} h · datos cada `
            + `${resolucionHoras} h`;
    }

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

    const anchoEtiqueta = 115;
const anchoColumna = 90;

tabla.style.gridTemplateColumns =
    `${anchoEtiqueta}px repeat(${indices.length}, ${anchoColumna}px)`;

tabla.style.width =
    `${anchoEtiqueta + (indices.length * anchoColumna)}px`;

    function agregarFila(
        etiquetaFila,
        valores,
        claseExtra = "",
        marcarDias = true
    ) {
        const celdaEtiqueta = document.createElement("div");

        celdaEtiqueta.className =
            "meteograma-celda meteograma-celda-etiqueta";

        celdaEtiqueta.textContent = etiquetaFila;
        tabla.appendChild(celdaEtiqueta);

        valores.forEach((valor, posicion) => {
            const celda = document.createElement("div");

            celda.className =
                `meteograma-celda ${claseExtra}`.trim();

            if (marcarDias && posicion > 0) {
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
    function agregarFilaFechaAgrupada() {
    const celdaEtiqueta = document.createElement("div");

    celdaEtiqueta.className =
        "meteograma-celda meteograma-celda-etiqueta";

    celdaEtiqueta.textContent = "Fecha";

    tabla.appendChild(celdaEtiqueta);

    let posicion = 0;

    while (posicion < indices.length) {
        const indiceInicial = indices[posicion];

        const fechaActual =
            tiempos[indiceInicial]?.split("T")[0];

        let cantidad = 1;

        while (
            posicion + cantidad < indices.length
        ) {
            const indiceSiguiente =
                indices[posicion + cantidad];

            const fechaSiguiente =
                tiempos[indiceSiguiente]?.split("T")[0];

            if (fechaSiguiente !== fechaActual) {
                break;
            }

            cantidad++;
        }

        const celda = document.createElement("div");

        celda.className =
            "meteograma-celda meteograma-celda-fecha-dia";

        celda.style.gridColumn =
            `span ${cantidad}`;

        celda.innerHTML =
          celda.innerHTML =
            `<strong>${etiquetaDiaPanel(fechaActual)}</strong>`;

        if (posicion > 0) {
            celda.classList.add(
                "meteograma-inicio-dia"
            );
        }

        tabla.appendChild(celda);

        posicion += cantidad;
    }
}

agregarFilaFechaAgrupada();
    agregarFila(
        "Hora",
        indices.map((indice) => {
            const hora =
                tiempos[indice]?.split("T")[1]?.slice(0, 5)
                || "—";

            return `<strong>${hora}</strong>`;
        }),
        "meteograma-celda-hora"
    );

    agregarFila(
        "Condición",
        indices.map((indice) =>
            iconoClimaPanel(
                horario.weather_code?.[indice]
            )
        ),
        "meteograma-celda-condicion"
    );

    agregarFila(
        "Temperatura",
        indices.map((indice) =>
            `${formatoPanel(
                horario.temperature_2m?.[indice],
                0
            )} ${unidades.temperature_2m || "°C"}`
        )
    );

    agregarFila(
        "Lluvia",
        indices.map((indice) =>
            `${formatoPanel(
                horario.precipitation?.[indice],
                1
            )} ${unidades.precipitation || "mm"}`
        )
    );

    agregarFila(
        "Viento",
        indices.map((indice) =>
            `${formatoPanel(
                horario.wind_speed_10m?.[indice],
                0
            )} ${unidades.wind_speed_10m || "km/h"}`
        )
    );

    agregarFila(
        "Ráfaga",
        indices.map((indice) =>
            `${formatoPanel(
                horario.wind_gusts_10m?.[indice],
                0
            )} ${unidades.wind_gusts_10m || "km/h"}`
        )
    );

    const rumbo = esLinea
        ? detalle.rumboTramoCritico
            ?? detalle.rumbo
            ?? null
        : null;

    if (esLinea) {
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
    }

    agregarFila(
        "Riesgo",
        indices.map((indice) => {
            const transversal = esLinea
                ? transversalPorHoraPanel(
                    horario.wind_gusts_10m?.[indice],
                    horario.wind_direction_10m?.[indice],
                    rumbo
                )
                : null;

            const riesgo = riesgoPorHoraPanel(
                horario.wind_gusts_10m?.[indice],
                horario.wind_speed_10m?.[indice],
                horario.precipitation?.[indice],
                transversal
            );

            const indicador = document.createElement("span");

            indicador.className =
                "meteograma-riesgo "
                + `meteograma-riesgo-${riesgo.nivel}`;

            const estado = document.createElement("strong");
            estado.textContent = riesgo.etiqueta;
            indicador.appendChild(estado);

            if (
                riesgo.causa
                && riesgo.causa.tipo !== "sin-riesgo"
            ) {
                const causa = document.createElement("small");

                causa.innerHTML =
                    `${riesgo.causa.icono} `
                    + `<strong>${riesgo.causa.descripcion}</strong><br>`
                    + `${riesgo.causa.valor}`;

                indicador.appendChild(causa);
            }

            if (transversal !== null) {
                indicador.title =
                    "Ráfaga transversal estimada: "
                    + `${formatoPanel(transversal, 0)} km/h`;
            }

            return indicador;
        })
    );

    contenedor.appendChild(tabla);
}

function construirMeteogramaActivo(
    horario,
    detalle = {},
    unidades = {}
) {
    construirMeteograma(
        "activo",
        horario,
        detalle,
        unidades
    );
}

function construirMeteogramaLinea(
    horario,
    detalle = {},
    unidades = {}
) {
    construirMeteograma(
        "linea",
        horario,
        detalle,
        unidades
    );
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

    document.getElementById(
        "operacional-timeline-etiqueta"
    ).textContent = "Ranking de exposición";

    document.getElementById(
        "operacional-timeline-titulo"
    ).textContent =
        "Tramos con mayor exposición prevista";

    document.getElementById(
        "operacional-timeline-detalle"
    ).textContent =
        `Máximo dentro de ${detalle.horizonte || 24} horas`;

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
    window.GridVisionPanelUtilidades = {
    formatoPanel,
    horaPanel,
    claseRiesgoLineaPanel
};
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
if (selectorHorizonte) {
    selectorHorizonte.value = "24";
}

if (selectorResolucion) {
    selectorResolucion.value = "1";
}

function actualizarMeteogramaDesdeControles() {
    if (
        !ultimoMeteograma
        || !ultimoMeteograma.tipo
        || !ultimoMeteograma.horario
    ) {
        return;
    }

    construirMeteograma(
        ultimoMeteograma.tipo,
        ultimoMeteograma.horario,
        ultimoMeteograma.detalle || {},
        ultimoMeteograma.unidades || {}
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
