
(() => {

"use strict";

const API =
    "https://api.open-meteo.com/v1/forecast";

const RUTA_LINEAS =
    "data/processed/lineas_validadas.geojson";

const PRIORIDAD = {
    NORMAL:0,
    PRECAUCION:1,
    ALERTA:2,
    CRITICO:3
};

const UMBRALES = {

    rafaga:{
        precaucion:60,
        alerta:80,
        critico:100
    },

    transversal:{
        precaucion:50,
        alerta:70,
        critico:90
    }

};

let inventarioPromise = null;


/* =======================================================
   ESTILOS
   ======================================================= */

const style =
    document.createElement("style");

style.textContent = `

.contenido-lineas{
    display:flex;
    flex-direction:column;
    gap:18px;
}

.reporte-linea{
    border:1px solid rgba(255,255,255,.11);
    border-radius:13px;
    overflow:hidden;
    background:#0c1720;
}

.linea-cabecera{
    padding:16px 18px;
    background:#111f29;
    border-bottom:1px solid rgba(255,255,255,.09);
}

.linea-cabecera small{
    display:block;
    color:#9be000;
    font-size:10px;
    font-weight:900;
    letter-spacing:1px;
}

.linea-cabecera h3{
    margin:5px 0 0;
    font-size:17px;
}

.linea-resumen{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(160px,1fr));
    gap:9px;
    padding:14px;
}

.linea-card{
    border:1px solid rgba(255,255,255,.09);
    border-radius:9px;
    padding:11px;
    background:#10202b;
}

.linea-card small{
    display:block;
    color:#86a0af;
    margin-bottom:5px;
}

.linea-card strong{
    display:block;
    font-size:15px;
}

.ranking-titulo{
    padding:4px 14px 10px;
    font-size:13px;
    font-weight:800;
}

.ranking-tramos{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(205px,1fr));
    gap:9px;
    padding:0 14px 15px;
}

.tramo-card{
    border:1px solid rgba(255,255,255,.10);
    border-radius:10px;
    padding:11px;
    background:#12202a;
}

.tramo-card h4{
    margin:0 0 10px;
    font-size:12px;
}

.tramo-dato{
    display:flex;
    justify-content:space-between;
    gap:8px;
    font-size:10px;
    margin:6px 0;
    color:#91a6b2;
}

.tramo-dato strong{
    color:#edf5f8;
}

.tramo-riesgo{
    text-align:center;
    border-radius:9px;
    padding:5px;
    margin-top:9px;
    font-size:9px;
    font-weight:900;
}

.tramo-riesgo.NORMAL{
    background:rgba(54,212,122,.13);
    color:#8ff0b7;
}

.tramo-riesgo.PRECAUCION{
    background:rgba(240,211,60,.15);
    color:#ffe47c;
}

.tramo-riesgo.ALERTA{
    background:rgba(255,147,46,.15);
    color:#ffbc76;
}

.tramo-riesgo.CRITICO{
    background:rgba(255,74,74,.16);
    color:#ff8c8c;
}

.cargando-lineas{
    padding:25px;
    text-align:center;
    color:#9be000;
}

.error-linea{
    padding:15px;
    color:#ff8686;
}

`;

document.head.appendChild(style);


/* =======================================================
   UTILIDADES
   ======================================================= */

function n(v){

    const numero =
        Number(v);

    return Number.isFinite(numero)
        ? numero
        : null;
}


function fmt(v,d=1){

    const numero =
        n(v);

    if(numero === null){
        return "--";
    }

    return numero.toLocaleString(
        "es-CL",
        {
            minimumFractionDigits:d,
            maximumFractionDigits:d
        }
    );
}


function nivel(valor,umbrales){

    const numero =
        n(valor);

    if(numero === null){
        return "NORMAL";
    }

    if(numero >= umbrales.critico){
        return "CRITICO";
    }

    if(numero >= umbrales.alerta){
        return "ALERTA";
    }

    if(numero >= umbrales.precaucion){
        return "PRECAUCION";
    }

    return "NORMAL";
}


function peor(a,b){

    return PRIORIDAD[b] > PRIORIDAD[a]
        ? b
        : a;
}


function fechaHora(iso){

    const fecha =
        new Date(iso);

    if(Number.isNaN(fecha.getTime())){
        return iso || "--";
    }

    return fecha.toLocaleString(
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


/* =======================================================
   GEOMETRIA
   ======================================================= */

function rad(g){
    return g * Math.PI / 180;
}


function distanciaKm(a,b){

    const R =
        6371.0088;

    const lat1 =
        rad(a[1]);

    const lat2 =
        rad(b[1]);

    const dLat =
        rad(b[1]-a[1]);

    const dLon =
        rad(b[0]-a[0]);

    const x =
        Math.sin(dLat/2) ** 2
        +
        Math.cos(lat1)
        *
        Math.cos(lat2)
        *
        Math.sin(dLon/2) ** 2;

    return 2 * R *
        Math.atan2(
            Math.sqrt(x),
            Math.sqrt(1-x)
        );
}


function rumbo(a,b){

    const lat1 =
        rad(a[1]);

    const lat2 =
        rad(b[1]);

    const dLon =
        rad(b[0]-a[0]);

    const y =
        Math.sin(dLon)
        *
        Math.cos(lat2);

    const x =
        Math.cos(lat1)
        *
        Math.sin(lat2)
        -
        Math.sin(lat1)
        *
        Math.cos(lat2)
        *
        Math.cos(dLon);

    return (
        Math.atan2(y,x)
        * 180 / Math.PI
        + 360
    ) % 360;
}


function partes(feature){

    const g =
        feature?.geometry;

    if(g?.type === "LineString"){
        return [g.coordinates];
    }

    if(g?.type === "MultiLineString"){
        return g.coordinates;
    }

    return [];
}


function crearPerfiles(feature){

    let offset = 0;

    const perfiles = [];

    partes(feature)
        .forEach(coords => {

            const puntos =
                coords
                    .filter(
                        p =>
                            Array.isArray(p)
                            && p.length >= 2
                    )
                    .map(
                        p => [
                            Number(p[0]),
                            Number(p[1])
                        ]
                    );

            if(puntos.length < 2){
                return;
            }

            const acumuladas = [0];

            for(
                let i=1;
                i<puntos.length;
                i+=1
            ){

                acumuladas.push(
                    acumuladas[i-1]
                    +
                    distanciaKm(
                        puntos[i-1],
                        puntos[i]
                    )
                );
            }

            const longitud =
                acumuladas.at(-1);

            perfiles.push({
                puntos,
                acumuladas,
                longitud,
                offset
            });

            offset += longitud;
        });

    return {
        perfiles,
        longitudTotal:offset
    };
}


function puntoPerfil(
    perfil,
    distancia
){

    const d =
        Math.min(
            Math.max(0,distancia),
            perfil.longitud
        );

    for(
        let i=1;
        i<perfil.acumuladas.length;
        i+=1
    ){

        if(
            perfil.acumuladas[i]
            < d
        ){
            continue;
        }

        const a =
            perfil.puntos[i-1];

        const b =
            perfil.puntos[i];

        const inicio =
            perfil.acumuladas[i-1];

        const largo =
            perfil.acumuladas[i]
            - inicio;

        const p =
            largo > 0
                ? (d-inicio)/largo
                : 0;

        return [
            a[0]
            +(b[0]-a[0])*p,

            a[1]
            +(b[1]-a[1])*p
        ];
    }

    return [
        ...perfil.puntos.at(-1)
    ];
}


function puntoGlobal(
    perfiles,
    distancia
){

    for(
        const perfil
        of perfiles
    ){

        const fin =
            perfil.offset
            +
            perfil.longitud;

        if(distancia <= fin){

            return puntoPerfil(
                perfil,
                distancia
                - perfil.offset
            );
        }
    }

    const ultimo =
        perfiles.at(-1);

    return [
        ...ultimo.puntos.at(-1)
    ];
}


function generarTramos(feature){

    const {
        perfiles,
        longitudTotal
    } =
        crearPerfiles(feature);

    if(
        !perfiles.length
        || longitudTotal <= 0
    ){
        return [];
    }

    // Aproximadamente 5 km por tramo.
    const cantidad =
        Math.max(
            1,
            Math.ceil(
                longitudTotal / 5
            )
        );

    const largoTramo =
        longitudTotal / cantidad;

    const tramos = [];

    for(
        let i=0;
        i<cantidad;
        i+=1
    ){

        const desde =
            i * largoTramo;

        const hasta =
            (i+1) * largoTramo;

        const centro =
            (desde+hasta)/2;

        const pInicio =
            puntoGlobal(
                perfiles,
                desde
            );

        const pFin =
            puntoGlobal(
                perfiles,
                hasta
            );

        const pCentro =
            puntoGlobal(
                perfiles,
                centro
            );

        tramos.push({

            numero:i+1,

            desdeKm:desde,

            hastaKm:hasta,

            centro:pCentro,

            rumbo:
                rumbo(
                    pInicio,
                    pFin
                )

        });
    }

    return tramos;
}


/* =======================================================
   INVENTARIO
   ======================================================= */

async function inventario(){

    if(!inventarioPromise){

        inventarioPromise =
            fetch(
                RUTA_LINEAS,
                {
                    cache:"force-cache"
                }
            )
            .then(respuesta => {

                if(!respuesta.ok){

                    throw new Error(
                        "No fue posible cargar lineas."
                    );
                }

                return respuesta.json();
            });
    }

    return inventarioPromise;
}


function buscar(
    geojson,
    id
){

    return (
        geojson.features || []
    )
    .find(
        f =>
            String(
                f?.properties?.id
                || f?.id
            )
            === String(id)
    );
}


/* =======================================================
   OPEN-METEO
   ======================================================= */

async function consultar(
    tramos,
    horas
){

    const latitudes =
        tramos.map(
            t =>
                t.centro[1]
                    .toFixed(5)
        );

    const longitudes =
        tramos.map(
            t =>
                t.centro[0]
                    .toFixed(5)
        );

    const parametros =
        new URLSearchParams({

            latitude:
                latitudes.join(","),

            longitude:
                longitudes.join(","),

            hourly:[
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
            API
            + "?"
            + parametros.toString(),
            {
                cache:"no-store"
            }
        );

    if(!respuesta.ok){

        throw new Error(
            "Open-Meteo HTTP "
            + respuesta.status
        );
    }

    const datos =
        await respuesta.json();

    return Array.isArray(datos)
        ? datos
        : [datos];
}


/* =======================================================
   EVALUAR TRAMO
   ======================================================= */

function evaluarTramo(
    tramo,
    datos
){

    const h =
        datos?.hourly || {};

    const tiempos =
        h.time || [];

    const rafagas =
        h.wind_gusts_10m || [];

    const direcciones =
        h.wind_direction_10m || [];

    const vientos =
        h.wind_speed_10m || [];

    let mejor = {

        estado:"NORMAL",

        rafaga:null,

        viento:null,

        transversal:null,

        hora:null,

        puntaje:-1

    };

    const cantidad =
        Math.min(
            tiempos.length,
            rafagas.length,
            direcciones.length
        );

    for(
        let i=0;
        i<cantidad;
        i+=1
    ){

        const rafaga =
            n(rafagas[i]);

        const direccion =
            n(direcciones[i]);

        const viento =
            n(vientos[i]);

        if(
            rafaga === null
            || direccion === null
        ){
            continue;
        }

        const diferencia =
            rad(
                direccion
                -
                tramo.rumbo
            );

        const transversal =
            Math.abs(
                rafaga
                *
                Math.sin(
                    diferencia
                )
            );

        const estado =
            peor(
                nivel(
                    rafaga,
                    UMBRALES.rafaga
                ),
                nivel(
                    transversal,
                    UMBRALES.transversal
                )
            );

        const puntaje =
            PRIORIDAD[estado]
            * 100000
            +
            transversal
            * 100
            +
            rafaga;

        if(
            puntaje
            >
            mejor.puntaje
        ){

            mejor = {

                estado,

                rafaga,

                viento,

                transversal,

                hora:
                    tiempos[i],

                puntaje

            };
        }
    }

    return {
        ...tramo,
        ...mejor
    };
}


/* =======================================================
   RENDER
   ======================================================= */

function crearReporte(
    alias,
    feature,
    evaluaciones,
    horas
){

    const orden =
        [...evaluaciones]
        .sort(
            (a,b) =>
                b.puntaje
                -
                a.puntaje
        );

    const peorTramo =
        orden[0];

    let estadoGeneral =
        "NORMAL";

    evaluaciones
        .forEach(
            e => {

                estadoGeneral =
                    peor(
                        estadoGeneral,
                        e.estado
                    );
            }
        );

    const longitud =
        evaluaciones.length
            ? evaluaciones
                .at(-1)
                .hastaKm
            : 0;

    return `

    <article class="reporte-linea">

        <div class="linea-cabecera">

            <small>
                ANALISIS METEOROLOGICO DE LINEA
            </small>

            <h3>
                ${alias}
            </h3>

        </div>


        <div class="linea-resumen">

            <div class="linea-card">

                <small>
                    Estado general
                </small>

                <strong>
                    ${estadoGeneral}
                </strong>

            </div>


            <div class="linea-card">

                <small>
                    Horizonte
                </small>

                <strong>
                    ${horas} h
                </strong>

            </div>


            <div class="linea-card">

                <small>
                    Longitud analizada
                </small>

                <strong>
                    ${fmt(longitud)} km
                </strong>

            </div>


            <div class="linea-card">

                <small>
                    Cantidad de tramos
                </small>

                <strong>
                    ${evaluaciones.length}
                </strong>

            </div>


            <div class="linea-card">

                <small>
                    Tramo mas expuesto
                </small>

                <strong>
                    Tramo ${peorTramo.numero}
                </strong>

            </div>


            <div class="linea-card">

                <small>
                    Hora critica
                </small>

                <strong>
                    ${fechaHora(
                        peorTramo.hora
                    )}
                </strong>

            </div>

        </div>


        <div class="ranking-titulo">
            Ranking de exposicion prevista
        </div>


        <div class="ranking-tramos">

            ${orden
                .map(
                    tramo => `

                    <div class="tramo-card">

                        <h4>

                            Tramo ${tramo.numero}
                            -
                            km
                            ${fmt(tramo.desdeKm)}
                            -
                            ${fmt(tramo.hastaKm)}

                        </h4>


                        <div class="tramo-dato">

                            <span>
                                Rafaga
                            </span>

                            <strong>
                                ${fmt(
                                    tramo.rafaga
                                )} km/h
                            </strong>

                        </div>


                        <div class="tramo-dato">

                            <span>
                                Viento
                            </span>

                            <strong>
                                ${fmt(
                                    tramo.viento
                                )} km/h
                            </strong>

                        </div>


                        <div class="tramo-dato">

                            <span>
                                Transversal
                            </span>

                            <strong>
                                ${fmt(
                                    tramo.transversal
                                )} km/h
                            </strong>

                        </div>


                        <div class="tramo-dato">

                            <span>
                                Hora
                            </span>

                            <strong>
                                ${fechaHora(
                                    tramo.hora
                                )}
                            </strong>

                        </div>


                        <div
                            class="
                                tramo-riesgo
                                ${tramo.estado}
                            "
                        >

                            ${tramo.estado}

                        </div>

                    </div>

                    `
                )
                .join("")
            }

        </div>

    </article>
    `;
}


/* =======================================================
   GENERAR LINEAS
   ======================================================= */

async function generarLineas(){

    const contenedor =
        document.getElementById(
            "contenido-lineas"
        );

    if(!contenedor){
        return;
    }

    const horas =
        Number(
            document.querySelector(
                ".horizonte.seleccionado"
            )
            ?.dataset.horas
            || 72
        );

    const seleccionadas =
        [
            ...document.querySelectorAll(
                ".item-activo input:checked"
            )
        ]
        .filter(
            input =>
                input
                .closest(
                    ".item-activo"
                )
                ?.querySelector(
                    ".tipo-linea"
                )
        );

    if(!seleccionadas.length){

        contenedor.innerHTML =
            `
            <div class="bloque-vacio">
                No hay lineas seleccionadas.
            </div>
            `;

        return;
    }

    contenedor.innerHTML =
        `
        <div class="cargando-lineas">
            Analizando lineas y tramos...
        </div>
        `;

    try{

        const geojson =
            await inventario();

        const reportes = [];

        for(
            const input
            of seleccionadas
        ){

            const id =
                input.value;

            const alias =
                input
                    .closest(
                        ".item-activo"
                    )
                    ?.querySelector(
                        "span:not(.tipo)"
                    )
                    ?.textContent
                    ?.trim()
                || id;

            const feature =
                buscar(
                    geojson,
                    id
                );

            if(!feature){

                reportes.push(
                    `
                    <div class="error-linea">
                        No se encontro ${alias}.
                    </div>
                    `
                );

                continue;
            }

            try{

                const tramos =
                    generarTramos(
                        feature
                    );

                if(!tramos.length){

                    throw new Error(
                        "Geometria de linea no valida."
                    );
                }

                const datos =
                    await consultar(
                        tramos,
                        horas
                    );

                if(
                    datos.length
                    !== tramos.length
                ){

                    throw new Error(
                        "Pronostico incompleto para tramos."
                    );
                }

                const evaluaciones =
                    tramos.map(
                        (tramo,i) =>
                            evaluarTramo(
                                tramo,
                                datos[i]
                            )
                    );

                reportes.push(
                    crearReporte(
                        alias,
                        feature,
                        evaluaciones,
                        horas
                    )
                );

            }

            catch(error){

                console.error(
                    alias,
                    error
                );

                reportes.push(
                    `
                    <div class="error-linea">
                        ${alias}: ${error.message}
                    </div>
                    `
                );
            }
        }

        contenedor.innerHTML =
            reportes.join("");

    }

    catch(error){

        console.error(error);

        contenedor.innerHTML =
            `
            <div class="error-linea">
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
        generarLineas
    );

})();
