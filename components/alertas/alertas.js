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
        "CRITICO",
        "PENDIENTE",
        "SIN_DATOS"
    ];

    function obtenerEstados() {
        return Array.isArray(window.estadoAlertas)
            ? window.estadoAlertas
            : [];
    }

    function normalizarEstado(estado) {
        const valor = String(estado || "PENDIENTE").toUpperCase();

        return estadosValidos.includes(valor)
            ? valor
            : "SIN_DATOS";
    }

    function esAlertaActiva(estado) {
        return [
            "PRECAUCION",
            "ALERTA",
            "CRITICO"
        ].includes(normalizarEstado(estado));
    }

    function obtenerIconoEstado(estado) {
        const iconos = {
            NORMAL: "🟢",
            PRECAUCION: "🟡",
            ALERTA: "🟠",
            CRITICO: "🔴",
            PENDIENTE: "⏳",
            SIN_DATOS: "⚪"
        };

        return iconos[normalizarEstado(estado)];
    }

    function obtenerTextoEstado(estado) {
        const textos = {
            NORMAL: "Normal",
            PRECAUCION: "Precaución",
            ALERTA: "Alerta",
            CRITICO: "Crítico",
            PENDIENTE: "Evaluando",
            SIN_DATOS: "Sin datos"
        };

        return textos[normalizarEstado(estado)];
    }

    function contarAlertasActivas() {
        return obtenerEstados().filter((item) =>
            esAlertaActiva(item.estado)
        ).length;
    }

    function contarPorEstado(estado) {
        return obtenerEstados().filter(
            (item) => normalizarEstado(item.estado) === estado
        ).length;
    }

    function ordenarEstados(estados) {
        const prioridad = {
            CRITICO: 1,
            ALERTA: 2,
            PRECAUCION: 3,
            PENDIENTE: 4,
            SIN_DATOS: 5,
            NORMAL: 6
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

        boton.dataset.nivel = (() => {
            const estados = obtenerEstados().map((item) =>
                normalizarEstado(item.estado)
            );

            if (estados.includes("CRITICO")) return "critico";
            if (estados.includes("ALERTA")) return "alerta";
            if (estados.includes("PRECAUCION")) return "precaucion";
            return "normal";
        })();
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

        if (typeof window.abrirActivoMeteorologicoPorId === "function") {
            window.abrirActivoMeteorologicoPorId(item.id);
            return;
        }

        console.warn(
            "GridVision: no está disponible abrirActivoMeteorologicoPorId()."
        );
    }

    function crearFila(item) {
        const estado = normalizarEstado(item.estado);
        const nombre = item.alias || item.nombre || item.id;
        const mensaje =
            item.mensaje
            || (
                estado === "NORMAL"
                    ? "Sin alertas meteorológicas"
                    : obtenerTextoEstado(estado)
            );

        const fila = document.createElement("button");

        fila.type = "button";
        fila.className =
            `alerta-centro alerta-${estado.toLowerCase()}`;

        fila.dataset.activoId = item.id;

        const icono = document.createElement("span");
        icono.className = "alerta-centro-icono";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = obtenerIconoEstado(estado);

        const contenido = document.createElement("span");
        contenido.className = "alerta-centro-contenido";

        const titulo = document.createElement("strong");
        titulo.textContent = nombre;

        const detalle = document.createElement("small");
        detalle.textContent = mensaje;

        contenido.appendChild(titulo);
        contenido.appendChild(detalle);

        const estadoVisual = document.createElement("span");
        estadoVisual.className = "alerta-centro-estado";
        estadoVisual.textContent = obtenerTextoEstado(estado);

        const flecha = document.createElement("span");
        flecha.className = "alerta-centro-flecha";
        flecha.setAttribute("aria-hidden", "true");
        flecha.textContent = "›";

        fila.appendChild(icono);
        fila.appendChild(contenido);
        fila.appendChild(estadoVisual);
        fila.appendChild(flecha);

        fila.addEventListener("click", () => {
            seleccionarActivo(item);
        });

        return fila;
    }

    async function actualizarAhora(botonActualizar) {
        const monitor = window.GridVisionAlertasMeteorologicas;

        if (!monitor?.actualizarAhora) {
            return;
        }

        botonActualizar.disabled = true;
        botonActualizar.textContent = "…";

        try {
            await monitor.actualizarAhora();
        } finally {
            botonActualizar.disabled = false;
            botonActualizar.textContent = "↻";

            if (!panel.hidden) {
                renderizarPanel();
            }
        }
    }

    function renderizarPanel() {
        const estados = ordenarEstados(obtenerEstados());
        const activas = contarAlertasActivas();
        const pendientes = contarPorEstado("PENDIENTE");
        const sinDatos = contarPorEstado("SIN_DATOS");
        const intervalo =
            window.GridVisionAlertasMeteorologicas?.intervaloMinutos
            || 15;

        panel.innerHTML = "";

        const encabezado = document.createElement("div");
        encabezado.className = "panel-alertas-encabezado";

        const bloqueTitulo = document.createElement("div");

        const titulo = document.createElement("strong");
        titulo.textContent = "Alertas meteorológicas";

        const resumen = document.createElement("small");

        const partes = [
            `${activas} activas`,
            `${estados.length} monitoreados`
        ];

        if (pendientes > 0) {
            partes.push(`${pendientes} evaluando`);
        }

        if (sinDatos > 0) {
            partes.push(`${sinDatos} sin datos`);
        }

        partes.push(`cada ${intervalo} min`);

        resumen.textContent = partes.join(" · ");

        bloqueTitulo.appendChild(titulo);
        bloqueTitulo.appendChild(resumen);

        const acciones = document.createElement("div");
        acciones.className = "panel-alertas-acciones";

        const botonActualizar = document.createElement("button");
        botonActualizar.type = "button";
        botonActualizar.className = "actualizar-panel-alertas";
        botonActualizar.title = "Actualizar pronóstico ahora";
        botonActualizar.setAttribute(
            "aria-label",
            "Actualizar pronóstico ahora"
        );
        botonActualizar.textContent = "↻";

        const botonCerrar = document.createElement("button");
        botonCerrar.type = "button";
        botonCerrar.className = "cerrar-panel-alertas";
        botonCerrar.setAttribute("aria-label", "Cerrar alertas");
        botonCerrar.textContent = "×";

        acciones.appendChild(botonActualizar);
        acciones.appendChild(botonCerrar);

        encabezado.appendChild(bloqueTitulo);
        encabezado.appendChild(acciones);

        const listado = document.createElement("div");
        listado.className = "panel-alertas-listado";

        panel.appendChild(encabezado);
        panel.appendChild(listado);

        botonCerrar.addEventListener("click", cerrarPanel);
        botonActualizar.addEventListener(
            "click",
            () => actualizarAhora(botonActualizar)
        );

        if (estados.length === 0) {
            listado.innerHTML = `
                <div class="panel-alertas-vacio">
                    <span aria-hidden="true">⚪</span>
                    <div>
                        <strong>No hay activos configurados</strong>
                        <small>Revisa activos-meteorologicos.js</small>
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