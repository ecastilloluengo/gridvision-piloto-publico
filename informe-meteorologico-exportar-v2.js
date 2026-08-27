
(() => {

"use strict";

const PRIORIDAD = {
    NORMAL: 0,
    PRECAUCION: 1,
    ALERTA: 2,
    CRITICO: 3
};

const ICONO = {
    NORMAL: "\uD83D\uDFE2",
    PRECAUCION: "\uD83D\uDFE1",
    ALERTA: "\uD83D\uDFE0",
    CRITICO: "\uD83D\uDD34"
};


/* =========================================================
   ESTILO NUEVO DE IMPRESION
   ========================================================= */

const style =
    document.createElement("style");

style.textContent = `

#informe-print-v2{
    display:none;
}

@media print{

    @page{
        size:A4 landscape;
        margin:8mm;
    }

    body{
        background:white !important;
    }

    body > .contenedor{
        display:none !important;
    }

    #informe-print-v2{
        display:block !important;
        width:100%;
        color:#111;
        font-family:Arial,sans-serif;
    }

    .print-page{
        width:100%;
        min-height:185mm;
        background:white;
        color:#111;
        page-break-after:always;
        break-after:page;
        overflow:hidden;
    }

    .print-page:last-child{
        page-break-after:auto;
        break-after:auto;
    }

    .print-page-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:10mm;
        padding:0 0 4mm;
        margin-bottom:4mm;
        border-bottom:1px solid #cbd5db;
    }

    .print-page-head small{
        display:block;
        color:#60717b !important;
        font-size:7pt;
        letter-spacing:.8px;
        font-weight:700;
    }

    .print-page-head strong{
        display:block;
        color:#111 !important;
        font-size:13pt;
        margin-top:1mm;
    }

    .print-page-head span{
        color:#60717b !important;
        font-size:8pt;
    }

    .print-page .panel,
    .print-page .reporte-activo,
    .print-page .reporte-linea{
        background:white !important;
        color:#111 !important;
        border:1px solid #ccd5db !important;
        box-shadow:none !important;
        margin:0 !important;
    }

    .print-page .reporte-activo-cabecera,
    .print-page .linea-cabecera,
    .print-page .estado-resumen,
    .print-page .meteo-metrica,
    .print-page .acumulado,
    .print-page .extremo,
    .print-page .linea-card,
    .print-page .tramo-card,
    .print-page .informe-identidad,
    .print-page .informe-meta,
    .print-page .semaforo-informe,
    .print-page .resumen-card{
        background:white !important;
        color:#111 !important;
        border-color:#cbd5db !important;
    }

    .print-page h2,
    .print-page h3,
    .print-page strong{
        color:#111;
    }

    .print-page small,
    .print-page em,
    .print-page p,
    .print-page span{
        color:#4f606a;
    }

    .print-tabla-page{
        min-height:185mm;
    }

    .print-tabla-wrap{
        width:100%;
        overflow:hidden;
    }

    .print-tabla-page .evolucion-tabla{
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        table-layout:fixed !important;
        border-collapse:collapse !important;
        font-size:8pt !important;
    }

    .print-tabla-page .evolucion-tabla th,
    .print-tabla-page .evolucion-tabla td{
        min-width:0 !important;
        max-width:none !important;
        width:auto !important;
        height:auto !important;
        padding:4px 2px !important;
        border:1px solid #d6dde1 !important;
        text-align:center !important;
        vertical-align:middle !important;
        color:#111 !important;
        line-height:1.15 !important;
        overflow:hidden !important;
    }

    .print-tabla-page .evolucion-tabla .fila-nombre{
        width:25mm !important;
        min-width:25mm !important;
        max-width:25mm !important;
        position:static !important;
        background:#f3f6f8 !important;
        font-weight:700 !important;
        text-align:left !important;
        padding-left:3mm !important;
    }

    .print-tabla-page .evolucion-tabla .fecha,
    .print-tabla-page .evolucion-tabla .hora{
        background:#eef3f6 !important;
        color:#111 !important;
        font-weight:700 !important;
    }

    .print-tabla-page .condicion-icono{
        display:block !important;
        font-size:12pt !important;
        margin-bottom:1mm !important;
    }

    .print-tabla-page .riesgo{
        display:block !important;
        font-size:7pt !important;
        font-weight:700 !important;
        padding:4px 1px !important;
        border-radius:3mm !important;
        line-height:1.15 !important;
    }

    .print-tabla-page .riesgo.NORMAL{
        background:#d9f7e5 !important;
        color:#176c3d !important;
    }

    .print-tabla-page .riesgo.PRECAUCION{
        background:#fff3b8 !important;
        color:#815d00 !important;
    }

    .print-tabla-page .riesgo.ALERTA{
        background:#ffe0c2 !important;
        color:#974500 !important;
    }

    .print-tabla-page .riesgo.CRITICO{
        background:#ffd3d3 !important;
        color:#9b1c1c !important;
    }

    .print-tabla-page td small{
        font-size:6.5pt !important;
        color:#555 !important;
    }

    .print-linea-page .ranking-tramos{
        display:grid !important;
        grid-template-columns:
            repeat(4,1fr) !important;
        gap:3mm !important;
    }

    .print-linea-page .tramo-card{
        break-inside:avoid;
        padding:3mm !important;
    }

    .print-linea-page .tramo-card h4{
        color:#111 !important;
        font-size:8pt !important;
    }

    .print-linea-page .tramo-dato{
        font-size:7pt !important;
    }

    .print-linea-page .tramo-dato span{
        color:#555 !important;
    }

    .print-linea-page .tramo-dato strong{
        color:#111 !important;
    }

    .print-resumen-page .panel{
        padding:5mm !important;
    }

    .print-conclusion-page{
        font-size:10pt;
        line-height:1.6;
    }
}

`;

document.head.appendChild(style);


/* =========================================================
   UTILIDADES
   ========================================================= */

function texto(elemento){

    return (
        elemento?.textContent || ""
    )
    .replace(/\s+/g," ")
    .trim();
}


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

    let peor = "NORMAL";

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


function campoPorTitulo(
    contenedor,
    selector,
    titulo
){

    return [
        ...contenedor.querySelectorAll(
            selector
        )
    ]
    .find(
        elemento =>
            texto(
                elemento.querySelector(
                    "small"
                )
            )
            .toLowerCase()
            .includes(
                titulo.toLowerCase()
            )
    );
}


function valorCampo(
    contenedor,
    selector,
    titulo
){

    const campo =
        campoPorTitulo(
            contenedor,
            selector,
            titulo
        );

    if(!campo){
        return null;
    }

    return {
        valor:
            texto(
                campo.querySelector(
                    "strong"
                )
            ),

        fecha:
            texto(
                campo.querySelector(
                    "em"
                )
            )
    };
}


/* =========================================================
   LEER INFORMACION DE ACTIVOS
   ========================================================= */

function leerActivo(article){

    const nombre =
        texto(
            article.querySelector("h3")
        );

    const estados =
        [
            ...article.querySelectorAll(
                ".estado-resumen"
            )
        ]
        .map(
            bloque => ({

                estado:
                    estadoClase(
                        bloque
                    )
                    || "NORMAL",

                titulo:
                    texto(
                        bloque.querySelector(
                            ".titulo"
                        )
                    ),

                motivo:
                    texto(
                        bloque.querySelector(
                            "p"
                        )
                    )

            })
        );

    const estado =
        peorEstado(
            estados.map(
                item => item.estado
            )
        );

    const acumulados =
        [
            ...article.querySelectorAll(
                ".acumulado"
            )
        ]
        .map(
            item => ({

                periodo:
                    texto(
                        item.querySelector(
                            "small"
                        )
                    ),

                valor:
                    texto(
                        item.querySelector(
                            "strong"
                        )
                    )

            })
        );

    return {

        nombre,

        estado,

        estados,

        acumulados,

        rafaga:
            valorCampo(
                article,
                ".extremo",
                "rafaga maxima"
            ),

        lluviaHora:
            valorCampo(
                article,
                ".extremo",
                "mayor lluvia horaria"
            ),

        temperatura:
            valorCampo(
                article,
                ".extremo",
                "temperatura del horizonte"
            ),

        probabilidad:
            valorCampo(
                article,
                ".extremo",
                "probabilidad maxima"
            )
    };
}


/* =========================================================
   LEER INFORMACION DE LINEAS
   ========================================================= */

function leerLinea(article){

    const nombre =
        texto(
            article.querySelector("h3")
        );

    const estadoCard =
        campoPorTitulo(
            article,
            ".linea-card",
            "estado general"
        );

    const estado =
        texto(
            estadoCard
                ?.querySelector("strong")
        )
        || "NORMAL";

    const tramoCard =
        campoPorTitulo(
            article,
            ".linea-card",
            "tramo mas expuesto"
        );

    const horaCard =
        campoPorTitulo(
            article,
            ".linea-card",
            "hora critica"
        );

    const primerTramo =
        article.querySelector(
            ".tramo-card"
        );

    const datos = {};

    if(primerTramo){

        [
            ...primerTramo.querySelectorAll(
                ".tramo-dato"
            )
        ]
        .forEach(
            fila => {

                const clave =
                    texto(
                        fila.querySelector(
                            "span"
                        )
                    );

                const valor =
                    texto(
                        fila.querySelector(
                            "strong"
                        )
                    );

                datos[clave] =
                    valor;
            }
        );
    }

    return {

        nombre,

        estado,

        tramo:
            texto(
                tramoCard
                    ?.querySelector(
                        "strong"
                    )
            ),

        descripcionTramo:
            texto(
                primerTramo
                    ?.querySelector("h4")
            ),

        hora:
            texto(
                horaCard
                    ?.querySelector(
                        "strong"
                    )
            ),

        rafaga:
            datos["Rafaga"]
            || "--",

        viento:
            datos["Viento"]
            || "--",

        transversal:
            datos["Transversal"]
            || "--"

    };
}


/* =========================================================
   RESUMEN COMPLETO PARA WHATSAPP
   ========================================================= */

function crearTextoCompartibleV2(){

    const horas =
        Number(
            document.querySelector(
                ".horizonte.seleccionado"
            )
            ?.dataset.horas
            || 72
        );

    const activos =
        [
            ...document.querySelectorAll(
                ".reporte-activo"
            )
        ]
        .map(leerActivo);

    const lineas =
        [
            ...document.querySelectorAll(
                ".reporte-linea"
            )
        ]
        .map(leerLinea);

    const todos =
        [
            ...activos,
            ...lineas
        ];

    const estadoGeneral =
        peorEstado(
            todos.map(
                item => item.estado
            )
        );

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

    const salida = [];

    salida.push(
        "*GRIDVISION CHILE*"
    );

    salida.push(
        "*INFORME METEOROLOGICO OPERACIONAL*"
    );

    salida.push("");

    salida.push(
        "\uD83D\uDCC5 Generado: "
        + ahora
    );

    salida.push(
        "\u23F1 Horizonte: "
        + horas
        + " horas"
    );

    salida.push(
        ICONO[estadoGeneral]
        + " *ESTADO GENERAL: "
        + estadoGeneral
        + "*"
    );


    if(activos.length){

        salida.push("");
        salida.push(
            "*ACTIVOS*"
        );

        activos.forEach(
            activo => {

                salida.push("");

                salida.push(
                    ICONO[activo.estado]
                    + " *"
                    + activo.nombre
                    + "* - "
                    + activo.estado
                );


                activo.estados.forEach(
                    bloque => {

                        let periodo =
                            bloque.titulo
                            .replace(
                                bloque.estado,
                                ""
                            )
                            .trim();

                        if(periodo){

                            salida.push(
                                "\u2022 "
                                + periodo
                                + ": "
                                + bloque.estado
                                + (
                                    bloque.motivo
                                    ? " - "
                                      + bloque.motivo
                                    : ""
                                )
                            );
                        }
                    }
                );


                if(
                    activo.acumulados.length
                ){

                    salida.push(
                        "\u2022 Precipitacion acumulada: "
                        +
                        activo.acumulados
                        .map(
                            item =>
                                item.periodo
                                + " "
                                + item.valor
                        )
                        .join(" | ")
                    );
                }


                if(activo.rafaga?.valor){

                    salida.push(
                        "\u2022 Rafaga maxima: "
                        + activo.rafaga.valor
                        + (
                            activo.rafaga.fecha
                            ? " - "
                              + activo.rafaga.fecha
                            : ""
                        )
                    );
                }


                if(
                    activo.lluviaHora?.valor
                ){

                    salida.push(
                        "\u2022 Mayor lluvia horaria: "
                        + activo.lluviaHora.valor
                        + (
                            activo.lluviaHora.fecha
                            ? " - "
                              + activo.lluviaHora.fecha
                            : ""
                        )
                    );
                }


                if(
                    activo.temperatura?.valor
                ){

                    salida.push(
                        "\u2022 Temperatura: "
                        + activo.temperatura.valor
                    );
                }


                if(
                    activo.probabilidad?.valor
                ){

                    salida.push(
                        "\u2022 Probabilidad max.: "
                        + activo.probabilidad.valor
                        + (
                            activo.probabilidad.fecha
                            ? " - "
                              + activo.probabilidad.fecha
                            : ""
                        )
                    );
                }

            }
        );
    }


    if(lineas.length){

        salida.push("");
        salida.push(
            "*LINEAS DE EVACUACION*"
        );


        lineas.forEach(
            linea => {

                salida.push("");

                salida.push(
                    ICONO[linea.estado]
                    + " *"
                    + linea.nombre
                    + "* - "
                    + linea.estado
                );

                salida.push(
                    "\u2022 Tramo mas expuesto: "
                    + (
                        linea.descripcionTramo
                        || linea.tramo
                        || "--"
                    )
                );

                salida.push(
                    "\u2022 Rafaga: "
                    + linea.rafaga
                    + " | Transversal: "
                    + linea.transversal
                );

                salida.push(
                    "\u2022 Viento: "
                    + linea.viento
                );

                salida.push(
                    "\u2022 Hora critica: "
                    + (
                        linea.hora
                        || "--"
                    )
                );

            }
        );
    }


    const severos =
        todos.filter(
            item =>
                item.estado
                === estadoGeneral
        );

    salida.push("");
    salida.push(
        "*CONCLUSION OPERACIONAL*"
    );


    if(
        estadoGeneral === "CRITICO"
    ){

        salida.push(
            "\uD83D\uDD34 Se detectan condiciones CRITICAS dentro del horizonte analizado."
        );
    }

    else if(
        estadoGeneral === "ALERTA"
    ){

        salida.push(
            "\uD83D\uDFE0 Se detectan condiciones de ALERTA dentro del horizonte analizado."
        );
    }

    else if(
        estadoGeneral === "PRECAUCION"
    ){

        salida.push(
            "\uD83D\uDFE1 Se detectan condiciones que requieren seguimiento preventivo."
        );
    }

    else{

        salida.push(
            "\uD83D\uDFE2 No se detectan superaciones de los umbrales configurados."
        );
    }


    if(severos.length){

        salida.push(
            "\u2022 Mayor severidad prevista en: "
            +
            severos
            .map(
                item => item.nombre
            )
            .join(", ")
            + "."
        );
    }


    const activoAlerta =
        activos.find(
            item =>
                PRIORIDAD[item.estado] >=
                PRIORIDAD["ALERTA"]
        );

    if(activoAlerta){

        const motivo =
            activoAlerta.estados
            .filter(
                item =>
                    item.estado
                    === activoAlerta.estado
            )
            .map(
                item => item.motivo
            )
            .filter(Boolean)
            .join(", ");

        if(motivo){

            salida.push(
                "\u2022 Causa principal: "
                + activoAlerta.nombre
                + " - "
                + motivo
                + "."
            );
        }
    }


    salida.push(
        "\u2022 Reforzar seguimiento durante las horas de mayor exposicion indicadas en el informe."
    );

    salida.push("");

    salida.push(
        "Fuente: Open-Meteo | GridVision Chile"
    );

    return salida.join("\n");
}


/* =========================================================
   DIVIDIR TABLA HORARIA PARA PDF
   ========================================================= */

function fechasPorColumna(tabla){

    const filaFecha =
        tabla.rows[0];

    if(!filaFecha){
        return [];
    }

    const resultado = [];

    [
        ...filaFecha.cells
    ]
    .slice(1)
    .forEach(
        celda => {

            const cantidad =
                Number(
                    celda.colSpan
                    || 1
                );

            for(
                let i=0;
                i<cantidad;
                i+=1
            ){

                resultado.push(
                    texto(celda)
                );
            }
        }
    );

    return resultado;
}


function crearBloquesTabla(
    tabla,
    maximo = 12
){

    const fechas =
        fechasPorColumna(
            tabla
        );

    const bloques = [];

    let inicioDia = 0;

    while(
        inicioDia
        < fechas.length
    ){

        const fecha =
            fechas[inicioDia];

        let finDia =
            inicioDia + 1;

        while(
            finDia < fechas.length
            &&
            fechas[finDia] === fecha
        ){

            finDia += 1;
        }

        const cantidad =
            finDia - inicioDia;

        const partes =
            Math.ceil(
                cantidad / maximo
            );

        const tamano =
            Math.ceil(
                cantidad / partes
            );

        for(
            let desde =
                inicioDia;
            desde < finDia;
            desde += tamano
        ){

            bloques.push({

                desde,

                hasta:
                    Math.min(
                        finDia,
                        desde + tamano
                    ),

                fecha

            });
        }

        inicioDia =
            finDia;
    }

    return {
        fechas,
        bloques
    };
}


function tablaRecortada(
    tabla,
    desde,
    hasta,
    fechas
){

    const nueva =
        document.createElement(
            "table"
        );

    nueva.className =
        "evolucion-tabla";

    const tbody =
        document.createElement(
            "tbody"
        );

    nueva.appendChild(
        tbody
    );


    const originalFecha =
        tabla.rows[0];

    const filaFecha =
        document.createElement(
            "tr"
        );

    filaFecha.appendChild(
        originalFecha.cells[0]
            .cloneNode(true)
    );

    let indice =
        desde;

    while(
        indice < hasta
    ){

        const fecha =
            fechas[indice];

        let fin =
            indice + 1;

        while(
            fin < hasta
            &&
            fechas[fin] === fecha
        ){
            fin += 1;
        }

        const th =
            document.createElement(
                "th"
            );

        th.className =
            "fecha";

        th.colSpan =
            fin - indice;

        th.textContent =
            fecha;

        filaFecha.appendChild(
            th
        );

        indice =
            fin;
    }

    tbody.appendChild(
        filaFecha
    );


    for(
        let fila=1;
        fila<tabla.rows.length;
        fila+=1
    ){

        const original =
            tabla.rows[fila];

        const nuevaFila =
            document.createElement(
                "tr"
            );

        nuevaFila.appendChild(
            original.cells[0]
                .cloneNode(true)
        );


        for(
            let columna=desde;
            columna<hasta;
            columna+=1
        ){

            const celda =
                original.cells[
                    columna + 1
                ];

            if(celda){

                nuevaFila.appendChild(
                    celda.cloneNode(true)
                );
            }
        }

        tbody.appendChild(
            nuevaFila
        );
    }

    return nueva;
}


/* =========================================================
   PAGINAS PDF
   ========================================================= */

function cabeceraPagina(
    titulo,
    subtitulo
){

    const div =
        document.createElement(
            "div"
        );

    div.className =
        "print-page-head";

    div.innerHTML = `

        <div>

            <small>
                GRIDVISION CHILE
            </small>

            <strong>
                ${titulo}
            </strong>

        </div>

        <span>
            ${subtitulo || ""}
        </span>

    `;

    return div;
}


function paginaResumenGeneral(root){

    const panel =
        document.querySelector(
            "#informe > .panel"
        );

    if(!panel){
        return;
    }

    const pagina =
        document.createElement(
            "section"
        );

    pagina.className =
        "print-page print-resumen-page";

    pagina.appendChild(
        cabeceraPagina(
            "Informe Meteorologico Operacional",
            "Resumen general"
        )
    );

    pagina.appendChild(
        panel.cloneNode(true)
    );

    root.appendChild(
        pagina
    );
}


function paginasActivo(
    root,
    article
){

    const nombre =
        texto(
            article.querySelector("h3")
        );

    const resumen =
        article.cloneNode(true);

    resumen
        .querySelector(
            ".tabla-titulo"
        )
        ?.remove();

    resumen
        .querySelector(
            ".evolucion-scroll"
        )
        ?.remove();


    const paginaResumen =
        document.createElement(
            "section"
        );

    paginaResumen.className =
        "print-page";

    paginaResumen.appendChild(
        cabeceraPagina(
            nombre,
            "Resumen meteorologico del activo"
        )
    );

    paginaResumen.appendChild(
        resumen
    );

    root.appendChild(
        paginaResumen
    );


    const tabla =
        article.querySelector(
            ".evolucion-tabla"
        );

    if(!tabla){
        return;
    }


    const {
        fechas,
        bloques
    } =
        crearBloquesTabla(
            tabla,
            12
        );


    bloques.forEach(
        (bloque,indice) => {

            const pagina =
                document.createElement(
                    "section"
                );

            pagina.className =
                "print-page print-tabla-page";

            pagina.appendChild(
                cabeceraPagina(
                    nombre
                    + " - Evolucion meteorologica por hora",

                    bloque.fecha
                    + " | bloque "
                    + (indice + 1)
                    + " de "
                    + bloques.length
                )
            );


            const wrap =
                document.createElement(
                    "div"
                );

            wrap.className =
                "print-tabla-wrap";


            wrap.appendChild(
                tablaRecortada(
                    tabla,
                    bloque.desde,
                    bloque.hasta,
                    fechas
                )
            );


            pagina.appendChild(
                wrap
            );

            root.appendChild(
                pagina
            );
        }
    );
}


function paginasLinea(
    root,
    article
){

    const nombre =
        texto(
            article.querySelector("h3")
        );

    const originalCards =
        [
            ...article.querySelectorAll(
                ".tramo-card"
            )
        ];

    const cantidadPorPagina =
        8;

    const partes =
        Math.max(
            1,
            Math.ceil(
                originalCards.length
                / cantidadPorPagina
            )
        );


    for(
        let parte=0;
        parte<partes;
        parte+=1
    ){

        const clon =
            article.cloneNode(true);

        const ranking =
            clon.querySelector(
                ".ranking-tramos"
            );

        if(ranking){

            ranking.innerHTML = "";

            originalCards
                .slice(
                    parte
                    * cantidadPorPagina,

                    (parte+1)
                    * cantidadPorPagina
                )
                .forEach(
                    card => {

                        ranking.appendChild(
                            card.cloneNode(true)
                        );
                    }
                );
        }


        if(parte > 0){

            clon
                .querySelector(
                    ".linea-resumen"
                )
                ?.remove();
        }


        const pagina =
            document.createElement(
                "section"
            );

        pagina.className =
            "print-page print-linea-page";

        pagina.appendChild(
            cabeceraPagina(
                nombre,

                partes > 1
                    ? "Ranking de tramos - "
                      + (parte+1)
                      + "/"
                      + partes
                    : "Analisis de linea y tramos"
            )
        );

        pagina.appendChild(
            clon
        );

        root.appendChild(
            pagina
        );
    }
}


function paginaConclusion(root){

    const panel =
        document.getElementById(
            "panel-conclusion"
        );

    if(!panel){
        return;
    }

    const pagina =
        document.createElement(
            "section"
        );

    pagina.className =
        "print-page print-conclusion-page";

    pagina.appendChild(
        cabeceraPagina(
            "Conclusion operacional",
            "GridVision Chile"
        )
    );

    pagina.appendChild(
        panel.cloneNode(true)
    );

    root.appendChild(
        pagina
    );
}


function construirPDFV2(){

    document
        .getElementById(
            "informe-print-v2"
        )
        ?.remove();


    const root =
        document.createElement(
            "div"
        );

    root.id =
        "informe-print-v2";


    paginaResumenGeneral(
        root
    );


    [
        ...document.querySelectorAll(
            ".reporte-activo"
        )
    ]
    .forEach(
        article =>
            paginasActivo(
                root,
                article
            )
    );


    [
        ...document.querySelectorAll(
            ".reporte-linea"
        )
    ]
    .forEach(
        article =>
            paginasLinea(
                root,
                article
            )
    );


    paginaConclusion(
        root
    );


    document.body.appendChild(
        root
    );
}


/* =========================================================
   BOTONES V2
   ========================================================= */

function mensaje(textoMensaje){

    const elemento =
        document.getElementById(
            "mensaje-compartir"
        );

    if(elemento){

        elemento.textContent =
            textoMensaje;
    }
}


async function copiarV2(){

    const contenido =
        crearTextoCompartibleV2();

    try{

        await navigator.clipboard.writeText(
            contenido
        );

        mensaje(
            "Informe operacional detallado copiado. Puedes pegarlo en WhatsApp, correo o Teams."
        );
    }

    catch(error){

        console.error(error);

        mensaje(
            "No fue posible copiar automaticamente."
        );
    }
}


async function compartirV2(){

    const contenido =
        crearTextoCompartibleV2();

    try{

        if(navigator.share){

            await navigator.share({

                title:
                    "GridVision Chile - Informe Meteorologico Operacional",

                text:
                    contenido

            });

            return;
        }


        await navigator.clipboard.writeText(
            contenido
        );

        mensaje(
            "El navegador no permite compartir directamente. El informe detallado fue copiado."
        );

    }

    catch(error){

        if(
            error?.name !== "AbortError"
        ){

            console.error(error);

            mensaje(
                "No fue posible compartir."
            );
        }
    }
}


function imprimirV2(){

    construirPDFV2();

    setTimeout(
        () => {
            window.print();
        },
        120
    );
}


function reemplazarBoton(
    id,
    etiqueta,
    funcion
){

    const anterior =
        document.getElementById(
            id
        );

    if(!anterior){
        return;
    }

    const nuevo =
        anterior.cloneNode(true);

    nuevo.textContent =
        etiqueta;

    anterior.replaceWith(
        nuevo
    );

    nuevo.addEventListener(
        "click",
        funcion
    );
}


reemplazarBoton(
    "copiar-informe",
    "COPIAR PARA WHATSAPP",
    copiarV2
);


reemplazarBoton(
    "compartir-informe",
    "COMPARTIR",
    compartirV2
);


reemplazarBoton(
    "pdf-informe",
    "IMPRIMIR / PDF LEGIBLE",
    imprimirV2
);

})();
