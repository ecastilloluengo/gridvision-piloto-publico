(() => {
    const NIVELES_IRO = [
        {
            minimo: 75,
            nivel: "critico",
            etiqueta: "CRÍTICO",
            color: "#dc2626",
            mensaje:
                "Condición crítica. Requiere monitoreo operacional permanente."
        },
        {
            minimo: 50,
            nivel: "alto",
            etiqueta: "ALTO",
            color: "#f97316",
            mensaje:
                "Condición de riesgo alto. Se recomienda reforzar el seguimiento."
        },
        {
            minimo: 25,
            nivel: "moderado",
            etiqueta: "MODERADO",
            color: "#eab308",
            mensaje:
                "Condición moderada. Mantener atención sobre la evolución."
        },
        {
            minimo: 0,
            nivel: "bajo",
            etiqueta: "BAJO",
            color: "#16a34a",
            mensaje:
                "Condición de riesgo bajo. Sin factores críticos identificados."
        }
    ];

    function clasificarIRO(valor) {
        const numero = Number(valor);

        const iro = Number.isFinite(numero)
            ? Math.min(100, Math.max(0, numero))
            : 0;

        return NIVELES_IRO.find(
            (nivel) => iro >= nivel.minimo
        ) || NIVELES_IRO.at(-1);
    }

    function describirTendencia(variacion) {
        const numero = Number(variacion);

        if (!Number.isFinite(numero)) {
            return {
                id: "sin-datos",
                etiqueta: "SIN DATOS",
                simbolo: "—"
            };
        }

        if (numero >= 10) {
            return {
                id: "subiendo",
                etiqueta: "SUBIENDO",
                simbolo: "↑"
            };
        }

        if (numero <= -10) {
            return {
                id: "bajando",
                etiqueta: "BAJANDO",
                simbolo: "↓"
            };
        }

        return {
            id: "estable",
            etiqueta: "ESTABLE",
            simbolo: "→"
        };
    }

    window.GridVisionIROClasificacion = {
        NIVELES_IRO,
        clasificarIRO,
        describirTendencia
    };
})();