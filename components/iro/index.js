(() => {
    function obtenerCalculadora() {
        const calculadora =
            window.GridVisionIROCalculadora;

        if (!calculadora) {
            throw new Error(
                "La calculadora IRO no está disponible."
            );
        }

        return calculadora;
    }

    function calcular(datos = {}) {
        return obtenerCalculadora()
            .calcularIRO(datos);
    }

    function probarEscenarios() {
        const casos = {
            normal: {
                rafaga: 40,
                transversal: 30,
                viento: 25,
                lluvia24h: 5,
                lluviaHora: 1,
                tendencia: 0
            },

            moderado: {
                rafaga: 75,
                transversal: 65,
                viento: 55,
                lluvia24h: 40,
                lluviaHora: 8,
                tendencia: 10
            },

            severo: {
                rafaga: 105,
                transversal: 95,
                viento: 85,
                lluvia24h: 90,
                lluviaHora: 22,
                tendencia: 25
            }
        };

        return Object.fromEntries(
            Object.entries(casos).map(
                ([nombre, datos]) => [
                    nombre,
                    calcular(datos)
                ]
            )
        );
    }

    window.GridVisionIRO = {
        calcular,
        probarEscenarios
    };
})();