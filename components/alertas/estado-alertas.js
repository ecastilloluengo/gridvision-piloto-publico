(() => {
    "use strict";

    const API_URL = "https://api.open-meteo.com/v1/forecast";

    const RUTAS_DATOS = {
        activos: "data/processed/activos_puntuales_validados.geojson",
        lineas: "data/processed/lineas_validadas.geojson"
    };

    const CONFIG = {
        intervaloActualizacionMs: 15 * 60 * 1000,
        horizonteHoras: 24,
        distanciaMuestreoLineaKm: 8,
        maximoMuestrasLinea: 18
    };

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
        lluvia24h: {
            precaucion: 20,
            alerta: 50,
            critico: 80
        },
        lluviaHora: {
            precaucion: 10,
            alerta: 20,
            critico: 30
        }
    };

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

    const CODIGOS_TORMENTA = new Set([95, 96, 99]);

    const PRIORIDAD = {
        NORMAL: 0,
        PRECAUCION: 1,
        ALERTA: 2,
        CRITICO: 3
    };

    let actualizando = false;
    let temporizador = null;
    let inventarioPromise = null;

    function ahoraIso() {
        return new Date().toISOString();
    }

    function numero(valor) {
        const resultado = Number(valor);
        return Number.isFinite(resultado) ? resultado : null;
    }

    function formatearNumero(valor, decimales = 1) {
        const n = numero(valor);

        if (n === null) {
            return "—";
        }

        return n.toLocaleString("es-CL", {
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        });
    }

    function formatearHora(fechaIso) {
        if (!fechaIso) {
            return "";
        }

        const fecha = new Date(fechaIso);

        if (Number.isNaN(fecha.getTime())) {
            const hora = String(fechaIso).split("T")[1]?.slice(0, 5);
            return hora || "";
        }

        return fecha.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
    }

    function normalizarEstado(estado) {
        const texto = String(estado || "").toUpperCase();

        if (Object.prototype.hasOwnProperty.call(PRIORIDAD, texto)) {
            return texto;
        }

        return "NORMAL";
    }

    function nivelPorValor(valor, umbrales) {
        const n = numero(valor);

        if (n === null) {
            return "NORMAL";
        }

        if (n >= umbrales.critico) {
            return "CRITICO";
        }

        if (n >= umbrales.alerta) {
            return "ALERTA";
        }

        if (n >= umbrales.precaucion) {
            return "PRECAUCION";
        }

        return "NORMAL";
    }

    function peorEstado(...estados) {
        return estados
            .map(normalizarEstado)
            .sort((a, b) => PRIORIDAD[b] - PRIORIDAD[a])[0]
            || "NORMAL";
    }

    function maximoConIndice(valores = [], cantidad = CONFIG.horizonteHoras) {
        let valor = null;
        let indice = -1;

        valores.slice(0, cantidad).forEach((dato, posicion) => {
            const n = numero(dato);

            if (n === null) {
                return;
            }

            if (valor === null || n > valor) {
                valor = n;
                indice = posicion;
            }
        });

        return { valor, indice };
    }

    function suma(valores = [], cantidad = CONFIG.horizonteHoras) {
        return valores
            .slice(0, cantidad)
            .reduce((total, dato) => total + (numero(dato) || 0), 0);
    }

    function obtenerEstadoPorId(id) {
        return window.estadoAlertas?.find((item) => item.id === id) || null;
    }

    function actualizarEstado(id, cambios = {}) {
        const item = obtenerEstadoPorId(id);

        if (!item) {
            return;
        }

        Object.assign(item, cambios);

        if (typeof window.actualizarCentroAlertas === "function") {
            window.actualizarCentroAlertas();
        }
    }

    function marcarError(id, mensaje) {
        const item = obtenerEstadoPorId(id);

        if (!item) {
            return;
        }

        if (item.actualizacion) {
            item.errorConsulta = true;
            item.mensaje =
                `${item.mensaje || "Último estado disponible"} · `
                + "actualización meteorológica fallida";
        } else {
            item.estado = "SIN_DATOS";
            item.mensaje = mensaje || "Sin datos meteorológicos";
        }

        if (typeof window.actualizarCentroAlertas === "function") {
            window.actualizarCentroAlertas();
        }
    }

    function crearEstadosIniciales() {
        const configurados = Array.isArray(window.ACTIVOS_MONITOREADOS)
            ? window.ACTIVOS_MONITOREADOS
            : [];

        window.estadoAlertas = configurados.map((activo) => ({
            id: activo.id,
            alias: activo.alias,
            tipo: activo.tipo,
            estado: "PENDIENTE",
            mensaje: "Evaluando pronóstico meteorológico…",
            actualizacion: null,
            errorConsulta: false
        }));
    }

    async function cargarGeojson(ruta) {
        const respuesta = await fetch(ruta, {
            cache: "force-cache"
        });

        if (!respuesta.ok) {
            throw new Error(`No fue posible cargar ${ruta}`);
        }

        return respuesta.json();
    }

    async function cargarInventario() {
        if (!inventarioPromise) {
            inventarioPromise = Promise.all([
                cargarGeojson(RUTAS_DATOS.activos),
                cargarGeojson(RUTAS_DATOS.lineas)
            ]).then(([activos, lineas]) => {
                const mapa = new Map();

                [...(activos.features || []), ...(lineas.features || [])]
                    .forEach((feature) => {
                        const id = feature?.properties?.id || feature?.id;

                        if (id) {
                            mapa.set(String(id), feature);
                        }
                    });

                return mapa;
            }).catch((error) => {
                inventarioPromise = null;
                throw error;
            });
        }

        return inventarioPromise;
    }

    function construirUrlPuntos(coordenadas = []) {
        const latitudes = coordenadas.map((punto) => punto[1].toFixed(5));
        const longitudes = coordenadas.map((punto) => punto[0].toFixed(5));

        const parametros = new URLSearchParams({
            latitude: latitudes.join(","),
            longitude: longitudes.join(","),
            hourly: [
                "weather_code",
                "precipitation",
                "wind_speed_10m",
                "wind_gusts_10m"
            ].join(","),
            forecast_hours: String(CONFIG.horizonteHoras),
            timezone: "auto",
            wind_speed_unit: "kmh"
        });

        return `${API_URL}?${parametros.toString()}`;
    }

    function resultadoALista(contenido) {
        return Array.isArray(contenido)
            ? contenido
            : [contenido];
    }

    function evaluarActivo(datos) {
        const horario = datos?.hourly || {};
        const tiempos = horario.time || [];

        const viento = maximoConIndice(horario.wind_speed_10m);
        const rafaga = maximoConIndice(horario.wind_gusts_10m);
        const lluviaHora = maximoConIndice(horario.precipitation);
        const lluvia24h = suma(horario.precipitation);

        let estado = peorEstado(
            nivelPorValor(viento.valor, UMBRALES_ACTIVO.viento),
            nivelPorValor(rafaga.valor, UMBRALES_ACTIVO.rafaga),
            nivelPorValor(lluviaHora.valor, UMBRALES_ACTIVO.lluviaHora),
            nivelPorValor(lluvia24h, UMBRALES_ACTIVO.lluvia24h)
        );

        const codigos = (horario.weather_code || [])
            .slice(0, CONFIG.horizonteHoras);

        const indiceTormenta = codigos.findIndex((codigo) =>
            CODIGOS_TORMENTA.has(Number(codigo))
        );

        if (indiceTormenta >= 0) {
            const codigo = Number(codigos[indiceTormenta]);
            estado = peorEstado(
                estado,
                codigo === 99 ? "CRITICO" : "ALERTA"
            );
        }

        const candidatos = [
            {
                estado: nivelPorValor(rafaga.valor, UMBRALES_ACTIVO.rafaga),
                texto:
                    `Ráfaga máx. ${formatearNumero(rafaga.valor)} km/h`
                    + (rafaga.indice >= 0
                        ? ` a las ${formatearHora(tiempos[rafaga.indice])}`
                        : "")
            },
            {
                estado: nivelPorValor(viento.valor, UMBRALES_ACTIVO.viento),
                texto:
                    `Viento máx. ${formatearNumero(viento.valor)} km/h`
                    + (viento.indice >= 0
                        ? ` a las ${formatearHora(tiempos[viento.indice])}`
                        : "")
            },
            {
                estado: nivelPorValor(
                    lluvia24h,
                    UMBRALES_ACTIVO.lluvia24h
                ),
                texto: `Lluvia 24 h ${formatearNumero(lluvia24h)} mm`
            },
            {
                estado: nivelPorValor(
                    lluviaHora.valor,
                    UMBRALES_ACTIVO.lluviaHora
                ),
                texto:
                    `Lluvia horaria máx. ${formatearNumero(lluviaHora.valor)} mm`
            }
        ];

        if (indiceTormenta >= 0) {
            candidatos.push({
                estado:
                    Number(codigos[indiceTormenta]) === 99
                        ? "CRITICO"
                        : "ALERTA",
                texto:
                    `Tormenta prevista a las `
                    + `${formatearHora(tiempos[indiceTormenta])}`
            });
        }

        candidatos.sort(
            (a, b) =>
                PRIORIDAD[normalizarEstado(b.estado)]
                - PRIORIDAD[normalizarEstado(a.estado)]
        );

        const dominante = candidatos[0];

        return {
            estado,
            mensaje:
                estado === "NORMAL"
                    ? (
                        `Sin umbrales superados · ráfaga máx. `
                        + `${formatearNumero(rafaga.valor)} km/h · `
                        + `lluvia 24 h ${formatearNumero(lluvia24h)} mm`
                    )
                    : dominante.texto
        };
    }

    function coordenadaValida(coordenada) {
        return Array.isArray(coordenada)
            && coordenada.length >= 2
            && numero(coordenada[0]) !== null
            && numero(coordenada[1]) !== null;
    }

    function distanciaKm(origen, destino) {
        const radioTierraKm = 6371.0088;
        const rad = (grados) => grados * Math.PI / 180;

        const lat1 = rad(origen[1]);
        const lat2 = rad(destino[1]);
        const dLat = rad(destino[1] - origen[1]);
        const dLon = rad(destino[0] - origen[0]);

        const a =
            Math.sin(dLat / 2) ** 2
            + Math.cos(lat1)
            * Math.cos(lat2)
            * Math.sin(dLon / 2) ** 2;

        return 2 * radioTierraKm * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
    }

    function rumbo(origen, destino) {
        const rad = (grados) => grados * Math.PI / 180;
        const deg = (radianes) => radianes * 180 / Math.PI;

        const lat1 = rad(origen[1]);
        const lat2 = rad(destino[1]);
        const dLon = rad(destino[0] - origen[0]);

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
            Math.cos(lat1) * Math.sin(lat2)
            - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

        return (deg(Math.atan2(y, x)) + 360) % 360;
    }

    function partesLinea(feature) {
        const geometria = feature?.geometry;

        if (geometria?.type === "LineString") {
            return [geometria.coordinates];
        }

        if (geometria?.type === "MultiLineString") {
            return geometria.coordinates;
        }

        return [];
    }

    function perfilParte(coordenadas = []) {
        const puntos = coordenadas
            .filter(coordenadaValida)
            .map((punto) => [Number(punto[0]), Number(punto[1])]);

        if (puntos.length < 2) {
            return null;
        }

        const acumuladas = [0];

        for (let i = 1; i < puntos.length; i += 1) {
            acumuladas.push(
                acumuladas[i - 1] + distanciaKm(puntos[i - 1], puntos[i])
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
            Math.max(0, distanciaObjetivo),
            perfil.longitudKm
        );

        for (let i = 1; i < perfil.acumuladas.length; i += 1) {
            if (perfil.acumuladas[i] < distancia) {
                continue;
            }

            const inicio = perfil.puntos[i - 1];
            const fin = perfil.puntos[i];
            const inicioKm = perfil.acumuladas[i - 1];
            const largo = perfil.acumuladas[i] - inicioKm;
            const proporcion = largo > 0
                ? (distancia - inicioKm) / largo
                : 0;

            return [
                inicio[0] + (fin[0] - inicio[0]) * proporcion,
                inicio[1] + (fin[1] - inicio[1]) * proporcion
            ];
        }

        return [...perfil.puntos.at(-1)];
    }

    function generarMuestrasLinea(feature) {
        const perfiles = partesLinea(feature)
            .map(perfilParte)
            .filter(Boolean);

        const longitudTotalKm = perfiles.reduce(
            (total, perfil) => total + perfil.longitudKm,
            0
        );

        if (!perfiles.length || longitudTotalKm <= 0) {
            return [];
        }

        const intervalo = Math.max(
            CONFIG.distanciaMuestreoLineaKm,
            longitudTotalKm / CONFIG.maximoMuestrasLinea
        );

        const muestras = [];

        perfiles.forEach((perfil) => {
            const cantidad = Math.max(
                1,
                Math.ceil(perfil.longitudKm / intervalo)
            );

            for (let i = 0; i < cantidad; i += 1) {
                const desde = i * perfil.longitudKm / cantidad;
                const hasta = (i + 1) * perfil.longitudKm / cantidad;
                const inicio = puntoEnPerfil(perfil, desde);
                const fin = puntoEnPerfil(perfil, hasta);
                const centro = puntoEnPerfil(
                    perfil,
                    (desde + hasta) / 2
                );

                muestras.push({
                    centro,
                    rumbo: rumbo(inicio, fin)
                });
            }
        });

        return muestras.slice(0, CONFIG.maximoMuestrasLinea);
    }

    function evaluarMuestraLinea(muestra, datos) {
        const horario = datos?.hourly || {};
        const tiempos = horario.time || [];
        const rafagas = horario.wind_gusts_10m || [];
        const direcciones = horario.wind_direction_10m || [];

        let peor = {
            estado: "NORMAL",
            rafaga: null,
            transversal: null,
            hora: null,
            puntaje: 0
        };

        const cantidad = Math.min(
            CONFIG.horizonteHoras,
            tiempos.length,
            rafagas.length,
            direcciones.length
        );

        for (let i = 0; i < cantidad; i += 1) {
            const rafaga = numero(rafagas[i]);
            const direccion = numero(direcciones[i]);

            if (rafaga === null || direccion === null) {
                continue;
            }

            const diferencia = (direccion - muestra.rumbo) * Math.PI / 180;
            const transversal = Math.abs(rafaga * Math.sin(diferencia));

            const estado = peorEstado(
                nivelPorValor(rafaga, UMBRALES_LINEA.rafaga),
                nivelPorValor(
                    transversal,
                    UMBRALES_LINEA.transversal
                )
            );

            const puntaje =
                PRIORIDAD[estado] * 100000
                + transversal * 100
                + rafaga;

            if (puntaje > peor.puntaje) {
                peor = {
                    estado,
                    rafaga,
                    transversal,
                    hora: tiempos[i],
                    puntaje
                };
            }
        }

        return peor;
    }

    async function evaluarLinea(feature) {
        const muestras = generarMuestrasLinea(feature);

        if (!muestras.length) {
            throw new Error("Geometría de línea no válida");
        }

        const url = construirUrlPuntos(
            muestras.map((muestra) => muestra.centro)
        );

        // La evaluación transversal necesita dirección de viento.
        const urlConDireccion = url.replace(
            "wind_gusts_10m",
            "wind_gusts_10m%2Cwind_direction_10m"
        );

        const respuesta = await fetch(urlConDireccion, {
            cache: "no-store"
        });

        if (!respuesta.ok) {
            throw new Error(`Open-Meteo respondió ${respuesta.status}`);
        }

        const pronosticos = resultadoALista(await respuesta.json());

        if (pronosticos.length !== muestras.length) {
            throw new Error("Pronóstico incompleto para la línea");
        }

        const evaluaciones = muestras.map((muestra, indice) =>
            evaluarMuestraLinea(muestra, pronosticos[indice])
        );

        evaluaciones.sort((a, b) => b.puntaje - a.puntaje);

        const peor = evaluaciones[0];

        return {
            estado: peor.estado,
            mensaje:
                peor.estado === "NORMAL"
                    ? (
                        `Sin umbrales superados · ráfaga máx. `
                        + `${formatearNumero(peor.rafaga)} km/h · `
                        + `transversal máx. `
                        + `${formatearNumero(peor.transversal)} km/h`
                    )
                    : (
                        `Ráfaga ${formatearNumero(peor.rafaga)} km/h · `
                        + `transversal ${formatearNumero(peor.transversal)} km/h`
                        + (peor.hora
                            ? ` a las ${formatearHora(peor.hora)}`
                            : "")
                    )
        };
    }

    async function evaluarActivosPuntuales(items, inventario) {
        const evaluables = [];

        items.forEach((item) => {
            const feature = inventario.get(String(item.id));
            const coordenadas = feature?.geometry?.coordinates;

            if (
                !feature
                || feature.geometry?.type !== "Point"
                || !coordenadaValida(coordenadas)
            ) {
                marcarError(
                    item.id,
                    "Activo no encontrado o sin coordenadas válidas"
                );
                return;
            }

            evaluables.push({
                item,
                feature,
                coordenadas
            });
        });

        if (!evaluables.length) {
            return;
        }

        const respuesta = await fetch(
            construirUrlPuntos(
                evaluables.map((registro) => registro.coordenadas)
            ),
            {
                cache: "no-store"
            }
        );

        if (!respuesta.ok) {
            throw new Error(`Open-Meteo respondió ${respuesta.status}`);
        }

        const pronosticos = resultadoALista(await respuesta.json());

        evaluables.forEach((registro, indice) => {
            const datos = pronosticos[indice];

            if (!datos?.hourly) {
                marcarError(
                    registro.item.id,
                    "Open-Meteo no entregó pronóstico"
                );
                return;
            }

            const resultado = evaluarActivo(datos);

            actualizarEstado(registro.item.id, {
                estado: resultado.estado,
                mensaje: resultado.mensaje,
                actualizacion: ahoraIso(),
                errorConsulta: false
            });
        });
    }

    async function evaluarLineas(items, inventario) {
        for (const item of items) {
            const feature = inventario.get(String(item.id));

            if (!feature) {
                marcarError(item.id, "Línea no encontrada en inventario");
                continue;
            }

            try {
                const resultado = await evaluarLinea(feature);

                actualizarEstado(item.id, {
                    estado: resultado.estado,
                    mensaje: resultado.mensaje,
                    actualizacion: ahoraIso(),
                    errorConsulta: false
                });
            } catch (error) {
                console.warn(
                    `GridVision: no fue posible evaluar ${item.alias}:`,
                    error
                );

                marcarError(
                    item.id,
                    "No fue posible evaluar la línea"
                );
            }
        }
    }

    async function actualizarMonitoreo() {
        if (actualizando) {
            return;
        }

        actualizando = true;

        try {
            const inventario = await cargarInventario();
            const items = Array.isArray(window.ACTIVOS_MONITOREADOS)
                ? window.ACTIVOS_MONITOREADOS
                : [];

            const activos = items.filter((item) => item.tipo === "activo");
            const lineas = items.filter((item) => item.tipo === "linea");

            await Promise.all([
                evaluarActivosPuntuales(activos, inventario),
                evaluarLineas(lineas, inventario)
            ]);
        } catch (error) {
            console.error(
                "GridVision: error en monitoreo meteorológico automático:",
                error
            );

            (window.estadoAlertas || []).forEach((item) => {
                marcarError(
                    item.id,
                    "No fue posible actualizar el pronóstico"
                );
            });
        } finally {
            actualizando = false;

            if (typeof window.actualizarCentroAlertas === "function") {
                window.actualizarCentroAlertas();
            }
        }
    }

    function iniciar() {
        if (temporizador) {
            return;
        }

        actualizarMonitoreo();

        temporizador = window.setInterval(
            actualizarMonitoreo,
            CONFIG.intervaloActualizacionMs
        );
    }

    function detener() {
        if (temporizador) {
            window.clearInterval(temporizador);
            temporizador = null;
        }
    }

    crearEstadosIniciales();

    window.GridVisionAlertasMeteorologicas = {
        actualizarAhora: actualizarMonitoreo,
        iniciar,
        detener,
        get actualizando() {
            return actualizando;
        },
        get intervaloMinutos() {
            return CONFIG.intervaloActualizacionMs / 60000;
        }
    };

    iniciar();
})();