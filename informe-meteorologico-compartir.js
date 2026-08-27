
(() => {

"use strict";

const PRIORIDAD = {
    NORMAL: 0,
    PRECAUCION: 1,
    ALERTA: 2,
    CRITICO: 3
};

let ultimoResumenCompartible = "";


/* =========================================================
   ESTILOS
   ========================================================= */

const style =
    document.createElement("style");

style.textContent = `

.informe-encabezado-final{
    display:grid;
    grid-template-columns:
        minmax(250px,1.4fr)
        repeat(3,minmax(150px,.65fr));
    gap:10px;
    margin-bottom:16px;
}

.informe-identidad,
.informe-meta{
    border:1px solid rgba(255,255,255,.10);
    border-radius:11px;
    padding:13px;
    background:#10202b;
}

.informe-identidad small,
.informe-meta small{
    display:block;
    color:#86a0af;
    font-size:10px;
    margin-bottom:5px;
}

.informe-identidad strong{
    font-size:17px;
    color:#edf5f8;
}

.informe-identidad span{
    display:block;
    margin-top:5px;
    color:#9be000;
    font-size:11px;
}

.informe-meta strong{
    font-size:13px;
}

.semaforos-informe{
    display:grid;
    grid-template-columns:
        repeat(4,minmax(130px,1fr));
    gap:8px;
    margin-top:12px;
}

.semaforo-informe{
    border-radius:10px;
    padding:11px;
    border:1px solid rgba(255,255,255,.09);
    background:#10202b;
}

.semaforo-informe small{
    display:block;
    color:#91a6b2;
    margin-bottom:4px;
}

.semaforo-informe strong{
    font-size:20px;
}

.semaforo-normal strong{
    color:#36d47a;
}

.semaforo-precaucion strong{
    color:#f0d33c;
}

.semaforo-alerta strong{
    color:#ff932e;
}

.semaforo-critico strong{
    color:#ff4a4a;
}

.estado-general-final{
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding:7px 12px;
    border-radius:20px;
    font-size:13px;
    font-weight:900;
    margin-top:8px;
}

.estado-general-final.NORMAL{
    color:#8ff0b7;
    background:rgba(54,212,122,.13);
}

.estado-general-final.PRECAUCION{
    color:#ffe47c;
    background:rgba(240,211,60,.14);
}

.estado-general-final.ALERTA{
    color:#ffbc76;
    background:rgba(255,147,46,.14);
}

.estado-general-final.CRITICO{
    color:#ff8c8c;
    background:rgba(255,74,74,.15);
}

.conclusion-operacional{
    line-height:1.65;
    font-size:13px;
    color:#d7e2e8;
}

.conclusion-operacional strong{
    color:#9be000;
}

.informe-acciones{
    display:flex;
    flex-wrap:wrap;
    gap:9px;
}

.informe-accion{
    flex:1;
    min-width:180px;
    border:1px solid rgba(52,215,255,.35);
    border-radius:10px;
    padding:12px 14px;
    background:#102330;
    color:#edf5f8;
    cursor:pointer;
    font-weight:800;
}

.informe-accion:hover{
    border-color:#34d7ff;
}

.informe-accion.principal{
    border-color:rgba(155,224,0,.55);
    color:#9be000;
}

.mensaje-compartir{
    margin-top:10px;
    min-height:18px;
    color:#91a6b2;
    font-size:11px;
}

@media(max-width:900px){

    .informe-encabezado-final{
        grid-template-columns:1fr 1fr;
    }

    .semaforos-informe{
        grid-template-columns:1fr 1fr;
    }
}


/* =========================================================
   IMPRESION / PDF
   ========================================================= */

@media print{

    @page{
        size:A4 landscape;
        margin:8mm;
    }

    body{
        background:white !important;
        color:#111 !important;
        font-family:Arial,sans-serif !important;
    }

    .contenedor{
        width:100% !important;
        margin:0 !important;
    }

    .cabecera,
    body > .contenedor > .panel:nth-of-type(1),
    body > .contenedor > .panel:nth-of-type(2),
    body > .contenedor > .panel:nth-of-type(3),
    .informe-acciones,
    .mensaje-compartir,
    .footer{
        display:none !important;
    }

    #informe{
        display:block !important;
    }

    #informe .panel,
    .reporte-activo,
    .reporte-linea{
        background:white !important;
        color:#111 !important;
        border:1px solid #cbd4d9 !important;
        box-shadow:none !important;
        break-inside:avoid-page;
    }

    #informe .panel{
        margin-bottom:7mm !important;
    }

    .reporte-activo-cabecera,
    .linea-cabecera,
    .resumen-card,
    .estado-resumen,
    .meteo-metrica,
    .acumulado,
    .extremo,
    .linea-card,
    .tramo-card,
    .informe-identidad,
    .informe-meta,
    .semaforo-informe{
        background:white !important;
        color:#111 !important;
        border-color:#ccd5db !important;
    }

    .reporte-activo-cabecera h3,
    .linea-cabecera h3,
    .meteo-metrica strong,
    .extremo strong,
    .linea-card strong,
    .tramo-dato strong{
        color:#111 !important;
    }

    .evolucion-scroll{
        overflow:visible !important;
        max-width:100% !important;
    }

    .evolucion-tabla{
        font-size:6px !important;
    }

    .evolucion-tabla th,
    .evolucion-tabla td{
        min-width:38px !important;
        max-width:38px !important;
        padding:3px 2px !important;
        color:#111 !important;
        border-color:#d5dce0 !important;
    }

    .evolucion-tabla .fila-nombre{
        min-width:60px !important;
        max-width:60px !important;
        background:white !important;
        color:#111 !important;
    }

    .condicion-icono{
        font-size:10px !important;
    }

    .ranking-tramos{
        grid-template-columns:
            repeat(4,1fr) !important;
    }

    .tramo-card{
        break-inside:avoid;
    }

    .subtexto,
    small,
    em{
        color:#555 !important;
    }
}

`;

document.head.appendChild(style);


/* =========================================================
   CREAR BLOQUES DEL INFORME FINAL
   ========================================================= */

function instalarEstructuraFinal(){

    const informe =
        document.getElementById(
            "informe"
        );

    if(!informe){
        return;
    }

    if(
        document.getElementById(
            "encabezado-informe-final"
        )
    ){
        return;
    }

    const resumenPanel =
        informe.querySelector(
            ".panel"
        );

    if(resumenPanel){

        const encabezado =
            document.createElement(
                "div"
            );

        encabezado.id =
            "encabezado-informe-final";

        encabezado.className =
            "informe-encabezado-final";

        encabezado.innerHTML = `

            <div class="informe-identidad">

                <small>
                    GRIDVISION CHILE
                </small>

                <strong>
                    Informe Meteorologico Operacional
                </strong>

                <span>
                    Analisis por activos, lineas y tramos
                </span>

            </div>


            <div class="informe-meta">

                <small>
                    Fecha de generacion
                </small>

                <strong
                    id="informe-fecha"
                >
                    --
                </strong>

            </div>


            <div class="informe-meta">

                <small>
                    Horizonte
                </small>

                <strong
                    id="informe-horizonte-final"
                >
                    --
                </strong>

            </div>


            <div class="informe-meta">

                <small>
                    Fuente meteorologica
                </small>

                <strong>
                    Open-Meteo
                </strong>

            </div>

        `;

        resumenPanel.insertBefore(
            encabezado,
            resumenPanel.firstChild
        );


        const semaforos =
            document.createElement(
                "div"
            );

        semaforos.id =
            "semaforos-informe";

        semaforos.className =
            "semaforos-informe";

        semaforos.innerHTML = `

            <div class="
                semaforo-informe
                semaforo-normal
            ">
                <small>Normal</small>
                <strong id="total-normal">
                    0
                </strong>
            </div>

            <div class="
                semaforo-informe
                semaforo-precaucion
            ">
                <small>Precaucion</small>
                <strong id="total-precaucion">
                    0
                </strong>
            </div>

            <div class="
                semaforo-informe
                semaforo-alerta
            ">
                <small>Alerta</small>
                <strong id="total-alerta">
                    0
                </strong>
            </div>

            <div class="
                semaforo-informe
                semaforo-critico
            ">
                <small>Critico</small>
                <strong id="total-critico">
                    0
                </strong>
            </div>

        `;

        resumenPanel.appendChild(
            semaforos
        );
    }


    const conclusion =
        document.createElement(
            "section"
        );

    conclusion.className =
        "panel";

    conclusion.id =
        "panel-conclusion";

    conclusion.innerHTML = `

        <h2>
            Conclusion operacional
        </h2>

        <div
            id="conclusion-operacional"
            class="conclusion-operacional"
        >
            Genera el informe para obtener
            la conclusion operacional.
        </div>

    `;

    informe.appendChild(
        conclusion
    );


    const acciones =
        document.createElement(
            "section"
        );

    acciones.className =
        "panel";

    acciones.id =
        "panel-acciones-informe";

    acciones.innerHTML = `

        <h2>
            Compartir informe
        </h2>

        <div class="informe-acciones">

            <button
                id="copiar-informe"
                class="
                    informe-accion
                    principal
                "
            >
                COPIAR RESUMEN
            </button>

            <button
                id="compartir-informe"
                class="informe-accion"
            >
                COMPARTIR
            </button>

            <button
                id="pdf-informe"
                class="informe-accion"
            >
                IMPRIMIR / PDF
            </button>

        </div>

        <div
            id="mensaje-compartir"
            class="mensaje-compartir"
        ></div>

    `;

    informe.appendChild(
        acciones
    );
}


/* =========================================================
   ESTADOS
   ========================================================= */

function estadoClase(elemento){

    for(
        const estado
        of Object.keys(PRIORIDAD)
    ){

        if(
            elemento
            ?.classList
            ?.contains(estado)
        ){
            return estado;
        }
    }

    return null;
}


function peorEstado(estados){

    let peor =
        "NORMAL";

    estados.forEach(
        estado => {

            if(
                PRIORIDAD[estado]
                >
                PRIORIDAD[peor]
            ){
                peor = estado;
            }
        }
    );

    return peor;
}


function estadoActivo(article){

    const estados =
        [
            ...article.querySelectorAll(
                ".estado-resumen"
            )
        ]
        .map(estadoClase)
        .filter(Boolean);

    return peorEstado(
        estados
    );
}


function estadoLinea(article){

    const estados =
        [
            ...article.querySelectorAll(
                ".tramo-riesgo"
            )
        ]
        .map(estadoClase)
        .filter(Boolean);

    return peorEstado(
        estados
    );
}


function analizarInforme(){

    const activos =
        [
            ...document.querySelectorAll(
                ".reporte-activo"
            )
        ];

    const lineas =
        [
            ...document.querySelectorAll(
                ".reporte-linea"
            )
        ];

    const registros = [];


    activos.forEach(
        article => {

            registros.push({

                tipo:"ACTIVO",

                nombre:
                    article
                        .querySelector("h3")
                        ?.textContent
                        ?.trim()
                    || "Activo",

                estado:
                    estadoActivo(article)

            });
        }
    );


    lineas.forEach(
        article => {

            registros.push({

                tipo:"LINEA",

                nombre:
                    article
                        .querySelector("h3")
                        ?.textContent
                        ?.trim()
                    || "Linea",

                estado:
                    estadoLinea(article)

            });
        }
    );


    const conteo = {
        NORMAL:0,
        PRECAUCION:0,
        ALERTA:0,
        CRITICO:0
    };


    registros.forEach(
        registro => {

            conteo[
                registro.estado
            ] += 1;
        }
    );


    return {
        activos,
        lineas,
        registros,
        conteo,
        estadoGeneral:
            peorEstado(
                registros.map(
                    r => r.estado
                )
            )
    };
}


/* =========================================================
   CONCLUSION
   ========================================================= */

function crearConclusion(
    analisis,
    horas
){

    const afectados =
        analisis.registros
            .filter(
                r =>
                    r.estado !== "NORMAL"
            );

    const principales =
        afectados
            .slice(0,5)
            .map(
                r =>
                    `${r.nombre} (${r.estado})`
            )
            .join(", ");


    if(
        analisis.estadoGeneral
        === "CRITICO"
    ){

        return `
            <strong>
                Condicion general CRITICA.
            </strong>
            Se identifican condiciones
            meteorologicas criticas dentro
            de las proximas ${horas} horas.
            Se recomienda evaluacion
            operacional inmediata,
            seguimiento meteorologico
            reforzado y revision preventiva
            de los activos y tramos
            expuestos.
            ${principales
                ? `<br><br>
                   Principales elementos:
                   ${principales}.`
                : ""
            }
        `;
    }


    if(
        analisis.estadoGeneral
        === "ALERTA"
    ){

        return `
            <strong>
                Condicion general de ALERTA.
            </strong>
            Se observan variables
            meteorologicas que superan
            umbrales de alerta dentro del
            horizonte de ${horas} horas.
            Se recomienda reforzar el
            seguimiento operacional,
            revisar ventanas horarias de
            mayor exposicion y mantener
            vigilancia preventiva de
            accesos y lineas.
            ${principales
                ? `<br><br>
                   Elementos destacados:
                   ${principales}.`
                : ""
            }
        `;
    }


    if(
        analisis.estadoGeneral
        === "PRECAUCION"
    ){

        return `
            <strong>
                Condicion general de PRECAUCION.
            </strong>
            Se identifican condiciones
            meteorologicas que requieren
            seguimiento dentro de las
            proximas ${horas} horas,
            principalmente en los activos
            o tramos indicados en el
            informe.
            ${principales
                ? `<br><br>
                   Elementos con precaucion:
                   ${principales}.`
                : ""
            }
        `;
    }


    return `
        <strong>
            Condicion general NORMAL.
        </strong>
        No se identifican superaciones de
        los umbrales meteorologicos
        configurados para los activos y
        lineas evaluados durante las
        proximas ${horas} horas.
    `;
}


/* =========================================================
   RESUMEN PARA WHATSAPP / CORREO
   ========================================================= */

function crearTextoCompartible(
    analisis,
    horas
){

    const ahora =
        new Date()
            .toLocaleString(
                "es-CL",
                {
                    dateStyle:"short",
                    timeStyle:"short",
                    hour12:false
                }
            );


    const detalle =
        analisis.registros.length
        ? analisis.registros
            .map(
                r => {

                    const icono = {

                        NORMAL:
                            "\uD83D\uDFE2",

                        PRECAUCION:
                            "\uD83D\uDFE1",

                        ALERTA:
                            "\uD83D\uDFE0",

                        CRITICO:
                            "\uD83D\uDD34"

                    }[r.estado];

                    return (
                        `${icono} `
                        + `${r.nombre}: `
                        + `${r.estado}`
                    );
                }
            )
            .join("\n")
        : "Sin elementos evaluados.";


    let observacion = "";

    if(
        analisis.estadoGeneral
        === "CRITICO"
    ){

        observacion =
            "Se recomienda evaluacion operacional inmediata y seguimiento meteorologico reforzado.";
    }

    else if(
        analisis.estadoGeneral
        === "ALERTA"
    ){

        observacion =
            "Se recomienda reforzar seguimiento operacional y revisar las ventanas de mayor exposicion.";
    }

    else if(
        analisis.estadoGeneral
        === "PRECAUCION"
    ){

        observacion =
            "Mantener seguimiento preventivo de los elementos indicados.";
    }

    else{

        observacion =
            "Sin superaciones de los umbrales meteorologicos configurados.";
    }


    return (
`GRIDVISION CHILE
INFORME METEOROLOGICO OPERACIONAL

Generado: ${ahora}
Horizonte: ${horas} horas
Estado general: ${analisis.estadoGeneral}

RESUMEN
\uD83D\uDFE2 Normal: ${analisis.conteo.NORMAL}
\uD83D\uDFE1 Precaucion: ${analisis.conteo.PRECAUCION}
\uD83D\uDFE0 Alerta: ${analisis.conteo.ALERTA}
\uD83D\uDD34 Critico: ${analisis.conteo.CRITICO}

DETALLE
${detalle}

OBSERVACION OPERACIONAL
${observacion}

Fuente meteorologica: Open-Meteo
Generado por GridVision Chile`
    );
}


/* =========================================================
   ACTUALIZAR INFORME FINAL
   ========================================================= */

function actualizarFinal(){

    instalarEstructuraFinal();

    const horas =
        Number(
            document.querySelector(
                ".horizonte.seleccionado"
            )
            ?.dataset.horas
            || 72
        );


    const analisis =
        analizarInforme();


    const fecha =
        document.getElementById(
            "informe-fecha"
        );

    if(fecha){

        fecha.textContent =
            new Date()
                .toLocaleString(
                    "es-CL",
                    {
                        dateStyle:"short",
                        timeStyle:"short",
                        hour12:false
                    }
                );
    }


    const horizonte =
        document.getElementById(
            "informe-horizonte-final"
        );

    if(horizonte){

        horizonte.textContent =
            horas + " horas";
    }


    const mapaConteos = {

        NORMAL:
            "total-normal",

        PRECAUCION:
            "total-precaucion",

        ALERTA:
            "total-alerta",

        CRITICO:
            "total-critico"

    };


    Object.entries(
        mapaConteos
    )
    .forEach(
        ([estado,id]) => {

            const elemento =
                document.getElementById(
                    id
                );

            if(elemento){

                elemento.textContent =
                    analisis.conteo[
                        estado
                    ];
            }
        }
    );


    const cards =
        [
            ...document.querySelectorAll(
                ".resumen-card"
            )
        ];


    const cardEstado =
        cards.find(
            card =>
                card
                    .querySelector("small")
                    ?.textContent
                    ?.toLowerCase()
                    ?.includes(
                        "estado general"
                    )
        );


    if(cardEstado){

        const strong =
            cardEstado.querySelector(
                "strong"
            );

        if(strong){

            strong.innerHTML =
                `
                <span
                    class="
                        estado-general-final
                        ${analisis.estadoGeneral}
                    "
                >
                    ${analisis.estadoGeneral}
                </span>
                `;
        }
    }


    const conclusion =
        document.getElementById(
            "conclusion-operacional"
        );

    if(conclusion){

        conclusion.innerHTML =
            crearConclusion(
                analisis,
                horas
            );
    }


    ultimoResumenCompartible =
        crearTextoCompartible(
            analisis,
            horas
        );
}


/* =========================================================
   SABER CUANDO TERMINARON LAS CONSULTAS
   ========================================================= */

function informeTodaviaCargando(){

    return Boolean(
        document.querySelector(
            ".cargando-activos, .cargando-lineas"
        )
    );
}


let temporizadorRevision = null;


function programarActualizacion(){

    clearTimeout(
        temporizadorRevision
    );

    temporizadorRevision =
        setTimeout(
            () => {

                if(
                    informeTodaviaCargando()
                ){

                    programarActualizacion();
                    return;
                }

                actualizarFinal();

            },
            350
        );
}


/* =========================================================
   OBSERVADORES
   ========================================================= */

function observar(){

    const objetivos = [

        document.getElementById(
            "contenido-activos"
        ),

        document.getElementById(
            "contenido-lineas"
        )

    ]
    .filter(Boolean);


    objetivos.forEach(
        objetivo => {

            const observer =
                new MutationObserver(
                    programarActualizacion
                );

            observer.observe(
                objetivo,
                {
                    childList:true,
                    subtree:true
                }
            );
        }
    );
}


/* =========================================================
   BOTONES
   ========================================================= */

function mensaje(texto){

    const elemento =
        document.getElementById(
            "mensaje-compartir"
        );

    if(elemento){

        elemento.textContent =
            texto;
    }
}


async function copiar(){

    if(
        !ultimoResumenCompartible
    ){

        actualizarFinal();
    }

    try{

        await navigator.clipboard.writeText(
            ultimoResumenCompartible
        );

        mensaje(
            "Resumen copiado. Ya puedes pegarlo en WhatsApp, correo o Teams."
        );
    }

    catch(error){

        console.error(error);

        mensaje(
            "No fue posible copiar automaticamente."
        );
    }
}


async function compartir(){

    if(
        !ultimoResumenCompartible
    ){

        actualizarFinal();
    }

    try{

        if(
            navigator.share
        ){

            await navigator.share({

                title:
                    "GridVision Chile - Informe Meteorologico Operacional",

                text:
                    ultimoResumenCompartible

            });

            return;
        }


        await navigator.clipboard.writeText(
            ultimoResumenCompartible
        );

        mensaje(
            "Este navegador no permite compartir directamente. El resumen fue copiado."
        );

    }

    catch(error){

        if(
            error?.name !== "AbortError"
        ){

            console.error(error);

            mensaje(
                "No fue posible compartir el informe."
            );
        }
    }
}


function imprimir(){

    actualizarFinal();

    window.print();
}


/* =========================================================
   INICIO
   ========================================================= */

instalarEstructuraFinal();

observar();


document
    .getElementById(
        "generar-informe"
    )
    ?.addEventListener(
        "click",
        () => {

            const informe =
                document.getElementById(
                    "informe"
                );

            informe
                ?.scrollIntoView({
                    behavior:"smooth"
                });

            programarActualizacion();

        }
    );


document
    .getElementById(
        "copiar-informe"
    )
    ?.addEventListener(
        "click",
        copiar
    );


document
    .getElementById(
        "compartir-informe"
    )
    ?.addEventListener(
        "click",
        compartir
    );


document
    .getElementById(
        "pdf-informe"
    )
    ?.addEventListener(
        "click",
        imprimir
    );

})();
