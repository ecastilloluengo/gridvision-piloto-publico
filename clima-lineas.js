(() => {
    const API_URL =
        "https://api.open-meteo.com/v1/forecast";

    const CONFIGURACION = {
        distanciaObjetivoKm: 5,
        maximoTramos: 25,
        maximoRanking: 8,
        horizonteInicial: 24,
        duracionCacheMs: 10 * 60 * 1000
    };

    const NIVELES_RIESGO = [
        {
            id: "critico",
            etiqueta: "Crítico",
            prioridad: 3,
            rafaga: 100,
            transversal: 90,
            color: "#dc2626"
        },
        {
            id: "alto",
            etiqueta: "Alto",
            prioridad: 2,
            rafaga: 80,
            transversal: 70,
            color: "#f97316"
        },
        {
            id: "precaucion",
            etiqueta: "Precaución",
            prioridad: 1,
            rafaga: 60,
            transversal: 50,
            color: "#eab308"
        },
        {
            id: "normal",
            etiqueta: "Normal",
            prioridad: 0,
            rafaga: 0,
            transversal: 0,
            color: "#16a34a"
        }
    ];

    let mapa = null;
    let capaAnalisis = null;
    let controladorActivo = null;
    let analisisActivo = null;

    const cachePronosticos = new Map();

    function elemento(id) {
        return document.getElementById(id);
    }

    function numeroSeguro(valor) {
        const numero = Number(valor);

        return Number.isFinite(numero)
            ? numero
            : null;
    }

    function formatearNumero(valor, decimales = 1) {
        const numero = numeroSeguro(valor);

        if (numero === null) {
            return "—";
        }

        return numero.toLocaleString("es-CL", {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        });
    }

    function formatearHora(fechaIso) {
        if (!fechaIso) {
            return "—";
        }

        const [fecha, hora] = fechaIso.split("T");
        const [anio, mes, dia] = fecha.split("-");

        return `${dia}-${mes}-${anio} ${(hora || "").slice(0, 5)}`;
    }

    function coordenadaValida(coordenada) {
        return Array.isArray(coordenada)
            && coordenada.length >= 2
            && numeroSeguro(coordenada[0]) !== null
            && numeroSeguro(coordenada[1]) !== null;
    }

    function distanciaKm(origen, destino) {
        const radioTierraKm = 6371.0088;
        const aRadianes = (grados) =>
            grados * Math.PI / 180;

        const latitud1 = aRadianes(origen[1]);
        const latitud2 = aRadianes(destino[1]);
        const deltaLatitud = aRadianes(
            destino[1] - origen[1]
        );
        const deltaLongitud = aRadianes(
            destino[0] - origen[0]
        );

        const senoLatitud = Math.sin(deltaLatitud / 2);
        const senoLongitud = Math.sin(deltaLongitud / 2);
        const a = senoLatitud ** 2
            + Math.cos(latitud1)
            * Math.cos(latitud2)
            * senoLongitud ** 2;

        return 2 * radioTierraKm * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
    }

    function crearPerfil(coordenadas) {
        const puntos = (coordenadas || [])
            .filter(coordenadaValida)
            .map((coordenada) => [
                Number(coordenada[0]),
                Number(coordenada[1])
            ]);

        if (puntos.length < 2) {
            return null;
        }

        const acumuladas = [0];

        for (let indice = 1; indice < puntos.length; indice += 1) {
            acumuladas.push(
                acumuladas[indice - 1]
                + distanciaKm(
                    puntos[indice - 1],
                    puntos[indice]
                )
            );
        }

        return {
            puntos,
            acumuladas,
            longitudKm: acumuladas.at(-1)
        };
    }

    function puntoEnPerfil(perfil, distanciaObjetivo) {
        const distancia = Math.min(
            Math.max(distanciaObjetivo, 0),
            perfil.longitudKm
        );

        for (
            let indice = 1;
            indice < perfil.acumuladas.length;
            indice += 1
        ) {
            if (perfil.acumuladas[indice] < distancia) {
                continue;
            }

            const inicio = perfil.puntos[indice - 1];
            const fin = perfil.puntos[indice];
            const distanciaInicio =
                perfil.acumuladas[indice - 1];
            const largo =
                perfil.acumuladas[indice] - distanciaInicio;
            const proporcion = largo > 0
                ? (distancia - distanciaInicio) / largo
                : 0;

            return [
                inicio[0] + (fin[0] - inicio[0]) * proporcion,
                inicio[1] + (fin[1] - inicio[1]) * proporcion
            ];
        }

        return [...perfil.puntos.at(-1)];
    }

    function recortarPerfil(perfil, inicioKm, finKm) {
        const coordenadas = [
            puntoEnPerfil(perfil, inicioKm)
        ];

        perfil.acumuladas.forEach((distancia, indice) => {
            if (distancia > inicioKm && distancia < finKm) {
                coordenadas.push(perfil.puntos[indice]);
            }
        });

        coordenadas.push(
            puntoEnPerfil(perfil, finKm)
        );

        return coordenadas;
    }

    function rumboGeografico(origen, destino) {
        const aRadianes = (grados) =>
            grados * Math.PI / 180;
        const aGrados = (radianes) =>
            radianes * 180 / Math.PI;

        const latitud1 = aRadianes(origen[1]);
        const latitud2 = aRadianes(destino[1]);
        const deltaLongitud = aRadianes(
            destino[0] - origen[0]
        );

        const y = Math.sin(deltaLongitud)
            * Math.cos(latitud2);
        const x = Math.cos(latitud1)
            * Math.sin(latitud2)
            - Math.sin(latitud1)
            * Math.cos(latitud2)
            * Math.cos(deltaLongitud);

        return (
            aGrados(Math.atan2(y, x)) + 360
        ) % 360;
    }

    function partesGeometria(feature) {
        const geometria = feature?.geometry;

        if (geometria?.type === "LineString") {
            return [geometria.coordinates];
        }

        if (geometria?.type === "MultiLineString") {
            return geometria.coordinates;
        }

        return [];
    }

    function generarTramos(feature) {
        const perfiles = partesGeometria(feature)
            .map(crearPerfil)
            .filter((perfil) =>
                perfil && perfil.longitudKm > 0
            );

        const longitudTotalKm = perfiles.reduce(
            (total, perfil) => total + perfil.longitudKm,
            0
        );

        if (!perfiles.length || longitudTotalKm <= 0) {
            return {
                longitudTotalKm: 0,
                tramos: []
            };
        }

        const intervaloKm = Math.max(
            CONFIGURACION.distanciaObjetivoKm,
            longitudTotalKm / CONFIGURACION.maximoTramos
        );

        const tramos = [];
        let distanciaAcumuladaKm = 0;

        perfiles.forEach((perfil) => {
            const cantidad = Math.max(
                1,
                Math.ceil(perfil.longitudKm / intervaloKm)
            );
            const largoTramoKm = perfil.longitudKm / cantidad;

            for (let indice = 0; indice < cantidad; indice += 1) {
                const inicioLocalKm = indice * largoTramoKm;
                const finLocalKm = (indice + 1) * largoTramoKm;
                const coordenadas = recortarPerfil(
                    perfil,
                    inicioLocalKm,
                    finLocalKm
                );
                const centro = puntoEnPerfil(
                    perfil,
                    (inicioLocalKm + finLocalKm) / 2
                );

                tramos.push({
                    numero: tramos.length + 1,
                    desdeKm:
                        distanciaAcumuladaKm + inicioLocalKm,
                    hastaKm:
                        distanciaAcumuladaKm + finLocalKm,
                    centro,
                    coordenadas,
                    rumbo: rumboGeografico(
                        coordenadas[0],
                        coordenadas.at(-1)
                    )
                });
            }

            distanciaAcumuladaKm += perfil.longitudKm;
        });

        return {
            longitudTotalKm,
            tramos
        };
    }

    function construirUrl(tramos) {
        const latitudes = tramos.map((tramo) =>
            tramo.centro[1].toFixed(5)
        );
        const longitudes = tramos.map((tramo) =>
            tramo.centro[0].toFixed(5)
        );

        const parametros = new URLSearchParams({
            latitude: latitudes.join(","),
            longitude: longitudes.join(","),
            hourly: [
    "temperature_2m",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m"
].join(","),
            forecast_hours: "72",
            timezone: "auto",
            wind_speed_unit: "kmh"
        });

        return `${API_URL}?${parametros.toString()}`;
    }

    function nivelRiesgo(rafaga, transversal) {
        return NIVELES_RIESGO.find((nivel) =>
            rafaga >= nivel.rafaga
            || transversal >= nivel.transversal
        ) || NIVELES_RIESGO.at(-1);
    }

    function evaluarTramo(tramo, pronostico, horizonteHoras) {
        const horario = pronostico?.hourly || {};
        const tiempos = horario.time || [];
        const rafagas = horario.wind_gusts_10m || [];
        const vientos = horario.wind_speed_10m || [];
        const direcciones = horario.wind_direction_10m || [];
        const cantidad = Math.min(
            horizonteHoras,
            tiempos.length,
            rafagas.length,
            direcciones.length
        );

        let peor = null;

        for (let indice = 0; indice < cantidad; indice += 1) {
            const rafaga = numeroSeguro(rafagas[indice]);
            const direccion = numeroSeguro(direcciones[indice]);

            if (rafaga === null || direccion === null) {
                continue;
            }

            const diferenciaRadianes =
                (direccion - tramo.rumbo) * Math.PI / 180;
            const transversal = Math.abs(
                rafaga * Math.sin(diferenciaRadianes)
            );
            const nivel = nivelRiesgo(rafaga, transversal);
            const puntaje = nivel.prioridad * 100000
                + transversal * 100
                + rafaga;

            if (!peor || puntaje > peor.puntaje) {
                peor = {
                    puntaje,
                    nivel,
                    hora: tiempos[indice],
                    rafaga,
                    transversal,
                    viento: numeroSeguro(vientos[indice]),
                    direccion
                };
            }
        }

        if (!peor) {
            return {
                tramo,
                disponible: false,
                nivel: NIVELES_RIESGO.at(-1),
                puntaje: -1
            };
        }

        return {
            tramo,
            disponible: true,
            ...peor
        };
    }

    function ordenarResultados(resultados) {
        return [...resultados].sort(
            (a, b) => b.puntaje - a.puntaje
        );
    }

    function claveCache(feature, tramos) {
        const propiedades = feature?.properties || {};
        const identificador = propiedades.id
            || propiedades.nombre
            || "linea";
        const centros = tramos.map((tramo) =>
            tramo.centro
                .map((valor) => valor.toFixed(4))
                .join(",")
        ).join(";");

        return `${identificador}|${centros}`;
    }

    async function consultarPronostico(feature, tramos, signal) {
        const clave = claveCache(feature, tramos);
        const cache = cachePronosticos.get(clave);

        if (
            cache
            && Date.now() - cache.fecha
                < CONFIGURACION.duracionCacheMs
        ) {
            return cache.datos;
        }

        const respuesta = await fetch(
            construirUrl(tramos),
            { signal }
        );

        if (!respuesta.ok) {
            throw new Error(
                `Respuesta meteorológica ${respuesta.status}`
            );
        }

        const contenido = await respuesta.json();
        const datos = Array.isArray(contenido)
            ? contenido
            : [contenido];

        if (datos.length !== tramos.length) {
            throw new Error(
                "La cantidad de pronósticos no coincide con los tramos"
            );
        }

        cachePronosticos.set(clave, {
            fecha: Date.now(),
            datos
        });

        return datos;
    }

    function mostrarEstado(estado, mensaje = "") {
        elemento("panel-clima-linea").hidden = false;
        elemento("linea-clima-cargando").hidden =
            estado !== "cargando";
        elemento("linea-clima-error").hidden =
            estado !== "error";
        elemento("linea-clima-contenido").hidden =
            estado !== "contenido";

        if (estado === "error") {
            elemento("linea-clima-error").textContent = mensaje;
        }
    }

    function etiquetaTramo(tramo) {
        return `Tramo ${tramo.numero} · km `
            + `${formatearNumero(tramo.desdeKm)}–`
            + `${formatearNumero(tramo.hastaKm)}`;
    }

    function crearPopupTramo(resultado) {
        const contenedor = document.createElement("div");
        contenedor.className = "popup-gridvision";

        const titulo = document.createElement("h3");
        titulo.textContent = etiquetaTramo(resultado.tramo);
        contenedor.appendChild(titulo);

        const campos = [
            ["Nivel", resultado.nivel.etiqueta],
            ["Ráfaga", `${formatearNumero(resultado.rafaga)} km/h`],
            [
                "Transversal estimada",
                `${formatearNumero(resultado.transversal)} km/h`
            ],
            ["Hora", formatearHora(resultado.hora)]
        ];

        campos.forEach(([etiqueta, valor]) => {
            const parrafo = document.createElement("p");
            const fuerte = document.createElement("strong");
            fuerte.textContent = `${etiqueta}: `;
            parrafo.appendChild(fuerte);
            parrafo.appendChild(document.createTextNode(valor));
            contenedor.appendChild(parrafo);
        });

        return contenedor;
    }

    function dibujarTramos(resultados) {
        capaAnalisis.clearLayers();

        resultados.forEach((resultado) => {
            const coordenadasLeaflet =
                resultado.tramo.coordenadas.map(
                    ([longitud, latitud]) =>
                        [latitud, longitud]
                );
            const color = resultado.disponible
                ? resultado.nivel.color
                : "#64748b";
            const linea = L.polyline(coordenadasLeaflet, {
                color,
                weight: 7,
                opacity: 0.92,
                lineCap: "round",
                lineJoin: "round"
            });

            if (resultado.disponible) {
                linea.bindPopup(crearPopupTramo(resultado));
            }

            linea.on("mouseover", () => {
                linea.setStyle({ weight: 10 });
            });

            linea.on("mouseout", () => {
                linea.setStyle({ weight: 7 });
            });

            linea.addTo(capaAnalisis);
        });
    }

    function escribirEstadoLinea(principal, horizonte) {
        const panel = elemento("estado-clima-linea");
        panel.classList.remove(
            "riesgo-pendiente",
            "riesgo-normal",
            "riesgo-precaucion",
            "riesgo-alto",
            "riesgo-critico"
        );
        panel.classList.add(`riesgo-${principal.nivel.id}`);

        elemento("nivel-clima-linea").textContent =
            principal.nivel.etiqueta;
        elemento("motivo-clima-linea").textContent =
            `${etiquetaTramo(principal.tramo)} presenta la mayor `
            + `exposición prevista dentro de ${horizonte} horas.`;

        elemento("tramo-critico-linea").textContent =
            etiquetaTramo(principal.tramo);
        elemento("rafaga-critica-linea").textContent =
            `${formatearNumero(principal.rafaga)} km/h`;
        elemento("transversal-critica-linea").textContent =
            `${formatearNumero(principal.transversal)} km/h`;
        elemento("hora-critica-linea").textContent =
            formatearHora(principal.hora);
    }

    function crearFilaRanking(resultado) {
        const fila = document.createElement("article");
        fila.className = "tramo-ranking";

        const color = document.createElement("span");
        color.className = "tramo-ranking-color";
        color.style.background = resultado.nivel.color;

        const detalle = document.createElement("div");
        const nombre = document.createElement("strong");
        const hora = document.createElement("small");
        nombre.textContent = etiquetaTramo(resultado.tramo);
        hora.textContent = formatearHora(resultado.hora);
        detalle.appendChild(nombre);
        detalle.appendChild(hora);

        const valores = document.createElement("div");
        valores.className = "tramo-ranking-valores";
        const transversal = document.createElement("strong");
        const rafaga = document.createElement("small");
        transversal.textContent =
            `${formatearNumero(resultado.transversal)} km/h`;
        rafaga.textContent =
            `Transversal · Ráfaga ${formatearNumero(resultado.rafaga)} km/h`;
        valores.appendChild(transversal);
        valores.appendChild(rafaga);

        fila.appendChild(color);
        fila.appendChild(detalle);
        fila.appendChild(valores);

        return fila;
    }

    function escribirRanking(resultados) {
        const contenedor = elemento("ranking-tramos-linea");
        contenedor.replaceChildren();

        resultados
            .filter((resultado) => resultado.disponible)
            .slice(0, CONFIGURACION.maximoRanking)
            .forEach((resultado) => {
                contenedor.appendChild(
                    crearFilaRanking(resultado)
                );
            });
    }

    function actualizarAnalisis() {
        if (!analisisActivo) {
            return;
        }

        const horizonte = Number(
            elemento("horizonte-linea").value
        ) || CONFIGURACION.horizonteInicial;
        const resultados = analisisActivo.tramos.map(
            (tramo, indice) => evaluarTramo(
                tramo,
                analisisActivo.pronosticos[indice],
                horizonte
            )
        );
        const ordenados = ordenarResultados(resultados);
        const principal = ordenados.find(
            (resultado) => resultado.disponible
        );
        const indiceTramoCritico =
    analisisActivo.tramos.indexOf(principal.tramo);

const pronosticoTramoCritico =
    analisisActivo.pronosticos[indiceTramoCritico]
    || null;

        if (!principal) {
            mostrarEstado(
                "error",
                "El pronóstico no entregó datos válidos para los tramos."
            );
            return;
        }

        dibujarTramos(resultados);
        escribirEstadoLinea(principal, horizonte);
        escribirRanking(ordenados);
        dibujarTramos(resultados);
escribirEstadoLinea(principal, horizonte);
escribirRanking(ordenados);

window.dispatchEvent(
    new CustomEvent(
        "gridvision:pronostico-linea",
        {
            detail: {
                pronosticoTramoCritico,

                nombre:
                    analisisActivo.feature?.properties?.nombre
                    || "Línea sin nombre",

                longitudTotalKm:
                    analisisActivo.longitudTotalKm,

                horizonte,

                nivel:
                    principal.nivel?.etiqueta || "NORMAL",

                motivo:
                    `${etiquetaTramo(principal.tramo)} presenta la mayor exposición prevista.`,

                tramoCritico:
                    etiquetaTramo(principal.tramo),
                    rumboTramoCritico:
    principal.tramo?.rumbo ?? null,
                rafagaCritica:
                    principal.rafaga,

                transversalCritica:
                    principal.transversal,

                horaCritica:
                    principal.hora,

                ranking: ordenados
    .filter((resultado) => resultado.disponible)
    .slice(0, 8)
    .map((resultado) => ({
        tramo: etiquetaTramo(resultado.tramo),
        rafaga: resultado.rafaga,
        transversal: resultado.transversal,
        hora: resultado.hora,
        nivel:
            resultado.nivel?.etiqueta
            || resultado.nivel?.nombre
            || "NORMAL"
    }))
            }
        }
    )
);

mostrarEstado("contenido");
        mostrarEstado("contenido");
    }

    async function seleccionarLinea(feature) {
        if (!mapa || !capaAnalisis) {
            return;
        }

        const propiedades = feature?.properties || {};
        const segmentacion = generarTramos(feature);

        if (!segmentacion.tramos.length) {
            mostrarEstado(
                "error",
                "La geometría seleccionada no permite crear tramos."
            );
            return;
        }

        if (controladorActivo) {
            controladorActivo.abort();
        }

        controladorActivo = new AbortController();
        analisisActivo = null;
        capaAnalisis.clearLayers();

        elemento("linea-clima-nombre").textContent =
            propiedades.nombre || "Línea sin nombre";
        elemento("linea-clima-resumen").textContent =
            `${formatearNumero(segmentacion.longitudTotalKm)} km `
            + `aproximados · ${segmentacion.tramos.length} tramos `
            + "meteorológicos";
        elemento("horizonte-linea").value =
            String(CONFIGURACION.horizonteInicial);

        mostrarEstado("cargando");

        try {
            const pronosticos = await consultarPronostico(
                feature,
                segmentacion.tramos,
                controladorActivo.signal
            );

            analisisActivo = {
                feature,
                longitudTotalKm: segmentacion.longitudTotalKm,
                tramos: segmentacion.tramos,
                pronosticos
            };

            actualizarAnalisis();
        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }

            console.error(error);
            mostrarEstado(
                "error",
                "No fue posible analizar la línea. Revisa la conexión "
                + "a internet e inténtalo nuevamente."
            );
        }
    }

    function ocultar() {
        if (controladorActivo) {
            controladorActivo.abort();
            controladorActivo = null;
        }

        analisisActivo = null;

        if (capaAnalisis) {
            capaAnalisis.clearLayers();
        }

        const panel = elemento("panel-clima-linea");

        if (panel) {
            panel.hidden = true;
        }
    }

    function inicializar(instanciaMapa) {
        mapa = instanciaMapa;
        capaAnalisis = L.layerGroup().addTo(mapa);

        elemento("cerrar-clima-linea").addEventListener(
            "click",
            ocultar
        );

        elemento("horizonte-linea").addEventListener(
            "change",
            actualizarAnalisis
        );
    }

    const api = {
        inicializar,
        seleccionarLinea,
        ocultar
    };

    if (typeof window !== "undefined") {
        window.GridVisionClimaLineas = api;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            distanciaKm,
            crearPerfil,
            puntoEnPerfil,
            recortarPerfil,
            rumboGeografico,
            generarTramos,
            construirUrl,
            nivelRiesgo,
            evaluarTramo,
            ordenarResultados,
            CONFIGURACION,
            NIVELES_RIESGO
        };
    }
})();
