(() => {
    "use strict";

    function iniciarMedicion() {
        const mapa = window.GridVisionMapa;

        if (!mapa || !window.L) {
            console.warn("GridVision: mapa no disponible para medición.");
            return;
        }

        let medicionActiva = false;
        let puntos = [];
        let linea = null;
        let marcadores = [];
        let etiquetas = [];

        const ControlMedicion = L.Control.extend({
            options: {
                position: "topleft"
            },

            onAdd: function () {
                const contenedor = L.DomUtil.create(
                    "div",
                    "leaflet-bar leaflet-control control-medicion"
                );

                const boton = L.DomUtil.create(
                    "a",
                    "control-medicion-boton",
                    contenedor
                );

                boton.href = "#";
                boton.innerHTML = "📏";
                boton.title = "Medir distancias";
                boton.setAttribute("aria-label", "Medir distancias");

                L.DomEvent.disableClickPropagation(contenedor);
                L.DomEvent.disableScrollPropagation(contenedor);

                L.DomEvent.on(boton, "click", function (evento) {
                    L.DomEvent.stop(evento);

                    medicionActiva = !medicionActiva;

                    if (medicionActiva) {
                        boton.classList.add("activo");
                        boton.title = "Finalizar medición";

                        mapa.getContainer().classList.add("modo-medicion");

                        mostrarResultado(
                            "Haz clic en el mapa para comenzar a medir."
                        );
                    } else {
                        boton.classList.remove("activo");
                        boton.title = "Medir distancias";

                        mapa.getContainer().classList.remove("modo-medicion");
                    }
                });

                return contenedor;
            }
        });

        mapa.addControl(new ControlMedicion());

        const panel = document.createElement("div");
        panel.id = "medicion-resultado";
        panel.className = "medicion-resultado";
        panel.hidden = true;

        panel.innerHTML = `
            <div class="medicion-resultado-cabecera">
                <strong>📏 Medición</strong>
                <button
                    id="medicion-limpiar"
                    type="button"
                    title="Borrar medición"
                >
                    ×
                </button>
            </div>

            <div id="medicion-texto">
                Haz clic en el mapa para comenzar.
            </div>
        `;

        document.body.appendChild(panel);

        document
            .getElementById("medicion-limpiar")
            .addEventListener("click", limpiarMedicion);

        mapa.on("click", function (evento) {
            if (!medicionActiva) {
                return;
            }

            agregarPunto(evento.latlng);
        });

        document.addEventListener("keydown", function (evento) {
            if (evento.key === "Escape" && medicionActiva) {
                limpiarMedicion();
            }
        });

        function agregarPunto(latlng) {
            puntos.push(latlng);

            const marcador = L.circleMarker(latlng, {
                radius: 5,
                weight: 2,
                fillOpacity: 1
            }).addTo(mapa);

            marcadores.push(marcador);

            actualizarLinea();
            actualizarResultado();
        }

        function actualizarLinea() {
            if (linea) {
                mapa.removeLayer(linea);
            }

            if (puntos.length < 2) {
                return;
            }

            linea = L.polyline(puntos, {
                weight: 3,
                dashArray: "8, 6"
            }).addTo(mapa);

            eliminarEtiquetas();

            for (let i = 1; i < puntos.length; i++) {
                const inicio = puntos[i - 1];
                const fin = puntos[i];

                const distancia = inicio.distanceTo(fin);

                const centro = L.latLng(
                    (inicio.lat + fin.lat) / 2,
                    (inicio.lng + fin.lng) / 2
                );

                const etiqueta = L.marker(centro, {
                    interactive: false,

                    icon: L.divIcon({
                        className: "medicion-etiqueta",
                        html: formatearDistancia(distancia)
                    })
                }).addTo(mapa);

                etiquetas.push(etiqueta);
            }
        }

        function calcularTotal() {
            let total = 0;

            for (let i = 1; i < puntos.length; i++) {
                total += puntos[i - 1].distanceTo(puntos[i]);
            }

            return total;
        }

        function actualizarResultado() {
            if (puntos.length === 1) {
                mostrarResultado(
                    "Punto inicial definido.<br>Haz clic en el siguiente punto."
                );

                return;
            }

            const total = calcularTotal();

            const ultimoTramo =
                puntos[puntos.length - 2]
                    .distanceTo(puntos[puntos.length - 1]);

            mostrarResultado(`
                Último tramo:
                <strong>${formatearDistancia(ultimoTramo)}</strong>
                <br>
                Distancia total:
                <strong>${formatearDistancia(total)}</strong>
                <br>
                <small>${puntos.length} puntos de medición</small>
            `);
        }

        function mostrarResultado(html) {
            const texto = document.getElementById("medicion-texto");

            texto.innerHTML = html;
            panel.hidden = false;
        }

        function formatearDistancia(metros) {
            if (metros < 1000) {
                return `${Math.round(metros)} m`;
            }

            return `${(metros / 1000)
                .toLocaleString("es-CL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })} km`;
        }

        function eliminarEtiquetas() {
            etiquetas.forEach((etiqueta) => {
                mapa.removeLayer(etiqueta);
            });

            etiquetas = [];
        }

        function limpiarMedicion() {
            puntos = [];

            if (linea) {
                mapa.removeLayer(linea);
                linea = null;
            }

            marcadores.forEach((marcador) => {
                mapa.removeLayer(marcador);
            });

            marcadores = [];

            eliminarEtiquetas();

            panel.hidden = true;
        }
    }

    window.addEventListener("load", iniciarMedicion);
})();