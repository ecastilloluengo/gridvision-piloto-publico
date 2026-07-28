(() => {
    "use strict";

    const RADIO_TIERRA_KM = 6371.0088;

    function convertirRadianes(grados) {
        return grados * Math.PI / 180;
    }

    function distanciaKm(puntoA, puntoB) {
        const [longitudA, latitudA] = puntoA;
        const [longitudB, latitudB] = puntoB;

        const diferenciaLatitud =
            convertirRadianes(latitudB - latitudA);

        const diferenciaLongitud =
            convertirRadianes(longitudB - longitudA);

        const latitudARadianes =
            convertirRadianes(latitudA);

        const latitudBRadianes =
            convertirRadianes(latitudB);

        const termino =
            Math.sin(diferenciaLatitud / 2) ** 2
            + Math.cos(latitudARadianes)
            * Math.cos(latitudBRadianes)
            * Math.sin(diferenciaLongitud / 2) ** 2;

        return (
            2
            * RADIO_TIERRA_KM
            * Math.atan2(
                Math.sqrt(termino),
                Math.sqrt(1 - termino)
            )
        );
    }

    function calcularLongitudLinea(coordenadas = []) {
        let longitudTotalKm = 0;

        for (
            let indice = 1;
            indice < coordenadas.length;
            indice += 1
        ) {
            longitudTotalKm += distanciaKm(
                coordenadas[indice - 1],
                coordenadas[indice]
            );
        }

        return longitudTotalKm;
    }

    function interpolarPunto(
        puntoInicial,
        puntoFinal,
        proporcion
    ) {
        const [longitudInicial, latitudInicial] =
            puntoInicial;

        const [longitudFinal, latitudFinal] =
            puntoFinal;

        return [
            longitudInicial
                + (
                    longitudFinal
                    - longitudInicial
                ) * proporcion,

            latitudInicial
                + (
                    latitudFinal
                    - latitudInicial
                ) * proporcion
        ];
    }

    function obtenerPuntoPorDistancia(
        coordenadas = [],
        distanciaObjetivoKm = 0
    ) {
        if (!Array.isArray(coordenadas)) {
            return null;
        }

        if (coordenadas.length === 0) {
            return null;
        }

        if (coordenadas.length === 1) {
            return coordenadas[0];
        }

        const longitudTotalKm =
            calcularLongitudLinea(coordenadas);

        const distanciaLimitadaKm = Math.min(
            Math.max(0, distanciaObjetivoKm),
            longitudTotalKm
        );

        let distanciaAcumuladaKm = 0;

        for (
            let indice = 1;
            indice < coordenadas.length;
            indice += 1
        ) {
            const puntoInicial =
                coordenadas[indice - 1];

            const puntoFinal =
                coordenadas[indice];

            const longitudSegmentoKm =
                distanciaKm(
                    puntoInicial,
                    puntoFinal
                );

            const siguienteAcumuladoKm =
                distanciaAcumuladaKm
                + longitudSegmentoKm;

            if (
                distanciaLimitadaKm
                <= siguienteAcumuladoKm
            ) {
                const distanciaDentroSegmentoKm =
                    distanciaLimitadaKm
                    - distanciaAcumuladaKm;

                const proporcion =
                    longitudSegmentoKm > 0
                        ? (
                            distanciaDentroSegmentoKm
                            / longitudSegmentoKm
                        )
                        : 0;

                return interpolarPunto(
                    puntoInicial,
                    puntoFinal,
                    proporcion
                );
            }

            distanciaAcumuladaKm =
                siguienteAcumuladoKm;
        }

        return coordenadas.at(-1);
    }

    function invertirCoordenadas(coordenadas = []) {
        return [...coordenadas].reverse();
    }

    function localizarFalla({
        nombreLinea = "Línea sin nombre",
        extremoReferencia = "A",
        nombreExtremoA = "Extremo A",
        nombreExtremoB = "Extremo B",
        coordenadas = [],
        distanciaKm: distanciaInformadaKm = 0,
        precisionKm = 1
    } = {}) {
        const longitudTotalKm =
            calcularLongitudLinea(coordenadas);

        const distanciaValidadaKm = Math.min(
            Math.max(
                0,
                Number(distanciaInformadaKm) || 0
            ),
            longitudTotalKm
        );

        const desdeExtremoB =
            String(extremoReferencia)
                .toUpperCase() === "B";

        const coordenadasRecorrido =
            desdeExtremoB
                ? invertirCoordenadas(coordenadas)
                : coordenadas;

        const puntoFalla =
            obtenerPuntoPorDistancia(
                coordenadasRecorrido,
                distanciaValidadaKm
            );

        const distanciaDesdeAKm =
            desdeExtremoB
                ? longitudTotalKm
                    - distanciaValidadaKm
                : distanciaValidadaKm;

        const distanciaDesdeBKm =
            longitudTotalKm
            - distanciaDesdeAKm;

        return {
            disponible: Boolean(puntoFalla),
            nombreLinea,
            nombreExtremoA,
            nombreExtremoB,
            extremoReferencia:
                desdeExtremoB ? "B" : "A",
            longitudTotalKm,
            distanciaDesdeAKm,
            distanciaDesdeBKm,
            coordenadas: puntoFalla,
            precisionKm:
                Math.max(
                    0,
                    Number(precisionKm) || 0
                )
        };
    }
let panelLocalizadorCargado = false;
let lineaSeleccionadaLocalizador = null;
let mapaLocalizador = null;
let marcadorFalla = null;

function elementoLocalizador(id) {
    return document.getElementById(id);
}

async function cargarPanelLocalizador() {
    if (panelLocalizadorCargado) {
        return;
    }

    const contenedor = elementoLocalizador(
        "contenedor-localizador-fallas"
    );

    if (!contenedor) {
        throw new Error(
            "No existe el contenedor del localizador de fallas."
        );
    }

    const respuesta = await fetch(
    "components/localizador-fallas/localizador-fallas.html",
    {
        cache: "no-store"
    }
);

    if (!respuesta.ok) {
        throw new Error(
            "No fue posible cargar el panel del localizador."
        );
    }

    contenedor.innerHTML = await respuesta.text();
    panelLocalizadorCargado = true;

    elementoLocalizador(
        "cerrar-localizador-fallas"
    )?.addEventListener(
        "click",
        cerrarPanelLocalizador
    );
    elementoLocalizador(
    "localizar-falla"
)?.addEventListener(
    "click",
    ejecutarLocalizacion
);
elementoLocalizador(
    "eliminar-falla"
)?.addEventListener(
    "click",
    eliminarMarcadorFalla
);
}
function ejecutarLocalizacion() {
    const mensaje = elementoLocalizador(
        "localizador-fallas-mensaje"
    );
    const resultadoPanel = elementoLocalizador(
        "localizador-fallas-resultado"
    );
    if (
        !lineaSeleccionadaLocalizador
        || !lineaSeleccionadaLocalizador.coordenadas.length
    ) {
        mensaje.textContent =
            "La línea seleccionada no tiene una geometría válida.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const selectorExtremo = elementoLocalizador(
        "localizador-fallas-extremo"
    );

    const entradaDistancia = elementoLocalizador(
        "localizador-fallas-distancia"
    );

    const entradaPrecision = elementoLocalizador(
        "localizador-fallas-precision"
    );

    const extremoReferencia =
        selectorExtremo.value;

    const distanciaInformadaKm =
        Number(entradaDistancia.value);

    const precisionKm =
        Number(entradaPrecision.value);

    if (
        !Number.isFinite(distanciaInformadaKm)
        || distanciaInformadaKm < 0
    ) {
        mensaje.textContent =
            "Ingresa una distancia de falla válida.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const longitudTotalKm =
        lineaSeleccionadaLocalizador.longitudTotalKm;

    if (distanciaInformadaKm > longitudTotalKm) {
        mensaje.textContent =
            `La distancia ingresada supera la longitud `
            + `GIS de la línea (${longitudTotalKm.toFixed(1)} km).`;

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    const resultado = localizarFalla({
        nombreLinea:
            lineaSeleccionadaLocalizador.nombreLinea,

        extremoReferencia,

        nombreExtremoA:
            lineaSeleccionadaLocalizador.nombreExtremoA,

        nombreExtremoB:
            lineaSeleccionadaLocalizador.nombreExtremoB,

        coordenadas:
            lineaSeleccionadaLocalizador.coordenadas,

        distanciaKm:
            distanciaInformadaKm,

        precisionKm
    });

    if (
        !resultado.disponible
        || !resultado.coordenadas
    ) {
        mensaje.textContent =
            "No fue posible calcular la ubicación de la falla.";

        mensaje.hidden = false;
        resultadoPanel.hidden = true;
        return;
    }

    mensaje.hidden = true;
    resultadoPanel.hidden = false;

    const [
        longitudFalla,
        latitudFalla
    ] = resultado.coordenadas;

    elementoLocalizador(
        "resultado-falla-linea"
    ).textContent =
        resultado.nombreLinea;

    elementoLocalizador(
        "resultado-distancia-a"
    ).textContent =
        `${resultado.distanciaDesdeAKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-distancia-b"
    ).textContent =
        `${resultado.distanciaDesdeBKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-longitud-total"
    ).textContent =
        `${resultado.longitudTotalKm.toFixed(1)} km`;

    elementoLocalizador(
        "resultado-coordenadas"
    ).textContent =
        `${latitudFalla.toFixed(6)}, `
        + `${longitudFalla.toFixed(6)}`;

    elementoLocalizador(
        "resultado-precision"
    ).textContent =
        `± ${resultado.precisionKm.toFixed(1)} km`;

    const posicionPorcentaje =
        resultado.longitudTotalKm > 0
            ? (
                resultado.distanciaDesdeAKm
                / resultado.longitudTotalKm
            ) * 100
            : 0;

    elementoLocalizador(
        "resultado-marcador-falla"
    ).style.left =
        `${Math.min(
            100,
            Math.max(0, posicionPorcentaje)
        )}%`;

    dibujarMarcadorFalla(resultado);
}

function cerrarPanelLocalizador() {
    const panel = elementoLocalizador(
        "panel-localizador-fallas"
    );

    if (panel) {
        panel.hidden = true;
    }
}
function obtenerCoordenadasFeature(feature) {
    const geometria = feature?.geometry;

    if (!geometria) {
        return [];
    }

    if (geometria.type === "LineString") {
        return geometria.coordinates || [];
    }

    if (geometria.type === "MultiLineString") {
        const lineas = geometria.coordinates || [];

        return lineas
            .map((coordenadas) => ({
                coordenadas,
                longitudKm:
                    calcularLongitudLinea(coordenadas)
            }))
            .sort(
                (a, b) =>
                    b.longitudKm - a.longitudKm
            )[0]?.coordenadas || [];
    }

    return [];
}

function obtenerNombresExtremos(nombreLinea = "") {
    const nombreLimpio = String(nombreLinea)
        .replace(/^\d+_/, "")
        .replace(
            /\s+\d+(?:[.,]\d+)?\s*KV.*$/i,
            ""
        )
        .trim();

    const partes = nombreLimpio
        .split(/\s+-\s+/)
        .map((parte) => parte.trim())
        .filter(Boolean);

    return {
        extremoA:
            partes[0]
                ? `S/E ${partes[0]}`
                : "Extremo inicial",

        extremoB:
            partes[1]
                ? `S/E ${partes[1]}`
                : "S/E Tres Puentes"
    };
}
async function abrirPanelLocalizador({
    nombreLinea = "Línea sin nombre",
    longitudTotalKm = null,
    feature = null,
    mapa = null
} = {}) {
    await cargarPanelLocalizador();

    const coordenadas =
        obtenerCoordenadasFeature(feature);

    const extremos =
        obtenerNombresExtremos(nombreLinea);

    lineaSeleccionadaLocalizador = {
        nombreLinea,
        longitudTotalKm:
            Number(longitudTotalKm),
        coordenadas,
        nombreExtremoA:
            extremos.extremoA,
        nombreExtremoB:
            extremos.extremoB,
        feature
    };

    mapaLocalizador = mapa;

    const panel = elementoLocalizador(
        "panel-localizador-fallas"
    );

    elementoLocalizador(
        "localizador-fallas-linea-nombre"
    ).textContent = nombreLinea;

    elementoLocalizador(
        "localizador-fallas-linea-longitud"
    ).textContent =
        Number.isFinite(Number(longitudTotalKm))
            ? `${Number(longitudTotalKm).toFixed(1)} km`
            : "Longitud pendiente";

    const selectorExtremo = elementoLocalizador(
        "localizador-fallas-extremo"
    );

    selectorExtremo.innerHTML = "";

    const opcionA =
        document.createElement("option");

    opcionA.value = "A";
    opcionA.textContent =
        extremos.extremoA;

    const opcionB =
        document.createElement("option");

    opcionB.value = "B";
    opcionB.textContent =
        extremos.extremoB;

    selectorExtremo.appendChild(opcionA);
    selectorExtremo.appendChild(opcionB);

    elementoLocalizador(
        "resultado-extremo-a"
    ).textContent =
        extremos.extremoA;

    elementoLocalizador(
        "resultado-extremo-b"
    ).textContent =
        extremos.extremoB;
        elementoLocalizador(
    "resultado-etiqueta-distancia-a"
).textContent =
    `Distancia desde ${extremos.extremoA}`;

elementoLocalizador(
    "resultado-etiqueta-distancia-b"
).textContent =
    `Distancia desde ${extremos.extremoB}`;

    elementoLocalizador(
        "localizador-fallas-resultado"
    ).hidden = true;

    elementoLocalizador(
        "localizador-fallas-mensaje"
    ).hidden = true;

    panel.hidden = false;
}
  function dibujarMarcadorFalla(resultado) {
    if (
        !mapaLocalizador
        || typeof L === "undefined"
        || !resultado?.coordenadas
    ) {
        return;
    }

    if (marcadorFalla) {
        mapaLocalizador.removeLayer(
            marcadorFalla
        );
    }

    const [
        longitudFalla,
        latitudFalla
    ] = resultado.coordenadas;

    const iconoFalla = L.divIcon({
        className: "gv-icono-falla",
        html: `
            <div class="gv-marcador-falla">
                ⚡
            </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
    });

    marcadorFalla = L.marker(
        [latitudFalla, longitudFalla],
        {
            icon: iconoFalla,
            title: "Ubicación estimada de falla",
            zIndexOffset: 1500
        }
    ).addTo(mapaLocalizador);

    marcadorFalla.bindPopup(`
        <div class="popup-gridvision">
            <h3>⚡ Falla estimada</h3>

            <p>
                <strong>Línea:</strong>
                ${resultado.nombreLinea}
            </p>

            <p>
                <strong>
                    Desde ${resultado.nombreExtremoA}:
                </strong>
                ${resultado.distanciaDesdeAKm.toFixed(1)} km
            </p>

            <p>
                <strong>
                    Desde ${resultado.nombreExtremoB}:
                </strong>
                ${resultado.distanciaDesdeBKm.toFixed(1)} km
            </p>

            <p>
                <strong>Coordenadas:</strong>
                ${latitudFalla.toFixed(6)},
                ${longitudFalla.toFixed(6)}
            </p>

            <p>
                <strong>Precisión declarada:</strong>
                ± ${resultado.precisionKm.toFixed(1)} km
            </p>
        </div>
    `);

    marcadorFalla.openPopup();

    mapaLocalizador.panTo(
        [latitudFalla, longitudFalla]
    );
 const botonEliminar = elementoLocalizador(
    "eliminar-falla"
);

if (botonEliminar) {
    botonEliminar.hidden = false;
}
}
function eliminarMarcadorFalla() {
    if (marcadorFalla && mapaLocalizador) {
        mapaLocalizador.removeLayer(
            marcadorFalla
        );

        marcadorFalla = null;
    }

    const botonEliminar = elementoLocalizador(
        "eliminar-falla"
    );

    if (botonEliminar) {
        botonEliminar.hidden = true;
    }

    const resultadoPanel = elementoLocalizador(
        "localizador-fallas-resultado"
    );

    if (resultadoPanel) {
        resultadoPanel.hidden = true;
    }
}
    window.GridVisionLocalizadorFallas = {
        distanciaKm,
        calcularLongitudLinea,
        obtenerPuntoPorDistancia,
        localizarFalla,
        cargarPanelLocalizador,
        abrirPanelLocalizador,
        cerrarPanelLocalizador
    };
})();