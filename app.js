const mapa = L.map("mapa", {
            preferCanvas: true,
            center: [-33.45, -70.66],
            zoom: 5,
            minZoom: 3
        });

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">' +
                    "OpenStreetMap</a>"
            }
        ).addTo(mapa);

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
            postes: L.layerGroup()
        };

        L.control.layers(
            null,
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
                collapsed: window.matchMedia("(max-width: 700px)").matches,
                position: "topright"
            }
        ).addTo(mapa);

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

        function crearPopup(propiedades) {
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

            return contenedor;
        }

        async function cargarPuntos() {
            const respuesta = await fetch("data/processed/activos_puntuales_validados.geojson"
            );

            if (!respuesta.ok) {
                throw new Error("No fue posible cargar los activos");
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
                        crearPopup(feature.properties)
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
                throw new Error("No fue posible cargar las líneas");
            }

            const datos = await respuesta.json();

            L.geoJSON(datos, {
                style(feature) {
                    const tension =
                        feature.properties.subcategoria;

                    return {
                        color: colorLinea(tension),
                        weight:
                            String(tension).includes("500") ? 3.5 : 2,
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
            const estado = document.getElementById("estado");

            try {
                const [cantidadPuntos, cantidadLineas] =
                    await Promise.all([
                        cargarPuntos(),
                        cargarLineas()
                    ]);

                document.getElementById(
                    "cantidad-puntos"
                ).textContent = cantidadPuntos.toLocaleString("es-CL");

                document.getElementById(
                    "cantidad-lineas"
                ).textContent = cantidadLineas.toLocaleString("es-CL");

                document.getElementById(
                    "cantidad-total"
                ).textContent = (
                    cantidadPuntos + cantidadLineas
                ).toLocaleString("es-CL");

                const limitesChile = [
    [-56.5, -76.5],
    [-17.0, -65.0]
];

mapa.fitBounds(limitesChile, {
    padding: [25, 25]
});
                estado.textContent =
                    "Datos cargados correctamente";
            } catch (error) {
                console.error(error);

                estado.textContent =
                    "Error al cargar los datos locales";

                document.getElementById("error-carga").hidden = false;
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

iniciarGridVision().then(inicializarFiltros);
