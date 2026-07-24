(() => {
    function obtenerDependencias() {
        const configuracion =
            window.GridVisionIROConfig;

        const interpolacion =
            window.GridVisionIROInterpolacion;

        const clasificacion =
            window.GridVisionIROClasificacion;

        if (
            !configuracion
            || !interpolacion
            || !clasificacion
        ) {
            throw new Error(
                "El módulo IRO no tiene todas sus dependencias cargadas."
            );
        }

        return {
            configuracion,
            interpolacion,
            clasificacion
        };
    }

    function numeroSeguro(valor, valorPorDefecto = 0) {
        const numero = Number(valor);

        return Number.isFinite(numero)
            ? numero
            : valorPorDefecto;
    }

    function calcularPuntajes(datos) {
        const {
            configuracion,
            interpolacion
        } = obtenerDependencias();

        const {
            CURVAS_IRO,
            PESOS_LLUVIA
        } = configuracion;

        const {
            interpolar,
            redondearPuntaje
        } = interpolacion;

        const puntajeRafaga = interpolar(
            numeroSeguro(datos.rafaga),
            CURVAS_IRO.rafaga
        );

        const puntajeTransversal = interpolar(
            numeroSeguro(datos.transversal),
            CURVAS_IRO.transversal
        );

        const puntajeViento = interpolar(
            numeroSeguro(datos.viento),
            CURVAS_IRO.viento
        );

        const puntajeLluvia24h = interpolar(
            numeroSeguro(datos.lluvia24h),
            CURVAS_IRO.lluvia24h
        );

        const puntajeLluviaHora = interpolar(
            numeroSeguro(datos.lluviaHora),
            CURVAS_IRO.lluviaHora
        );

        const puntajeTendencia = interpolar(
            numeroSeguro(datos.tendencia),
            CURVAS_IRO.tendencia
        );

        const puntajeLluvia =
            PESOS_LLUVIA.acumulada24h
                * puntajeLluvia24h
            + PESOS_LLUVIA.maximaHoraria
                * puntajeLluviaHora;

        return {
            rafaga:
                redondearPuntaje(puntajeRafaga),

            transversal:
                redondearPuntaje(
                    puntajeTransversal
                ),

            viento:
                redondearPuntaje(puntajeViento),

            lluvia24h:
                redondearPuntaje(
                    puntajeLluvia24h
                ),

            lluviaHora:
                redondearPuntaje(
                    puntajeLluviaHora
                ),

            lluvia:
                redondearPuntaje(puntajeLluvia),

            tendencia:
                redondearPuntaje(
                    puntajeTendencia
                )
        };
    }

    function calcularAportes(puntajes) {
        const {
            configuracion,
            interpolacion
        } = obtenerDependencias();

        const {
            PESOS_IRO
        } = configuracion;

        const {
            redondearPuntaje
        } = interpolacion;

        return {
            rafaga:
                redondearPuntaje(
                    PESOS_IRO.rafaga
                    * puntajes.rafaga
                ),

            transversal:
                redondearPuntaje(
                    PESOS_IRO.transversal
                    * puntajes.transversal
                ),

            viento:
                redondearPuntaje(
                    PESOS_IRO.viento
                    * puntajes.viento
                ),

            lluvia:
                redondearPuntaje(
                    PESOS_IRO.lluvia
                    * puntajes.lluvia
                ),

            tendencia:
                redondearPuntaje(
                    PESOS_IRO.tendencia
                    * puntajes.tendencia
                )
        };
    }

    function factoresPrincipales(aportes) {
        return Object.entries(aportes)
            .map(([factor, aporte]) => ({
                factor,
                aporte
            }))
            .sort(
                (a, b) =>
                    b.aporte - a.aporte
            )
            .slice(0, 3);
    }

    function calcularIRO(datos = {}) {
        const {
            interpolacion,
            clasificacion
        } = obtenerDependencias();

        const puntajes =
            calcularPuntajes(datos);

        const aportes =
            calcularAportes(puntajes);

        const suma =
            aportes.rafaga
            + aportes.transversal
            + aportes.viento
            + aportes.lluvia
            + aportes.tendencia;

        const iro =
            interpolacion.redondearPuntaje(
                suma
            );

        const nivel =
            clasificacion.clasificarIRO(iro);

        const tendencia =
            clasificacion.describirTendencia(
                numeroSeguro(datos.tendencia)
            );

        return {
            iro,
            nivel,
            tendencia,
            puntajes,
            aportes,
            factoresPrincipales:
                factoresPrincipales(aportes)
        };
    }

    window.GridVisionIROCalculadora = {
        calcularIRO,
        calcularPuntajes,
        calcularAportes,
        factoresPrincipales
    };
})();