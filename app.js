const mapa = L.map("mapa", {
    preferCanvas: true,
    center: [-33.45, -70.66],
    zoom: 5,
    minZoom: 3,
    zoomControl: false
});

window.GridVisionMapa = mapa;
// ======================================================
// UBICACIÓN COMPARTIDA POR ENLACE
// ======================================================

function abrirUbicacionCompartidaDesdeURL() {
    const parametros =
        new URLSearchParams(window.location.search);

    // Si el enlace no contiene ubicación compartida,
    // GridVision continúa normalmente.
    if (
        !parametros.has("lat")
        || !parametros.has("lng")
    ) {
        return;
    }

    const latitud =
        Number(parametros.get("lat"));

    const longitud =
        Number(parametros.get("lng"));

    const zoomSolicitado =
        Number(parametros.get("zoom"));

    const tieneVencimiento =
        parametros.has("exp");

    const vencimiento =
        Number(parametros.get("exp"));

    if (
        !Number.isFinite(latitud)
        || !Number.isFinite(longitud)
        || latitud < -90
        || latitud > 90
        || longitud < -180
        || longitud > 180
    ) {
        return;
    }

    if (
        tieneVencimiento
        && (
            !Number.isFinite(vencimiento)
            || vencimiento <= 0
        )
    ) {
        alert(
            "El enlace de ubicación compartida no es válido."
        );

        return;
    }

    if (
        tieneVencimiento
        && Date.now() > vencimiento
    ) {
        alert(
            "Esta ubicación compartida ha vencido."
        );

        return;
    }

    const zoom =
        Number.isFinite(zoomSolicitado)
            ? Math.min(
                19,
                Math.max(3, zoomSolicitado)
            )
            : 17;

    const posicion = [
        latitud,
        longitud
    ];

    mapa.setView(
        posicion,
        zoom
    );

    const marcadorCompartido =
        L.circleMarker(posicion, {
            radius: 9,
            color: "#ffffff",
            weight: 3,
            fillColor: "#ff6d00",
            fillOpacity: 1
        })
        .addTo(mapa);

    marcadorCompartido
        .bindPopup(
            `<strong>Ubicación compartida</strong><br>
             Latitud: ${latitud.toFixed(6)}<br>
             Longitud: ${longitud.toFixed(6)}`
        )
        .openPopup();
}

abrirUbicacionCompartidaDesdeURL();
// ======================================================
// MI UBICACIÓN ACTUAL
// ======================================================

let marcadorUbicacion = null;
let circuloPrecision = null;

// Estado del seguimiento en tiempo real
let seguimientoActivo = false;
let primeraLecturaSeguimiento = true;

const ControlUbicacion = L.Control.extend({
    options: {
        position: "topleft"
    },

    onAdd: function () {
        const contenedor = L.DomUtil.create(
            "div",
            "leaflet-bar leaflet-control control-ubicacion"
        );

        const boton = L.DomUtil.create(
            "a",
            "control-ubicacion-boton",
            contenedor
        );

        boton.href = "#";
        boton.id = "boton-seguimiento-ubicacion";
        boton.innerHTML = `
    <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
    >
        <circle
            cx="12"
            cy="12"
            r="4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        ></circle>

        <path
            d="M12 2V5 M12 19V22 M2 12H5 M19 12H22"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
        ></path>
    </svg>
`;
        boton.title = "Mostrar mi ubicación actual";
        boton.setAttribute("aria-label", "Mostrar mi ubicación actual");

        L.DomEvent.disableClickPropagation(contenedor);
        L.DomEvent.disableScrollPropagation(contenedor);

        L.DomEvent.on(boton, "click", function (evento) {
    L.DomEvent.stop(evento);

    if (!seguimientoActivo) {
        // Iniciar seguimiento
        seguimientoActivo = true;
        primeraLecturaSeguimiento = true;

        boton.classList.add("seguimiento-activo");
        boton.title = "Detener seguimiento en tiempo real";
        boton.setAttribute(
            "aria-label",
            "Detener seguimiento en tiempo real"
        );

        mapa.locate({
            watch: true,
            setView: true,
            maxZoom: 17,
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });

        console.log("Seguimiento de ubicación iniciado");
    } else {
        // Detener seguimiento
        // Detener seguimiento
seguimientoActivo = false;

mapa.stopLocate();
mapa.closePopup();

// Eliminar el punto de ubicación
if (marcadorUbicacion) {
    mapa.removeLayer(marcadorUbicacion);
    marcadorUbicacion = null;
}

// Eliminar el círculo de precisión
if (circuloPrecision) {
    mapa.removeLayer(circuloPrecision);
    circuloPrecision = null;
}

boton.classList.remove("seguimiento-activo");
boton.title = "Iniciar seguimiento en tiempo real";
boton.setAttribute(
    "aria-label",
    "Iniciar seguimiento en tiempo real"
);

console.log("Seguimiento de ubicación detenido");
        boton.title = "Iniciar seguimiento en tiempo real";
        boton.setAttribute(
            "aria-label",
            "Iniciar seguimiento en tiempo real"
        );

        console.log("Seguimiento de ubicación detenido");
    }
});

        return contenedor;
    }
});

const controlUbicacion = new ControlUbicacion();

mapa.addControl(controlUbicacion);

L.control.zoom({
    position: "topleft"
}).addTo(mapa);

mapa.on("locationfound", function (evento) {
        if (!seguimientoActivo) {
        return;
    }
    const posicion = evento.latlng;
    const precision = Math.round(evento.accuracy);

    if (marcadorUbicacion) {
        mapa.removeLayer(marcadorUbicacion);
    }

    if (circuloPrecision) {
        mapa.removeLayer(circuloPrecision);
    }

    marcadorUbicacion = L.circleMarker(posicion, {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#1976d2",
        fillOpacity: 1
    }).addTo(mapa);

    marcadorUbicacion
    .bindPopup(
        `<strong>Mi ubicación actual</strong><br>
         Latitud: ${posicion.lat.toFixed(6)}<br>
         Longitud: ${posicion.lng.toFixed(6)}<br>
         Precisión aproximada: ${precision} metros<br><br>

         <button
             type="button"
             class="boton-compartir-ubicacion"
             onclick="
                 compartirUbicacionGridVision(
                     ${posicion.lat.toFixed(6)},
                     ${posicion.lng.toFixed(6)},
                     ${evento.accuracy}
                 )
             "
         >
             📤 Compartir ubicación
         </button>`
    )
    .openPopup();

    circuloPrecision = L.circle(posicion, {
        radius: evento.accuracy,
        color: "#1976d2",
        weight: 1,
        fillColor: "#1976d2",
        fillOpacity: 0.12
    }).addTo(mapa);
});

mapa.on("locationerror", function (evento) {
    console.error("Error de geolocalización:", evento.message);

    alert(
        "GridVision no pudo obtener tu ubicación. " +
        "Revisa que el navegador tenga permiso para acceder a ella."
    );
});
       // =====================================================
// MAPAS BASE - GRIDVISION CHILE
// =====================================================


// -----------------------------------------------------
// 1. OSM - MAPA CONVENCIONAL
// -----------------------------------------------------
const mapaCalles = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">' +
            "OpenStreetMap</a> contributors"
    }
);


// -----------------------------------------------------
// 2. MAPA CLARO - CARTO POSITRON
// -----------------------------------------------------
const mapaClaro = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
        subdomains: "abcd",
        maxZoom: 20,

        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">' +
            'OpenStreetMap</a> contributors ' +
            '&copy; <a href="https://carto.com/">CARTO</a>'
    }
);
// -----------------------------------------------------
// PANEL ESPECIAL PARA ETIQUETAS
// -----------------------------------------------------
// Permite que nombres de ciudades y lugares aparezcan
// sobre la imagen satelital, pero debajo de nuestras
// líneas y activos eléctricos.

mapa.createPane("etiquetasMapa");

mapa.getPane("etiquetasMapa").style.zIndex = 350;
mapa.getPane("etiquetasMapa").style.pointerEvents = "none";


// -----------------------------------------------------
// FUNCIÓN PARA CREAR SATÉLITE ESRI
// -----------------------------------------------------
// Se crean capas independientes para evitar conflictos
// al cambiar entre "Satélite HD" y
// "Satélite HD + etiquetas".

function crearMapaSatelitalEsri() {

    return L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
    maxNativeZoom: 17,
    maxZoom: 19,

            // IMPORTANTE:
            // No usamos maxNativeZoom: 17.
            // Así Leaflet solicita los mosaicos reales
            // de zoom 18 y 19 cuando estén disponibles.

            updateWhenIdle: false,

            keepBuffer: 4,

            updateWhenZooming: false,

            className: "mapa-satelital-tile",

            attribution:
                "Tiles &copy; Esri - Sources: Esri, Maxar, " +
                "Earthstar Geographics and the GIS User Community"
        }
    );
}


// -----------------------------------------------------
// 3. SATÉLITE HD SIN ETIQUETAS
// -----------------------------------------------------

const mapaSatelitalHD =
    crearMapaSatelitalEsri();


// -----------------------------------------------------
// 4. SATÉLITE HD + ETIQUETAS
// -----------------------------------------------------

const mapaSatelitalImagen =
    crearMapaSatelitalEsri();


// Nombres de ciudades, localidades,
// límites y lugares.

const etiquetasSatelitales = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/" +
    "Reference/World_Boundaries_and_Places/" +
    "MapServer/tile/{z}/{y}/{x}",
    {
        pane: "etiquetasMapa",

        maxZoom: 19,

        updateWhenIdle: false,

        keepBuffer: 4,

        updateWhenZooming: false,

        className: "mapa-etiquetas-tile",

        attribution: "Labels &copy; Esri"
    }
);


// Imagen + etiquetas funcionan
// como un único mapa base.

const mapaSatelital = L.layerGroup([
    mapaSatelitalImagen,
    etiquetasSatelitales
]);
// -----------------------------------------------------
// 5. GOOGLE SATÉLITE
// -----------------------------------------------------
const GOOGLE_BACKEND_BASE =
    (
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    )
        ? window.location.origin
        : "https://" + "gridvision-piloto-publico.onrender.com";

const mapaGoogleSatelite = L.tileLayer(
    GOOGLE_BACKEND_BASE + "/google-tiles/{z}/{x}/{y}",
    {
        maxZoom: 22,
        updateWhenIdle: false,
        keepBuffer: 4,
        updateWhenZooming: false,
        attribution: "Google Maps"
    }
);
let googleSateliteAutorizado = false;
let googleSateliteToken = "";

async function autorizarGoogleSatelite() {

    const password = window.prompt(
        "Google Satélite está protegido.\n\nIngresa la contraseña:"
    );

    if (password === null) {
        return false;
    }

    try {
        const respuesta = await fetch(
    GOOGLE_BACKEND_BASE + "/google-auth",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    password: password
                })
            }
        );

      if (!respuesta.ok) {
    alert("Contraseña incorrecta.");
    return false;
}

const datos = await respuesta.json();

if (!datos.token) {
    alert("No se recibió autorización para Google Satélite.");
    return false;
}

googleSateliteToken = datos.token;

mapaGoogleSatelite.setUrl(
    GOOGLE_BACKEND_BASE +
    "/google-tiles/{z}/{x}/{y}" +
    "?token=" +
    encodeURIComponent(googleSateliteToken)
);

googleSateliteAutorizado = true;

return true;

    } catch (error) {

        console.error(
            "Error autorizando Google Satélite:",
            error
        );

        alert(
            "No fue posible autorizar Google Satélite."
        );

        return false;
    }
}

// -----------------------------------------------------
// MAPA INICIAL DE GRIDVISION
// -----------------------------------------------------

mapaCalles.addTo(mapa);
// Mapa visible al iniciar GridVision
mapaCalles.addTo(mapa);

        L.control.scale({
            imperial: false,
            position: "bottomleft"
        }).addTo(mapa);

        const indiceBusqueda = [];
const capas = {
    lineas: L.layerGroup().addTo(mapa),
    subestaciones: L.layerGroup().addTo(mapa),
    centrales: L.layerGroup().addTo(mapa),
    almacenamiento: L.layerGroup().addTo(mapa),
    derivaciones: L.layerGroup().addTo(mapa),
    otros: L.layerGroup().addTo(mapa),
    postes: L.layerGroup().addTo(mapa)
};
const capasSeleccionables = [
    capas.lineas,
    capas.subestaciones,
    capas.centrales,
    capas.almacenamiento,
    capas.derivaciones,
    capas.otros,
    capas.postes
];

const controlCapas = L.control.layers(
    {
        "OSM": mapaCalles,
        "Mapa claro": mapaClaro,
        "Satélite HD": mapaSatelitalHD,
        "Satélite HD + etiquetas": mapaSatelital,
        "🔒 Google Satélite": mapaGoogleSatelite
    },
    {
        "Líneas eléctricas": capas.lineas,
        "Subestaciones": capas.subestaciones,
        "Centrales": capas.centrales,
        "Almacenamiento": capas.almacenamiento,
        "Conexiones en derivación": capas.derivaciones,
        "Otros activos": capas.otros,
        "Postes PEVP": capas.postes
    },
    {
        collapsed:
            window.matchMedia(
                "(max-width: 700px)"
            ).matches,
        position: "topright"
    }
).addTo(mapa);
// =====================================================
// PROTECCIÓN DE GOOGLE SATÉLITE
// =====================================================

let mapaBaseAnterior = mapaCalles;
let cambiandoGoogleSatelite = false;

mapa.on("baselayerchange", async function (evento) {

    if (cambiandoGoogleSatelite) {
        return;
    }

    // Si el usuario selecciona Google Satélite
    // y todavía no se ha autenticado.
    if (
        evento.layer === mapaGoogleSatelite &&
        !googleSateliteAutorizado
    ) {

        // Evita que Google cargue mosaicos sin autorización.
        mapa.removeLayer(mapaGoogleSatelite);

        const autorizado =
            await autorizarGoogleSatelite();

        if (autorizado) {

            cambiandoGoogleSatelite = true;

            mapaGoogleSatelite.addTo(mapa);

            cambiandoGoogleSatelite = false;

            mapaBaseAnterior = mapaGoogleSatelite;

        } else {

            // Si cancela o la contraseña es incorrecta,
            // vuelve al mapa que estaba usando.
            if (mapaBaseAnterior) {
                mapaBaseAnterior.addTo(mapa);
            }
        }

        return;
    }

    mapaBaseAnterior = evento.layer;
});
const contenedorControl =
    controlCapas.getContainer();

let sincronizandoCapas = false;

function obtenerContenedorOverlays() {
    return contenedorControl.querySelector(
        ".leaflet-control-layers-overlays"
    );
}

function obtenerSelectorTodo() {
    const contenedorOverlays =
        obtenerContenedorOverlays();

    if (!contenedorOverlays) {
        return null;
    }

    let selectorTodo =
        contenedorOverlays.querySelector(
            'input[data-gridvision-seleccionar-todo="true"]'
        );

    if (selectorTodo) {
        return selectorTodo;
    }

    const etiquetaSeleccionarTodo =
        document.createElement("label");

    etiquetaSeleccionarTodo.className =
        "gridvision-seleccionar-todo";

    const contenedorSeleccionarTodo =
        document.createElement("span");

    selectorTodo =
        document.createElement("input");

    selectorTodo.type = "checkbox";
    selectorTodo.className =
        "leaflet-control-layers-selector";

    selectorTodo.setAttribute(
        "data-gridvision-seleccionar-todo",
        "true"
    );

    const textoSeleccionarTodo =
        document.createElement("span");

    textoSeleccionarTodo.textContent =
        " Seleccionar todo";

    contenedorSeleccionarTodo.appendChild(
        selectorTodo
    );

    contenedorSeleccionarTodo.appendChild(
        textoSeleccionarTodo
    );

    etiquetaSeleccionarTodo.appendChild(
        contenedorSeleccionarTodo
    );

    contenedorOverlays.insertBefore(
        etiquetaSeleccionarTodo,
        contenedorOverlays.firstChild
    );
    
const botonMinimizarCapas =
    document.createElement("button");

botonMinimizarCapas.type = "button";
botonMinimizarCapas.textContent = "−";
botonMinimizarCapas.className =
    "gridvision-minimizar-capas";
botonMinimizarCapas.title =
    "Minimizar capas";

contenedorOverlays.insertBefore(
    botonMinimizarCapas,
    contenedorOverlays.firstChild
);
botonMinimizarCapas.addEventListener(
    "click",
    () => {

        const minimizar =
            botonMinimizarCapas.textContent.trim() === "−";

        const elementos =
            Array.from(
                contenedorOverlays.children
            );

        for (const elemento of elementos) {

            if (
                elemento === botonMinimizarCapas
            ) {
                continue;
            }

            elemento.style.display =
                minimizar ? "none" : "";
        }

        botonMinimizarCapas.textContent =
            minimizar ? "+" : "−";

        botonMinimizarCapas.title =
            minimizar
                ? "Mostrar capas"
                : "Minimizar capas";
    }
);
    selectorTodo.addEventListener(
        "change",
        () => {
            sincronizandoCapas = true;

            capasSeleccionables.forEach(
                (capa) => {
                    if (
                        selectorTodo.checked
                        && !mapa.hasLayer(capa)
                    ) {
                        mapa.addLayer(capa);
                    }

                    if (
                        !selectorTodo.checked
                        && mapa.hasLayer(capa)
                    ) {
                        mapa.removeLayer(capa);
                    }
                }
            );

            sincronizandoCapas = false;

            window.setTimeout(
                actualizarSeleccionarTodo,
                0
            );
        }
    );

    return selectorTodo;
}

function actualizarSeleccionarTodo() {
    const selectorTodo =
        obtenerSelectorTodo();

    if (!selectorTodo) {
        return;
    }

    const cantidadActivas =
        capasSeleccionables.filter(
            (capa) => mapa.hasLayer(capa)
        ).length;

    selectorTodo.checked =
        cantidadActivas
        === capasSeleccionables.length;

    selectorTodo.indeterminate =
        cantidadActivas > 0
        && cantidadActivas
            < capasSeleccionables.length;
}

mapa.on(
    "overlayadd overlayremove",
    (evento) => {
        if (
            sincronizandoCapas
            || !capasSeleccionables.includes(
                evento.layer
            )
        ) {
            return;
        }

        window.setTimeout(
            actualizarSeleccionarTodo,
            0
        );
    }
);

actualizarSeleccionarTodo();
        function colorLinea(tension) {
            const texto = String(tension || "");

            if (texto.includes("500")) return "#8e24aa";
            if (texto.includes("345")) return "#d32f2f";
            if (texto.includes("220")) return "#d32f2f";
            if (texto.includes("154")) return "#f57c00";
            if (texto.includes("110")) return "#f57c00";
            if (texto.includes("66")) return "#1976d2";

            return "#607d8b";
        }

        function estiloPunto(categoria) {
            const estilos = {
                "Subestación": {
                    radius: 4,
                    color: "#0d47a1",
                    fillColor: "#1976d2"
                },
                "Central": {
                    radius: 5,
                    color: "#00695c",
                    fillColor: "#00a878"
                },
                "Almacenamiento de energía": {
                    radius: 5,
                    color: "#6a1b9a",
                    fillColor: "#ab47bc"
                },
                "Conexión en derivación": {
                    radius: 4,
                    color: "#e65100",
                    fillColor: "#fb8c00"
                },
                "Poste": {
                    radius: 3,
                    color: "#37474f",
                    fillColor: "#78909c"
                }
            };

            return {
                ...(estilos[categoria] || {
                    radius: 4,
                    color: "#455a64",
                    fillColor: "#90a4ae"
                }),
                weight: 1,
                fillOpacity: 0.82
            };
        }

        function capaParaCategoria(categoria) {
            if (categoria === "Subestación") {
                return capas.subestaciones;
            }

            if (categoria === "Central") {
                return capas.centrales;
            }

            if (categoria === "Almacenamiento de energía") {
                return capas.almacenamiento;
            }

            if (categoria === "Conexión en derivación") {
                return capas.derivaciones;
            }

            if (categoria === "Poste") {
                return capas.postes;
            }

            return capas.otros;
        }
        const URL_PUBLICA_GRIDVISION =
    "https://ecastilloluengo.github.io/gridvision-piloto-publico/";

function construirEnlaceActivo(idActivo) {
    const url = new URL(URL_PUBLICA_GRIDVISION);

    if (idActivo) {
        url.searchParams.set("activo", idActivo);
    }

    return url.toString();
}
function construirEnlaceUbicacion(
    latitud,
    longitud,
    zoom = 17,
    duracionHoras = 24
) {
    const url = new URL(URL_PUBLICA_GRIDVISION);

    url.searchParams.set(
        "lat",
        Number(latitud).toFixed(6)
    );

    url.searchParams.set(
        "lng",
        Number(longitud).toFixed(6)
    );

    url.searchParams.set(
        "zoom",
        String(zoom)
    );

    const vencimiento =
        Date.now()
        + (
            Number(duracionHoras)
            * 60
            * 60
            * 1000
        );

    url.searchParams.set(
        "exp",
        String(vencimiento)
    );

    return url.toString();
}
async function compartirUbicacionGridVision(
    latitud,
    longitud,
    precision
) {
    const enlace = construirEnlaceUbicacion(
        latitud,
        longitud,
        mapa.getZoom()
    );
const lat = Number(latitud).toFixed(6);
const lng = Number(longitud).toFixed(6);

const enlaceGoogleMaps =
    construirEnlaceGoogleMaps(lat, lng);

const texto =
    "GridVision Chile\n\n"
    + "Mi ubicación actual\n"
    + `Coordenadas: ${lat}, ${lng}\n`
    + `Precisión aproximada: ${Math.round(precision)} m\n\n`
    + "Ver ubicación en Google Maps:\n"
    + `${enlaceGoogleMaps}\n\n`
    + "Abrir ubicación en GridVision:";

    try {
        if (navigator.share) {
            await navigator.share({
                title: "Mi ubicación - GridVision Chile",
                text: texto,
                url: enlace
            });

            return;
        }

        await navigator.clipboard.writeText(
            `${texto}\n${enlace}`
        );

        alert(
            "Enlace de ubicación copiado al portapapeles."
        );
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }

        console.error(
            "No se pudo compartir la ubicación:",
            error
        );

        window.prompt(
            "Copia este enlace de ubicación:",
            enlace
        );
    }
}
function construirEnlaceGoogleMaps(
    latitud,
    longitud
) {
    const punto = encodeURIComponent(
        `${latitud},${longitud}`
    );

    return (
        "https://www.google.com/maps/search/" +
        `?api=1&query=${punto}`
    );
}

async function copiarTexto(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        const auxiliar =
            document.createElement("textarea");

        auxiliar.value = texto;
        auxiliar.style.position = "fixed";
        auxiliar.style.opacity = "0";

        document.body.appendChild(auxiliar);
        auxiliar.select();

        const correcto =
            document.execCommand("copy");

        auxiliar.remove();

        return correcto;
    }
}

async function compartirActivo(
    propiedades,
    latitud,
    longitud,
    boton
) {
    const nombre =
        propiedades.nombre || "Activo GridVision";

    const enlaceGoogleMaps =
        construirEnlaceGoogleMaps(
            latitud,
            longitud
        );

    const enlaceGridVision =
        construirEnlaceActivo(
            propiedades.id
        );

    const mensaje = [
        "GridVision Chile",
        `Activo: ${nombre}`,
        propiedades.id
            ? `ID: ${propiedades.id}`
            : null,
        propiedades.categoria
            ? `Categoría: ${propiedades.categoria}`
            : null,
        propiedades.subcategoria
            ? `Subcategoría: ${propiedades.subcategoria}`
            : null,
        `Coordenadas: ${latitud.toFixed(6)}, ${longitud.toFixed(6)}`,
        "",
        "Ver ubicación en Google Maps:",
        enlaceGoogleMaps,
        "",
        "Abrir activo en GridVision:",
        enlaceGridVision
    ]
        .filter((linea) => linea !== null)
        .join("\n");

    try {
        if (navigator.share) {
            await navigator.share({
                title: `GridVision · ${nombre}`,
                text: mensaje
            });

            return;
        }

        const correcto =
            await copiarTexto(mensaje);

        if (!correcto) {
            throw new Error(
                "No fue posible copiar la información."
            );
        }

        const tituloOriginal = boton.title;

        boton.classList.add("enlace-copiado");
        boton.title = "Información copiada";
        boton.setAttribute(
            "aria-label",
            "Información copiada"
        );

        window.setTimeout(() => {
            boton.classList.remove(
                "enlace-copiado"
            );

            boton.title = tituloOriginal;
            boton.setAttribute(
                "aria-label",
                "Compartir activo"
            );
        }, 1800);
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }

        console.error(
            "No fue posible compartir el activo:",
            error
        );

        alert(
            "No fue posible compartir el activo. " +
            "Inténtalo nuevamente."
        );
    }
}
async function cargarEstadoSolaxLoAguirre(contenedor) {
    const UMBRAL_DATO_SOLAX_MS =
        10 * 60 * 1000; // 10 minutos

    const REINTENTO_SOLAX_MS =
        15 * 1000; // 15 segundos

    function obtenerEdadDatoSolaxMs(fechaSolax) {

        if (
            !fechaSolax ||
            typeof fechaSolax !== "string"
        ) {
            return null;
        }

        const partes = fechaSolax
            .trim()
            .match(
                /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
            );

        if (!partes) {
            return null;
        }

        const fechaDato = new Date(
            Number(partes[1]),
            Number(partes[2]) - 1,
            Number(partes[3]),
            Number(partes[4]),
            Number(partes[5]),
            Number(partes[6])
        );

        const edadMs =
            Date.now() - fechaDato.getTime();

        if (!Number.isFinite(edadMs)) {
            return null;
        }

        return edadMs;
    }
    const INTERVALO_SOLAX_MS = 60 * 1000; // 1 minuto

    const bloque = document.createElement("div");

    bloque.style.marginTop = "10px";
    bloque.style.paddingTop = "9px";
    bloque.style.borderTop = "1px solid #dce5ec";

    contenedor.appendChild(bloque);

    let actualizando = false;
    let datoSolaxDesactualizado = false;

    async function actualizarEstadoSolax() {

        if (actualizando) {
            return;
        }

        actualizando = true;

        bloque.innerHTML = "";

        const titulo = document.createElement("strong");
        titulo.textContent = "Estado de inversores";
        bloque.appendChild(titulo);

        const cargando = document.createElement("p");
        cargando.textContent = "Consultando SolaXCloud…";
        cargando.style.margin = "6px 0";

        bloque.appendChild(cargando);

        try {

            const respuesta = await fetch(
                GOOGLE_BACKEND_BASE +
                "/api/solax/lo-aguirre",
                {
                    cache: "no-store"
                }
            );

            if (!respuesta.ok) {
                throw new Error(
                    "No fue posible consultar SolaX"
                );
            }

            const datos = await respuesta.json();

            cargando.remove();


   // --------------------------------------------
// GENERACIÓN INSTANTÁNEA
// SOLO INVERSORES CON DATOS VIGENTES
// --------------------------------------------

function inversorTieneDatoVigente(inversor) {

    const edadDato =
        obtenerEdadDatoSolaxMs(
            inversor.ultimo_dato
        );

    return (
        edadDato !== null &&
        edadDato <= UMBRAL_DATO_SOLAX_MS
    );
}

const inversoresVigentes =
    datos.inversores.filter(
        inversorTieneDatoVigente
    );

const potenciaTotalW =
    inversoresVigentes.reduce(
        (total, inversor) =>
            total +
            Number(
                inversor.potencia_ac || 0
            ),
        0
    );

const potenciaTotalKW =
    potenciaTotalW / 1000;
                // --------------------------------------------
// RED Y CONSUMO DE LA INSTALACIÓN
// --------------------------------------------

// El medidor de red aparece asociado a uno
// de los inversores. Tomamos el valor con
// mayor magnitud para evitar sumar ceros
// de los demás equipos.
const potenciaRedW =
    inversoresVigentes.reduce(
        (valorActual, inversor) => {

            const valor =
                Number(inversor.potencia_red || 0);

            return Math.abs(valor) >
                Math.abs(valorActual)
                ? valor
                : valorActual;

        },
        0
    );

const potenciaRedKW =
    potenciaRedW / 1000;

// Planta sin batería:
// Consumo = FV - potencia de red con signo
const consumoCasaKW =
    potenciaTotalKW - potenciaRedKW;

            const generacionActual =
                document.createElement("p");

            generacionActual.style.margin = "8px 0";
            generacionActual.style.fontWeight = "700";

            generacionActual.textContent =
                `⚡ Generación instantánea: ` +
                `${potenciaTotalKW.toLocaleString(
                    "es-CL",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                )} kW`;

            bloque.appendChild(generacionActual);
// --------------------------------------------
// CONSUMO CASA
// --------------------------------------------

const consumoActual =
    document.createElement("p");

consumoActual.style.margin = "5px 0";
consumoActual.style.fontWeight = "700";

consumoActual.textContent =
    `🏠 Consumo instalación: ` +
    `${consumoCasaKW.toLocaleString(
        "es-CL",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )} kW`;

bloque.appendChild(consumoActual);


// --------------------------------------------
// INTERCAMBIO CON LA RED
// --------------------------------------------

const redActual =
    document.createElement("p");

redActual.style.margin = "5px 0";
redActual.style.fontWeight = "700";

let textoRed;

if (potenciaRedKW < -0.01) {

    textoRed =
        `🔌 Red: Importando ` +
        `${Math.abs(potenciaRedKW).toLocaleString(
            "es-CL",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )} kW`;

} else if (potenciaRedKW > 0.01) {

    textoRed =
        `🔌 Red: Exportando ` +
        `${potenciaRedKW.toLocaleString(
            "es-CL",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )} kW`;

} else {

    textoRed = "🔌 Red: 0,00 kW";
}

redActual.textContent = textoRed;

bloque.appendChild(redActual);
// --------------------------------------------
// METEOROLOGÍA / IRRADIANCIA ESTIMADA
// --------------------------------------------

try {

    const respuestaMeteo = await fetch(
        "https://api.open-meteo.com/v1/forecast" +
        "?latitude=-33.453723" +
        "&longitude=-70.870886" +
        "&current=shortwave_radiation,temperature_2m,cloud_cover" +
        "&timezone=America%2FSantiago",
        {
            cache: "no-store"
        }
    );

    if (respuestaMeteo.ok) {

        const meteo =
            await respuestaMeteo.json();

        const actual =
            meteo.current || {};

        const irradiancia =
            Number(actual.shortwave_radiation);

        const temperatura =
            Number(actual.temperature_2m);

        const nubosidad =
            Number(actual.cloud_cover);


        const irradianciaActual =
            document.createElement("p");

        irradianciaActual.style.margin =
            "8px 0 5px 0";

        irradianciaActual.textContent =
            `☀ Irradiancia GHI estimada: ` +
            `${irradiancia.toLocaleString(
                "es-CL",
                {
                    maximumFractionDigits: 0
                }
            )} W/m²`;

        bloque.appendChild(
            irradianciaActual
        );


        const temperaturaActual =
            document.createElement("p");

        temperaturaActual.style.margin =
            "5px 0";

        temperaturaActual.textContent =
            `🌡 Temperatura exterior: ` +
            `${temperatura.toLocaleString(
                "es-CL",
                {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                }
            )} °C`;

        bloque.appendChild(
            temperaturaActual
        );


        const nubosidadActual =
            document.createElement("p");

        nubosidadActual.style.margin =
            "5px 0";

        nubosidadActual.textContent =
            `☁ Nubosidad: ` +
            `${nubosidad.toLocaleString(
                "es-CL",
                {
                    maximumFractionDigits: 0
                }
            )} %`;

        bloque.appendChild(
            nubosidadActual
        );
    }

} catch (errorMeteo) {

    console.warn(
        "No fue posible consultar Open-Meteo:",
        errorMeteo
    );
}

// --------------------------------------------
// INVERSORES
// --------------------------------------------

for (const inversor of datos.inversores) {

    const fila =
        document.createElement("p");

    fila.style.margin = "5px 0";

    const edadDato =
        obtenerEdadDatoSolaxMs(
            inversor.ultimo_dato
        );

    const datoVigente =
        edadDato !== null &&
        edadDato <= UMBRAL_DATO_SOLAX_MS;

    let simbolo = "🟡";
    let textoEstado =
        inversor.estado;

    if (!datoVigente) {

        simbolo = "🟠";
        textoEstado =
            "DATO DESACTUALIZADO";

    } else {

        if (inversor.nivel === "ok") {
            simbolo = "🟢";
        }

        if (inversor.nivel === "falla") {
            simbolo = "🔴";
        }

        if (
            inversor.nivel ===
            "sin_datos"
        ) {
            simbolo = "⚪";
        }
    }

    fila.textContent =
        `${simbolo} ${inversor.nombre}: ` +
        textoEstado;

    bloque.appendChild(fila);
}
// --------------------------------------------
// ÚLTIMO DATO DE SOLAX
// --------------------------------------------

const ultimoDato =
    datos.inversores
        .map(
            inversor =>
                inversor.ultimo_dato
        )
        .filter(Boolean)
        .sort()
        .at(-1);

const edadDatoSolaxMs =
    obtenerEdadDatoSolaxMs(ultimoDato);

datoSolaxDesactualizado =
    edadDatoSolaxMs !== null &&
    edadDatoSolaxMs > UMBRAL_DATO_SOLAX_MS;


// --------------------------------------------
// ESTADO GENERAL
// --------------------------------------------

const general =
    document.createElement("p");

general.style.marginTop = "8px";
general.style.fontWeight = "700";

let simboloGeneral = "🟡";
let textoEstadoGeneral =
    datos.estado_general;

if (datos.nivel_general === "ok") {
    simboloGeneral = "🟢";
}

if (datos.nivel_general === "falla") {
    simboloGeneral = "🔴";
}

if (
    datos.nivel_general ===
    "sin_datos"
) {
    simboloGeneral = "⚪";
}


// Si SolaX entrega información antigua,
// GridVision no la presenta como estado actual.
if (datoSolaxDesactualizado) {

    simboloGeneral = "🟠";
    textoEstadoGeneral =
        "DATOS DESACTUALIZADOS";
}

general.textContent =
    `${simboloGeneral} Estado general: ` +
    textoEstadoGeneral;

bloque.appendChild(general);


// --------------------------------------------
// FECHA DEL ÚLTIMO DATO
// --------------------------------------------

if (ultimoDato) {

    const hora =
        document.createElement("small");

    hora.style.display = "block";

    hora.textContent =
        `Último dato SolaX: ${ultimoDato}`;

    bloque.appendChild(hora);
}


// --------------------------------------------
// AVISO DE DATO DESACTUALIZADO
// --------------------------------------------

if (
    datoSolaxDesactualizado &&
    edadDatoSolaxMs !== null
) {

    const minutos =
        Math.floor(
            edadDatoSolaxMs / 60000
        );

    let textoEdad;

    if (minutos >= 60) {

        const horas =
            Math.floor(minutos / 60);

        const minutosRestantes =
            minutos % 60;

        textoEdad =
            `${horas} h ` +
            `${minutosRestantes} min`;

    } else {

        textoEdad =
            `${minutos} min`;
    }

    const avisoDato =
        document.createElement("small");

    avisoDato.style.display = "block";
    avisoDato.style.marginTop = "5px";
    avisoDato.style.padding = "6px 8px";
    avisoDato.style.borderRadius = "6px";
    avisoDato.style.background =
        "#fff3cd";
    avisoDato.style.color =
        "#856404";
    avisoDato.style.fontWeight =
        "700";

    avisoDato.textContent =
        `⚠ SolaX no entrega un dato nuevo ` +
        `desde hace ${textoEdad}.`;

    bloque.appendChild(avisoDato);
}
            // --------------------------------------------
            // HORA DE CONSULTA DE GRIDVISION
            // --------------------------------------------

            const horaConsulta =
                document.createElement("small");

            horaConsulta.style.display = "block";
            horaConsulta.style.marginTop = "3px";
            horaConsulta.style.opacity = "0.7";

const ahora =
    new Date().toLocaleTimeString(
        "es-CL",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }
    );
            horaConsulta.textContent =
                `GridVision consultó: ${ahora} · ` +
                `actualización cada 1 min`;

            bloque.appendChild(horaConsulta);

        } catch (error) {

            console.error(
                "Error consultando SolaX:",
                error
            );

            cargando.textContent =
                "⚪ Sin comunicación con SolaXCloud";

        } finally {

            actualizando = false;
        }
    }
// -----------------------------------------------------
// ACTUALIZACIÓN AUTOMÁTICA SOLAX
// -----------------------------------------------------

let temporizadorSolax = null;

function programarSiguienteConsultaSolax() {

    if (temporizadorSolax) {
        window.clearTimeout(
            temporizadorSolax
        );
    }

    const espera =
        datoSolaxDesactualizado
            ? REINTENTO_SOLAX_MS
            : INTERVALO_SOLAX_MS;

    temporizadorSolax =
        window.setTimeout(
            async () => {

                if (!contenedor.isConnected) {
                    temporizadorSolax = null;
                    return;
                }

                await actualizarEstadoSolax();

                programarSiguienteConsultaSolax();

            },
            espera
        );
}
// Primera consulta inmediata
await actualizarEstadoSolax();

// Luego programamos la siguiente:
// 15 s si está desactualizado,
// 1 min si está actualizado.
programarSiguienteConsultaSolax();

    

        
}
function claveCacheFusionSolar(claveFusionSolar) {
    return "gridvision:fusionsolar:ultimo:" + claveFusionSolar;
}

function guardarUltimoDatoFusionSolar(
    claveFusionSolar,
    datos
) {
    try {
        localStorage.setItem(
            claveCacheFusionSolar(claveFusionSolar),
            JSON.stringify({
                guardado_en: new Date().toISOString(),
                datos: datos
            })
        );
    } catch (error) {
        console.warn(
            "No fue posible guardar respaldo FusionSolar:",
            error
        );
    }
}

function leerUltimoDatoFusionSolar(
    claveFusionSolar
) {
    try {
        const texto = localStorage.getItem(
            claveCacheFusionSolar(claveFusionSolar)
        );

        if (!texto) {
            return null;
        }

        const respaldo = JSON.parse(texto);

        if (!respaldo || !respaldo.datos) {
            return null;
        }

        return respaldo;

    } catch (error) {

        console.warn(
            "No fue posible leer respaldo FusionSolar:",
            error
        );

        return null;
    }
}

async function cargarEstadoSolarPendienteFusion(
    contenedor,
    latitud,
    longitud,
    claveFusionSolar
) {
    const INTERVALO_FUSIONSOLAR_MS = 60 * 1000;

    const bloque = document.createElement("div");
    bloque.style.marginTop = "10px";
    bloque.style.paddingTop = "9px";
    bloque.style.borderTop = "1px solid #dce5ec";

    contenedor.appendChild(bloque);

    let actualizando = false;
    let temporizadorFusionSolar = null;

    function agregarLinea(
        texto,
        {
            margen = "5px 0",
            negrita = false
        } = {}
    ) {
        const linea = document.createElement("p");
        linea.style.margin = margen;

        if (negrita) {
            linea.style.fontWeight = "700";
        }

        linea.textContent = texto;
        bloque.appendChild(linea);

        return linea;
    }

   function formatearNumero(
    valor,
    decimales = 2
) {
    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {
        return null;
    }

    const numero = Number(valor);

        if (!Number.isFinite(numero)) {
            return null;
        }

        return numero.toLocaleString(
            "es-CL",
            {
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }
        );
    }

    async function actualizarEstadoSolar() {

        if (actualizando) {
            return;
        }

        actualizando = true;
        bloque.innerHTML = "";

        try {

            // =============================================
            // FUSIONSOLAR
            // =============================================

            let datosFusion = null;
            let datosFusionDesactualizados = false;
            let fechaRespaldoFusion = null;

            try {

                const respuestaFusion = await fetch(
                    GOOGLE_BACKEND_BASE +
                    `/api/fusionsolar/${claveFusionSolar}`,
                    {
                        cache: "no-store"
                    }
                );

                if (!respuestaFusion.ok) {
                    throw new Error(
                        "FusionSolar no respondió correctamente"
                    );
                }

                datosFusion =
                    await respuestaFusion.json();

                guardarUltimoDatoFusionSolar(
                    claveFusionSolar,
                    datosFusion
                );

            } catch (errorFusion) {

                console.warn(
                    "Error FusionSolar:",
                    errorFusion
                );

                const respaldoFusion =
                    leerUltimoDatoFusionSolar(
                        claveFusionSolar
                    );

                if (respaldoFusion) {

                    datosFusion =
                        respaldoFusion.datos;

                    datosFusionDesactualizados =
                        true;

                    fechaRespaldoFusion =
                        respaldoFusion.guardado_en;
                }
            }


            const titulo =
                document.createElement("strong");

            titulo.textContent =
                "Estado de inversores";

            bloque.appendChild(titulo);


            if (
                datosFusionDesactualizados &&
                datosFusion
            ) {

                const potencia =
                    formatearNumero(
                        datosFusion.potencia_instantanea_kw
                    );

                agregarLinea(
                    potencia !== null
                        ? `\u26A1 \u00DAltima generaci\u00F3n conocida: ${potencia} kW`
                        : "\u26A1 \u00DAltima generaci\u00F3n conocida: Sin dato",
                    {
                        margen: "8px 0",
                        negrita: true
                    }
                );

                const energiaHoy =
                    formatearNumero(
                        datosFusion.energia_hoy_kwh
                    );

                const energiaMes =
                    formatearNumero(
                        datosFusion.energia_mes_kwh
                    );

                const energiaTotal =
                    formatearNumero(
                        datosFusion.energia_total_kwh
                    );

                agregarLinea(
                    energiaHoy !== null
                        ? `\uD83D\uDD0B Energ\u00EDa hoy - \u00FAltimo dato: ${energiaHoy} kWh`
                        : "\uD83D\uDD0B Energ\u00EDa hoy: Sin dato"
                );

                agregarLinea(
                    energiaMes !== null
                        ? `\uD83D\uDCC5 Energ\u00EDa mes - \u00FAltimo dato: ${energiaMes} kWh`
                        : "\uD83D\uDCC5 Energ\u00EDa mes: Sin dato"
                );

                agregarLinea(
                    energiaTotal !== null
                        ? `\u26A1 Energ\u00EDa acumulada - \u00FAltimo dato: ${energiaTotal} kWh`
                        : "\u26A1 Energ\u00EDa acumulada: Sin dato"
                );

                const inversores =
                    Array.isArray(
                        datosFusion.inversores
                    )
                        ? datosFusion.inversores
                        : [];

                for (const inversor of inversores) {

                    const potenciaInversor =
                        formatearNumero(
                            inversor.potencia_kw
                        );

                    const identificador =
                        inversor.sn ||
                        inversor.devId ||
                        "Inversor";

                    agregarLinea(
                        `\uD83D\uDFE0 ${identificador}: ` +
                        (
                            potenciaInversor !== null
                                ? `${potenciaInversor} kW`
                                : "Sin dato"
                        ) +
                        " \u00B7 \u00DALTIMO DATO"
                    );
                }

                let textoFecha =
                    "fecha no disponible";

                if (fechaRespaldoFusion) {

                    const fecha =
                        new Date(
                            fechaRespaldoFusion
                        );

                    if (!Number.isNaN(fecha.getTime())) {

                        textoFecha =
                            fecha.toLocaleString(
                                "es-CL",
                                {
                                    timeZone:
                                        "America/Santiago",
                                    dateStyle:
                                        "short",
                                    timeStyle:
                                        "medium"
                                }
                            );
                    }
                }

                agregarLinea(
                    "\uD83D\uDFE0 FusionSolar: " +
                    "DATOS DESACTUALIZADOS \u00B7 " +
                    "\u00DAltima respuesta v\u00E1lida: " +
                    textoFecha,
                    {
                        margen: "8px 0 5px 0",
                        negrita: true
                    }
                );

            } else if (datosFusion) {

                // -----------------------------------------
                // POTENCIA INSTANTÁNEA
                // -----------------------------------------

                const potencia =
                    formatearNumero(
                        datosFusion
                            .potencia_instantanea_kw
                    );

                agregarLinea(
                    potencia !== null
                        ? `⚡ Generación instantánea: ${potencia} kW`
                        : "⚡ Generación instantánea: Sin dato",
                    {
                        margen: "8px 0",
                        negrita: true
                    }
                );

                agregarLinea(
                    "🏠 Consumo instalación: Sin medición",
                    {
                        negrita: true
                    }
                );

                agregarLinea(
                    "🔌 Red: Sin medición",
                    {
                        negrita: true
                    }
                );


                // -----------------------------------------
                // ENERGÍA
                // -----------------------------------------

                const energiaHoy =
                    formatearNumero(
                        datosFusion.energia_hoy_kwh
                    );

                const energiaMes =
                    formatearNumero(
                        datosFusion.energia_mes_kwh
                    );

                const energiaTotal =
                    formatearNumero(
                        datosFusion.energia_total_kwh
                    );

                agregarLinea(
                    energiaHoy !== null
                        ? `🔋 Energía hoy: ${energiaHoy} kWh`
                        : "🔋 Energía hoy: Sin dato"
                );

                agregarLinea(
                    energiaMes !== null
                        ? `📅 Energía mes: ${energiaMes} kWh`
                        : "📅 Energía mes: Sin dato"
                );

                agregarLinea(
                    energiaTotal !== null
                        ? `⚡ Energía acumulada: ${energiaTotal} kWh`
                        : "⚡ Energía acumulada: Sin dato"
                );


                // -----------------------------------------
                // INVERSORES
                // -----------------------------------------

                const inversores =
                    Array.isArray(
                        datosFusion.inversores
                    )
                        ? datosFusion.inversores
                        : [];

                for (const inversor of inversores) {

                    const potenciaInversor =
                        formatearNumero(
                            inversor.potencia_kw
                        );

                    if (inversor.telemetria) {

                        agregarLinea(
                            `🟢 ${inversor.sn}: ` +
                            (
                                potenciaInversor !== null
                                    ? `${potenciaInversor} kW`
                                    : "Sin dato"
                            )
                        );

                    } else {

                        agregarLinea(
                            `🟠 ${inversor.sn}: ` +
                            "SIN TELEMETRÍA"
                        );
                    }
                }


                // -----------------------------------------
                // ESTADO GENERAL
                // -----------------------------------------

                const horaChile =
                    Number(
                        new Intl.DateTimeFormat(
                            "es-CL",
                            {
                                timeZone:
                                    "America/Santiago",
                                hour: "2-digit",
                                hourCycle: "h23"
                            }
                        ).format(new Date())
                    );

                const esVseTecho =
                    claveFusionSolar === "techo";

                const enVentanaPunta =
                    esVseTecho &&
                    horaChile >= 18 &&
                    horaChile < 22;

                let indicadorEstado = "⚪";
                let textoEstado =
                    datosFusion.estado;

                if (datosFusion.estado === "OK") {

                    indicadorEstado = "🟢";
                    textoEstado = "OK";

                } else if (
                    datosFusion.estado === "FALLA"
                ) {

                    indicadorEstado = "🔴";
                    textoEstado = "FALLA";

                } else if (
                    datosFusion.estado ===
                    "SIN COMUNICACION"
                ) {

                    if (enVentanaPunta) {

                        indicadorEstado = "🟠";

                        textoEstado =
                            "SIN COMUNICACIÓN · " +
                            "VENTANA PUNTA / VERIFICAR";

                    } else if (esVseTecho) {

                        indicadorEstado = "🔴";

                        textoEstado =
                            "SIN COMUNICACIÓN · " +
                            "FUERA DE VENTANA PUNTA / REVISAR";

                    } else {

                        indicadorEstado = "🟠";

                        textoEstado =
                            "SIN COMUNICACIÓN";
                    }
                }

                agregarLinea(
                    `${indicadorEstado} FusionSolar: ` +
                    `${textoEstado}`,
                    {
                        margen: "8px 0 5px 0",
                        negrita: true
                    }
                );

            } else {

                agregarLinea(
                    "⚡ Generación instantánea: Sin dato",
                    {
                        margen: "8px 0",
                        negrita: true
                    }
                );

                agregarLinea(
                    "🔴 FusionSolar: SIN COMUNICACIÓN",
                    {
                        negrita: true
                    }
                );
            }


            // =============================================
            // METEOROLOGÍA
            // =============================================

            let meteoDisponible = false;

            try {

                const respuestaMeteo = await fetch(
                    "https://api.open-meteo.com/v1/forecast" +
                    `?latitude=${latitud}` +
                    `&longitude=${longitud}` +
                    "&current=shortwave_radiation,temperature_2m,cloud_cover" +
                    "&timezone=America%2FSantiago",
                    {
                        cache: "no-store"
                    }
                );

                if (!respuestaMeteo.ok) {
                    throw new Error(
                        "Open-Meteo no respondió correctamente"
                    );
                }

                const meteo =
                    await respuestaMeteo.json();

                const actual =
                    meteo.current || {};

                const irradiancia =
                    Number(
                        actual.shortwave_radiation
                    );

                const temperatura =
                    Number(
                        actual.temperature_2m
                    );

                const nubosidad =
                    Number(
                        actual.cloud_cover
                    );


                agregarLinea(
                    Number.isFinite(irradiancia)
                        ? `☀ Irradiancia GHI estimada: ` +
                          `${irradiancia.toLocaleString(
                              "es-CL",
                              {
                                  maximumFractionDigits: 0
                              }
                          )} W/m²`
                        : "☀ Irradiancia GHI estimada: Sin dato",
                    {
                        margen: "8px 0 5px 0"
                    }
                );


                agregarLinea(
                    Number.isFinite(temperatura)
                        ? `🌡 Temperatura exterior: ` +
                          `${temperatura.toLocaleString(
                              "es-CL",
                              {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1
                              }
                          )} °C`
                        : "🌡 Temperatura exterior: Sin dato"
                );


                agregarLinea(
                    Number.isFinite(nubosidad)
                        ? `☁ Nubosidad: ` +
                          `${nubosidad.toLocaleString(
                              "es-CL",
                              {
                                  maximumFractionDigits: 0
                              }
                          )} %`
                        : "☁ Nubosidad: Sin dato"
                );

                meteoDisponible = true;

            } catch (errorMeteo) {

                console.warn(
                    "Error Open-Meteo:",
                    errorMeteo
                );

                agregarLinea(
                    "☀ Irradiancia GHI estimada: Sin dato",
                    {
                        margen: "8px 0 5px 0"
                    }
                );

                agregarLinea(
                    "🌡 Temperatura exterior: Sin dato"
                );

                agregarLinea(
                    "☁ Nubosidad: Sin dato"
                );
            }


            agregarLinea(
                meteoDisponible
                    ? "🟢 Datos meteorológicos: OK"
                    : "🟠 Datos meteorológicos: Sin comunicación",
                {
                    negrita: true
                }
            );


            // =============================================
            // HORA CONSULTA GRIDVISION
            // =============================================

            const horaConsulta =
                document.createElement("small");

            horaConsulta.style.display = "block";
            horaConsulta.style.marginTop = "7px";
            horaConsulta.style.opacity = "0.7";

            const ahora =
                new Date().toLocaleTimeString(
                    "es-CL",
                    {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false
                    }
                );

            horaConsulta.textContent =
                `GridVision consultó: ${ahora} · ` +
                `actualización cada 1 min`;

            bloque.appendChild(
                horaConsulta
            );

        } finally {

            actualizando = false;
        }
    }


    // Primera consulta inmediata
    actualizarEstadoSolar();


    // Actualización cada 1 minuto
    temporizadorFusionSolar =
        window.setInterval(
            () => {

                if (!contenedor.isConnected) {

                    window.clearInterval(
                        temporizadorFusionSolar
                    );

                    temporizadorFusionSolar = null;

                    return;
                }

                actualizarEstadoSolar();

            },
            INTERVALO_FUSIONSOLAR_MS
        );
}
function crearPopup(propiedades, coordenadas = null) {
    const contenedor = document.createElement("div");
    contenedor.className = "popup-gridvision";

    const titulo = document.createElement("h3");
    titulo.textContent =
        propiedades.nombre || "Activo sin nombre";

    contenedor.appendChild(titulo);

    const campos = [
        ["ID", propiedades.id],
        ["Categoría", propiedades.categoria],
        ["Subcategoría", propiedades.subcategoria]
    ];

    for (const [etiqueta, valor] of campos) {
        if (!valor) continue;

        const parrafo = document.createElement("p");
        const destacado = document.createElement("strong");

        destacado.textContent = `${etiqueta}: `;
        parrafo.appendChild(destacado);
        parrafo.appendChild(
            document.createTextNode(String(valor))
        );

        contenedor.appendChild(parrafo);
    }

    // =====================================================
    // PFV NET BILLING
    // =====================================================

    if (propiedades.id === "PFV-NB-001") {
        // Lo Aguirre: mantiene íntegra su lógica SolaXCloud.
        cargarEstadoSolaxLoAguirre(contenedor);

    } else if (
        propiedades.id === "PFV-NB-002" ||
        propiedades.id === "PFV-NB-003"
    ) {
        // VSE Techo / VSE Paidahuén:
        // telemetría FusionSolar pendiente + meteorología.
        if (
            Array.isArray(coordenadas) &&
            coordenadas.length >= 2
        ) {
            const longitudActivo =
                Number(coordenadas[0]);

            const latitudActivo =
                Number(coordenadas[1]);

            if (
                Number.isFinite(latitudActivo) &&
                Number.isFinite(longitudActivo)
            ) {
                const claveFusionSolar =
                    propiedades.id === "PFV-NB-002"
                        ? "techo"
                        : "paidahuen";

                cargarEstadoSolarPendienteFusion(
                    contenedor,
                    latitudActivo,
                    longitudActivo,
                    claveFusionSolar
                );
            }
        }
    }

    /*
     * Los puntos GeoJSON usan:
     * [longitud, latitud]
     */
    if (
        Array.isArray(coordenadas) &&
        coordenadas.length >= 2
    ) {
        const longitud = Number(coordenadas[0]);
        const latitud = Number(coordenadas[1]);

        if (
            Number.isFinite(latitud) &&
            Number.isFinite(longitud)
        ) {
            const punto = encodeURIComponent(
                `${latitud},${longitud}`
            );

            const acciones = document.createElement("div");
            acciones.className = "popup-acciones-mapa";

            Object.assign(acciones.style, {
                display: "grid",
                gap: "7px",
                marginTop: "12px"
            });

            const estiloAccion = {
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: "7px",
                backgroundColor: "#ffffff",
                color: "#1f2937",
                fontFamily: "inherit",
                fontWeight: "600",
                textAlign: "center",
                textDecoration: "none"
            };

            const enlacesGoogle = [
                {
                    texto: "📍 Abrir en Google Maps",
                    url:
                        "https://www.google.com/maps/search/" +
                        `?api=1&query=${punto}`
                },
                {
                    texto: "🚗 Cómo llegar",
                    url:
                        "https://www.google.com/maps/dir/" +
                        `?api=1&destination=${punto}`
                }
            ];

            for (const opcion of enlacesGoogle) {
                const enlace = document.createElement("a");

                enlace.href = opcion.url;
                enlace.target = "_blank";
                enlace.rel = "noopener noreferrer";
                enlace.textContent = opcion.texto;

                Object.assign(
                    enlace.style,
                    estiloAccion
                );

                acciones.appendChild(enlace);
            }

            const filaCoordenadas =
                document.createElement("div");

            filaCoordenadas.className =
                "popup-coordenadas-compartir";

            const coordenadasTexto =
                document.createElement("small");

            coordenadasTexto.textContent =
                `Coordenadas: ${latitud.toFixed(6)}, ` +
                longitud.toFixed(6);

            const botonCompartir =
                document.createElement("button");

            botonCompartir.type = "button";
            botonCompartir.className =
                "popup-boton-compartir-activo";

            botonCompartir.title = "Compartir activo";
            botonCompartir.setAttribute(
                "aria-label",
                "Compartir activo"
            );

            botonCompartir.innerHTML = `
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M12 15V3"></path>
                    <path d="M7 8L12 3L17 8"></path>
                    <path d="M5 13V19H19V13"></path>
                </svg>
            `;

            botonCompartir.addEventListener(
                "click",
                async (evento) => {
                    evento.preventDefault();
                    evento.stopPropagation();

                    await compartirActivo(
                        propiedades,
                        latitud,
                        longitud,
                        botonCompartir
                    );
                }
            );

            filaCoordenadas.appendChild(
                coordenadasTexto
            );

            filaCoordenadas.appendChild(
                botonCompartir
            );

            acciones.appendChild(
                filaCoordenadas
            );

            contenedor.appendChild(
                acciones
            );
        }
    }

    return contenedor;
}

async function cargarPfvNetBilling() {
    const respuesta = await fetch(
        "data/processed/pfv_netbilling.geojson"
    );

    if (!respuesta.ok) {
        throw new Error(
            "No fue posible cargar las PFV Net Billing"
        );
    }

    const datos = await respuesta.json();

    L.geoJSON(datos, {
        pointToLayer(feature, latlng) {
            return L.circleMarker(
                latlng,
                estiloPunto(feature.properties.categoria)
            );
        },

        onEachFeature(feature, layer) {
            layer.bindPopup(() =>
    crearPopup(
        feature.properties,
        feature.geometry.coordinates
    )
);

            layer.on("popupopen", () => {
                window.GridVisionClimaLineas
                    ?.ocultar();

                window.GridVisionClima
                    ?.seleccionarActivo(feature);
            });

            const capaDestino = capaParaCategoria(
                feature.properties.categoria
            );

            capaDestino.addLayer(layer);

            indiceBusqueda.push({
                feature,
                layer,
                capa: capaDestino
            });
        }
    });

    return datos.features.length;
}


async function cargarPuntos() {
    const respuesta = await fetch(
        "data/processed/activos_puntuales_validados.geojson"
    );

    if (!respuesta.ok) {
        throw new Error(
            "No fue posible cargar los activos"
        );
    }

    const datos = await respuesta.json();

    L.geoJSON(datos, {
        pointToLayer(feature, latlng) {
            return L.circleMarker(
                latlng,
                estiloPunto(feature.properties.categoria)
            );
        },

        onEachFeature(feature, layer) {
            layer.bindPopup(
                crearPopup(
                    feature.properties,
                    feature.geometry.coordinates
                )
            );

            layer.on("popupopen", () => {
                window.GridVisionClimaLineas
                    ?.ocultar();

                window.GridVisionClima
                    ?.seleccionarActivo(feature);
            });

            const capaDestino = capaParaCategoria(
                feature.properties.categoria
            );

            capaDestino.addLayer(layer);

            indiceBusqueda.push({
                feature,
                layer,
                capa: capaDestino
            });
        }
    });

    return datos.features.length;
}


async function cargarLineas() {
    const respuesta = await fetch(
        "data/processed/lineas_validadas.geojson"
    );

    if (!respuesta.ok) {
        throw new Error(
            "No fue posible cargar las líneas"
        );
    }

    const datos = await respuesta.json();

    L.geoJSON(datos, {
        style(feature) {
            const tension =
                feature.properties.subcategoria;

            return {
                color: colorLinea(tension),
                weight:
                    String(tension).includes("500")
                        ? 3.5
                        : 2,
                opacity: 0.78
            };
        },

        onEachFeature(feature, layer) {
            layer.bindPopup(
                crearPopup(feature.properties)
            );

            layer.on("popupopen", () => {
                window.GridVisionClima
                    ?.ocultar();

                window.GridVisionClimaLineas
                    ?.seleccionarLinea(feature);
            });

            capas.lineas.addLayer(layer);

            indiceBusqueda.push({
                feature,
                layer,
                capa: capas.lineas
            });
        }
    });

    return datos.features.length;
}


async function iniciarGridVision() {
    const estado = document.getElementById(
        "estado"
    );

    try {
        const [
            cantidadPuntos,
            cantidadPfvNetBilling,
            cantidadLineas
        ] = await Promise.all([
            cargarPuntos(),
            cargarPfvNetBilling(),
            cargarLineas()
        ]);

        const cantidadPuntosTotal =
            cantidadPuntos +
            cantidadPfvNetBilling;

        document.getElementById(
            "cantidad-puntos"
        ).textContent =
            cantidadPuntosTotal.toLocaleString(
                "es-CL"
            );

        document.getElementById(
            "cantidad-lineas"
        ).textContent =
            cantidadLineas.toLocaleString(
                "es-CL"
            );

        document.getElementById(
            "cantidad-total"
        ).textContent = (
            cantidadPuntosTotal +
            cantidadLineas
        ).toLocaleString(
            "es-CL"
        );

        const limitesChile = [
            [-56.5, -76.5],
            [-17.0, -65.0]
        ];

        mapa.fitBounds(
            limitesChile,
            {
                padding: [25, 25]
            }
        );

        estado.textContent =
            "Datos cargados correctamente";

    } catch (error) {
        console.error(error);

        estado.textContent =
            "Error al cargar los datos locales";

        document.getElementById(
            "error-carga"
        ).hidden = false;
    }
}

        function normalizarBusqueda(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es-CL")
        .trim();
}

function ocultarResultadosBusqueda() {
    const resultados = document.getElementById(
        "resultados-busqueda"
    );

    resultados.hidden = true;
    resultados.replaceChildren();
}

function enfocarResultado(registro) {
    
    if (!mapa.hasLayer(registro.capa)) {
        registro.capa.addTo(mapa);
    }

    if (typeof registro.layer.getLatLng === "function") {
        mapa.setView(
            registro.layer.getLatLng(),
            Math.max(mapa.getZoom(), 12)
        );
    } else if (
        typeof registro.layer.getBounds === "function"
    ) {
        const limites = registro.layer.getBounds();

        if (limites.isValid()) {
            mapa.fitBounds(limites, {
                padding: [45, 45],
                maxZoom: 13
            });
        }
    }

    registro.layer.openPopup();

    const input = document.getElementById(
        "buscador-activos"
    );

    input.value =
        registro.feature.properties.nombre || "";

    ocultarResultadosBusqueda();
}
window.abrirActivoMeteorologicoPorId = function (id) {

    const registro = indiceBusqueda.find((item) => {
        return item.feature.properties.id === id;
    });

    if (!registro) {
        console.warn("No se encontró el activo:", id);
        return;
    }

    enfocarResultado(registro);
};

function crearBotonResultado(registro) {
    const propiedades = registro.feature.properties;

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "resultado-busqueda";

    const nombre = document.createElement("span");
    nombre.className = "resultado-nombre";
    nombre.textContent =
        propiedades.nombre || "Activo sin nombre";

    const detalle = document.createElement("span");
    detalle.className = "resultado-detalle";

    const partes = [
        propiedades.id,
        propiedades.categoria,
        propiedades.subcategoria
    ].filter(Boolean);

    detalle.textContent = partes.join(" · ");

    boton.appendChild(nombre);
    boton.appendChild(detalle);

    boton.addEventListener("click", () => {
        enfocarResultado(registro);
    });

    return boton;
}

function mostrarResultadosBusqueda(terminoOriginal) {
    const resultados = document.getElementById(
        "resultados-busqueda"
    );

    const termino = normalizarBusqueda(terminoOriginal);

    resultados.replaceChildren();

    if (termino.length < 2) {
        resultados.hidden = true;
        return;
    }

    const coincidencias = indiceBusqueda
        .filter((registro) => {
            const propiedades =
                registro.feature.properties;

            const contenido = normalizarBusqueda([
                propiedades.nombre,
                propiedades.id,
                propiedades.categoria,
                propiedades.subcategoria
            ].filter(Boolean).join(" "));

            return contenido.includes(termino)
                && registroCumpleFiltros(registro);
        })
        .slice(0, 12);

    resultados.hidden = false;

    if (!coincidencias.length) {
        const mensaje = document.createElement("p");
        mensaje.className = "sin-resultados";
        mensaje.textContent =
            "No se encontraron activos coincidentes.";

        resultados.appendChild(mensaje);
        return;
    }

    for (const registro of coincidencias) {
        resultados.appendChild(
            crearBotonResultado(registro)
        );
    }
}

function configurarBuscador() {
    const input = document.getElementById(
        "buscador-activos"
    );

    const limpiar = document.getElementById(
        "limpiar-busqueda"
    );

    input.addEventListener("input", (evento) => {
        mostrarResultadosBusqueda(
            evento.target.value
        );
    });

    input.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            input.value = "";
            ocultarResultadosBusqueda();
        }
    });

    limpiar.addEventListener("click", () => {
        input.value = "";
        ocultarResultadosBusqueda();
        input.focus();
    });

    document.addEventListener("click", (evento) => {
        const panel = evento.target.closest(
            ".panel-busqueda"
        );

        if (!panel) {
            ocultarResultadosBusqueda();
        }
    });
}

function obtenerValorFiltro(id) {
    return document.getElementById(id).value;
}

function obtenerValoresUnicos(registros, selector) {
    return [...new Set(
        registros
            .map(selector)
            .filter(Boolean)
    )].sort((a, b) =>
        String(a).localeCompare(
            String(b),
            "es-CL"
        )
    );
}

function agregarOpciones(select, valores) {
    for (const valor of valores) {
        const opcion = document.createElement("option");
        opcion.value = valor;
        opcion.textContent = valor;
        select.appendChild(opcion);
    }
}

function poblarFiltros() {
    const categorias = obtenerValoresUnicos(
        indiceBusqueda,
        (registro) =>
            registro.feature.properties.categoria
    );

    const tecnologias = obtenerValoresUnicos(
        indiceBusqueda.filter((registro) =>
            registro.feature.properties.categoria
                === "Central"
        ),
        (registro) =>
            registro.feature.properties.subcategoria
    );

    const tensiones = obtenerValoresUnicos(
        indiceBusqueda.filter((registro) =>
            String(
                registro.feature.properties.categoria
            ).includes("Línea")
        ),
        (registro) =>
            registro.feature.properties.subcategoria
    );

    agregarOpciones(
        document.getElementById("filtro-categoria"),
        categorias
    );

    agregarOpciones(
        document.getElementById("filtro-tecnologia"),
        tecnologias
    );

    agregarOpciones(
        document.getElementById("filtro-tension"),
        tensiones
    );
}

function actualizarDisponibilidadFiltros() {
    const categoria = obtenerValorFiltro(
        "filtro-categoria"
    );

    const tecnologia = document.getElementById(
        "filtro-tecnologia"
    );

    const tension = document.getElementById(
        "filtro-tension"
    );

    if (!categoria) {
        tecnologia.disabled = false;
        tension.disabled = false;
        return;
    }

    if (categoria === "Central") {
        tecnologia.disabled = false;
        tension.value = "";
        tension.disabled = true;
        return;
    }

    if (categoria.includes("Línea")) {
        tecnologia.value = "";
        tecnologia.disabled = true;
        tension.disabled = false;
        return;
    }

    tecnologia.value = "";
    tension.value = "";
    tecnologia.disabled = true;
    tension.disabled = true;
}

function registroCumpleFiltros(registro) {
    const propiedades = registro.feature.properties;

    const categoria = obtenerValorFiltro(
        "filtro-categoria"
    );

    const tecnologia = obtenerValorFiltro(
        "filtro-tecnologia"
    );

    const tension = obtenerValorFiltro(
        "filtro-tension"
    );

    if (
        categoria
        && propiedades.categoria !== categoria
    ) {
        return false;
    }

    if (
        tecnologia
        && (
            propiedades.categoria !== "Central"
            || propiedades.subcategoria !== tecnologia
        )
    ) {
        return false;
    }

    if (
        tension
        && (
            !String(propiedades.categoria)
                .includes("Línea")
            || propiedades.subcategoria !== tension
        )
    ) {
        return false;
    }

    return true;
}

function aplicarFiltros() {
    let coincidencias = 0;

    for (const registro of indiceBusqueda) {
        const cumple = registroCumpleFiltros(
            registro
        );

        const contiene = registro.capa.hasLayer(
            registro.layer
        );

        if (cumple) {
            coincidencias += 1;

            if (!contiene) {
                registro.capa.addLayer(
                    registro.layer
                );
            }
        } else if (contiene) {
            registro.capa.removeLayer(
                registro.layer
            );
        }
    }

    document.getElementById(
        "cantidad-filtrada"
    ).textContent = coincidencias.toLocaleString(
        "es-CL"
    );

    const termino = document.getElementById(
        "buscador-activos"
    ).value;

    if (termino.trim().length >= 2) {
        mostrarResultadosBusqueda(termino);
    } else {
        ocultarResultadosBusqueda();
    }
}

function restablecerFiltros() {
    document.getElementById(
        "filtro-categoria"
    ).value = "";

    document.getElementById(
        "filtro-tecnologia"
    ).value = "";

    document.getElementById(
        "filtro-tension"
    ).value = "";

    actualizarDisponibilidadFiltros();
    aplicarFiltros();
}

function inicializarFiltros() {
    poblarFiltros();
    actualizarDisponibilidadFiltros();

    const categoria = document.getElementById(
        "filtro-categoria"
    );

    const tecnologia = document.getElementById(
        "filtro-tecnologia"
    );

    const tension = document.getElementById(
        "filtro-tension"
    );

    categoria.addEventListener("change", () => {
        actualizarDisponibilidadFiltros();
        aplicarFiltros();
    });

    tecnologia.addEventListener(
        "change",
        aplicarFiltros
    );

    tension.addEventListener(
        "change",
        aplicarFiltros
    );

    document.getElementById(
        "restablecer-filtros"
    ).addEventListener(
        "click",
        restablecerFiltros
    );

    aplicarFiltros();
}

window.GridVisionClima.inicializar();
window.GridVisionClimaLineas.inicializar(mapa);
configurarBuscador();

document.getElementById("reintentar-carga").addEventListener(
    "click",
    () => window.location.reload()
);
function abrirActivoCompartido() {
    const parametros =
        new URLSearchParams(
            window.location.search
        );

    const idActivo =
        parametros.get("activo");

    if (!idActivo) {
        return;
    }

    const registro = indiceBusqueda.find(
        (item) =>
            item.feature.properties.id
            === idActivo
    );

    if (!registro) {
        console.warn(
            "No se encontró el activo compartido:",
            idActivo
        );

        return;
    }

    enfocarResultado(registro);
}

iniciarGridVision().then(() => {
    inicializarFiltros();

    window.setTimeout(
        abrirActivoCompartido,
        350
    );
});