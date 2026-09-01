(() => {

"use strict";

const VERSION_RESUMEN_DIARIO = "5.0.0";
document.documentElement.dataset.gridvisionResumenDiario = VERSION_RESUMEN_DIARIO;
console.info("GridVision: Resumen Diario + SENAPRED v" + VERSION_RESUMEN_DIARIO + " cargado.");

const API =
    "https://api.open-meteo.com/v1/forecast";

const RUTA_ACTIVOS =
    "data/processed/activos_puntuales_validados.geojson";

const RUTA_LINEAS =
    "data/processed/lineas_validadas.geojson";

const RUTA_SENAPRED =
    "data/alertas_senapred.json";

const PRIORIDAD = {
    NORMAL: 0,
    PRECAUCION: 1,
    ALERTA: 2,
    CRITICO: 3
};

const ICONO_ESTADO = {
    NORMAL: "🟢",
    PRECAUCION: "🟡",
    ALERTA: "🟠",
    CRITICO: "🔴"
};

/* Mismos umbrales del informe extendido de activos. */
const UMBRALES_ACTIVO = {
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

/* Mismos umbrales del informe extendido de lineas. */
const UMBRALES_LINEA = {
    rafaga: {
        precaucion: 60,
        alerta: 80,
        critico: 100
    },
    transversal: {
        precaucion: 50,
        alerta: 70,
        critico: 90
    }
};

const TORMENTA = new Set([
    95,
    96,
    99
]);

/*
 * Fallback geografico para el cruce con SENAPRED.
 * Si los GeoJSON traen region/provincia/comuna, esos valores se agregan.
 */
const UBICACION_POR_ID = {
    "GV-02505": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: []
    },
    "GV-02559": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: ["puyehue"]
    },
    "GV-03472": {
        region: ["magallanes"],
        provincia: ["magallanes"],
        comuna: ["punta arenas"]
    },
    "GV-03905": {
        region: ["magallanes"],
        provincia: ["magallanes"],
        comuna: ["punta arenas"]
    },
    "GV-00743": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: []
    },
    "GV-00563": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: []
    },
    "GV-00597": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: []
    },
    "GV-00133": {
        region: ["los lagos"],
        provincia: ["osorno"],
        comuna: ["osorno"]
    }
};


function zonaDesdeUbicacion(ubicacion){

    const regiones =
        ubicacion?.region || [];

    if(
        regiones.some(
            region =>
                region.includes("magallanes")
        )
    ){
        return "Magallanes";
    }

    if(
        regiones.some(
            region =>
                region.includes("los lagos")
        )
    ){
        return "Los Lagos";
    }

    if(
        regiones.some(
            region =>
                region.includes("los rios")
        )
    ){
        return "Los Rios";
    }

    return "Otra zona";
}


function zonaEntidad(entidad){

    return zonaDesdeUbicacion(
        entidad?.ubicacion || {}
    );
}


let ultimoResultado = null;
let ejecucionActual = 0;


/* =========================================================
   ESTILOS
   ========================================================= */

const style =
    document.createElement("style");

style.textContent = `

#resumen-diario-gridvision{
    margin-top:16px;
    padding-top:16px;
    border-top:1px solid rgba(255,255,255,.10);
}

.resumen-diario-cabecera{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:16px;
    margin-bottom:12px;
}

.resumen-diario-cabecera h3{
    margin:0;
    font-size:17px;
}

.resumen-diario-cabecera p{
    margin:4px 0 0;
    color:#91a6b2;
    font-size:11px;
    line-height:1.45;
}

.resumen-integrado{
    flex:0 0 auto;
    border:1px solid rgba(255,255,255,.10);
    border-radius:11px;
    padding:9px 12px;
    background:#10202b;
    text-align:right;
}

.resumen-integrado small{
    display:block;
    color:#91a6b2;
    font-size:9px;
    margin-bottom:3px;
}

.resumen-integrado strong{
    font-size:13px;
}

.resumen-senapred-band{
    border:1px solid rgba(52,215,255,.20);
    background:rgba(52,215,255,.045);
    border-radius:10px;
    padding:10px 12px;
    margin-bottom:12px;
    font-size:10px;
    line-height:1.35;
}

.resumen-senapred-band > strong{
    color:#34d7ff;
}

.resumen-senapred-zonas{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(260px,1fr));
    gap:7px;
    margin-top:8px;
}

.resumen-senapred-zona{
    border:1px solid rgba(255,255,255,.08);
    border-radius:8px;
    padding:8px 9px;
    background:#10202b;
}

.resumen-senapred-zona strong{
    color:#edf5f8;
}

.resumen-senapred-zona small{
    display:block;
    margin-top:3px;
    color:#91a6b2;
    font-size:8.5px;
    line-height:1.25;
}

.resumen-senapred-alerta{
    margin-top:4px;
    color:#cdeef7;
}

.resumen-senapred-band .senapred-frescura{
    color:#91a6b2;
    margin-top:6px;
    font-size:8.5px;
}

.resumen-diario-grid{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(215px,1fr));
    gap:9px;
}

.resumen-dia-card{
    border:1px solid rgba(255,255,255,.10);
    border-left:4px solid #36d47a;
    border-radius:10px;
    padding:9px 10px;
    background:#10202b;
    break-inside:avoid;
}

.resumen-dia-card.PRECAUCION{
    border-left-color:#f0d33c;
    background:rgba(240,211,60,.06);
}

.resumen-dia-card.ALERTA{
    border-left-color:#ff932e;
    background:rgba(255,147,46,.07);
}

.resumen-dia-card.CRITICO{
    border-left-color:#ff4a4a;
    background:rgba(255,74,74,.08);
}

.resumen-dia-head{
    display:flex;
    justify-content:space-between;
    gap:10px;
    align-items:flex-start;
}

.resumen-dia-fecha{
    font-weight:900;
    font-size:12px;
    text-transform:capitalize;
}

.resumen-dia-estado{
    font-size:9px;
    font-weight:900;
    white-space:nowrap;
}

.resumen-dia-meteo{
    color:#91a6b2;
    font-size:9px;
    margin-top:3px;
}

.resumen-dia-metricas{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:5px 8px;
    margin-top:7px;
    font-size:9.5px;
}

.resumen-dia-metricas span{
    color:#dce8ed;
}

.resumen-dia-foco{
    margin-top:6px;
    padding-top:5px;
    border-top:1px solid rgba(255,255,255,.08);
    font-size:10px;
    line-height:1.35;
}

.resumen-dia-foco strong{
    color:#edf5f8;
}

.resumen-dia-senapred{
    margin-top:6px;
    padding:6px 7px;
    border-radius:8px;
    background:rgba(52,215,255,.07);
    color:#cdeef7;
    font-size:8.5px;
    line-height:1.3;
}

.resumen-dia-senapred-linea + .resumen-dia-senapred-linea{
    margin-top:3px;
}

.resumen-dia-zona{
    display:inline-block;
    margin-right:4px;
    padding:1px 4px;
    border-radius:5px;
    border:1px solid rgba(52,215,255,.22);
    color:#34d7ff;
    font-weight:900;
}

.resumen-dia-aplica{
    color:#91a6b2;
}

.resumen-dia-elevado{
    margin-top:6px;
    color:#f0d33c;
    font-size:9px;
    font-weight:800;
}

.resumen-matriz-titulo{
    margin:14px 0 7px;
    font-size:11px;
    font-weight:900;
}

.resumen-matriz-wrap{
    width:100%;
    overflow-x:auto;
    border:1px solid rgba(255,255,255,.09);
    border-radius:10px;
}

.resumen-matriz{
    width:100%;
    min-width:760px;
    border-collapse:collapse;
    font-size:9px;
}

.resumen-matriz th,
.resumen-matriz td{
    padding:7px 6px;
    text-align:center;
    border-right:1px solid rgba(255,255,255,.06);
    border-bottom:1px solid rgba(255,255,255,.06);
}

.resumen-matriz th{
    color:#91a6b2;
    background:#111f29;
}

.resumen-matriz .entidad{
    position:sticky;
    left:0;
    z-index:2;
    min-width:190px;
    text-align:left;
    background:#111f29;
    color:#edf5f8;
    font-weight:800;
}

.resumen-matriz-chip{
    display:inline-block;
    padding:3px 5px;
    border-radius:7px;
    font-size:8px;
    font-weight:900;
}

.resumen-matriz-chip.NORMAL{
    background:rgba(54,212,122,.12);
    color:#8ff0b7;
}

.resumen-matriz-chip.PRECAUCION{
    background:rgba(240,211,60,.14);
    color:#ffe47c;
}

.resumen-matriz-chip.ALERTA{
    background:rgba(255,147,46,.14);
    color:#ffbc76;
}

.resumen-matriz-chip.CRITICO{
    background:rgba(255,74,74,.15);
    color:#ff8c8c;
}

.resumen-matriz-dato{
    display:block;
    margin-top:3px;
    color:#91a6b2;
    font-size:7.5px;
}

.resumen-matriz-fuentes{
    display:block;
    margin-top:2px;
    color:#91a6b2;
    font-size:7px;
}

.resumen-diario-cargando,
.resumen-diario-error{
    padding:12px;
    border:1px dashed rgba(255,255,255,.15);
    border-radius:10px;
    color:#91a6b2;
    text-align:center;
    font-size:11px;
}

.resumen-diario-error{
    color:#ff9292;
}

@media(max-width:760px){
    .resumen-diario-cabecera{
        display:block;
    }

    .resumen-integrado{
        margin-top:9px;
        text-align:left;
    }
}

@media print{
    .print-resumen-page #resumen-diario-gridvision{
        margin-top:3mm !important;
        padding-top:3mm !important;
        border-top:1px solid #cbd5db !important;
    }

    .print-resumen-page .resumen-diario-cabecera{
        margin-bottom:2mm !important;
    }

    .print-resumen-page .resumen-diario-cabecera h3{
        font-size:9pt !important;
    }

    .print-resumen-page .resumen-diario-cabecera p,
    .print-resumen-page .resumen-integrado,
    .print-resumen-page .resumen-senapred-band{
        font-size:6.2pt !important;
    }

    .print-resumen-page .resumen-senapred-band{
        padding:1.3mm 1.7mm !important;
        margin-bottom:1.5mm !important;
        background:#f7fbfd !important;
        color:#111 !important;
        border-color:#cbd5db !important;
    }

    .print-resumen-page .resumen-senapred-zonas{
        grid-template-columns:repeat(2,1fr) !important;
        gap:1mm !important;
        margin-top:1mm !important;
    }

    .print-resumen-page .resumen-senapred-zona{
        padding:1mm 1.2mm !important;
        background:white !important;
        color:#111 !important;
        border-color:#d8dfe3 !important;
    }

    .print-resumen-page .resumen-senapred-zona small,
    .print-resumen-page .resumen-senapred-alerta{
        font-size:5.2pt !important;
        line-height:1.15 !important;
        color:#333 !important;
    }

    .print-resumen-page .resumen-diario-grid{
        grid-template-columns:repeat(4,1fr) !important;
        gap:1.2mm !important;
    }

    .print-resumen-page .resumen-dia-card{
        padding:1.1mm !important;
        min-height:0 !important;
        break-inside:avoid-page !important;
        background:white !important;
        color:#111 !important;
        border-color:#cbd5db !important;
    }

    .print-resumen-page .resumen-dia-fecha{
        font-size:6.8pt !important;
    }

    .print-resumen-page .resumen-dia-estado,
    .print-resumen-page .resumen-dia-meteo,
    .print-resumen-page .resumen-dia-metricas,
    .print-resumen-page .resumen-dia-foco,
    .print-resumen-page .resumen-dia-senapred,
    .print-resumen-page .resumen-dia-elevado{
        font-size:5.1pt !important;
        color:#333 !important;
        line-height:1.2 !important;
    }

    .print-resumen-page .resumen-dia-metricas{
        gap:.7mm 1mm !important;
        margin-top:1mm !important;
    }

    .print-resumen-page .resumen-dia-foco,
    .print-resumen-page .resumen-dia-senapred{
        margin-top:1mm !important;
        padding-top:1mm !important;
    }

    .print-resumen-page .resumen-matriz-titulo{
        break-before:page !important;
        page-break-before:always !important;
        margin:0 0 1.5mm !important;
        padding-top:1mm !important;
        font-size:7pt !important;
    }

    .print-resumen-page .resumen-matriz-wrap{
        overflow:visible !important;
        border-color:#cbd5db !important;
    }

    .print-resumen-page .resumen-matriz{
        min-width:0 !important;
        font-size:5.3pt !important;
    }

    .print-resumen-page .resumen-matriz th,
    .print-resumen-page .resumen-matriz td{
        padding:1mm .7mm !important;
        border-color:#d8dfe3 !important;
        color:#111 !important;
    }

    .print-resumen-page .resumen-matriz .entidad{
        position:static !important;
        min-width:30mm !important;
        background:#f3f6f8 !important;
        color:#111 !important;
    }

    .print-resumen-page .resumen-matriz-chip,
    .print-resumen-page .resumen-matriz-dato,
    .print-resumen-page .resumen-matriz-fuentes{
        font-size:4.8pt !important;
        color:#111 !important;
    }
 }

@media print{
    .print-leyenda-page{
        background:#fff !important;
        color:#111 !important;
        padding:0 !important;
    }

    .print-leyenda-page .gv-leyenda-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10mm;
        padding-bottom:4mm;
        margin-bottom:6mm;
        border-bottom:1px solid #cbd4d9;
    }

    .print-leyenda-page .gv-leyenda-head small{
        display:block;
        font-size:7pt !important;
        color:#555 !important;
        letter-spacing:.5px;
        margin-bottom:1mm;
    }

    .print-leyenda-page .gv-leyenda-head strong{
        display:block;
        font-size:14pt !important;
        color:#111 !important;
    }

    .print-leyenda-page .gv-leyenda-head span{
        font-size:7pt !important;
        color:#666 !important;
    }

    .print-leyenda-page .gv-leyenda-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:5mm;
    }

    .print-leyenda-page .gv-leyenda-bloque{
        border:1px solid #d5dde2;
        border-radius:3mm;
        padding:4mm;
        break-inside:avoid;
    }

    .print-leyenda-page .gv-leyenda-bloque h3{
        margin:0 0 3mm;
        font-size:9pt !important;
        color:#111 !important;
    }

    .print-leyenda-page .gv-leyenda-bloque p,
    .print-leyenda-page .gv-leyenda-bloque li{
        margin:0 0 2mm;
        font-size:7pt !important;
        line-height:1.45;
        color:#222 !important;
    }

    .print-leyenda-page .gv-leyenda-bloque ul{
        margin:0;
        padding-left:5mm;
    }

    .print-leyenda-page .gv-leyenda-nota{
        grid-column:1 / -1;
        border-left:1.2mm solid #34a7c7;
        background:#f3f8fa !important;
    }

    .print-leyenda-page .gv-chip{
        font-weight:700;
        white-space:nowrap;
    }
}

`;

document.head.appendChild(style);


/* =========================================================
   UTILIDADES
   ========================================================= */

function n(valor){

    const numero =
        Number(valor);

    return Number.isFinite(numero)
        ? numero
        : null;
}


function fmt(valor, decimales = 1){

    const numero =
        n(valor);

    if(numero === null){
        return "--";
    }

    return numero.toLocaleString(
        "es-CL",
        {
            minimumFractionDigits:decimales,
            maximumFractionDigits:decimales
        }
    );
}


function normalizar(texto){

    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


function nivel(valor, umbrales){

    const numero = n(valor);

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


function peorEstado(...estados){

    return estados
        .flat()
        .filter(Boolean)
        .sort(
            (a,b) =>
                PRIORIDAD[b]
                - PRIORIDAD[a]
        )[0]
        || "NORMAL";
}


function suma(datos, desde = 0, cantidad = datos.length){

    return datos
        .slice(
            desde,
            desde + cantidad
        )
        .reduce(
            (total, valor) =>
                total + (n(valor) || 0),
            0
        );
}


function promedio(datos){

    const validos =
        datos
        .map(n)
        .filter(
            valor => valor !== null
        );

    if(!validos.length){
        return null;
    }

    return validos.reduce(
        (a,b) => a + b,
        0
    ) / validos.length;
}


function maximo(datos){

    let valor = null;
    let indice = -1;

    datos.forEach(
        (dato,i) => {

            const numero = n(dato);

            if(
                numero !== null
                && (
                    valor === null
                    || numero > valor
                )
            ){
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


function minimo(datos){

    const validos =
        datos
        .map(n)
        .filter(
            valor => valor !== null
        );

    return validos.length
        ? Math.min(...validos)
        : null;
}


function fechaSolo(iso){

    return String(iso || "")
        .slice(0,10);
}


function horaSolo(iso){

    return String(iso || "")
        .split("T")[1]
        ?.slice(0,5)
        || "--:--";
}


function fechaEtiqueta(fechaISO){

    const d =
        new Date(
            fechaISO + "T12:00:00"
        );

    if(Number.isNaN(d.getTime())){
        return fechaISO;
    }

    return d.toLocaleDateString(
        "es-CL",
        {
            weekday:"long",
            day:"numeric",
            month:"short"
        }
    );
}


function fechaCorta(fechaISO){

    const d =
        new Date(
            fechaISO + "T12:00:00"
        );

    if(Number.isNaN(d.getTime())){
        return fechaISO;
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


function condicion(codigo){

    const c = Number(codigo);

    if(c === 0){
        return ["☀️", "Despejado"];
    }

    if([1,2].includes(c)){
        return ["⛅", "Parcialmente nublado"];
    }

    if(c === 3){
        return ["☁️", "Nublado"];
    }

    if([45,48].includes(c)){
        return ["🌫️", "Niebla"];
    }

    if([51,53,55,56,57].includes(c)){
        return ["🌦️", "Llovizna"];
    }

    if([61,63,65,66,67].includes(c)){
        return ["🌧️", "Lluvia"];
    }

    if([71,73,75,77].includes(c)){
        return ["🌨️", "Nieve"];
    }

    if([80,81,82].includes(c)){
        return ["🌦️", "Chubascos"];
    }

    if([85,86].includes(c)){
        return ["🌨️", "Chubascos de nieve"];
    }

    if([95,96,99].includes(c)){
        return ["⛈️", "Tormenta"];
    }

    return ["☁️", "Condicion variable"];
}


function codigoDominante(codigos){

    const conteo =
        new Map();

    codigos.forEach(
        codigo => {

            const clave = Number(codigo);

            conteo.set(
                clave,
                (conteo.get(clave) || 0) + 1
            );
        }
    );

    let elegido = codigos[0] ?? 3;
    let cantidad = -1;

    conteo.forEach(
        (valor, codigo) => {

            if(valor > cantidad){
                elegido = codigo;
                cantidad = valor;
            }
        }
    );

    return elegido;
}


function agruparIndicesPorFecha(tiempos, dias){

    const mapa = new Map();

    tiempos.forEach(
        (tiempo,indice) => {

            const fecha =
                fechaSolo(tiempo);

            if(!mapa.has(fecha)){
                mapa.set(fecha, []);
            }

            mapa.get(fecha).push(indice);
        }
    );

    return [
        ...mapa.entries()
    ]
    .slice(0,dias)
    .map(
        ([fecha,indices]) => ({
            fecha,
            indices
        })
    );
}


function puntuacionEstado(estado, factor = 0){

    return (
        PRIORIDAD[estado]
        * 1000000
        + factor
    );
}


/* =========================================================
   ACTIVO - MISMA LOGICA DEL INFORME EXTENDIDO
   ========================================================= */

function evaluarHoraActivo(horario, indice){

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

    /*
     * Se replica exactamente el criterio actual del informe:
     * suma desde la hora evaluada hacia las siguientes 24 h.
     */
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
                    UMBRALES_ACTIVO.viento
                ),
            motivo:"Viento",
            valor:viento,
            unidad:"km/h"
        },
        {
            estado:
                nivel(
                    rafaga,
                    UMBRALES_ACTIVO.rafaga
                ),
            motivo:"Rafaga",
            valor:rafaga,
            unidad:"km/h"
        },
        {
            estado:
                nivel(
                    lluvia,
                    UMBRALES_ACTIVO.lluviaHora
                ),
            motivo:"Lluvia horaria",
            valor:lluvia,
            unidad:"mm/h"
        },
        {
            estado:
                nivel(
                    lluvia24,
                    UMBRALES_ACTIVO.lluvia24h
                ),
            motivo:"Lluvia 24 h",
            valor:lluvia24,
            unidad:"mm"
        }
    ];

    if(TORMENTA.has(codigo)){

        candidatos.push({
            estado:
                codigo === 99
                    ? "CRITICO"
                    : "ALERTA",
            motivo:"Tormenta",
            valor:null,
            unidad:""
        });
    }

    candidatos.sort(
        (a,b) => {

            const diferencia =
                PRIORIDAD[b.estado]
                - PRIORIDAD[a.estado];

            if(diferencia){
                return diferencia;
            }

            return (
                (n(b.valor) || 0)
                - (n(a.valor) || 0)
            );
        }
    );

    return candidatos[0];
}


function evaluarActivoDia(
    id,
    nombre,
    horario,
    fecha,
    indices
){

    let peor = {
        estado:"NORMAL",
        motivo:"Sin umbrales superados",
        valor:null,
        unidad:"",
        hora:null,
        indice:-1,
        score:0
    };

    indices.forEach(
        indice => {

            const r =
                evaluarHoraActivo(
                    horario,
                    indice
                );

            const score =
                puntuacionEstado(
                    r.estado,
                    (n(r.valor) || 0) * 100
                    + (n(horario.wind_gusts_10m[indice]) || 0)
                );

            if(score > peor.score){
                peor = {
                    ...r,
                    hora:
                        horario.time[indice],
                    indice,
                    score
                };
            }
        }
    );

    const temperaturas =
        indices.map(
            i => horario.temperature_2m[i]
        );

    const lluvias =
        indices.map(
            i => horario.precipitation[i]
        );

    const vientos =
        indices.map(
            i => horario.wind_speed_10m[i]
        );

    const rafagas =
        indices.map(
            i => horario.wind_gusts_10m[i]
        );

    const probabilidades =
        indices.map(
            i => horario.precipitation_probability[i]
        );

    const codigos =
        indices.map(
            i => horario.weather_code[i]
        );

    const codigo =
        codigoDominante(codigos);

    const [icono, textoCondicion] =
        condicion(codigo);

    return {
        id,
        nombre,
        tipo:"ACTIVO",
        fecha,
        estado:peor.estado,
        motivo:peor.motivo,
        motivoValor:peor.valor,
        motivoUnidad:peor.unidad,
        hora:peor.hora,
        score:peor.score,
        tempMin:minimo(temperaturas),
        tempMax:maximo(temperaturas).valor,
        lluvia:suma(lluvias),
        vientoMedio:promedio(vientos),
        vientoMax:maximo(vientos).valor,
        rafaga:maximo(rafagas).valor,
        probabilidad:maximo(probabilidades).valor,
        condicionIcono:icono,
        condicionTexto:textoCondicion
    };
}


async function consultarActivo(feature, horas){

    const coordenadas =
        feature?.geometry?.coordinates;

    if(
        feature?.geometry?.type !== "Point"
        || !Array.isArray(coordenadas)
    ){
        throw new Error(
            "Activo sin coordenadas validas."
        );
    }

    const [lon,lat] = coordenadas;

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
            API + "?" + parametros.toString(),
            {cache:"no-store"}
        );

    if(!respuesta.ok){
        throw new Error(
            "Open-Meteo HTTP "
            + respuesta.status
        );
    }

    return respuesta.json();
}


/* =========================================================
   LINEA - MISMA LOGICA DEL INFORME EXTENDIDO
   ========================================================= */

function rad(grados){
    return grados * Math.PI / 180;
}


function distanciaKm(a,b){

    const R = 6371.0088;

    const lat1 = rad(a[1]);
    const lat2 = rad(b[1]);
    const dLat = rad(b[1]-a[1]);
    const dLon = rad(b[0]-a[0]);

    const x =
        Math.sin(dLat/2) ** 2
        +
        Math.cos(lat1)
        * Math.cos(lat2)
        * Math.sin(dLon/2) ** 2;

    return 2 * R * Math.atan2(
        Math.sqrt(x),
        Math.sqrt(1-x)
    );
}


function rumbo(a,b){

    const lat1 = rad(a[1]);
    const lat2 = rad(b[1]);
    const dLon = rad(b[0]-a[0]);

    const y =
        Math.sin(dLon)
        * Math.cos(lat2);

    const x =
        Math.cos(lat1)
        * Math.sin(lat2)
        -
        Math.sin(lat1)
        * Math.cos(lat2)
        * Math.cos(dLon);

    return (
        Math.atan2(y,x)
        * 180 / Math.PI
        + 360
    ) % 360;
}


function partes(feature){

    const g = feature?.geometry;

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
        .forEach(
            coords => {

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
                        + distanciaKm(
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
            }
        );

    return {
        perfiles,
        longitudTotal:offset
    };
}


function puntoPerfil(perfil, distancia){

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

        if(perfil.acumuladas[i] < d){
            continue;
        }

        const a = perfil.puntos[i-1];
        const b = perfil.puntos[i];
        const inicio = perfil.acumuladas[i-1];
        const largo =
            perfil.acumuladas[i] - inicio;

        const p =
            largo > 0
                ? (d-inicio)/largo
                : 0;

        return [
            a[0] + (b[0]-a[0])*p,
            a[1] + (b[1]-a[1])*p
        ];
    }

    return [
        ...perfil.puntos.at(-1)
    ];
}


function puntoGlobal(perfiles, distancia){

    for(const perfil of perfiles){

        const fin =
            perfil.offset
            + perfil.longitud;

        if(distancia <= fin){
            return puntoPerfil(
                perfil,
                distancia - perfil.offset
            );
        }
    }

    const ultimo = perfiles.at(-1);

    return [
        ...ultimo.puntos.at(-1)
    ];
}


function generarTramos(feature){

    const {
        perfiles,
        longitudTotal
    } = crearPerfiles(feature);

    if(
        !perfiles.length
        || longitudTotal <= 0
    ){
        return [];
    }

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

        const desde = i * largoTramo;
        const hasta = (i+1) * largoTramo;
        const centro = (desde+hasta)/2;

        const pInicio =
            puntoGlobal(perfiles,desde);

        const pFin =
            puntoGlobal(perfiles,hasta);

        const pCentro =
            puntoGlobal(perfiles,centro);

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


async function consultarLinea(tramos, horas){

    const latitudes =
        tramos.map(
            t => t.centro[1].toFixed(5)
        );

    const longitudes =
        tramos.map(
            t => t.centro[0].toFixed(5)
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
            API + "?" + parametros.toString(),
            {cache:"no-store"}
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


function evaluarTramoDia(
    tramo,
    datos,
    fecha
){

    const h = datos?.hourly || {};
    const tiempos = h.time || [];
    const rafagas = h.wind_gusts_10m || [];
    const direcciones = h.wind_direction_10m || [];
    const vientos = h.wind_speed_10m || [];

    let mejor = {
        estado:"NORMAL",
        rafaga:null,
        viento:null,
        transversal:null,
        hora:null,
        motivo:"Sin umbrales superados",
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

        if(fechaSolo(tiempos[i]) !== fecha){
            continue;
        }

        const rafaga = n(rafagas[i]);
        const direccion = n(direcciones[i]);
        const viento = n(vientos[i]);

        if(
            rafaga === null
            || direccion === null
        ){
            continue;
        }

        const diferencia =
            rad(
                direccion
                - tramo.rumbo
            );

        const transversal =
            Math.abs(
                rafaga
                * Math.sin(diferencia)
            );

        const estadoRafaga =
            nivel(
                rafaga,
                UMBRALES_LINEA.rafaga
            );

        const estadoTransversal =
            nivel(
                transversal,
                UMBRALES_LINEA.transversal
            );

        const estado =
            peorEstado(
                estadoRafaga,
                estadoTransversal
            );

        const motivo =
            PRIORIDAD[estadoTransversal]
            >= PRIORIDAD[estadoRafaga]
            && estadoTransversal !== "NORMAL"
                ? "Viento transversal"
                : (
                    estadoRafaga !== "NORMAL"
                        ? "Rafaga"
                        : "Viento"
                );

        const puntaje =
            PRIORIDAD[estado]
            * 100000
            + transversal * 100
            + rafaga;

        if(puntaje > mejor.puntaje){
            mejor = {
                estado,
                rafaga,
                viento,
                transversal,
                hora:tiempos[i],
                motivo,
                puntaje
            };
        }
    }

    return {
        ...tramo,
        ...mejor
    };
}


function evaluarLineaDia(
    id,
    nombre,
    tramos,
    datos,
    fecha
){

    const evaluaciones =
        tramos.map(
            (tramo,i) =>
                evaluarTramoDia(
                    tramo,
                    datos[i],
                    fecha
                )
        );

    evaluaciones.sort(
        (a,b) =>
            b.puntaje - a.puntaje
    );

    const peor =
        evaluaciones[0]
        || {
            estado:"NORMAL",
            rafaga:null,
            viento:null,
            transversal:null,
            hora:null,
            motivo:"Sin umbrales superados",
            puntaje:0,
            numero:null,
            desdeKm:null,
            hastaKm:null
        };

    return {
        id,
        nombre,
        tipo:"LINEA",
        fecha,
        estado:peor.estado,
        motivo:peor.motivo,
        hora:peor.hora,
        score:
            puntuacionEstado(
                peor.estado,
                Math.max(0,peor.puntaje)
            ),
        rafaga:peor.rafaga,
        vientoMax:peor.viento,
        transversal:peor.transversal,
        tramo:peor.numero,
        desdeKm:peor.desdeKm,
        hastaKm:peor.hastaKm
    };
}


/* =========================================================
   GEOJSON / UBICACION
   ========================================================= */

async function cargarJSON(ruta, cache = "force-cache"){

    const respuesta =
        await fetch(
            ruta,
            {cache}
        );

    if(!respuesta.ok){
        throw new Error(
            `No fue posible cargar ${ruta}.`
        );
    }

    return respuesta.json();
}


function buscarFeature(geojson, id){

    return (
        geojson?.features || []
    )
    .find(
        feature =>
            String(
                feature?.properties?.id
                || feature?.id
            )
            === String(id)
    );
}


function valoresPropiedad(
    propiedades,
    nombres
){

    const salida = [];

    Object.entries(
        propiedades || {}
    )
    .forEach(
        ([clave,valor]) => {

            const k = normalizar(clave);

            if(
                !nombres.some(
                    nombre =>
                        k.includes(nombre)
                )
            ){
                return;
            }

            if(Array.isArray(valor)){
                salida.push(...valor);
            }
            else if(valor !== null && valor !== undefined){
                salida.push(valor);
            }
        }
    );

    return [
        ...new Set(
            salida
            .flatMap(
                valor =>
                    String(valor)
                    .split(/[;,|/]/)
            )
            .map(normalizar)
            .filter(Boolean)
        )
    ];
}


function ubicacionEntidad(id, feature){

    const base =
        UBICACION_POR_ID[id]
        || {
            region:[],
            provincia:[],
            comuna:[]
        };

    const propiedades =
        feature?.properties || {};

    return {
        region:[
            ...new Set([
                ...(base.region || []),
                ...valoresPropiedad(
                    propiedades,
                    ["region"]
                )
            ])
        ],
        provincia:[
            ...new Set([
                ...(base.provincia || []),
                ...valoresPropiedad(
                    propiedades,
                    ["provincia"]
                )
            ])
        ],
        comuna:[
            ...new Set([
                ...(base.comuna || []),
                ...valoresPropiedad(
                    propiedades,
                    ["comuna"]
                )
            ])
        ]
    };
}


/* =========================================================
   SENAPRED
   ========================================================= */

function esAlertaMeteorologica(alerta){

    const texto =
        normalizar(
            [
                alerta?.riesgo,
                alerta?.titulo,
                alerta?.contenido
            ].join(" ")
        );

    const relevantes = [
        "meteorolog",
        "viento",
        "temporal",
        "torment",
        "precipit",
        "lluvia",
        "nev",
        "helad",
        "crecida",
        "desborde",
        "inund",
        "remocion",
        "aluvion",
        "incendio forestal"
    ];

    const excluir = [
        "zoosanit",
        "influenza aviar",
        "sanitaria"
    ];

    return (
        relevantes.some(
            palabra =>
                texto.includes(palabra)
        )
        && !excluir.some(
            palabra =>
                texto.includes(palabra)
        )
    );
}


function estadoSenapred(alerta){

    const texto =
        normalizar(
            [
                alerta?.nivel,
                alerta?.nivelSenapred,
                alerta?.codigoVisual
            ].join(" ")
        );

    if(texto.includes("roja")){
        return "CRITICO";
    }

    if(texto.includes("amarilla")){
        return "ALERTA";
    }

    if(
        texto.includes("temprana preventiva")
        || texto.includes("verde")
        || texto.includes("atp")
    ){
        return "PRECAUCION";
    }

    return "PRECAUCION";
}


function contieneAlguno(texto, valores){

    return valores.some(
        valor =>
            valor
            && texto.includes(valor)
    );
}


function alertaAplicaUbicacion(
    alerta,
    ubicacion
){

    const regiones =
        normalizar(
            alerta?.regiones
        );

    if(
        regiones
        && ubicacion.region.length
        && !contieneAlguno(
            regiones,
            ubicacion.region
        )
    ){
        return false;
    }

    const provinciasCampo =
        normalizar(
            alerta?.provincias
        );

    if(
        provinciasCampo
        && ubicacion.provincia.length
        && !contieneAlguno(
            provinciasCampo,
            ubicacion.provincia
        )
    ){
        return false;
    }

    const comunasCampo =
        normalizar(
            alerta?.comunas
        );

    if(
        comunasCampo
        && ubicacion.comuna.length
        && !contieneAlguno(
            comunasCampo,
            ubicacion.comuna
        )
    ){
        return false;
    }

    /*
     * Refuerzo geografico: si SENAPRED declara explicitamente una
     * region/provincia/comuna en el titulo, esa referencia manda.
     * Asi una ATP de Los Lagos nunca puede elevar una entidad de
     * Magallanes aunque otros campos vengan vacios.
     */
    const titulo =
        normalizar(
            alerta?.titulo
        );

    const regionesConocidas = [
        "los lagos",
        "los rios",
        "magallanes"
    ];

    const regionExplicita =
        regionesConocidas.find(
            region =>
                titulo.includes(
                    "region de "
                    + region
                )
        );

    if(
        regionExplicita
        && ubicacion.region.length
        && !contieneAlguno(
            regionExplicita,
            ubicacion.region
        )
    ){
        return false;
    }

    const provinciasConocidas = [
        "osorno",
        "palena",
        "llanquihue",
        "chiloe",
        "magallanes",
        "ultima esperanza",
        "tierra del fuego",
        "antartica chilena"
    ];

    const provinciaExplicita =
        provinciasConocidas.find(
            provincia =>
                titulo.includes(
                    "provincia de "
                    + provincia
                )
        );

    if(
        provinciaExplicita
        && ubicacion.provincia.length
        && !ubicacion.provincia.includes(
            provinciaExplicita
        )
    ){
        return false;
    }

    return true;
}


function resolverDiaMes(texto, anioBase){

    const limpio =
        String(texto || "")
        .trim();

    const match =
        limpio.match(
            /(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/
        );

    if(!match){
        return null;
    }

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    let anio = match[3]
        ? Number(match[3])
        : Number(anioBase);

    if(anio < 100){
        anio += 2000;
    }

    if(
        !Number.isFinite(dia)
        || !Number.isFinite(mes)
        || !Number.isFinite(anio)
        || dia < 1
        || dia > 31
        || mes < 1
        || mes > 12
    ){
        return null;
    }

    return [
        String(anio).padStart(4,"0"),
        String(mes).padStart(2,"0"),
        String(dia).padStart(2,"0")
    ].join("-");
}


function extraerAlertamientos(alerta){

    const contenido =
        String(
            alerta?.contenido || ""
        );

    if(!contenido){
        return [];
    }

    const parser =
        new DOMParser();

    const doc =
        parser.parseFromString(
            contenido,
            "text/html"
        );

    const anioBase =
        new Date(
            alerta?.fechaHora
            || alerta?.createdAt
            || Date.now()
        ).getFullYear();

    const salida = [];

    doc.querySelectorAll("tr")
        .forEach(
            fila => {

                const celdas =
                    [
                        ...fila.querySelectorAll(
                            "td,th"
                        )
                    ]
                    .map(
                        celda =>
                            celda.textContent
                            .replace(/\s+/g," ")
                            .trim()
                    );

                if(celdas.length < 4){
                    return;
                }

                const codigo = celdas[0];

                if(
                    !/\b(aviso|alerta)\b/i.test(
                        codigo
                    )
                ){
                    return;
                }

                const inicio =
                    resolverDiaMes(
                        celdas[2],
                        anioBase
                    );

                const fin =
                    resolverDiaMes(
                        celdas[3],
                        anioBase
                    );

                if(!inicio || !fin){
                    return;
                }

                salida.push({
                    codigo,
                    descripcion:
                        celdas[1]
                        || alerta.riesgo
                        || alerta.titulo,
                    inicio,
                    fin,
                    estado:
                        estadoSenapred(alerta),
                    nivel:
                        alerta.nivel
                        || alerta.nivelSenapred
                        || "SENAPRED",
                    alertaId:
                        alerta.id
                });
            }
        );

    return salida;
}


function fechaEnRango(fecha, inicio, fin){

    return (
        fecha >= inicio
        && fecha <= fin
    );
}


function prepararSenapred(
    data,
    entidades,
    fechas
){

    const alertas =
        (data?.alertas || [])
        .filter(
            alerta =>
                alerta?.isActive !== false
                && alerta?.isDeleted !== true
                && esAlertaMeteorologica(alerta)
        );

    const relevantes = [];
    const porFecha = {};

    fechas.forEach(
        fecha => {
            porFecha[fecha] = [];
        }
    );

    alertas.forEach(
        alerta => {

            const entidadesAplicables =
                entidades.filter(
                    entidad =>
                        alertaAplicaUbicacion(
                            alerta,
                            entidad.ubicacion
                        )
                );

            if(!entidadesAplicables.length){
                return;
            }

            const entidadesDetalle =
                entidadesAplicables.map(
                    entidad => ({
                        id:entidad.id,
                        nombre:entidad.nombre,
                        zona:zonaEntidad(entidad)
                    })
                );

            const zonas =
                [
                    ...new Set(
                        entidadesDetalle.map(
                            entidad =>
                                entidad.zona
                        )
                    )
                ];

            const item = {
                id:alerta.id,
                titulo:
                    alerta.titulo
                    || alerta.riesgo
                    || "Alerta SENAPRED",
                nivel:
                    alerta.nivel
                    || alerta.nivelSenapred
                    || "SENAPRED",
                estado:
                    estadoSenapred(alerta),
                riesgo:
                    alerta.riesgo || "",
                regiones:
                    alerta.regiones || "",
                entidades:
                    entidadesAplicables.map(
                        e => e.nombre
                    ),
                entidadesDetalle,
                zonas
            };

            relevantes.push(item);

            const subalertas =
                extraerAlertamientos(alerta);

            if(subalertas.length){

                subalertas.forEach(
                    sub => {

                        fechas.forEach(
                            fecha => {

                                if(
                                    fechaEnRango(
                                        fecha,
                                        sub.inicio,
                                        sub.fin
                                    )
                                ){
                                    porFecha[fecha].push({
                                        ...sub,
                                        titulo:item.titulo,
                                        regiones:item.regiones,
                                        entidades:item.entidades,
                                        entidadesDetalle:item.entidadesDetalle,
                                        zonas:item.zonas
                                    });
                                }
                            }
                        );
                    }
                );
            }
        }
    );

    return {
        generadoEn:
            data?.generadoEn || null,
        relevantes,
        porFecha
    };
}


function alertasParaEntidad(
    oficiales,
    nombreEntidad
){

    return (oficiales || [])
        .filter(
            alerta =>
                (alerta.entidades || [])
                .includes(nombreEntidad)
        );
}


function integrarSenapredEntidades(
    resultadosEntidad,
    senapred
){

    return resultadosEntidad.map(
        entidad => ({
            ...entidad,
            dias:
                entidad.dias.map(
                    dia => {

                        const oficiales =
                            alertasParaEntidad(
                                senapred.porFecha[dia.fecha],
                                entidad.nombre
                            );

                        const estadoOficial =
                            oficiales.length
                                ? peorEstado(
                                    oficiales.map(
                                        alerta =>
                                            alerta.estado
                                    )
                                )
                                : "NORMAL";

                        return {
                            ...dia,
                            estadoMeteo:dia.estado,
                            estadoSenapred:estadoOficial,
                            estadoIntegrado:
                                peorEstado(
                                    dia.estado,
                                    estadoOficial
                                ),
                            alertasSenapred:oficiales
                        };
                    }
                )
        })
    );
}


function agruparSenapredPorZona(
    alertas
){

    const mapa =
        new Map();

    (alertas || []).forEach(
        alerta => {

            const detalles =
                alerta.entidadesDetalle
                || [];

            const zonas =
                detalles.length
                    ? [
                        ...new Set(
                            detalles.map(
                                detalle =>
                                    detalle.zona
                            )
                        )
                    ]
                    : (
                        alerta.zonas?.length
                            ? alerta.zonas
                            : ["Zona no especificada"]
                    );

            zonas.forEach(
                zona => {

                    if(!mapa.has(zona)){
                        mapa.set(zona, []);
                    }

                    const entidadesZona =
                        detalles
                        .filter(
                            detalle =>
                                detalle.zona === zona
                        )
                        .map(
                            detalle =>
                                detalle.nombre
                        );

                    const clave =
                        `${alerta.alertaId || alerta.id || ""}|${alerta.codigo || alerta.titulo || ""}`;

                    const lista =
                        mapa.get(zona);

                    if(
                        lista.some(
                            existente =>
                                existente._clave === clave
                        )
                    ){
                        return;
                    }

                    lista.push({
                        ...alerta,
                        _clave:clave,
                        entidadesZona:
                            entidadesZona.length
                                ? entidadesZona
                                : (
                                    alerta.entidades
                                    || []
                                )
                    });
                }
            );
        }
    );

    return [
        ...mapa.entries()
    ]
    .map(
        ([zona,items]) => ({
            zona,
            alertas:items
        })
    )
    .sort(
        (a,b) =>
            a.zona.localeCompare(
                b.zona,
                "es"
            )
    );
}


/* =========================================================
   RESUMEN / RENDER
   ========================================================= */

function obtenerContenedor(){

    const panel =
        document.querySelector(
            "#informe > .panel"
        );

    if(!panel){
        return null;
    }

    let bloque =
        document.getElementById(
            "resumen-diario-gridvision"
        );

    if(!bloque){
        bloque =
            document.createElement("div");

        bloque.id =
            "resumen-diario-gridvision";

        panel.appendChild(bloque);
    }

    return bloque;
}


function estadoMeteoDia(entidadesDia){

    return peorEstado(
        entidadesDia.map(
            item => item.estado
        )
    );
}


function maximaMetrica(
    entidadesDia,
    campo
){

    const valores =
        entidadesDia
        .map(
            item => n(item[campo])
        )
        .filter(
            valor => valor !== null
        );

    return valores.length
        ? Math.max(...valores)
        : null;
}


function temperaturasDia(entidadesDia){

    const activos =
        entidadesDia.filter(
            e => e.tipo === "ACTIVO"
        );

    const mins =
        activos
        .map(e => n(e.tempMin))
        .filter(v => v !== null);

    const maxs =
        activos
        .map(e => n(e.tempMax))
        .filter(v => v !== null);

    return {
        min:mins.length
            ? Math.min(...mins)
            : null,
        max:maxs.length
            ? Math.max(...maxs)
            : null
    };
}


function lluviaDia(entidadesDia){

    const activos =
        entidadesDia.filter(
            e => e.tipo === "ACTIVO"
        );

    return maximaMetrica(
        activos,
        "lluvia"
    );
}


function focoDia(entidadesDia){

    return [...entidadesDia]
        .sort(
            (a,b) =>
                b.score - a.score
        )[0]
        || null;
}


function crearDiasResultado(
    fechas,
    resultadosEntidad,
    senapred
){

    return fechas.map(
        fecha => {

            const entidadesDia =
                resultadosEntidad
                .map(
                    entidad =>
                        entidad.dias.find(
                            d => d.fecha === fecha
                        )
                )
                .filter(Boolean);

            const meteo =
                peorEstado(
                    entidadesDia.map(
                        item =>
                            item.estadoMeteo
                            || item.estado
                    )
                );

            const oficiales =
                senapred.porFecha[fecha]
                || [];

            const estadoOficial =
                peorEstado(
                    entidadesDia.map(
                        item =>
                            item.estadoSenapred
                            || "NORMAL"
                    )
                );

            /*
             * El estado integrado se calcula entidad por entidad.
             * Una ATP de Los Lagos solo puede elevar activos/lineas
             * de Los Lagos; no eleva LTVP o PECN en Magallanes.
             */
            const integrado =
                peorEstado(
                    entidadesDia.map(
                        item =>
                            item.estadoIntegrado
                            || item.estado
                    )
                );

            const foco =
                focoDia(
                    entidadesDia
                );

            const temps =
                temperaturasDia(
                    entidadesDia
                );

            return {
                fecha,
                entidades:entidadesDia,
                estadoMeteo:meteo,
                estadoSenapred:estadoOficial,
                estadoIntegrado:integrado,
                oficiales,
                senapredZonas:
                    agruparSenapredPorZona(
                        oficiales
                    ),
                foco,
                tempMin:temps.min,
                tempMax:temps.max,
                lluviaMax:lluviaDia(entidadesDia),
                rafagaMax:maximaMetrica(
                    entidadesDia,
                    "rafaga"
                ),
                transversalMax:maximaMetrica(
                    entidadesDia,
                    "transversal"
                )
            };
        }
    );
}


function descripcionDatoEntidad(item){

    if(item.tipo === "LINEA"){

        return (
            "R "
            + fmt(item.rafaga,0)
            + " / T "
            + fmt(item.transversal,0)
            + " km/h"
        );
    }

    return (
        "P "
        + fmt(item.lluvia,1)
        + " mm · R "
        + fmt(item.rafaga,0)
        + " km/h"
    );
}


function resumenSenapredDia(zonas){

    if(!zonas?.length){
        return "";
    }

    const lineas =
        zonas.map(
            grupo => {

                const codigos =
                    grupo.alertas
                    .slice(0,3)
                    .map(
                        alerta =>
                            `${alerta.codigo || "SENAPRED"} · ${alerta.estado}`
                    )
                    .join(" · ");

                const entidades =
                    [
                        ...new Set(
                            grupo.alertas
                            .flatMap(
                                alerta =>
                                    alerta.entidadesZona
                                    || []
                            )
                        )
                    ]
                    .slice(0,3);

                const extraEntidades =
                    grupo.alertas
                    .flatMap(
                        alerta =>
                            alerta.entidadesZona
                            || []
                    ).length > 3
                        ? "…"
                        : "";

                return (
                    `<div class="resumen-dia-senapred-linea">`
                    + `<span class="resumen-dia-zona">${grupo.zona}</span>`
                    + `${codigos}`
                    + (
                        entidades.length
                            ? `<span class="resumen-dia-aplica"> · aplica a ${entidades.join(", ")}${extraEntidades}</span>`
                            : ""
                    )
                    + `</div>`
                );
            }
        )
        .join("");

    return (
        `<div class="resumen-dia-senapred">`
        + `🚨 <strong>SENAPRED por zona</strong>`
        + lineas
        + `</div>`
    );
}


function tarjetaDia(dia){

    const foco = dia.foco;

    const focoTexto = foco
        ? (
            `<strong>${foco.nombre}</strong>`
            + ` · ${foco.motivo}`
            + (
                foco.hora
                    ? ` · ${horaSolo(foco.hora)}`
                    : ""
            )
        )
        : "Sin elementos evaluados";

    /*
     * V5: la interfaz ya no muestra tarjetas diarias.
     * SENAPRED queda en el bloque oficial separado por zona y la lectura diaria se concentra en la matriz.
     * La funcion se conserva solo por compatibilidad interna; la matriz evita asociar visualmente una ATP de Los Lagos con
     * un foco meteorologico ubicado en Magallanes.
     */
    return `
        <div class="resumen-dia-card ${dia.estadoMeteo}">

            <div class="resumen-dia-head">
                <div>
                    <div class="resumen-dia-fecha">
                        ${fechaEtiqueta(dia.fecha)}
                    </div>
                    <div class="resumen-dia-meteo">
                        Estado meteorologico: ${dia.estadoMeteo}
                    </div>
                </div>

                <div class="resumen-dia-estado">
                    ${ICONO_ESTADO[dia.estadoMeteo]}
                    ${dia.estadoMeteo}
                </div>
            </div>

            <div class="resumen-dia-metricas">
                <span>
                    🌡️ ${fmt(dia.tempMin)} / ${fmt(dia.tempMax)} °C
                </span>
                <span>
                    🌧️ max. activo ${fmt(dia.lluviaMax)} mm
                </span>
                <span>
                    💨 rafaga max. ${fmt(dia.rafagaMax)} km/h
                </span>
                <span>
                    ↔ transv. max. ${fmt(dia.transversalMax)} km/h
                </span>
            </div>

            <div class="resumen-dia-foco">
                <strong>Foco meteorologico:</strong> ${focoTexto}
            </div>

        </div>
    `;
}

function matrizEntidades(
    fechas,
    resultadosEntidad
){

    const encabezado =
        fechas
        .map(
            fecha =>
                `<th>${fechaCorta(fecha)}</th>`
        )
        .join("");

    const filas =
        resultadosEntidad
        .map(
            entidad => {

                const celdas =
                    fechas
                    .map(
                        fecha => {

                            const dia =
                                entidad.dias.find(
                                    d => d.fecha === fecha
                                );

                            if(!dia){
                                return `<td>--</td>`;
                            }

                            const estadoVisual =
                                dia.estadoIntegrado
                                || dia.estado;

                            const fuentes =
                                dia.estadoSenapred
                                && dia.estadoSenapred !== "NORMAL"
                                ? (
                                    `M ${dia.estadoMeteo || dia.estado}`
                                    + ` · S ${dia.estadoSenapred}`
                                )
                                : (
                                    `M ${dia.estadoMeteo || dia.estado}`
                                );

                            return `
                                <td>
                                    <span class="resumen-matriz-chip ${estadoVisual}">
                                        ${ICONO_ESTADO[estadoVisual]}
                                        ${estadoVisual}
                                    </span>
                                    <span class="resumen-matriz-fuentes">
                                        ${fuentes}
                                    </span>
                                    <span class="resumen-matriz-dato">
                                        ${descripcionDatoEntidad(dia)}
                                    </span>
                                </td>
                            `;
                        }
                    )
                    .join("");

                return `
                    <tr>
                        <td class="entidad">
                            ${entidad.nombre}
                            <span class="resumen-matriz-fuentes">
                                ${zonaEntidad(entidad)}
                            </span>
                        </td>
                        ${celdas}
                    </tr>
                `;
            }
        )
        .join("");

    return `
        <div class="resumen-matriz-titulo">
            Detalle diario por activo y linea
        </div>

        <div class="resumen-matriz-wrap">
            <table class="resumen-matriz">
                <thead>
                    <tr>
                        <th class="entidad">Elemento / zona</th>
                        ${encabezado}
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
            </table>
        </div>
    `;
}


function frescuraSenapred(generadoEn){

    if(!generadoEn){
        return "Fecha de actualizacion no informada.";
    }

    const fecha = new Date(generadoEn);

    if(Number.isNaN(fecha.getTime())){
        return `Actualizado: ${generadoEn}`;
    }

    const horas =
        (Date.now() - fecha.getTime())
        / 3600000;

    const texto =
        fecha.toLocaleString(
            "es-CL",
            {
                dateStyle:"short",
                timeStyle:"short",
                hour12:false
            }
        );

    if(horas > 6){
        return (
            `Actualizado: ${texto}. `
            + `Dato SENAPRED con más de 6 h; conviene refrescar alertas.`
        );
    }

    return `Actualizado: ${texto}.`;
}


function renderResultado(resultado){

    const contenedor =
        obtenerContenedor();

    if(!contenedor){
        return;
    }

    const estadoIntegrado =
        peorEstado(
            resultado.dias.map(
                d => d.estadoIntegrado
            )
        );

    const zonasRelevantes =
        agruparSenapredPorZona(
            resultado.senapred.relevantes
        );

    const alertaBand =
        zonasRelevantes.length
        ? (
            `<div class="resumen-senapred-band">`
            + `<strong>🚨 SENAPRED · separado por zona operacional</strong>`
            + `<div class="resumen-senapred-zonas">`
            + zonasRelevantes
                .map(
                    grupo => {

                        const alertas =
                            grupo.alertas
                            .map(
                                alerta =>
                                    `<div class="resumen-senapred-alerta">`
                                    + `<strong>${alerta.nivel || "SENAPRED"}:</strong> `
                                    + `${alerta.titulo}`
                                    + `</div>`
                            )
                            .join("");

                        const entidades =
                            [
                                ...new Set(
                                    grupo.alertas
                                    .flatMap(
                                        alerta =>
                                            alerta.entidadesZona
                                            || alerta.entidades
                                            || []
                                    )
                                )
                            ];

                        return (
                            `<div class="resumen-senapred-zona">`
                            + `<strong>${grupo.zona}</strong>`
                            + alertas
                            + (
                                entidades.length
                                    ? `<small>Aplica solo a: ${entidades.join(", ")}.</small>`
                                    : ""
                            )
                            + `</div>`
                        );
                    }
                )
                .join("")
            + `</div>`
            + `<div class="senapred-frescura">`
            + frescuraSenapred(
                resultado.senapred.generadoEn
            )
            + `</div>`
            + `</div>`
        )
        : (
            `<div class="resumen-senapred-band">`
            + `<strong>✅ SENAPRED:</strong> `
            + `sin alertas meteorologicas relevantes para las zonas de los elementos seleccionados.`
            + `<div class="senapred-frescura">`
            + frescuraSenapred(
                resultado.senapred.generadoEn
            )
            + `</div>`
            + `</div>`
        );

    contenedor.innerHTML = `
        <div class="resumen-diario-cabecera">
            <div>
                <h3>
                    Resumen Diario Operacional · ${resultado.diasSeleccionados} dias
                </h3>
                <p>
                    Mismo criterio meteorologico del informe extendido.
                    SENAPRED se presenta en un bloque oficial independiente por zona operacional.
                    El resumen ejecutivo se muestra en la matriz diaria por activo y linea.
                </p>
            </div>

            <div class="resumen-integrado">
                <small>Estado operacional integrado</small>
                <strong>
                    ${ICONO_ESTADO[estadoIntegrado]}
                    ${estadoIntegrado}
                </strong>
            </div>
        </div>

        ${alertaBand}

        ${matrizEntidades(
            resultado.fechas,
            resultado.entidades
        )}
    `;
}


function mostrarCargando(dias){

    const contenedor =
        obtenerContenedor();

    if(!contenedor){
        return;
    }

    contenedor.innerHTML = `
        <div class="resumen-diario-cargando">
            Construyendo resumen diario de ${dias} dias y cruzando SENAPRED...
        </div>
    `;
}


function ocultarResumen(){

    document.getElementById(
        "resumen-diario-gridvision"
    )?.remove();

    ultimoResultado = null;
}


/* =========================================================
   GENERACION
   ========================================================= */

function seleccionActual(){

    const boton =
        document.querySelector(
            ".horizonte.seleccionado"
        );

    const horas =
        Number(
            boton?.dataset.horas
            || 72
        );

    const dias =
        Math.round(
            horas / 24
        );

    const inputs =
        [
            ...document.querySelectorAll(
                ".item-activo input:checked"
            )
        ];

    return {
        horas,
        dias,
        inputs
    };
}


function nombreInput(input){

    return input
        .closest(".item-activo")
        ?.querySelector(
            "span:not(.tipo)"
        )
        ?.textContent
        ?.replace(/\s+/g," ")
        ?.trim()
        || input.value;
}


async function generarResumenDiario(){

    const numeroEjecucion =
        ++ejecucionActual;

    const {
        horas,
        dias,
        inputs
    } = seleccionActual();

    if(
        horas < 96
        || dias < 4
        || dias > 7
    ){
        ocultarResumen();
        return;
    }

    mostrarCargando(dias);

    try{

        const [
            geoActivos,
            geoLineas,
            datosSenapred
        ] = await Promise.all([
            cargarJSON(RUTA_ACTIVOS),
            cargarJSON(RUTA_LINEAS),
            cargarJSON(
                RUTA_SENAPRED,
                "no-store"
            ).catch(
                error => {
                    console.warn(
                        "GridVision resumen diario: SENAPRED no disponible.",
                        error
                    );
                    return {
                        alertas:[],
                        generadoEn:null
                    };
                }
            )
        ]);

        if(numeroEjecucion !== ejecucionActual){
            return;
        }

        const entidades =
            inputs.map(
                input => {

                    const id = input.value;
                    const esLinea = Boolean(
                        input
                        .closest(".item-activo")
                        ?.querySelector(
                            ".tipo-linea"
                        )
                    );

                    const feature =
                        buscarFeature(
                            esLinea
                                ? geoLineas
                                : geoActivos,
                            id
                        );

                    return {
                        id,
                        nombre:nombreInput(input),
                        tipo:
                            esLinea
                                ? "LINEA"
                                : "ACTIVO",
                        feature,
                        ubicacion:
                            ubicacionEntidad(
                                id,
                                feature
                            )
                    };
                }
            );

        const faltantes =
            entidades.filter(
                e => !e.feature
            );

        if(faltantes.length){
            throw new Error(
                "No se encontraron en inventario: "
                + faltantes
                    .map(e => e.nombre)
                    .join(", ")
            );
        }

        const resultadosEntidad = [];
        let fechasBase = null;

        for(const entidad of entidades){

            if(numeroEjecucion !== ejecucionActual){
                return;
            }

            if(entidad.tipo === "ACTIVO"){

                const datos =
                    await consultarActivo(
                        entidad.feature,
                        horas
                    );

                const h = datos.hourly;

                const grupos =
                    agruparIndicesPorFecha(
                        h.time || [],
                        dias
                    );

                if(!fechasBase){
                    fechasBase =
                        grupos.map(
                            g => g.fecha
                        );
                }

                resultadosEntidad.push({
                    ...entidad,
                    dias:
                        grupos.map(
                            grupo =>
                                evaluarActivoDia(
                                    entidad.id,
                                    entidad.nombre,
                                    h,
                                    grupo.fecha,
                                    grupo.indices
                                )
                        )
                });
            }
            else{

                const tramos =
                    generarTramos(
                        entidad.feature
                    );

                if(!tramos.length){
                    throw new Error(
                        `Geometria no valida: ${entidad.nombre}`
                    );
                }

                const datos =
                    await consultarLinea(
                        tramos,
                        horas
                    );

                const tiempos =
                    datos[0]?.hourly?.time
                    || [];

                const grupos =
                    agruparIndicesPorFecha(
                        tiempos,
                        dias
                    );

                if(!fechasBase){
                    fechasBase =
                        grupos.map(
                            g => g.fecha
                        );
                }

                resultadosEntidad.push({
                    ...entidad,
                    dias:
                        grupos.map(
                            grupo =>
                                evaluarLineaDia(
                                    entidad.id,
                                    entidad.nombre,
                                    tramos,
                                    datos,
                                    grupo.fecha
                                )
                        )
                });
            }
        }

        if(numeroEjecucion !== ejecucionActual){
            return;
        }

        const fechas =
            (fechasBase || [])
            .slice(0,dias);

        const senapred =
            prepararSenapred(
                datosSenapred,
                resultadosEntidad,
                fechas
            );

        const resultadosIntegrados =
            integrarSenapredEntidades(
                resultadosEntidad,
                senapred
            );

        const diasResultado =
            crearDiasResultado(
                fechas,
                resultadosIntegrados,
                senapred
            );

        ultimoResultado = {
            horas,
            diasSeleccionados:dias,
            fechas,
            entidades:resultadosIntegrados,
            senapred,
            dias:diasResultado,
            generadoEn:new Date().toISOString()
        };

        renderResultado(
            ultimoResultado
        );

    }
    catch(error){

        console.error(
            "GridVision resumen diario:",
            error
        );

        const contenedor =
            obtenerContenedor();

        if(contenedor){
            contenedor.innerHTML = `
                <div class="resumen-diario-error">
                    No fue posible generar el resumen diario: ${error.message}
                </div>
            `;
        }
    }
}


/* =========================================================
   TEXTO COMPARTIBLE 4-7 DIAS
   ========================================================= */

function textoLimpio(elemento){

    return (
        elemento?.textContent || ""
    )
    .replace(/\s+/g," ")
    .trim();
}


function estadoClase(elemento){

    for(const estado of Object.keys(PRIORIDAD)){
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
            normalizar(
                textoLimpio(
                    elemento.querySelector("small")
                )
            )
            .includes(
                normalizar(titulo)
            )
    );
}


function crearTextoCompleto(resultado){

    const salida = [];

    const estadoMeteo =
        peorEstado(
            resultado.dias.map(
                d => d.estadoMeteo
            )
        );

    const estadoIntegrado =
        peorEstado(
            resultado.dias.map(
                d => d.estadoIntegrado
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

    salida.push("*GRIDVISION CHILE*");
    salida.push("*INFORME METEOROLOGICO OPERACIONAL*");
    salida.push("");
    salida.push(`📅 Generado: ${ahora}`);
    salida.push(`⏱ Horizonte: ${resultado.horas} horas (${resultado.diasSeleccionados} dias)`);
    salida.push(`${ICONO_ESTADO[estadoMeteo]} *ESTADO METEOROLOGICO: ${estadoMeteo}*`);
    salida.push(`${ICONO_ESTADO[estadoIntegrado]} *ESTADO INTEGRADO METEO + SENAPRED: ${estadoIntegrado}*`);

    salida.push("");
    salida.push(`*RESUMEN DIARIO · ${resultado.diasSeleccionados} DIAS*`);

    resultado.dias.forEach(
        dia => {

            salida.push("");
            salida.push(
                `${ICONO_ESTADO[dia.estadoMeteo]} *${fechaEtiqueta(dia.fecha)}* - ${dia.estadoMeteo}`
            );
            salida.push(
                `• Estado meteorologico: ${dia.estadoMeteo}`
            );
            salida.push(
                `• Temperatura: ${fmt(dia.tempMin)} a ${fmt(dia.tempMax)} °C`
            );
            salida.push(
                `• Lluvia max. entre activos: ${fmt(dia.lluviaMax)} mm`
            );
            salida.push(
                `• Rafaga maxima: ${fmt(dia.rafagaMax)} km/h`
                + (
                    dia.transversalMax !== null
                        ? ` | Transversal: ${fmt(dia.transversalMax)} km/h`
                        : ""
                )
            );

            if(dia.foco){
                salida.push(
                    `• Foco meteorologico: ${dia.foco.nombre} - ${dia.foco.motivo}`
                    + (
                        dia.foco.hora
                            ? ` - ${horaSolo(dia.foco.hora)}`
                            : ""
                    )
                );
            }
        }
    );

    if(resultado.senapred.relevantes.length){
        salida.push("");
        salida.push("*ALERTAS SENAPRED RELEVANTES · POR ZONA*");

        agruparSenapredPorZona(
            resultado.senapred.relevantes
        )
        .forEach(
            grupo => {

                salida.push(`• *${grupo.zona}*`);

                grupo.alertas.forEach(
                    alerta => {
                        salida.push(
                            `  - ${alerta.nivel}: ${alerta.titulo}`
                        );
                    }
                );
            }
        );
    }

    /* Conserva el resumen extendido ya visible en la pagina. */
    const activos =
        [
            ...document.querySelectorAll(
                ".reporte-activo"
            )
        ];

    if(activos.length){
        salida.push("");
        salida.push("*ACTIVOS · RESUMEN EXTENDIDO*");

        activos.forEach(
            article => {

                const nombre =
                    textoLimpio(
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
                                estadoClase(bloque)
                                || "NORMAL",
                            titulo:
                                textoLimpio(
                                    bloque.querySelector(
                                        ".titulo"
                                    )
                                ),
                            motivo:
                                textoLimpio(
                                    bloque.querySelector("p")
                                )
                        })
                    );

                const estado =
                    peorEstado(
                        estados.map(e => e.estado)
                    );

                salida.push("");
                salida.push(
                    `${ICONO_ESTADO[estado]} *${nombre}* - ${estado}`
                );

                estados.forEach(
                    item => {
                        salida.push(
                            `• ${item.titulo}: ${item.motivo}`
                        );
                    }
                );

                [
                    ["rafaga maxima", "Rafaga maxima"],
                    ["mayor lluvia horaria", "Mayor lluvia horaria"],
                    ["temperatura del horizonte", "Temperatura"],
                    ["probabilidad maxima", "Probabilidad max."]
                ]
                .forEach(
                    ([clave,etiqueta]) => {

                        const campo =
                            campoPorTitulo(
                                article,
                                ".extremo",
                                clave
                            );

                        if(campo){
                            const valor =
                                textoLimpio(
                                    campo.querySelector("strong")
                                );
                            const fecha =
                                textoLimpio(
                                    campo.querySelector("em")
                                );

                            salida.push(
                                `• ${etiqueta}: ${valor}`
                                + (
                                    fecha
                                        ? ` - ${fecha}`
                                        : ""
                                )
                            );
                        }
                    }
                );
            }
        );
    }

    const lineas =
        [
            ...document.querySelectorAll(
                ".reporte-linea"
            )
        ];

    if(lineas.length){
        salida.push("");
        salida.push("*LINEAS DE EVACUACION · RESUMEN EXTENDIDO*");

        lineas.forEach(
            article => {

                const nombre =
                    textoLimpio(
                        article.querySelector("h3")
                    );

                const estadoCard =
                    campoPorTitulo(
                        article,
                        ".linea-card",
                        "estado general"
                    );

                const estado =
                    textoLimpio(
                        estadoCard?.querySelector("strong")
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

                primerTramo
                    ?.querySelectorAll(
                        ".tramo-dato"
                    )
                    .forEach(
                        fila => {
                            datos[
                                textoLimpio(
                                    fila.querySelector("span")
                                )
                            ] =
                                textoLimpio(
                                    fila.querySelector("strong")
                                );
                        }
                    );

                salida.push("");
                salida.push(
                    `${ICONO_ESTADO[estado] || "⚪"} *${nombre}* - ${estado}`
                );
                salida.push(
                    `• Tramo mas expuesto: ${textoLimpio(tramoCard?.querySelector("strong")) || "--"}`
                );
                salida.push(
                    `• Rafaga: ${datos.Rafaga || "--"} | Transversal: ${datos.Transversal || "--"} | Viento: ${datos.Viento || "--"}`
                );
                salida.push(
                    `• Hora critica: ${textoLimpio(horaCard?.querySelector("strong")) || "--"}`
                );
            }
        );
    }

    salida.push("");
    salida.push("Fuente meteorologica: Open-Meteo | Alertas oficiales: SENAPRED | GridVision Chile");

    return salida.join("\n");
}


async function copiarResumenCompleto(){

    const texto =
        crearTextoCompleto(
            ultimoResultado
        );

    await navigator.clipboard.writeText(texto);

    const mensaje =
        document.getElementById(
            "mensaje-compartir"
        );

    if(mensaje){
        mensaje.textContent =
            "Informe con Resumen Diario y SENAPRED copiado.";
    }
}


async function compartirResumenCompleto(){

    const texto =
        crearTextoCompleto(
            ultimoResultado
        );

    if(navigator.share){
        await navigator.share({
            title:
                "GridVision Chile - Informe Meteorologico Operacional",
            text:texto
        });
        return;
    }

    await navigator.clipboard.writeText(texto);

    const mensaje =
        document.getElementById(
            "mensaje-compartir"
        );

    if(mensaje){
        mensaje.textContent =
            "El navegador no permite compartir directamente. Informe completo copiado.";
    }
}


/*
 * Captura COPIAR / COMPARTIR solo cuando existe un resumen 4-7 dias.
 * Para 24/48/72 h deja actuar al modulo actual sin cambios.
 */
document.addEventListener(
    "click",
    async evento => {

        const boton =
            evento.target.closest(
                "#copiar-informe, #compartir-informe"
            );

        if(
            !boton
            || !ultimoResultado
        ){
            return;
        }

        evento.preventDefault();
        evento.stopPropagation();
        evento.stopImmediatePropagation();

        try{
            if(boton.id === "copiar-informe"){
                await copiarResumenCompleto();
            }
            else{
                await compartirResumenCompleto();
            }
        }
        catch(error){
            if(error?.name !== "AbortError"){
                console.error(error);
            }
        }
    },
    true
);


/* =========================================================
   LEYENDA PDF · V5
   ========================================================= */

function crearPaginaLeyendaPDF(){

    const pagina =
        document.createElement("section");

    pagina.className =
        "print-page print-leyenda-page";

    pagina.innerHTML = `
        <div class="gv-leyenda-head">
            <div>
                <small>GRIDVISION CHILE</small>
                <strong>Leyenda, abreviaturas y criterios de interpretacion</strong>
            </div>
            <span>Referencia para el Informe Meteorologico Operacional</span>
        </div>

        <div class="gv-leyenda-grid">

            <section class="gv-leyenda-bloque">
                <h3>Estados operacionales</h3>
                <ul>
                    <li>🟢 <strong>NORMAL:</strong> condiciones dentro de los umbrales configurados.</li>
                    <li>🟡 <strong>PRECAUCION:</strong> condicion que requiere seguimiento preventivo.</li>
                    <li>🟠 <strong>ALERTA:</strong> mayor exposicion; requiere vigilancia reforzada.</li>
                    <li>🔴 <strong>CRITICO:</strong> condicion severa que requiere evaluacion operacional prioritaria.</li>
                </ul>
            </section>

            <section class="gv-leyenda-bloque">
                <h3>Abreviaturas</h3>
                <p><span class="gv-chip">M = Meteorologia:</span> estado calculado por GridVision desde Open-Meteo y los umbrales operacionales.</p>
                <p><span class="gv-chip">S = SENAPRED:</span> estado oficial aplicable a la fecha, zona y entidad evaluada.</p>
                <p><span class="gv-chip">P = Precipitacion:</span> acumulado de lluvia del periodo, en mm.</p>
                <p><span class="gv-chip">R = Rafaga:</span> maxima velocidad de rafaga prevista, en km/h.</p>
                <p><span class="gv-chip">T = Viento transversal:</span> componente perpendicular al trazado de una linea, en km/h.</p>
            </section>

            <section class="gv-leyenda-bloque">
                <h3>Criterios de lectura</h3>
                <p><strong>Estado meteorologico diario:</strong> peor estado meteorologico entre los elementos seleccionados para ese dia.</p>
                <p><strong>Foco meteorologico:</strong> elemento con mayor exposicion relativa segun los criterios configurados.</p>
                <p><strong>Estado integrado:</strong> peor estado aplicable entre meteorologia y SENAPRED, calculado entidad por entidad antes de consolidar el periodo.</p>
                <p><strong>Ejemplo:</strong> R 79 / T 79 km/h significa rafaga maxima de 79 km/h y componente transversal aproximada de 79 km/h.</p>
            </section>

            <section class="gv-leyenda-bloque">
                <h3>Fuentes y alcance</h3>
                <p><strong>Open-Meteo:</strong> fuente de pronostico utilizada por el modulo meteorologico.</p>
                <p><strong>SENAPRED:</strong> alertas oficiales vigentes recuperadas por GridVision y filtradas por zona operacional.</p>
                <p>El resumen diario utiliza los mismos umbrales meteorologicos definidos para el informe extendido.</p>
            </section>

            <section class="gv-leyenda-bloque gv-leyenda-nota">
                <h3>Regla geografica SENAPRED</h3>
                <p><strong>Las alertas se aplican por zona operacional.</strong> Una alerta de la Region de Los Lagos no modifica el estado de LTVP ni PECN en Magallanes, y una alerta de Magallanes no modifica los elementos de Los Lagos.</p>
                <p>En V5, SENAPRED se presenta en un bloque oficial separado por zona operacional. La matriz diaria mantiene por separado el estado meteorologico (M) y SENAPRED (S) de cada entidad.</p>
            </section>

        </div>
    `;

    return pagina;
}


function agregarLeyendaAlPDF(){

    const root =
        document.getElementById(
            "informe-print-v2"
        );

    if(!root){
        return;
    }

    root.querySelector(
        ".print-leyenda-page"
    )?.remove();

    root.appendChild(
        crearPaginaLeyendaPDF()
    );
}


function instalarLeyendaPDF(){

    const boton =
        document.getElementById(
            "pdf-informe"
        );

    if(!boton){
        return;
    }

    boton.addEventListener(
        "click",
        () => {
            /*
             * exportar-v2 construye #informe-print-v2 de forma sincrona
             * y abre impresion ~120 ms despues. La leyenda se agrega
             * entre ambos pasos para quedar como ultima pagina.
             */
            setTimeout(
                agregarLeyendaAlPDF,
                20
            );
        }
    );
}


/* =========================================================
   INICIO / EVENTOS
   ========================================================= */

const botonGenerar =
    document.getElementById(
        "generar-informe"
    );

botonGenerar?.addEventListener(
    "click",
    () => {

        const {
            horas,
            dias
        } = seleccionActual();

        if(
            horas >= 96
            && dias >= 4
            && dias <= 7
        ){
            /* Da tiempo a que el panel #informe se muestre. */
            setTimeout(
                generarResumenDiario,
                30
            );
        }
        else{
            ocultarResumen();
        }
    }
);


instalarLeyendaPDF();


window.GridVisionResumenDiario = {
    generar:generarResumenDiario,
    obtenerResultado:() => ultimoResultado,
    crearTexto:() =>
        ultimoResultado
            ? crearTextoCompleto(
                ultimoResultado
            )
            : ""
};

})();
