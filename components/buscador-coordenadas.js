(() => {
    "use strict";

    const mapa = window.GridVisionMapa;
    const L = window.L;

    const input = document.getElementById("buscador-activos");
    const resultados = document.getElementById("resultados-busqueda");
    const limpiar = document.getElementById("limpiar-busqueda");
    const etiqueta = document.querySelector(
        'label[for="buscador-activos"]'
    );

    if (!mapa || !L || !input || !resultados) {
        console.error(
            "GridVision Buscador Unificado: faltan el mapa o los elementos del buscador."
        );
        return;
    }

    let marcadorTemporal = null;
    let circuloTemporal = null;
    let ultimoTextoCoordenadas = "";

    if (etiqueta) {
        etiqueta.textContent = "Buscar activos o coordenadas";
    }

    input.placeholder =
        "Nombre, ID, categoría, tensión o coordenadas...";

    function aplicarEstilos(elemento, estilos) {
        Object.assign(elemento.style, estilos);
        return elemento;
    }

    function crearBoton(texto) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.textContent = texto;

        return aplicarEstilos(boton, {
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
            cursor: "pointer"
        });
    }

    function crearEnlace(texto, url) {
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.target = "_blank";
        enlace.rel = "noopener noreferrer";
        enlace.textContent = texto;

        return aplicarEstilos(enlace, {
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px",
            border: "1px solid #cbd5e1",
            borderRadius: "7px",
            backgroundColor: "#ffffff",
            color: "#1f2937",
            fontWeight: "600",
            textAlign: "center",
            textDecoration: "none"
        });
    }

    function convertirNumero(valor) {
        return Number(
            String(valor)
                .trim()
                .replace(",", ".")
        );
    }

    function interpretarCoordenadas(textoOriginal) {
        const texto = String(textoOriginal || "").trim();

        if (!texto) {
            return null;
        }

        const latitudEtiquetada = texto.match(
            /lat(?:itud)?\s*[:=]?\s*([-+]?\d+(?:[.,]\d+)?)/i
        );

        const longitudEtiquetada = texto.match(
            /(?:lon(?:gitud)?|lng)\s*[:=]?\s*([-+]?\d+(?:[.,]\d+)?)/i
        );

        let latitud;
        let longitud;

        if (latitudEtiquetada && longitudEtiquetada) {
            latitud = convertirNumero(latitudEtiquetada[1]);
            longitud = convertirNumero(longitudEtiquetada[1]);
        } else if (texto.includes(";")) {
            const partes = texto
                .replace(/[()]/g, "")
                .split(";")
                .map((parte) => parte.trim())
                .filter(Boolean);

            if (partes.length !== 2) {
                return null;
            }

            latitud = convertirNumero(partes[0]);
            longitud = convertirNumero(partes[1]);
        } else {
            const coincidencia = texto.match(
                /^\s*\(?\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)?\s*$/
            );

            if (!coincidencia) {
                return null;
            }

            latitud = Number(coincidencia[1]);
            longitud = Number(coincidencia[2]);
        }

        if (
            !Number.isFinite(latitud) ||
            !Number.isFinite(longitud) ||
            Math.abs(latitud) > 90 ||
            Math.abs(longitud) > 180
        ) {
            return null;
        }

        return {
            latitud,
            longitud
        };
    }

    function borrarMarcadorTemporal() {
        if (marcadorTemporal) {
            mapa.removeLayer(marcadorTemporal);
            marcadorTemporal = null;
        }

        if (circuloTemporal) {
            mapa.removeLayer(circuloTemporal);
            circuloTemporal = null;
        }
    }

    async function copiarCoordenadas(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch {
            const auxiliar = document.createElement("textarea");
            auxiliar.value = texto;
            auxiliar.style.position = "fixed";
            auxiliar.style.opacity = "0";

            document.body.appendChild(auxiliar);
            auxiliar.select();

            const correcto = document.execCommand("copy");
            auxiliar.remove();

            return correcto;
        }
    }

    function crearPopupCoordenadas(latitud, longitud) {
        const contenedor = document.createElement("div");
        contenedor.className = "popup-gridvision";

        const titulo = document.createElement("h3");
        titulo.textContent = "Ubicación consultada";
        contenedor.appendChild(titulo);

        const textoCoordenadas = document.createElement("p");

        const destacado = document.createElement("strong");
        destacado.textContent = "Coordenadas: ";

        textoCoordenadas.appendChild(destacado);
        textoCoordenadas.appendChild(
            document.createTextNode(
                `${latitud.toFixed(6)}, ${longitud.toFixed(6)}`
            )
        );

        contenedor.appendChild(textoCoordenadas);

        const acciones = aplicarEstilos(
            document.createElement("div"),
            {
                display: "grid",
                gap: "7px",
                marginTop: "12px"
            }
        );

        const punto = encodeURIComponent(
            `${latitud},${longitud}`
        );

        acciones.appendChild(
            crearEnlace(
                "📍 Abrir en Google Maps",
                "https://www.google.com/maps/search/" +
                    `?api=1&query=${punto}`
            )
        );

        acciones.appendChild(
            crearEnlace(
                "🚗 Cómo llegar",
                "https://www.google.com/maps/dir/" +
                    `?api=1&destination=${punto}`
            )
        );

        const botonStreetView = crearBoton(
            "🛣️ Street View más cercano"
        );

        const estadoStreetView = aplicarEstilos(
            document.createElement("small"),
            {
                display: "block",
                color: "#64748b",
                textAlign: "center"
            }
        );

        estadoStreetView.textContent =
            "Busca cobertura en un radio máximo de 1 km.";

        botonStreetView.addEventListener(
            "click",
            () => {
                const servicio =
                    window.GridVisionStreetView;

                if (!servicio?.abrirMasCercano) {
                    estadoStreetView.textContent =
                        "El servicio Street View no está disponible.";

                    return;
                }

                servicio.abrirMasCercano({
                    latitud,
                    longitud,
                    boton: botonStreetView,
                    estado: estadoStreetView
                });
            }
        );

        acciones.appendChild(botonStreetView);
        acciones.appendChild(estadoStreetView);

        const botonCopiar = crearBoton(
            "📋 Copiar coordenadas"
        );

        const estadoCopiar = aplicarEstilos(
            document.createElement("small"),
            {
                display: "block",
                color: "#64748b",
                textAlign: "center"
            }
        );

        botonCopiar.addEventListener(
            "click",
            async () => {
                const correcto =
                    await copiarCoordenadas(
                        `${latitud.toFixed(6)}, ${longitud.toFixed(6)}`
                    );

                estadoCopiar.textContent = correcto
                    ? "Coordenadas copiadas."
                    : "No fue posible copiar las coordenadas.";
            }
        );

        acciones.appendChild(botonCopiar);
        acciones.appendChild(estadoCopiar);

        const botonBorrar = crearBoton(
            "🗑️ Borrar marcador"
        );

        botonBorrar.addEventListener(
            "click",
            () => {
                borrarMarcadorTemporal();
                mapa.closePopup();
            }
        );

        acciones.appendChild(botonBorrar);
        contenedor.appendChild(acciones);

        return contenedor;
    }

    function ubicarCoordenadas(latitud, longitud) {
        borrarMarcadorTemporal();

        marcadorTemporal = L.circleMarker(
            [latitud, longitud],
            {
                radius: 9,
                color: "#b91c1c",
                weight: 3,
                fillColor: "#ffffff",
                fillOpacity: 1
            }
        ).addTo(mapa);

        circuloTemporal = L.circle(
            [latitud, longitud],
            {
                radius: 25,
                color: "#b91c1c",
                weight: 1,
                fillOpacity: 0.08,
                interactive: false
            }
        ).addTo(mapa);

        marcadorTemporal.bindPopup(
            crearPopupCoordenadas(
                latitud,
                longitud
            ),
            {
                maxWidth: 330
            }
        );

        mapa.setView(
            [latitud, longitud],
            17,
            {
                animate: true
            }
        );

        window.setTimeout(
            () => marcadorTemporal?.openPopup(),
            350
        );

        resultados.hidden = true;
        resultados.replaceChildren();
    }

    function crearResultadoCoordenadas(
        latitud,
        longitud
    ) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "resultado-busqueda";
        boton.dataset.resultadoCoordenadas = "true";

        const nombre = document.createElement("span");
        nombre.className = "resultado-nombre";
        nombre.textContent = "📍 Ir a coordenadas";

        const detalle = document.createElement("span");
        detalle.className = "resultado-detalle";
        detalle.textContent =
            `Lat. ${latitud.toFixed(6)} · ` +
            `Lon. ${longitud.toFixed(6)}`;

        boton.appendChild(nombre);
        boton.appendChild(detalle);

        boton.addEventListener(
            "click",
            () => {
                ubicarCoordenadas(
                    latitud,
                    longitud
                );
            }
        );

        return boton;
    }

    function actualizarResultadoCoordenadas() {
        const coordenadas =
            interpretarCoordenadas(input.value);

        resultados
            .querySelector(
                '[data-resultado-coordenadas="true"]'
            )
            ?.remove();

        if (!coordenadas) {
            ultimoTextoCoordenadas = "";
            return;
        }

        ultimoTextoCoordenadas = input.value.trim();

        const resultadoCoordenadas =
            crearResultadoCoordenadas(
                coordenadas.latitud,
                coordenadas.longitud
            );

        resultados.prepend(resultadoCoordenadas);
        resultados.hidden = false;
    }

    input.addEventListener(
        "input",
        () => {
            /*
             * app.js procesa primero los activos.
             * Este pequeño retraso permite agregar después
             * el resultado especial de coordenadas.
             */
            window.setTimeout(
                actualizarResultadoCoordenadas,
                0
            );
        }
    );

    input.addEventListener(
        "keydown",
        (evento) => {
            if (evento.key !== "Enter") {
                return;
            }

            const coordenadas =
                interpretarCoordenadas(input.value);

            if (!coordenadas) {
                return;
            }

            evento.preventDefault();

            ubicarCoordenadas(
                coordenadas.latitud,
                coordenadas.longitud
            );
        }
    );

    limpiar?.addEventListener(
        "click",
        () => {
            ultimoTextoCoordenadas = "";
            borrarMarcadorTemporal();
        }
    );

    window.GridVisionCoordenadas = {
        interpretar: interpretarCoordenadas,
        ubicar: ubicarCoordenadas,
        borrar: borrarMarcadorTemporal
    };

    console.info(
        "GridVision: buscador unificado de activos y coordenadas listo."
    );
})();
