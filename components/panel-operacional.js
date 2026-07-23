function numeroPanel(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function formatoPanel(valor, decimales = 1) {
    const numero = numeroPanel(valor);

    if (numero === null) {
        return "—";
    }

    return numero.toLocaleString("es-CL", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales
    });
}

function sumaPanel(valores, horas) {
    return (valores || [])
        .slice(0, horas)
        .reduce(
            (total, valor) => total + (numeroPanel(valor) || 0),
            0
        );
}

function maximoPanel(valores) {
    let indice = -1;
    let valor = null;

    (valores || []).forEach((dato, posicion) => {
        const numero = numeroPanel(dato);

        if (numero !== null && (valor === null || numero > valor)) {
            valor = numero;
            indice = posicion;
        }
    });

    return { indice, valor };
}

function rangoPanel(valores) {
    const numeros = (valores || [])
        .map(numeroPanel)
        .filter((valor) => valor !== null);

    if (!numeros.length) {
        return { minimo: null, maximo: null };
    }

    return {
        minimo: Math.min(...numeros),
        maximo: Math.max(...numeros)
    };
}

function horaPanel(fechaIso) {
    if (!fechaIso) {
        return "—";
    }

    const [fecha, hora] = fechaIso.split("T");
    const [anio, mes, dia] = fecha.split("-");

    return `${dia}-${mes}-${anio} ${(hora || "").slice(0, 5)}`;
}

function evaluarRiesgoPanel(horario) {
    const rafaga = maximoPanel(
        (horario.wind_gusts_10m || []).slice(0, 24)
    ).valor;

    const viento = maximoPanel(
        (horario.wind_speed_10m || []).slice(0, 24)
    ).valor;

    const lluvia24h = sumaPanel(
        horario.precipitation,
        24
    );

    if (
        (rafaga !== null && rafaga >= 100)
        || (viento !== null && viento >= 80)
        || lluvia24h >= 80
    ) {
        return {
            nivel: "critico",
            etiqueta: "CRÍTICO",
            motivo: "Condiciones meteorológicas críticas durante las próximas 24 horas."
        };
    }

    if (
        (rafaga !== null && rafaga >= 80)
        || (viento !== null && viento >= 60)
        || lluvia24h >= 50
    ) {
        return {
            nivel: "alerta",
            etiqueta: "ALERTA",
            motivo: "Se recomienda seguimiento operacional permanente."
        };
    }

    if (
        (rafaga !== null && rafaga >= 60)
        || (viento !== null && viento >= 40)
        || lluvia24h >= 20
    ) {
        return {
            nivel: "precaucion",
            etiqueta: "PRECAUCIÓN",
            motivo: "Existen condiciones que requieren atención operacional."
        };
    }

    return {
        nivel: "normal",
        etiqueta: "NORMAL",
        motivo: "No se identifican condiciones meteorológicas críticas."
    };
}

function actualizarPanelOperacional(evento) {
    const detalle = evento.detail || {};
    const datos = detalle.datos || {};
    const horario = datos.hourly || {};
    const unidades = datos.hourly_units || {};
    const tiempos = horario.time || [];

    const rafaga = maximoPanel(horario.wind_gusts_10m);
    const temperaturas = rangoPanel(horario.temperature_2m);
    const riesgo = evaluarRiesgoPanel(horario);

    document.getElementById("panel-operacional-vacio").hidden = true;
    document.getElementById("panel-operacional-resumen").hidden = false;

    document.getElementById("operacional-activo").textContent =
        detalle.nombre || "Activo sin nombre";

    document.getElementById("operacional-rafaga").textContent =
        `${formatoPanel(rafaga.valor)} `
        + `${unidades.wind_gusts_10m || "km/h"}`;

    document.getElementById("operacional-hora-rafaga").textContent =
        horaPanel(tiempos[rafaga.indice]);

    document.getElementById("operacional-lluvia-24h").textContent =
        `${formatoPanel(sumaPanel(horario.precipitation, 24))} `
        + `${unidades.precipitation || "mm"}`;

    document.getElementById("operacional-lluvia-72h").textContent =
        `${formatoPanel(sumaPanel(horario.precipitation, 72))} `
        + `${unidades.precipitation || "mm"}`;

    document.getElementById("operacional-temperatura").textContent =
        `${formatoPanel(temperaturas.minimo)} a `
        + `${formatoPanel(temperaturas.maximo)} `
        + `${unidades.temperature_2m || "°C"}`;

    const indicador = document.getElementById("operacional-riesgo");

    indicador.className =
        `operacional-riesgo riesgo-${riesgo.nivel}`;

    indicador.textContent = riesgo.etiqueta;

    document.getElementById("operacional-motivo").textContent =
        riesgo.motivo;
}

async function cargarPanelOperacional() {
    const contenedor = document.getElementById(
        "contenedor-panel-operacional"
    );

    if (!contenedor) {
        return;
    }

    try {
        const respuesta = await fetch(
            "components/panel-operacional.html"
        );

        if (!respuesta.ok) {
            throw new Error(
                `No se pudo cargar el panel: ${respuesta.status}`
            );
        }

        contenedor.innerHTML = await respuesta.text();

        const panel = document.getElementById("panel-operacional");
        const boton = document.getElementById(
            "alternar-panel-operacional"
        );
        const contenido = document.getElementById(
            "contenido-panel-operacional"
        );

        boton.addEventListener("click", () => {
            const estaAbierto =
                boton.getAttribute("aria-expanded") === "true";

            boton.setAttribute(
                "aria-expanded",
                String(!estaAbierto)
            );

            contenido.hidden = estaAbierto;

            panel.classList.toggle(
                "panel-operacional-colapsado",
                estaAbierto
            );

            if (
                typeof mapa !== "undefined"
                && mapa.invalidateSize
            ) {
                window.setTimeout(
                    () => mapa.invalidateSize(),
                    200
                );
            }
        });

        window.addEventListener(
            "gridvision:pronostico-activo",
            actualizarPanelOperacional
        );
    } catch (error) {
        console.error(
            "Error al inicializar el Panel Operacional:",
            error
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    cargarPanelOperacional
);
