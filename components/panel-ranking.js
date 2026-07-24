(() => {
    function obtenerDependencias() {
        const formatoPanel =
            window.GridVisionPanelUtilidades?.formatoPanel;

        const horaPanel =
            window.GridVisionPanelUtilidades?.horaPanel;

        const claseRiesgoLineaPanel =
            window.GridVisionPanelUtilidades
                ?.claseRiesgoLineaPanel;

        if (
            !formatoPanel
            || !horaPanel
            || !claseRiesgoLineaPanel
        ) {
            throw new Error(
                "No están disponibles las utilidades del panel operacional."
            );
        }

        return {
            formatoPanel,
            horaPanel,
            claseRiesgoLineaPanel
        };
    }

    function nombreTramo(resultado) {
        if (typeof resultado?.tramo === "string") {
            return resultado.tramo;
        }

        return resultado?.tramo?.nombre
            || resultado?.tramo?.etiqueta
            || "Tramo";
    }

    function construirRankingLinea(ranking) {
        const contenedor = document.getElementById(
            "timeline-operacional-contenido"
        );

        if (!contenedor) {
            return;
        }

        contenedor.innerHTML = "";

        const {
            formatoPanel,
            horaPanel,
            claseRiesgoLineaPanel
        } = obtenerDependencias();

        (ranking || [])
            .filter(
                (resultado) =>
                    resultado?.disponible !== false
            )
            .slice(0, 8)
            .forEach((resultado) => {
                const riesgo =
                    claseRiesgoLineaPanel(
                        resultado.nivel?.etiqueta
                        || resultado.nivel?.nombre
                        || resultado.nivel
                    );

                const tarjeta =
                    document.createElement("article");

                tarjeta.className =
                    "timeline-operacional-item";

                tarjeta.innerHTML = `
                    <strong class="timeline-operacional-hora">
                        ${nombreTramo(resultado)}
                    </strong>

                    <div class="timeline-operacional-dato">
                        <span>Ráfaga</span>
                        <strong>
                            ${formatoPanel(resultado.rafaga)}
                            km/h
                        </strong>
                    </div>

                    <div class="timeline-operacional-dato">
                        <span>Transversal</span>
                        <strong>
                            ${formatoPanel(
                                resultado.transversal
                            )}
                            km/h
                        </strong>
                    </div>

                    <div class="timeline-operacional-dato">
                        <span>Hora</span>
                        <strong>
                            ${horaPanel(resultado.hora)}
                        </strong>
                    </div>

                    <div
                        class="
                            timeline-riesgo
                            timeline-riesgo-${riesgo.clase}
                        "
                    >
                        ${riesgo.etiqueta}
                    </div>
                `;

                contenedor.appendChild(tarjeta);
            });
    }

    window.GridVisionPanelRanking = {
        construirRankingLinea
    };
})();