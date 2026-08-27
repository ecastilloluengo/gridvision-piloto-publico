
(() => {

"use strict";

const API =
    "https://api.open-meteo.com/v1/forecast";

const RUTA_ACTIVOS =
    "data/processed/activos_puntuales_validados.geojson";

const PRIORIDAD = {
    NORMAL: 0,
    PRECAUCION: 1,
    ALERTA: 2,
    CRITICO: 3
};

const UMBRALES = {

    viento: {
        precaucion: 40,
        alerta: 60,
        critico: 80
    },

    rafaga: {
        precaucion: 60,
        alerta: 80,
        critico: 100
    },

    lluviaHora: {
        precaucion: 10,
        alerta: 20,
        critico: 30
    },

    lluvia24h: {
        precaucion: 20,
        alerta: 50,
        critico: 80
    }

};

const TORMENTA = new Set([
    95,
    96,
    99
]);

let inventarioPromise = null;


/* ========================================================
   ESTILOS
   ======================================================== */

const estilo = document.createElement("style");

estilo.textContent = `

.contenido-activos{
    display:flex;
    flex-direction:column;
    gap:18px;
}

.reporte-activo{
    border:1px solid rgba(255,255,255,.11);
    border-radius:13px;
    overflow:hidden;
    background:#0c1720;
}

.reporte-activo-cabecera{
    padding:16px 18px;
    border-bottom:1px solid rgba(255,255,255,.09);
    background:#111f29;
}

.reporte-activo-cabecera small{
    display:block;
    color:#7f9caf;
    font-size:10px;
    font-weight:800;
    letter-spacing:1px;
    text-transform:uppercase;
}

.reporte-activo-cabecera h3{
    margin:5px 0 0;
    font-size:17px;
}

.estado-resumen-grid{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(260px,1fr));
    gap:10px;
    padding:14px;
}

.estado-resumen{
    padding:13px 14px;
    border-radius:10px;
    border-left:4px solid #3ed97b;
    background:#12202a;
}

.estado-resumen.PRECAUCION{
    border-color:#f0d33c;
    background:rgba(240,211,60,.08);
}

.estado-resumen.ALERTA{
    border-color:#ff932e;
    background:rgba(255,147,46,.09);
}

.estado-resumen.CRITICO{
    border-color:#ff4a4a;
    background:rgba(255,74,74,.10);
}

.estado-resumen .titulo{
    color:#9db1bc;
    font-size:12px;
}

.estado-resumen strong{
    float:right;
}

.estado-resumen p{
    margin:7px 0 0;
    font-size:12px;
    color:#d8e2e7;
}

.meteo-metricas{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(125px,1fr));
    gap:8px;
    padding:0 14px 14px;
}

.meteo-metrica{
    border:1px solid rgba(255,255,255,.09);
    border-radius:9px;
    padding:10px;
    background:#10202b;
}

.meteo-metrica small{
    display:block;
    color:#84a0b0;
    font-size:10px;
    margin-bottom:5px;
}

.meteo-metrica strong{
    font-size:14px;
}

.acumulados{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(125px,1fr));
    gap:8px;
    padding:0 14px 14px;
}

.acumulado{
    padding:10px;
    border-radius:9px;
    text-align:center;
    background:#102536;
    border:1px solid rgba(52,215,255,.18);
}

.acumulado small{
    display:block;
    color:#8ba3b1;
    margin-bottom:5px;
}

.acumulado strong{
    color:#34d7ff;
    font-size:17px;
}

.extremos{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(190px,1fr));
    gap:8px;
    padding:0 14px 15px;
}

.extremo{
    border:1px solid rgba(255,255,255,.09);
    padding:11px;
    border-radius:9px;
}

.extremo small{
    display:block;
    color:#8ba3b1;
    margin-bottom:4px;
}

.extremo strong{
    display:block;
}

.extremo em{
    display:block;
    color:#7290a0;
    font-size:10px;
    font-style:normal;
    margin-top:4px;
}

.tabla-titulo{
    padding:14px 14px 8px;
    font-weight:800;
    font-size:13px;
}

.evolucion-scroll{
    overflow-x:auto;
    border-top:1px solid rgba(255,255,255,.08);
}

.evolucion-tabla{
    border-collapse:collapse;
    font-size:11px;
    min-width:max-content;
    width:max-content;
}

.evolucion-tabla th,
.evolucion-tabla td{
    min-width:90px;
    max-width:90px;
    text-align:center;
    padding:9px 6px;
    border-right:1px solid rgba(255,255,255,.07);
    border-bottom:1px solid rgba(255,255,255,.07);
}

.evolucion-tabla .fila-nombre{
    position:sticky;
    left:0;
    z-index:5;
    min-width:112px;
    max-width:112px;
    text-align:left;
    font-weight:800;
    background:#111e28;
}

.evolucion-tabla .fecha{
    background:#152532;
    color:#dce8ed;
}

.evolucion-tabla .hora{
    background:#10202b;
    font-weight:700;
}

.condicion-icono{
    display:block;
    font-size:21px;
    margin-bottom:2px;
}

.riesgo{
    display:block;
    border-radius:8px;
    padding:7px 4px;
    font-size:9px;
    font-weight:900;
}

.riesgo.NORMAL{
    color:#8ff0b7;
    background:rgba(54,212,122,.12);
}

.riesgo.PRECAUCION{
    color:#ffe47c;
    background:rgba(240,211,60,.14);
}

.riesgo.ALERTA{
    color:#ffbc76;
    background:rgba(255,147,46,.14);
}

.riesgo.CRITICO{
    color:#ff8c8c;
    background:rgba(255,74,74,.15);
}

.cargando-activos{
    padding:25px;
    text-align:center;
    color:#34d7ff;
}

.error-activo{
    padding:15px;
    color:#ff8686;
}

`;

document.head.appendChild(estilo);


/* ========================================================
   UTILIDADES
   ======================================================== */

function n(valor) {

    const numero = Number(valor);

    return Number.isFinite(numero)
        ? numero
        : null;
}


function fmt(valor, decimales = 1) {

    const numero = n(valor);

    if (numero === null) {
        return "--";
    }

    return numero.toLocaleString(
        "es-CL",
        {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        }
    );
}


function nivel(valor, umbral) {

    const numero = n(valor);

    if (numero === null) {
        return "NORMAL";
    }

    if (numero >= umbral.critico) {
        return "CRITICO";
    }

    if (numero >= umbral.alerta) {
        return "ALERTA";
    }

    if (numero >= umbral.precaucion) {
        return "PRECAUCION";
    }

    return "NORMAL";
}


function peor(...estados) {

    return estados
        .sort(
            (a, b) =>
                PRIORIDAD[b]
                - PRIORIDAD[a]
        )[0]
        || "NORMAL";
}


function suma(datos, desde = 0, cantidad = datos.length) {

    return datos
        .slice(
            desde,
            desde + cantidad
        )
        .reduce(
            (total, dato) =>
                total + (n(dato) || 0),
            0
        );
}


function maximo(datos) {

    let valor = null;
    let indice = -1;

    datos.forEach(
        (dato, i) => {

            const numero = n(dato);

            if (
                numero !== null
                && (
                    valor === null
                    || numero > valor
                )
            ) {

                valor = numero;
                indice = i;
            }
        }
    );

    return {
        valor,
        indice
    };
}


function minimo(datos) {

    const validos =
        datos
            .map(n)
            .filter(
                valor =>
                    valor !== null
            );

    return validos.length
        ? Math.min(...validos)
        : null;
}


function horaTexto(fecha) {

    return String(fecha || "")
        .split("T")[1]
        ?.slice(0, 5)
        || "";
}


function fechaCorta(fecha) {

    const d = new Date(fecha);

    if (Number.isNaN(d.getTime())) {
        return fecha;
    }

    return d.toLocaleDateString(
        "es-CL",
        {
            weekday:"short",
            day:"2-digit",
            month:"2-digit"
        }
    );
}


function fechaHora(fecha) {

    const d = new Date(fecha);

    if (Number.isNaN(d.getTime())) {
        return fecha || "--";
    }

    return d.toLocaleString(
        "es-CL",
        {
            day:"2-digit",
            month:"2-digit",
            year:"numeric",
            hour:"2-digit",
            minute:"2-digit",
            hour12:false
        }
    );
}


/* ========================================================
   CONDICION METEOROLOGICA
   ======================================================== */

function condicion(codigo) {

    const c = Number(codigo);

    if (c === 0) {
        return ["\u2600\uFE0F", "Despejado"];
    }

    if ([1,2].includes(c)) {
        return ["\u26C5", "Parcialmente nublado"];
    }

    if (c === 3) {
        return ["\u2601\uFE0F", "Nublado"];
    }

    if ([45,48].includes(c)) {
        return ["\uD83C\uDF2B\uFE0F", "Niebla"];
    }

    if ([51,53,55,56,57].includes(c)) {
        return ["\uD83C\uDF26\uFE0F", "Llovizna"];
    }

    if ([61,63,65,66,67].includes(c)) {
        return ["\uD83C\uDF27\uFE0F", "Lluvia"];
    }

    if ([71,73,75,77].includes(c)) {
        return ["\uD83C\uDF28\uFE0F", "Nieve"];
    }

    if ([80,81,82].includes(c)) {
        return ["\uD83C\uDF26\uFE0F", "Chubascos"];
    }

    if ([85,86].includes(c)) {
        return ["\uD83C\uDF28\uFE0F", "Chubascos de nieve"];
    }

    if ([95,96,99].includes(c)) {
        return ["\u26C8\uFE0F", "Tormenta"];
    }

    return ["\u2601\uFE0F", "Condicion variable"];
}


function direccionTexto(grados) {

    const numero = n(grados);

    if (numero === null) {
        return "--";
    }

    const puntos = [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW"
    ];

    return puntos[
        Math.round(numero / 22.5) % 16
    ];
}


/* ========================================================
   INVENTARIO
   ======================================================== */

async function cargarInventario() {

    if (!inventarioPromise) {

        inventarioPromise =
            fetch(
                RUTA_ACTIVOS,
                {
                    cache:"force-cache"
                }
            )
            .then(
                respuesta => {

                    if (!respuesta.ok) {
                        throw new Error(
                            "No fue posible cargar activos."
                        );
                    }

                    return respuesta.json();
                }
            );
    }

    return inventarioPromise;
}


function buscarFeature(geojson, id) {

    return (geojson.features || [])
        .find(
            feature =>
                String(
                    feature?.properties?.id
                    || feature?.id
                )
                === String(id)
        );
}


/* ========================================================
   PRONOSTICO
   ======================================================== */

async function consultarPronostico(
    feature,
    horas
) {

    const coordenadas =
        feature?.geometry?.coordinates;

    if (
        feature?.geometry?.type !== "Point"
        || !Array.isArray(coordenadas)
    ) {

        throw new Error(
            "Activo sin coordenadas validas."
        );
    }

    const [lon, lat] = coordenadas;

    const parametros =
        new URLSearchParams({

            latitude:
                Number(lat).toFixed(5),

            longitude:
                Number(lon).toFixed(5),

            hourly:[
                "weather_code",
                "temperature_2m",
                "relative_humidity_2m",
                "precipitation",
                "precipitation_probability",
                "wind_speed_10m",
                "wind_gusts_10m",
                "wind_direction_10m"
            ].join(","),

            forecast_hours:
                String(horas),

            timezone:
                "America/Santiago",

            wind_speed_unit:
                "kmh"
        });

    const respuesta =
        await fetch(
            API + "?"
            + parametros.toString(),
            {
                cache:"no-store"
            }
        );

    if (!respuesta.ok) {

        throw new Error(
            "Open-Meteo HTTP "
            + respuesta.status
        );
    }

    return respuesta.json();
}


/* ========================================================
   RIESGO HORARIO
   ======================================================== */

function evaluarHora(
    horario,
    indice
) {

    const viento =
        n(
            horario.wind_speed_10m[indice]
        );

    const rafaga =
        n(
            horario.wind_gusts_10m[indice]
        );

    const lluvia =
        n(
            horario.precipitation[indice]
        );

    const lluvia24 =
        suma(
            horario.precipitation,
            indice,
            24
        );

    const codigo =
        Number(
            horario.weather_code[indice]
        );

    const candidatos = [

        {
            estado:
                nivel(
                    viento,
                    UMBRALES.viento
                ),
            motivo:"Viento"
        },

        {
            estado:
                nivel(
                    rafaga,
                    UMBRALES.rafaga
                ),
            motivo:"Rafaga"
        },

        {
            estado:
                nivel(
                    lluvia,
                    UMBRALES.lluviaHora
                ),
            motivo:"Lluvia horaria"
        },

        {
            estado:
                nivel(
                    lluvia24,
                    UMBRALES.lluvia24h
                ),
            motivo:"Lluvia 24 h"
        }

    ];

    if (TORMENTA.has(codigo)) {

        candidatos.push({

            estado:
                codigo === 99
                    ? "CRITICO"
                    : "ALERTA",

            motivo:"Tormenta"
        });
    }

    candidatos.sort(
        (a, b) =>
            PRIORIDAD[b.estado]
            - PRIORIDAD[a.estado]
    );

    return candidatos[0];
}


function peorPeriodo(
    horario,
    inicio,
    cantidad
) {

    let peorResultado = {
        estado:"NORMAL",
        motivo:"Sin umbrales superados"
    };

    const fin =
        Math.min(
            horario.time.length,
            inicio + cantidad
        );

    for (
        let i = inicio;
        i < fin;
        i += 1
    ) {

        const resultado =
            evaluarHora(
                horario,
                i
            );

        if (
            PRIORIDAD[resultado.estado]
            >
            PRIORIDAD[peorResultado.estado]
        ) {

            peorResultado =
                resultado;
        }
    }

    return peorResultado;
}


/* ========================================================
   TABLA HORARIA
   ======================================================== */

function gruposFecha(tiempos) {

    const grupos = [];

    let actual = null;

    tiempos.forEach(
        tiempo => {

            const fecha =
                String(tiempo)
                    .split("T")[0];

            if (
                !actual
                || actual.fecha !== fecha
            ) {

                actual = {
                    fecha,
                    cantidad:1
                };

                grupos.push(actual);
            }

            else {

                actual.cantidad += 1;
            }
        }
    );

    return grupos;
}


function fila(
    nombre,
    valores,
    clase = ""
) {

    return `
        <tr>
            <th class="fila-nombre">
                ${nombre}
            </th>

            ${valores
                .map(
                    valor =>
                        `<td class="${clase}">
                            ${valor}
                        </td>`
                )
                .join("")
            }
        </tr>
    `;
}


function crearTabla(horario) {

    const tiempos =
        horario.time || [];

    const fechas =
        gruposFecha(tiempos);

    const filaFecha =
        `
        <tr>
            <th class="fila-nombre fecha">
                Fecha
            </th>

            ${fechas
                .map(
                    grupo =>
                        `
                        <th
                            class="fecha"
                            colspan="${grupo.cantidad}"
                        >
                            ${fechaCorta(
                                grupo.fecha
                            )}
                        </th>
                        `
                )
                .join("")
            }
        </tr>
        `;

    const horas =
        tiempos.map(
            tiempo =>
                `<strong>
                    ${horaTexto(tiempo)}
                </strong>`
        );

    const condiciones =
        horario.weather_code.map(
            codigo => {

                const [icono, texto] =
                    condicion(codigo);

                return `
                    <span class="condicion-icono">
                        ${icono}
                    </span>
                    ${texto}
                `;
            }
        );

    const temperatura =
        horario.temperature_2m.map(
            valor =>
                `${fmt(valor)} &deg;C`
        );

    const lluvia =
        horario.precipitation.map(
            valor =>
                `${fmt(valor)} mm`
        );

    const viento =
        horario.wind_speed_10m.map(
            valor =>
                `${fmt(valor)} km/h`
        );

    const rafaga =
        horario.wind_gusts_10m.map(
            valor =>
                `${fmt(valor)} km/h`
        );

    const riesgo =
        tiempos.map(
            (_, indice) => {

                const r =
                    evaluarHora(
                        horario,
                        indice
                    );

                return `
                    <span
                        class="riesgo ${r.estado}"
                    >
                        ${r.estado}
                    </span>
                    <small>
                        ${r.motivo}
                    </small>
                `;
            }
        );

    return `
        <div class="tabla-titulo">
            Evolucion meteorologica por hora
        </div>

        <div class="evolucion-scroll">

            <table class="evolucion-tabla">

                ${filaFecha}

                ${fila(
                    "Hora",
                    horas,
                    "hora"
                )}

                ${fila(
                    "Condicion",
                    condiciones
                )}

                ${fila(
                    "Temperatura",
                    temperatura
                )}

                ${fila(
                    "Lluvia",
                    lluvia
                )}

                ${fila(
                    "Viento",
                    viento
                )}

                ${fila(
                    "Rafaga",
                    rafaga
                )}

                ${fila(
                    "Riesgo",
                    riesgo
                )}

            </table>

        </div>
    `;
}


/* ========================================================
   RESUMEN ACTIVO
   ======================================================== */

function acumulado(
    horario,
    horas
) {

    return suma(
        horario.precipitation,
        0,
        Math.min(
            horas,
            horario.time.length
        )
    );
}


function crearReporteActivo(
    alias,
    datos,
    horas
) {

    const h =
        datos.hourly;

    const estado24 =
        peorPeriodo(
            h,
            0,
            Math.min(
                24,
                horas
            )
        );

    const estadoExtendido =
        horas > 24
            ? peorPeriodo(
                h,
                24,
                horas - 24
            )
            : null;

    const rafagaMax =
        maximo(
            h.wind_gusts_10m
        );

    const lluviaMax =
        maximo(
            h.precipitation
        );

    const probMax =
        maximo(
            h.precipitation_probability
        );

    const tempMin =
        minimo(
            h.temperature_2m
        );

    const tempMax =
        maximo(
            h.temperature_2m
        );

    const actual =
        0;

    const [icono, textoCondicion] =
        condicion(
            h.weather_code[actual]
        );

    let acumulados = [

        [24, "24 horas"],

        [48, "48 horas"],

        [72, "72 horas"]

    ]
    .filter(
        item =>
            item[0] <= horas
    );

    if (
        horas > 72
    ) {

        acumulados.push([
            horas,
            horas / 24
            + " dias"
        ]);
    }

    const bloqueExtendido =
        estadoExtendido
        ? `
            <div
                class="estado-resumen
                ${estadoExtendido.estado}"
            >
                <div class="titulo">
                    Vigilancia extendida
                    24-${horas} h

                    <strong>
                        ${estadoExtendido.estado}
                    </strong>
                </div>

                <p>
                    ${estadoExtendido.motivo}
                </p>
            </div>
        `
        : "";

    return `
        <article class="reporte-activo">

            <div class="reporte-activo-cabecera">

                <small>
                    Evolucion meteorologica del activo
                </small>

                <h3>
                    ${alias}
                </h3>

            </div>


            <div class="estado-resumen-grid">

                <div
                    class="estado-resumen
                    ${estado24.estado}"
                >

                    <div class="titulo">

                        Estado meteorologico
                        - proximas 24 h

                        <strong>
                            ${estado24.estado}
                        </strong>

                    </div>

                    <p>
                        ${estado24.motivo}
                    </p>

                </div>

                ${bloqueExtendido}

            </div>


            <div class="meteo-metricas">

                <div class="meteo-metrica">
                    <small>Temperatura</small>
                    <strong>
                        ${fmt(
                            h.temperature_2m[actual]
                        )} &deg;C
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Condicion</small>
                    <strong>
                        ${icono}
                        ${textoCondicion}
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Humedad</small>
                    <strong>
                        ${fmt(
                            h.relative_humidity_2m[actual],
                            0
                        )} %
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Precipitacion</small>
                    <strong>
                        ${fmt(
                            h.precipitation[actual]
                        )} mm
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Viento</small>
                    <strong>
                        ${fmt(
                            h.wind_speed_10m[actual]
                        )} km/h
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Rafaga</small>
                    <strong>
                        ${fmt(
                            h.wind_gusts_10m[actual]
                        )} km/h
                    </strong>
                </div>

                <div class="meteo-metrica">
                    <small>Direccion</small>
                    <strong>
                        ${direccionTexto(
                            h.wind_direction_10m[actual]
                        )}
                        ${fmt(
                            h.wind_direction_10m[actual],
                            0
                        )}&deg;
                    </strong>
                </div>

            </div>


            <div class="acumulados">

                ${acumulados
                    .map(
                        ([cantidad, etiqueta]) =>
                            `
                            <div class="acumulado">

                                <small>
                                    ${etiqueta}
                                </small>

                                <strong>
                                    ${fmt(
                                        acumulado(
                                            h,
                                            cantidad
                                        )
                                    )} mm
                                </strong>

                            </div>
                            `
                    )
                    .join("")
                }

            </div>


            <div class="extremos">

                <div class="extremo">

                    <small>
                        Rafaga maxima
                    </small>

                    <strong>
                        ${fmt(
                            rafagaMax.valor
                        )} km/h
                    </strong>

                    <em>
                        ${fechaHora(
                            h.time[
                                rafagaMax.indice
                            ]
                        )}
                    </em>

                </div>


                <div class="extremo">

                    <small>
                        Mayor lluvia horaria
                    </small>

                    <strong>
                        ${fmt(
                            lluviaMax.valor
                        )} mm
                    </strong>

                    <em>
                        ${fechaHora(
                            h.time[
                                lluviaMax.indice
                            ]
                        )}
                    </em>

                </div>


                <div class="extremo">

                    <small>
                        Temperatura del horizonte
                    </small>

                    <strong>
                        ${fmt(tempMin)}
                        a
                        ${fmt(tempMax.valor)}
                        &deg;C
                    </strong>

                </div>


                <div class="extremo">

                    <small>
                        Probabilidad maxima
                    </small>

                    <strong>
                        ${fmt(
                            probMax.valor,
                            0
                        )} %
                    </strong>

                    <em>
                        ${fechaHora(
                            h.time[
                                probMax.indice
                            ]
                        )}
                    </em>

                </div>

            </div>


            ${crearTabla(h)}

        </article>
    `;
}


/* ========================================================
   GENERAR
   ======================================================== */

async function generarActivos() {

    const contenedor =
        document.getElementById(
            "contenido-activos"
        );

    if (!contenedor) {
        return;
    }

    const botonSeleccionado =
        document.querySelector(
            ".horizonte.seleccionado"
        );

    const horas =
        Number(
            botonSeleccionado?.dataset.horas
            || 72
        );

    const seleccionados =
        [
            ...document.querySelectorAll(
                ".item-activo input:checked"
            )
        ]
        .filter(
            input =>
                input
                    .closest(".item-activo")
                    ?.querySelector(".tipo-activo")
        );

    if (!seleccionados.length) {

        contenedor.innerHTML =
            `
            <div class="bloque-vacio">
                No hay activos seleccionados.
            </div>
            `;

        return;
    }

    contenedor.innerHTML =
        `
        <div class="cargando-activos">
            Consultando pronostico meteorologico...
        </div>
        `;

    try {

        const geojson =
            await cargarInventario();

        const reportes = [];

        for (
            const input
            of seleccionados
        ) {

            const id =
                input.value;

            const etiqueta =
                input
                    .closest(".item-activo")
                    ?.querySelector("span:not(.tipo)")
                    ?.textContent
                    ?.trim()
                || id;

            const feature =
                buscarFeature(
                    geojson,
                    id
                );

            if (!feature) {

                reportes.push(
                    `
                    <div class="error-activo">
                        No se encontro ${etiqueta}
                        en el inventario.
                    </div>
                    `
                );

                continue;
            }

            try {

                const datos =
                    await consultarPronostico(
                        feature,
                        horas
                    );

                reportes.push(
                    crearReporteActivo(
                        etiqueta,
                        datos,
                        horas
                    )
                );
            }

            catch (error) {

                console.error(
                    etiqueta,
                    error
                );

                reportes.push(
                    `
                    <div class="error-activo">
                        ${etiqueta}:
                        ${error.message}
                    </div>
                    `
                );
            }
        }

        contenedor.innerHTML =
            reportes.join("");
    }

    catch (error) {

        console.error(error);

        contenedor.innerHTML =
            `
            <div class="error-activo">
                ${error.message}
            </div>
            `;
    }
}


document
    .getElementById(
        "generar-informe"
    )
    ?.addEventListener(
        "click",
        () => {

            generarActivos();

        }
    );

})();
