(function () {
    "use strict";

    const contenedor = document.getElementById("contenedor-centro-alertas");

    if (!contenedor) {
        console.warn(
            "GridVision: no se encontró #contenedor-centro-alertas."
        );
        return;
    }

    const estadosValidos = [
        "NORMAL",
        "PRECAUCION",
        "ALERTA",
        "CRITICO"
    ];

    function obtenerEstados() {
        return Array.isArray(window.estadoAlertas)
            ? window.estadoAlertas
            : [];
    }

    function normalizarEstado(estado) {
        const valor = String(estado || "NORMAL").toUpperCase();

        return estadosValidos.includes(valor)
            ? valor
            : "NORMAL";
    }

    function obtenerIconoEstado(estado) {
        const iconos = {
            NORMAL: "🟢",
            PRECAUCION: "🟡",
            ALERTA: "🟠",
            CRITICO: "🔴"
        };

        return iconos[normalizarEstado(estado)];
    }

    function obtenerTextoEstado(estado) {
        const textos = {
            NORMAL: "Normal",
            PRECAUCION: "Precaución",
            ALERTA: "Alerta",
            CRITICO: "Crítico"
        };

        return textos[normalizarEstado(estado)];
    }

    function contarAlertasActivas() {
        return obtenerEstados().filter((item) => {
            return normalizarEstado(item.estado) !== "NORMAL";
        }).length;
    }

    function ordenarEstados(estados) {
        const prioridad = {
            CRITICO: 1,
            ALERTA: 2,
            PRECAUCION: 3,
            NORMAL: 4
        };

        return [...estados].sort((a, b) => {
            const prioridadA = prioridad[normalizarEstado(a.estado)];
            const prioridadB = prioridad[normalizarEstado(b.estado)];

            if (prioridadA !== prioridadB) {
                return prioridadA - prioridadB;
            }

            return String(a.alias || a.nombre || "").localeCompare(
                String(b.alias || b.nombre || ""),
                "es"
            );
        });
    }

    function crearBoton() {
        const boton = document.createElement("button");

        boton.type = "button";
        boton.id = "boton-centro-alertas";
        boton.className = "boton-centro-alertas";
        boton.setAttribute("aria-expanded", "false");
        boton.setAttribute("aria-controls", "panel-centro-alertas");

        return boton;
    }

    function crearPanel() {
        const panel = document.createElement("div");

        panel.id = "panel-centro-alertas";
        panel.className = "panel-centro-alertas";
        panel.hidden = true;

        return panel;
    }

    const boton = crearBoton();
    const panel = crearPanel();

    contenedor.innerHTML = "";
    contenedor.appendChild(boton);
    contenedor.appendChild(panel);

    function actualizarBoton() {
        const cantidad = contarAlertasActivas();

        boton.innerHTML = `
            <span aria-hidden="true">🌦️</span>
            <span>Alertas</span>
            <strong>(${cantidad})</strong>
        `;
    }

    function cerrarPanel() {
        panel.hidden = true;
        boton.setAttribute("aria-expanded", "false");
    }

    function abrirPanel() {
        renderizarPanel();
        panel.hidden = false;
        boton.setAttribute("aria-expanded", "true");
    }

    function alternarPanel() {
        if (panel.hidden) {
            abrirPanel();
        } else {
            cerrarPanel();
        }
    }

    function seleccionarActivo(item) {
        cerrarPanel();

        console.log(
            "GridVision: activo seleccionado desde alertas:",
            item.id,
            item.alias || item.nombre
        );

        /*
         * En el siguiente paso conectaremos esta llamada con
         * la función real del mapa que selecciona el activo por ID.
         */
        if (typeof window.abrirActivoMeteorologicoPorId === "function") {
            window.abrirActivoMeteorologicoPorId(item.id);
            return;
        }

        console.warn(
            "GridVision: aún no existe abrirActivoMeteorologicoPorId()."
        );
    }

    function crearFila(item) {
        const estado = normalizarEstado(item.estado);
        const nombre = item.alias || item.nombre || item.id;
        const mensaje =
            item.mensaje ||
            (estado === "NORMAL"
                ? "Sin alertas meteorológicas"
                : obtenerTextoEstado(estado));

        const fila = document.createElement("button");

        fila.type = "button";
        fila.className =
            `alerta-meteorologica alerta-${estado.toLowerCase()}`;

        fila.dataset.activoId = item.id;

        fila.innerHTML = `
            <span class="alerta-meteorologica-icono" aria-hidden="true">
                ${obtenerIconoEstado(estado)}
            </span>

            <span class="alerta-meteorologica-contenido">
                <strong>${nombre}</strong>
                <small>${mensaje}</small>
            </span>

            <span class="alerta-meteorologica-estado">
                ${obtenerTextoEstado(estado)}
            </span>

            <span
                class="alerta-meteorologica-flecha"
                aria-hidden="true"
            >
                ›
            </span>
        `;

        fila.addEventListener("click", () => {
            seleccionarActivo(item);
        });

        return fila;
    }

    function renderizarPanel() {
        const estados = ordenarEstados(obtenerEstados());
        const activas = contarAlertasActivas();

        panel.innerHTML = `
            <div class="panel-alertas-encabezado">
                <div>
                    <strong>Alertas meteorológicas</strong>
                    <small>
                        ${activas} activas · ${estados.length} monitoreados
                    </small>
                </div>

                <button
                    type="button"
                    class="cerrar-panel-alertas"
                    aria-label="Cerrar alertas"
                >
                    ×
                </button>
            </div>

            <div class="panel-alertas-listado"></div>
        `;

        const listado = panel.querySelector(".panel-alertas-listado");
        const botonCerrar = panel.querySelector(".cerrar-panel-alertas");

        botonCerrar.addEventListener("click", cerrarPanel);

        if (estados.length === 0) {
            listado.innerHTML = `
                <div class="panel-alertas-vacio">
                    <span aria-hidden="true">⚪</span>

                    <div>
                        <strong>No hay activos configurados</strong>
                        <small>
                            Revisa activos-meteorologicos.js
                        </small>
                    </div>
                </div>
            `;

            return;
        }

        estados.forEach((item) => {
            listado.appendChild(crearFila(item));
        });
    }

    boton.addEventListener("click", (evento) => {
        evento.stopPropagation();
        alternarPanel();
    });

    panel.addEventListener("click", (evento) => {
        evento.stopPropagation();
    });

    document.addEventListener("click", cerrarPanel);

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            cerrarPanel();
        }
    });

    window.actualizarCentroAlertas = function () {
        actualizarBoton();

        if (!panel.hidden) {
            renderizarPanel();
        }
    };

    actualizarBoton();
})();