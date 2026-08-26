(() => {
    "use strict";

    const RUTA_HTML =
        "components/senapred/senapred.html";

    const RUTA_DATOS =
        "data/alertas_senapred.json";


    // =====================================================
    // UTILIDADES
    // =====================================================

    function elemento(id) {
        return document.getElementById(id);
    }


    function escaparHtml(valor) {
        return String(valor ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function formatearFecha(fechaIso) {
        if (!fechaIso) {
            return "Fecha no disponible";
        }

        const fecha = new Date(fechaIso);

        if (Number.isNaN(fecha.getTime())) {
            return fechaIso;
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
            hour12: false
            }
        ).format(fecha);
    }


    function formatearActualizacion(fechaIso) {
        if (!fechaIso) {
            return "—";
        }

        const fecha = new Date(fechaIso);

        if (Number.isNaN(fecha.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        ).format(fecha);
    }


    // =====================================================
    // NIVEL VISUAL
    // =====================================================

    function claseNivel(codigoVisual) {
        switch (codigoVisual) {
            case "ROJA":
                return {
                    tarjeta:
                        "senapred-alerta--roja",

                    insignia:
                        "senapred-nivel--roja"
                };
function textoEstadoVigencia(estado) {
    switch (estado) {
        case "VIGENTE":
            return "Vigente";

        case "VIGENTE_ACTUALIZADA":
            return "Vigente · actualizada";

        case "CANCELADA":
            return "Cancelada";

        case "HISTORICA":
            return "Histórica";

        default:
            return "Por verificar";
    }
}


function claseEstadoVigencia(estado) {
    switch (estado) {
        case "VIGENTE":
            return "senapred-vigencia--vigente";

        case "VIGENTE_ACTUALIZADA":
            return "senapred-vigencia--actualizada";

        case "CANCELADA":
            return "senapred-vigencia--cancelada";

        case "HISTORICA":
            return "senapred-vigencia--historica";

        default:
            return "senapred-vigencia--verificar";
    }
}

            case "AMARILLA":
                return {
                    tarjeta:
                        "senapred-alerta--amarilla",

                    insignia:
                        "senapred-nivel--amarilla"
                };

            case "ATP":
                return {
                    tarjeta:
                        "senapred-alerta--atp",

                    insignia:
                        "senapred-nivel--atp"
                };

            case "VERDE":
                return {
                    tarjeta:
                        "senapred-alerta--verde",

                    insignia:
                        ""
                };

            default:
                return {
                    tarjeta: "",
                    insignia: ""
                };
        }
    }


    // =====================================================
    // TERRITORIO
    // =====================================================

    function obtenerTerritorio(alerta) {
        const partes = [];

        if (alerta.comunas) {
            partes.push(alerta.comunas);
        }

        if (alerta.provincias) {
            partes.push(alerta.provincias);
        }

        if (alerta.regiones) {
            partes.push(alerta.regiones);
        }

        return partes.length
            ? partes.join(" · ")
            : "Territorio no informado";
    }


    // =====================================================
    // CREAR TARJETA
    // =====================================================
function textoEstadoVigencia(estado) {
    switch (estado) {
        case "VIGENTE":
            return "Vigente";

        case "VIGENTE_ACTUALIZADA":
            return "Vigente · actualizada";

        case "CANCELADA":
            return "Cancelada";

        case "HISTORICA":
            return "Histórica";

        default:
            return "Por verificar";
    }
}


function claseEstadoVigencia(estado) {
    switch (estado) {
        case "VIGENTE":
            return "senapred-vigencia--vigente";

        case "VIGENTE_ACTUALIZADA":
            return "senapred-vigencia--actualizada";

        case "CANCELADA":
            return "senapred-vigencia--cancelada";

        case "HISTORICA":
            return "senapred-vigencia--historica";

        default:
            return "senapred-vigencia--verificar";
    }
}
    function crearTarjeta(alerta) {
    const estadoVigencia =
        alerta.estadoVigencia || "POR_VERIFICAR";

    const textoVigencia =
        textoEstadoVigencia(estadoVigencia);

    const claseVigencia =
        claseEstadoVigencia(estadoVigencia);

        const clases =
            claseNivel(
                alerta.codigoVisual
            );

        const articulo =
            document.createElement("article");

        articulo.className =
            `senapred-alerta ${clases.tarjeta}`.trim();

        const nivel =
            alerta.nivel
            || alerta.nivelSenapred
            || "Sin nivel";

        const riesgo =
            alerta.riesgo
            || "Riesgo no identificado";

        const territorio =
            obtenerTerritorio(alerta);

        articulo.innerHTML = `
            <div class="senapred-alerta-superior">

                <span
                    class="senapred-nivel ${clases.insignia}"
                >
                    ${escaparHtml(nivel)}
                </span>

                <span class="senapred-fecha">
                    ${escaparHtml(
                        formatearFecha(
                            alerta.fechaHora
                        )
                    )}
                </span>

            </div>

            <h3>
                ${escaparHtml(
                    alerta.titulo
                    || "Sin título"
                )}
            </h3>

            <p class="senapred-riesgo">
                ${escaparHtml(riesgo)}
            </p>

            <p class="senapred-territorio">
                ${escaparHtml(territorio)}
            </p>
<button
    type="button"
    class="senapred-ver-detalle"
>
    Ver detalle
</button>
        `;
    const indicadorVigencia =
        document.createElement("span");

    indicadorVigencia.className =
        `senapred-vigencia ${claseVigencia}`;

    indicadorVigencia.textContent =
        textoVigencia;

    articulo
        .querySelector(".senapred-nivel")
        ?.insertAdjacentElement(
            "afterend",
            indicadorVigencia
        );
articulo
    .querySelector(".senapred-ver-detalle")
    ?.addEventListener(
        "click",
        () => abrirDetalle(alerta)
    );

        return articulo;
    }
// =====================================================
// DETALLE SENAPRED
// =====================================================

function obtenerDocumentoContenido(html) {
    const parser = new DOMParser();

    return parser.parseFromString(
        html || "",
        "text/html"
    );
}


function obtenerTextoContenido(html) {
    const documento =
        obtenerDocumentoContenido(html);

    return (
        documento.body.textContent
        || ""
    )
        .replace(/\s+/g, " ")
        .trim();
}


function extraerRango(
    texto,
    expresion,
    unidad
) {
    const coincidencia =
        texto.match(expresion);

    if (!coincidencia) {
        return "—";
    }

    return (
        `${coincidencia[1]}–` +
        `${coincidencia[2]} ${unidad}`
    );
}


function extraerMetricas(alerta) {
    const texto =
        obtenerTextoContenido(
            alerta.contenido
        );

    const precipitacion =
        extraerRango(
            texto,
            /Precipitaciones?\s*:\s*(?:entre\s*)?([0-9.,]+)\s*y\s*([0-9.,]+)\s*mm/i,
            "mm"
        );

    const nieve =
        extraerRango(
            texto,
            /Nevadas?\s*:\s*(?:entre\s*)?([0-9.,]+)\s*y\s*([0-9.,]+)\s*cm/i,
            "cm"
        );

    const viento =
        extraerRango(
            texto,
            /Viento\s*:\s*(?:entre\s*)?([0-9.,]+)\s*y\s*([0-9.,]+)\s*km\/h/i,
            "km/h"
        );

    let temperatura = "—";

    const coincidenciaTemperatura =
        texto.match(
            /temperaturas?.{0,120}?entre\s*(-?[0-9.,]+)\s*y\s*(-?[0-9.,]+)\s*°?\s*C/i
        );

    if (coincidenciaTemperatura) {
        temperatura =
            `${coincidenciaTemperatura[1]}–` +
            `${coincidenciaTemperatura[2]} °C`;
    }


    let isoterma = "—";

    const coincidenciaIsoterma =
        texto.match(
            /Isoterma\s*0\s*°?\s*C.{0,100}?entre\s*([0-9.]+)\s*y\s*([0-9.]+)\s*m/i
        );

    if (coincidenciaIsoterma) {
        isoterma =
            `${coincidenciaIsoterma[1]}–` +
            `${coincidenciaIsoterma[2]} m`;
    }


    return {
        precipitacion,
        nieve,
        viento,
        temperatura,
        isoterma
    };
}


function obtenerEnlaceReal(href) {
    if (!href) {
        return "";
    }

    try {
        const url =
            new URL(
                href,
                window.location.href
            );

        if (
            url.hostname.includes(
                "safelinks.protection.outlook.com"
            )
        ) {
            return (
                url.searchParams.get("url")
                || href
            );
        }

        return url.href;
    }

    catch {
        return href;
    }
}


function obtenerAvisos(alerta) {
    const documento =
        obtenerDocumentoContenido(
            alerta.contenido
        );

    const avisos = [];

    for (
        const fila
        of documento.querySelectorAll(
            "table tr"
        )
    ) {
        const celdas =
            [...fila.querySelectorAll(
                "td, th"
            )];

        if (celdas.length < 4) {
            continue;
        }

        const nombre =
            celdas[0].textContent
                .replace(/\s+/g, " ")
                .trim();

        if (
            !nombre
            || /alertamiento/i.test(nombre)
        ) {
            continue;
        }

        const pronostico =
            celdas[1].textContent
                .replace(/\s+/g, " ")
                .trim();

        const inicio =
            celdas[2].textContent
                .replace(/\s+/g, " ")
                .trim();

        const fin =
            celdas[3].textContent
                .replace(/\s+/g, " ")
                .trim();

        const enlace =
            celdas[4]
                ?.querySelector("a")
                ?.getAttribute("href")
                || "";

        avisos.push({
            nombre,
            pronostico,
            inicio,
            fin,
            enlace:
                obtenerEnlaceReal(enlace)
        });
    }

    return avisos;
}


function mostrarAvisos(alerta) {
    const contenedor =
        elemento(
            "senapred-detalle-avisos"
        );

    if (!contenedor) {
        return;
    }

    const avisos =
        obtenerAvisos(alerta);

    if (!avisos.length) {
        contenedor.textContent =
            "No se informan alertamientos adicionales.";

        return;
    }

    contenedor.innerHTML = "";

    for (const aviso of avisos) {
        const bloque =
            document.createElement("div");

        bloque.style.marginBottom =
            "10px";

        const titulo =
            document.createElement(
                "strong"
            );

        titulo.textContent =
            aviso.nombre;

        const descripcion =
            document.createElement("div");

        descripcion.textContent =
            aviso.pronostico;

        const vigencia =
            document.createElement("small");

        vigencia.textContent =
            `Inicio: ${aviso.inicio} · ` +
            `Fin: ${aviso.fin}`;

        bloque.appendChild(titulo);
        bloque.appendChild(
            document.createElement("br")
        );
        bloque.appendChild(descripcion);
        bloque.appendChild(
            document.createElement("br")
        );
        bloque.appendChild(vigencia);

        if (aviso.enlace) {
            const enlace =
                document.createElement("a");

            enlace.href =
                aviso.enlace;

            enlace.target =
                "_blank";

            enlace.rel =
                "noopener noreferrer";

            enlace.textContent =
                "Abrir aviso oficial";

            bloque.appendChild(
                document.createElement("br")
            );

            bloque.appendChild(enlace);
        }

        contenedor.appendChild(
            bloque
        );
    }
}


function mostrarContenidoCompleto(alerta) {
    const destino =
        elemento(
            "senapred-detalle-contenido"
        );

    if (!destino) {
        return;
    }

    const documento =
        obtenerDocumentoContenido(
            alerta.contenido
        );

    // Eliminamos elementos que no queremos
    documento
        .querySelectorAll(
            "script, iframe, object, embed, style"
        )
        .forEach(
            elemento =>
                elemento.remove()
        );

    // Eliminamos atributos ejecutables
    documento
        .querySelectorAll("*")
        .forEach(
            nodo => {
                for (
                    const atributo
                    of [...nodo.attributes]
                ) {
                    if (
                        atributo.name
                            .toLowerCase()
                            .startsWith("on")
                    ) {
                        nodo.removeAttribute(
                            atributo.name
                        );
                    }
                }
            }
        );

    documento
        .querySelectorAll("a")
        .forEach(
            enlace => {
                const href =
                    enlace.getAttribute(
                        "href"
                    );

                const destinoReal =
                    obtenerEnlaceReal(
                        href
                    );

                if (
                    destinoReal
                    && !destinoReal
                        .toLowerCase()
                        .startsWith(
                            "javascript:"
                        )
                ) {
                    enlace.href =
                        destinoReal;

                    enlace.target =
                        "_blank";

                    enlace.rel =
                        "noopener noreferrer";
                }

                else {
                    enlace.removeAttribute(
                        "href"
                    );
                }
            }
        );

    destino.innerHTML =
        documento.body.innerHTML;
}


function mostrarAfectaciones(alerta) {
    const destino =
        elemento(
            "senapred-detalle-afectaciones"
        );

    if (!destino) {
        return;
    }

    const documento =
        obtenerDocumentoContenido(
            alerta.contenido
        );

    const textos =
        [...documento.querySelectorAll(
            "p, li"
        )]
            .map(
                nodo =>
                    nodo.textContent
                        .replace(/\s+/g, " ")
                        .trim()
            )
            .filter(Boolean);


    const relevantes =
        textos.filter(
            texto =>
                /corte de tránsito|corte de transito|conectividad|evacuaci|afectaci|interrupci|ruta\s/i
                    .test(texto)
        );


    if (!relevantes.length) {
        destino.textContent =
            "No se identificaron afectaciones específicas en el texto publicado.";

        return;
    }


    destino.innerHTML = "";

    for (
        const texto
        of relevantes.slice(0, 5)
    ) {
        const parrafo =
            document.createElement("p");

        parrafo.textContent =
            texto;

        destino.appendChild(
            parrafo
        );
    }
}


function abrirDetalle(alerta) {
    const lista =
        elemento("senapred-lista");

    const resumen =
        document.querySelector(
            ".senapred-resumen"
        );

    const estado =
        elemento("senapred-estado");

    const detalle =
        elemento("senapred-detalle");

    if (!detalle) {
        return;
    }


    if (lista) {
        lista.hidden = true;
    }

    if (resumen) {
        resumen.hidden = true;
    }

    if (estado) {
        estado.hidden = true;
    }

    detalle.hidden = false;


    elemento(
        "senapred-detalle-titulo"
    ).textContent =
        alerta.titulo || "Sin título";


    elemento(
        "senapred-detalle-fecha"
    ).textContent =
        formatearFecha(
            alerta.fechaHora
        );


    elemento(
        "senapred-detalle-nivel"
    ).textContent =
        alerta.nivel
        || alerta.nivelSenapred
        || "Sin nivel";


    elemento(
        "senapred-detalle-territorio"
    ).textContent =
        obtenerTerritorio(alerta);


    const metricas =
        extraerMetricas(alerta);


    elemento(
        "senapred-detalle-precipitacion"
    ).textContent =
        metricas.precipitacion;


    elemento(
        "senapred-detalle-nieve"
    ).textContent =
        metricas.nieve;


    elemento(
        "senapred-detalle-viento"
    ).textContent =
        metricas.viento;


    elemento(
        "senapred-detalle-temperatura"
    ).textContent =
        metricas.temperatura;


    elemento(
        "senapred-detalle-isoterma"
    ).textContent =
        metricas.isoterma;


    mostrarAvisos(alerta);
    mostrarAfectaciones(alerta);
    mostrarContenidoCompleto(alerta);
}


function volverALista() {
    const lista =
        elemento("senapred-lista");

    const resumen =
        document.querySelector(
            ".senapred-resumen"
        );

    const detalle =
        elemento("senapred-detalle");

    if (detalle) {
        detalle.hidden = true;
    }

    if (lista) {
        lista.hidden = false;
    }

    if (resumen) {
        resumen.hidden = false;
    }
}

    // =====================================================
    // MOSTRAR DATOS
    // =====================================================

    function mostrarDatos(datos) {
        const lista =
            elemento("senapred-lista");

        const estado =
            elemento("senapred-estado");

        const total =
            elemento("senapred-total");

        const actualizacion =
            elemento(
                "senapred-actualizacion"
            );

        if (
            !lista
            || !estado
            || !total
            || !actualizacion
        ) {
            return;
        }

        const alertas =
            Array.isArray(datos.alertas)
                ? datos.alertas
                : [];

       const totalVigentes =
    alertas.filter(
        alerta =>
            alerta.estadoVigencia === "VIGENTE"
            || alerta.estadoVigencia === "VIGENTE_ACTUALIZADA"
    ).length;

const totalActualizadas =
    alertas.filter(
        alerta =>
            alerta.estadoVigencia === "VIGENTE_ACTUALIZADA"
    ).length;

total.textContent =
    `${totalVigentes} · ${totalActualizadas} actualizadas`;
const contadorHeader =
    elemento("senapred-contador-header");

if (contadorHeader) {
    contadorHeader.textContent =
        `(${totalVigentes})`;
}

        actualizacion.textContent =
            formatearActualizacion(
                datos.generadoEn
            );

        lista.innerHTML = "";

        if (!alertas.length) {
            estado.hidden = false;

            estado.textContent =
                "No existen registros SENAPRED relevantes.";

            return;
        }

        estado.hidden = true;

        for (const alerta of alertas) {
            lista.appendChild(
                crearTarjeta(alerta)
            );
        }
    }


    // =====================================================
    // CARGAR DATOS JSON
    // =====================================================

    async function cargarDatos() {
        const estado =
            elemento("senapred-estado");

        try {
            const respuesta =
                await fetch(
                    RUTA_DATOS,
                    {
                        cache: "no-store"
                    }
                );

            if (!respuesta.ok) {
                throw new Error(
                    `HTTP ${respuesta.status}`
                );
            }

            const datos =
                await respuesta.json();

            mostrarDatos(datos);
        }

        catch (error) {
            console.error(
                "Error cargando SENAPRED:",
                error
            );

            if (estado) {
                estado.hidden = false;

                estado.textContent =
                    "No fue posible cargar la información SENAPRED.";
            }
        }
    }


    // =====================================================
    // ABRIR / CERRAR PANEL
    // =====================================================

    function abrirPanel() {
        const panel =
            elemento("panel-senapred");

        if (!panel) {
            return;
        }

        panel.hidden = false;
    }


    function cerrarPanel() {
        const panel =
            elemento("panel-senapred");

        if (!panel) {
            return;
        }

        panel.hidden = true;
    }

// =====================================================
// CARGAR COMPONENTE HTML
// =====================================================

async function cargarComponente() {
    const contenedor =
        elemento(
            "contenedor-alertas-senapred"
        );

    if (!contenedor) {
        console.warn(
            "No existe contenedor-alertas-senapred."
        );

        return;
    }

    try {
        const respuesta =
            await fetch(
                RUTA_HTML,
                {
                    cache: "no-store"
                }
            );

        if (!respuesta.ok) {
            throw new Error(
                `HTTP ${respuesta.status}`
            );
        }

        contenedor.innerHTML =
            await respuesta.text();


        // Botón cerrar panel
        elemento(
            "cerrar-senapred"
        )?.addEventListener(
            "click",
            cerrarPanel
        );

        // Boton actualizar SENAPRED
        const botonActualizarSenapred =
            elemento("actualizar-senapred");

        botonActualizarSenapred?.addEventListener(
            "click",
            async () => {
                botonActualizarSenapred.disabled = true;

                botonActualizarSenapred.classList.add(
                    "senapred-actualizando"
                );

                try {
                    const esLocal =
                        window.location.hostname === "localhost"
                        || window.location.hostname === "127.0.0.1";

                    const baseApi = esLocal
                        ? "http://localhost:8000"
                        : "https://gridvision-piloto-publico.onrender.com";

                    const respuesta =
                        await fetch(
                            `${baseApi}/api/senapred/actualizar`,
                            {
                                cache: "no-store"
                            }
                        );

                    if (!respuesta.ok) {
                        throw new Error(
                            `HTTP ${respuesta.status}`
                        );
                    }

                    const datos =
                        await respuesta.json();

                    mostrarDatos(datos);

                } catch (error) {

                    console.error(
                        "Error actualizando SENAPRED en vivo:",
                        error
                    );

                    const estado =
                        elemento("senapred-estado");

                    if (estado) {
                        estado.hidden = false;
                        estado.textContent =
                            "No fue posible actualizar SENAPRED en vivo.";
                    }

                } finally {

                    botonActualizarSenapred.disabled = false;

                    botonActualizarSenapred.classList.remove(
                        "senapred-actualizando"
                    );
                }
            }
        );


        // Botón volver desde detalle
        elemento(
            "senapred-volver"
        )?.addEventListener(
            "click",
            volverALista
        );


        // Botón SENAPRED del encabezado
        const botonAbrirSenapred =
            elemento(
                "abrir-senapred"
            );

        if (botonAbrirSenapred) {
            botonAbrirSenapred.addEventListener(
                "click",
                () => {
                    const panel =
                        elemento("panel-senapred");

                    if (!panel) {
                        return;
                    }

                    if (panel.hidden) {
                        abrirPanel();
                    } else {
                        cerrarPanel();
                    }
                }
            );
        }


        await cargarDatos();
    }

    catch (error) {
        console.error(
            "Error cargando panel SENAPRED:",
            error
        );
    }
}


// =====================================================
// API PÚBLICA GRIDVISION
// =====================================================

window.GridVisionSenapred = {
    abrirPanel,
    cerrarPanel,
    cargarDatos
};


// =====================================================
// INICIO
// =====================================================

if (
    document.readyState
    === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        cargarComponente
    );
}

else {
    cargarComponente();
}

})();