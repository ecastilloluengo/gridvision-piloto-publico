(() => {
    "use strict";

    let panelAcercaCargado = false;

    function elementoAcerca(id) {
        return document.getElementById(id);
    }

    async function cargarPanelAcerca() {
        if (panelAcercaCargado) {
            return;
        }

        const contenedor = elementoAcerca(
            "contenedor-acerca-gridvision"
        );

        if (!contenedor) {
            throw new Error(
                "No existe el contenedor del panel Acerca de GridVision."
            );
        }

        const respuesta = await fetch(
            "components/acerca-gridvision/acerca-gridvision.html",
            {
                cache: "no-store"
            }
        );

        if (!respuesta.ok) {
            throw new Error(
                "No fue posible cargar el panel Acerca de GridVision."
            );
        }

        contenedor.innerHTML =
            await respuesta.text();

        panelAcercaCargado = true;

        elementoAcerca(
            "cerrar-acerca-gridvision"
        )?.addEventListener(
            "click",
            cerrarPanelAcerca
        );
    }

    async function abrirPanelAcerca() {
        await cargarPanelAcerca();

        const panel = elementoAcerca(
            "panel-acerca-gridvision"
        );

        if (panel) {
            panel.hidden = false;
        }
    }

    function cerrarPanelAcerca() {
        const panel = elementoAcerca(
            "panel-acerca-gridvision"
        );

        if (panel) {
            panel.hidden = true;
        }
    }

    window.GridVisionAcerca = {
        cargarPanelAcerca,
        abrirPanelAcerca,
        cerrarPanelAcerca
    };
})();