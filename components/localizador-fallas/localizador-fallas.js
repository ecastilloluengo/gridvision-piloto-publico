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

    window.GridVisionLocalizadorFallas = {
        distanciaKm,
        calcularLongitudLinea,
        obtenerPuntoPorDistancia,
        localizarFalla
    };
})();