(() => {

    const abrirAdministracion =
        document.getElementById(
            "abrir-administracion-accesos"
        );

    const alternarFiltros =
        document.getElementById("alternar-filtros");

    const filtros =
        document.getElementById("panel-filtros");
        const minimizarPanelFiltros =
    document.getElementById(
        "minimizar-panel-filtros"
    );

        abrirAdministracion?.addEventListener(
        "click",
        () => {
            window.GridVisionAdministracionAccesos
                ?.abrirPanel();
        }
    );

    alternarFiltros.addEventListener(
        "click",
        () => {
            const abierto =
                filtros.classList.toggle(
                    "panel-filtros-abierto"
                );

            alternarFiltros.setAttribute(
                "aria-expanded",
                String(abierto)
            );
        }
    );
minimizarPanelFiltros?.addEventListener(
    "click",
    () => {

        const minimizado =
            minimizarPanelFiltros.textContent.trim() === "\u2212";

        const elementos =
            Array.from(filtros.children);

        for (const elemento of elementos) {

            if (
                elemento.classList.contains(
                    "cabecera-filtros"
                )
            ) {
                continue;
            }

            elemento.style.display =
                minimizado ? "none" : "";
        }

        minimizarPanelFiltros.textContent =
            minimizado ? "+" : "\u2212";

        minimizarPanelFiltros.title =
            minimizado
                ? "Mostrar filtros"
                : "Minimizar filtros";

        minimizarPanelFiltros.setAttribute(
            "aria-label",
            minimizado
                ? "Mostrar filtros"
                : "Minimizar filtros"
        );
    }
);
})();
