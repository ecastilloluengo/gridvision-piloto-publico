(() => {
    const bienvenida = document.getElementById("bienvenida-piloto");
    const abrir = document.getElementById("abrir-guia-piloto");
    const cerrar = document.getElementById("cerrar-guia-piloto");
    const abrirAcerca =
    document.getElementById(
        "abrir-acerca-gridvision"
    );
    const alternarFiltros = document.getElementById("alternar-filtros");
    const filtros = document.getElementById("panel-filtros");

    function abrirGuia() {
        bienvenida.hidden = false;
        cerrar.focus();
    }

    function cerrarGuia() {
        bienvenida.hidden = true;
        abrir.focus();
    }

    abrir.addEventListener("click", abrirGuia);
    cerrar.addEventListener("click", cerrarGuia);
    abrirAcerca?.addEventListener(
    "click",
    () => {
        window.GridVisionAcerca
            ?.abrirPanelAcerca();
    }
);

    alternarFiltros.addEventListener("click", () => {
        const abierto = filtros.classList.toggle("panel-filtros-abierto");
        alternarFiltros.setAttribute("aria-expanded", String(abierto));
    });

    bienvenida.addEventListener("click", (evento) => {
        if (evento.target === bienvenida) {
            cerrarGuia();
        }
    });

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && !bienvenida.hidden) {
            cerrarGuia();
        }
    });

    abrirGuia();
})();
