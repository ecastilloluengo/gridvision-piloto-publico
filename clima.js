(() => {
    const API_URL =
        "https://api.open-meteo.com/v1/forecast";

    let controladorActivo = null;
    const UMBRALES_METEOROLOGICOS = {
    viento: {
        precaucion: 40,
        alerta: 60
    },
    rafaga: {
        precaucion: 60,
        alerta: 80
    },
    lluvia24h: {
        precaucion: 20,
        alerta: 50
    },
    lluviaHora: {
        precaucion: 10,
        alerta: 20
    }
};

const CODIGOS_TORMENTA = new Set([95, 96, 99]);


    function elemento(id) {
        return document.getElementById(id);
    }

    function mostrarEstado(estado) {
        elemento("panel-clima").hidden = false;
        elemento("clima-vacio").hidden =
            estado !== "vacio";
        elemento("clima-cargando").hidden =
            estado !== "cargando";
        elemento("clima-error").hidden =
            estado !== "error";
        elemento("clima-contenido").hidden =
            estado !== "contenido";
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

        return numero.toLocaleString(
            "es-CL",
            {
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }
        );
    }

    function sumarPrimerasHoras(valores, horas) {
        return (valores || [])
            .slice(0, horas)
            .reduce(
                (total, valor) =>
                    total + (numeroSeguro(valor) || 0),
                0
            );
    }

    function indiceMaximo(valores) {
        let indice = -1;
        let maximo = -Infinity;

        (valores || []).forEach((valor, posicion) => {
            const numero = numeroSeguro(valor);

            if (
                numero !== null
                && numero > maximo
            ) {
                maximo = numero;
                indice = posicion;
            }
        });

        return {
            indice,
            valor: indice >= 0 ? maximo : null
        };
    }

    function rango(valores) {
        const numeros = (valores || [])
            .map(numeroSeguro)
            .filter((valor) => valor !== null);

        if (!numeros.length) {
            return {
                minimo: null,
                maximo: null
            };
        }

        return {
            minimo: Math.min(...numeros),
            maximo: Math.max(...numeros)
        };
    }

    function formatearHora(fechaIso) {
        if (!fechaIso) {
            return "";
        }

        const [fecha, hora] = fechaIso.split("T");
        const [anio, mes, dia] = fecha.split("-");
        const horaCorta = (hora || "").slice(0, 5);

        return `${dia}-${mes}-${anio} ${horaCorta}`;
    }

    function direccionCardinal(grados) {
        const valor = numeroSeguro(grados);

        if (valor === null) {
            return "—";
        }

        const direcciones = [
            "N", "NNE", "NE", "ENE",
            "E", "ESE", "SE", "SSE",
            "S", "SSO", "SO", "OSO",
            "O", "ONO", "NO", "NNO"
        ];

        const indice = Math.round(
            ((valor % 360) / 22.5)
        ) % 16;

        return `${direcciones[indice]} ${Math.round(valor)}°`;
    }

    function descripcionClima(codigo) {
        const descripciones = {
            0: "Despejado",
            1: "Mayormente despejado",
            2: "Parcialmente nublado",
            3: "Cubierto",
            45: "Niebla",
            48: "Niebla con escarcha",
            51: "Llovizna ligera",
            53: "Llovizna moderada",
            55: "Llovizna intensa",
            56: "Llovizna helada ligera",
            57: "Llovizna helada intensa",
            61: "Lluvia ligera",
            63: "Lluvia moderada",
            65: "Lluvia intensa",
            66: "Lluvia helada ligera",
            67: "Lluvia helada intensa",
            71: "Nieve ligera",
            73: "Nieve moderada",
            75: "Nieve intensa",
            77: "Granos de nieve",
            80: "Chubascos ligeros",
            81: "Chubascos moderados",
            82: "Chubascos violentos",
            85: "Chubascos de nieve ligeros",
            86: "Chubascos de nieve intensos",
            95: "Tormenta",
            96: "Tormenta con granizo leve",
            99: "Tormenta con granizo fuerte"
        };

        return descripciones[Number(codigo)] ?? "Sin información";
    }


    function coordenadaActivo(feature) {
        const geometria = feature?.geometry;

        if (!geometria) {
            return null;
        }

        if (geometria.type === "Point") {
            return geometria.coordinates;
        }

        if (
            geometria.type === "MultiPoint"
            && geometria.coordinates?.length
        ) {
            return geometria.coordinates[0];
        }

        return null;
    }

    function construirUrl(latitud, longitud) {
        const parametros = new URLSearchParams({
            latitude: latitud,
            longitude: longitud,
            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "weather_code",
                "precipitation",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m"
            ].join(","),
            hourly: [
    "temperature_2m",
    "weather_code",
    "precipitation",
    "precipitation_probability",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m"
].join(","),
            forecast_days: "7",
            timezone: "auto",
            wind_speed_unit: "kmh"
        });

        return `${API_URL}?${parametros.toString()}`;
    }

    function escribirActual(datos) {
        const actual = datos.current || {};
        const unidades = datos.current_units || {};

        elemento("clima-temperatura").textContent =
            `${formatearNumero(actual.temperature_2m)} `
            + `${unidades.temperature_2m || "°C"}`;
        elemento("clima-condicion").textContent =
            descripcionClima(actual.weather_code);

        elemento("clima-humedad").textContent =
            `${formatearNumero(actual.relative_humidity_2m, 0)} `
            + `${unidades.relative_humidity_2m || "%"}`;

        elemento("clima-precipitacion").textContent =
            `${formatearNumero(actual.precipitation)} `
            + `${unidades.precipitation || "mm"}`;

        elemento("clima-viento").textContent =
            `${formatearNumero(actual.wind_speed_10m)} `
            + `${unidades.wind_speed_10m || "km/h"}`;

        elemento("clima-rafaga").textContent =
            `${formatearNumero(actual.wind_gusts_10m)} `
            + `${unidades.wind_gusts_10m || "km/h"}`;

        elemento("clima-direccion").textContent =
            direccionCardinal(
                actual.wind_direction_10m
            );
    }
function maximoPrimerasHoras(valores, horas) {
    const lista = Array.isArray(valores)
        ? valores.slice(0, horas)
        : [];

    let valorMaximo = null;
    let indice = -1;

    lista.forEach((valor, posicion) => {
        const numero = Number(valor);

        if (!Number.isFinite(numero)) {
            return;
        }

        if (valorMaximo === null || numero > valorMaximo) {
            valorMaximo = numero;
            indice = posicion;
        }
    });

    return {
        valor: valorMaximo ?? 0,
        indice
    };
}

function nivelPorUmbral(valor, umbrales) {
    if (valor >= umbrales.alerta) {
        return 2;
    }

    if (valor >= umbrales.precaucion) {
        return 1;
    }

    return 0;
}

function escribirAlerta(resultado) {
    const panel = elemento("alerta-meteorologica");

    panel.classList.remove(
        "alerta-pendiente",
        "alerta-normal",
        "alerta-precaucion",
        "alerta-alerta"
    );

    panel.classList.add(`alerta-${resultado.nivel}`);

    const etiquetas = {
        pendiente: "Sin evaluar",
        normal: "Normal",
        precaucion: "Precaución",
        alerta: "Alerta"
    };

    elemento("alerta-nivel").textContent =
        etiquetas[resultado.nivel] || "Sin evaluar";

    elemento("alerta-motivo").textContent = resultado.motivo;
}

function evaluarAlertaMeteorologica(horario, tiempos) {
    const viento = maximoPrimerasHoras(
        horario.wind_speed_10m,
        24
    );

    const rafaga = maximoPrimerasHoras(
        horario.wind_gusts_10m,
        24
    );

    const lluviaHora = maximoPrimerasHoras(
        horario.precipitation,
        24
    );

    const lluvia24h = sumarPrimerasHoras(
        horario.precipitation,
        24
    );

    const eventos = [];

    function registrarMaximo(
        etiqueta,
        resultado,
        umbrales,
        unidad
    ) {
        const prioridad = nivelPorUmbral(
            resultado.valor,
            umbrales
        );

        if (prioridad === 0) {
            return;
        }

        const hora = resultado.indice >= 0
            ? formatearHora(tiempos[resultado.indice])
            : "hora no disponible";

        eventos.push({
            prioridad,
            motivo:
                `${etiqueta}: `
                + `${formatearNumero(resultado.valor)} `
                + `${unidad}, previsto para ${hora}`
        });
    }

    registrarMaximo(
        "Viento máximo",
        viento,
        UMBRALES_METEOROLOGICOS.viento,
        "km/h"
    );

    registrarMaximo(
        "Ráfaga máxima",
        rafaga,
        UMBRALES_METEOROLOGICOS.rafaga,
        "km/h"
    );

    registrarMaximo(
        "Precipitación horaria",
        lluviaHora,
        UMBRALES_METEOROLOGICOS.lluviaHora,
        "mm"
    );

    const prioridadLluvia = nivelPorUmbral(
        lluvia24h,
        UMBRALES_METEOROLOGICOS.lluvia24h
    );

    if (prioridadLluvia > 0) {
        eventos.push({
            prioridad: prioridadLluvia,
            motivo:
                "Precipitación acumulada: "
                + `${formatearNumero(lluvia24h)} mm `
                + "en las próximas 24 horas"
        });
    }

    const codigos = Array.isArray(horario.weather_code)
        ? horario.weather_code.slice(0, 24)
        : [];

    const indiceTormenta = codigos.findIndex(
        (codigo) => CODIGOS_TORMENTA.has(Number(codigo))
    );

    if (indiceTormenta >= 0) {
        eventos.push({
            prioridad: 2,
            motivo:
                "Tormenta prevista para "
                + formatearHora(tiempos[indiceTormenta])
        });
    }

    if (eventos.length === 0) {
        return {
            nivel: "normal",
            motivo:
                "No se superan los umbrales "
                + "meteorológicos preliminares."
        };
    }

    const prioridadMaxima = Math.max(
        ...eventos.map((evento) => evento.prioridad)
    );

    const nivel = prioridadMaxima === 2
        ? "alerta"
        : "precaucion";

    const motivos = eventos
        .filter(
            (evento) => evento.prioridad === prioridadMaxima
        )
        .slice(0, 2)
        .map((evento) => evento.motivo)
        .join(" · ");

    return {
        nivel,
        motivo: motivos
    };
}
function recortarHorario(horario, inicio, fin) {
    function recortar(valores) {
        return Array.isArray(valores)
            ? valores.slice(inicio, fin)
            : [];
    }

    return {
        wind_speed_10m: recortar(
            horario.wind_speed_10m
        ),
        wind_gusts_10m: recortar(
            horario.wind_gusts_10m
        ),
        precipitation: recortar(
            horario.precipitation
        ),
        weather_code: recortar(
            horario.weather_code
        )
    };
}

function evaluarAlertaExtendida(horario, tiempos) {
    const periodos = [
        {
            horario: recortarHorario(horario, 24, 48),
            tiempos: tiempos.slice(24, 48)
        },
        {
            horario: recortarHorario(horario, 48, 72),
            tiempos: tiempos.slice(48, 72)
        }
    ];

    const resultados = periodos.map(
        (periodo) => evaluarAlertaMeteorologica(
            periodo.horario,
            periodo.tiempos
        )
    );

    const prioridades = {
        normal: 0,
        precaucion: 1,
        alerta: 2
    };

    const resultadoPrincipal = resultados.reduce(
        (principal, resultado) => {
            const prioridadPrincipal =
                prioridades[principal.nivel] ?? 0;

            const prioridadResultado =
                prioridades[resultado.nivel] ?? 0;

            return prioridadResultado
                > prioridadPrincipal
                ? resultado
                : principal;
        }
    );

    if (resultadoPrincipal.nivel === "normal") {
        return {
            nivel: "normal",
            motivo:
                "No se superan los umbrales "
                + "entre las 24 y 72 horas."
        };
    }

    return resultadoPrincipal;
}

function escribirAlertaExtendida(resultado) {
    const panel = elemento("alerta-extendida");

    if (!panel) {
        return;
    }

    panel.classList.remove(
        "alerta-pendiente",
        "alerta-normal",
        "alerta-precaucion",
        "alerta-alerta"
    );

    panel.classList.add(`alerta-${resultado.nivel}`);

    const etiquetas = {
        normal: "Normal",
        precaucion: "Precaución",
        alerta: "Alerta"
    };

    elemento("alerta-extendida-nivel").textContent =
        etiquetas[resultado.nivel] || "Sin evaluar";

    elemento("alerta-extendida-motivo").textContent =
        resultado.motivo;
}

    function escribirPronostico(datos) {
        const horario = datos.hourly || {};
        const unidades = datos.hourly_units || {};
        const tiempos = horario.time || [];

        elemento("lluvia-24h").textContent =
            `${formatearNumero(
                sumarPrimerasHoras(
                    horario.precipitation,
                    24
                )
            )} ${unidades.precipitation || "mm"}`;

        elemento("lluvia-48h").textContent =
            `${formatearNumero(
                sumarPrimerasHoras(
                    horario.precipitation,
                    48
                )
            )} ${unidades.precipitation || "mm"}`;

        elemento("lluvia-72h").textContent =
            `${formatearNumero(
                sumarPrimerasHoras(
                    horario.precipitation,
                    72
                )
            )} ${unidades.precipitation || "mm"}`;

        const rafaga = indiceMaximo(
            horario.wind_gusts_10m
        );

        elemento("rafaga-maxima").textContent =
            `${formatearNumero(rafaga.valor)} `
            + `${unidades.wind_gusts_10m || "km/h"}`;

        elemento(
            "hora-rafaga-maxima"
        ).textContent = formatearHora(
            tiempos[rafaga.indice]
        );

        const lluvia = indiceMaximo(
            horario.precipitation
        );

        elemento("lluvia-maxima").textContent =
            `${formatearNumero(lluvia.valor)} `
            + `${unidades.precipitation || "mm"}`;

        elemento(
            "hora-lluvia-maxima"
        ).textContent = formatearHora(
            tiempos[lluvia.indice]
        );

        const temperaturas = rango(
            horario.temperature_2m
        );

        elemento("rango-temperatura").textContent =
            `${formatearNumero(temperaturas.minimo)}`
            + " a "
            + `${formatearNumero(temperaturas.maximo)} `
            + `${unidades.temperature_2m || "°C"}`;

        const probabilidad = indiceMaximo(
            horario.precipitation_probability
        );

        elemento(
            "probabilidad-maxima"
        ).textContent =
            `${formatearNumero(
                probabilidad.valor,
                0
            )} ${unidades.precipitation_probability
            || "%"
            }`;

        elemento(
            "hora-probabilidad-maxima"
        ).textContent = formatearHora(
            tiempos[probabilidad.indice]
        );
        escribirAlerta(
    evaluarAlertaMeteorologica(horario, tiempos)
);
escribirAlertaExtendida(
    evaluarAlertaExtendida(horario, tiempos)
);
    }

    async function seleccionarActivo(feature) {
        const coordenadas = coordenadaActivo(feature);

        if (!coordenadas) {
            return;
        }
        window.seleccionarActivoMeteorologico = seleccionarActivo;

        const [longitud, latitud] = coordenadas;
        const propiedades = feature.properties || {};

        if (controladorActivo) {
            controladorActivo.abort();
        }

        controladorActivo = new AbortController();

        elemento("clima-activo").textContent =
            propiedades.nombre || "Activo sin nombre";

        elemento("clima-coordenadas").textContent =
            `Latitud ${formatearNumero(latitud, 5)}`
            + " · "
            + `Longitud ${formatearNumero(longitud, 5)}`;

        mostrarEstado("cargando");

        try {
            const respuesta = await fetch(
                construirUrl(latitud, longitud),
                {
                    signal: controladorActivo.signal
                }
            );

            if (!respuesta.ok) {
                throw new Error(
                    `Respuesta meteorológica ${respuesta.status}`
                );
            }

            const datos = await respuesta.json();

escribirActual(datos);
escribirPronostico(datos);
window.dispatchEvent(
    new CustomEvent(
        "gridvision:pronostico-activo",
        {
            detail: {
                nombre:
                    propiedades.nombre
                    || "Activo sin nombre",
                latitud,
                longitud,
                datos
            }
        }
    )
);
mostrarEstado("contenido");
        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }

            console.error(error);

            elemento("clima-error").textContent =
                "No fue posible obtener el pronóstico. "
                + "Revisa la conexión a internet "
                + "e inténtalo nuevamente.";

            mostrarEstado("error");
        }
    }
    function inicializar() {
    elemento("cerrar-clima").addEventListener(
        "click",
        ocultar
    );

    ocultar();
}
    function ocultar() {
        if (controladorActivo) {
            controladorActivo.abort();
            controladorActivo = null;
        }

        elemento("panel-clima").hidden = true;
    }

    window.GridVisionClima = {
        inicializar,
        seleccionarActivo,
        ocultar
    };
})();
window.abrirActivoMeteorologicoPorId = function (activoId) {
    const feature = window.featuresGridVision?.find((item) => {
        const propiedades = item.properties || {};

        return (
            propiedades.id === activoId ||
            propiedades.ID === activoId ||
            item.id === activoId
        );
    });

    if (!feature) {
        console.warn(
            "GridVision: no se encontró el activo:",
            activoId
        );
        return;
    }

    if (
        typeof window.seleccionarActivoMeteorologico
        !== "function"
    ) {
        console.warn(
            "GridVision: no está disponible "
            + "seleccionarActivoMeteorologico()."
        );
        return;
    }

    window.seleccionarActivoMeteorologico(feature);
};