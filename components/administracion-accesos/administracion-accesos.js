(() => {
    "use strict";

    let panelCargado = false;
    let usuarios = [];

    function elemento(id) {
        return document.getElementById(id);
    }

    async function cargarPanel() {
        if (panelCargado) {
            return;
        }

        const contenedor = elemento(
            "contenedor-administracion-accesos"
        );

        if (!contenedor) {
            throw new Error(
                "No existe el contenedor de Administración de Accesos."
            );
        }

        const respuesta = await fetch(
            "components/administracion-accesos/administracion-accesos.html",
            {
                cache: "no-store"
            }
        );

        if (!respuesta.ok) {
            throw new Error(
                "No fue posible cargar Administración de Accesos."
            );
        }

        contenedor.innerHTML =
            await respuesta.text();

        usuarios =
            window
                .GridVisionAlmacenamientoAccesos
                .cargarUsuarios();

        panelCargado = true;

        conectarEventos();
        actualizarPanel();
    }

    function conectarEventos() {
        elemento(
            "cerrar-administracion-accesos"
        )?.addEventListener(
            "click",
            cerrarPanel
        );

        elemento(
            "buscar-usuario-acceso"
        )?.addEventListener(
            "input",
            actualizarPanel
        );
    }

    function actualizarPanel() {
        actualizarResumen();
        renderizarUsuarios();
    }

    function actualizarResumen() {
        const total = usuarios.length;

        const activos = usuarios.filter(
            (usuario) =>
                window
                    .GridVisionUsuarios
                    .tieneAccesoVigente(usuario)
        ).length;

        const caducados = usuarios.filter(
            (usuario) =>
                window
                    .GridVisionUsuarios
                    .obtenerEstadoVisual(usuario)
                    .estado
                === window
                    .GridVisionUsuarios
                    .ESTADOS
                    .CADUCADO
        ).length;

        elemento(
            "resumen-usuarios-total"
        ).textContent = String(total);

        elemento(
            "resumen-usuarios-activos"
        ).textContent = String(activos);

        elemento(
            "resumen-usuarios-caducados"
        ).textContent = String(caducados);
    }

    function obtenerUsuariosFiltrados() {
        const consulta =
            elemento(
                "buscar-usuario-acceso"
            )
            ?.value
            ?.trim()
            ?.toLowerCase()
            || "";

        if (!consulta) {
            return usuarios;
        }

        return usuarios.filter(
            (usuario) => {
                const texto = [
                    usuario.nombre,
                    usuario.correo,
                    usuario.empresa,
                    usuario.cargo,
                    usuario.rol
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return texto.includes(consulta);
            }
        );
    }

    function renderizarUsuarios() {
        const lista = elemento(
            "lista-usuarios-acceso"
        );

        if (!lista) {
            return;
        }

        const usuariosFiltrados =
            obtenerUsuariosFiltrados();

        if (!usuariosFiltrados.length) {
            lista.innerHTML = `
                <div class="admin-accesos-sin-resultados">
                    No se encontraron usuarios.
                </div>
            `;

            return;
        }

        lista.innerHTML =
            usuariosFiltrados
                .map(crearTarjetaUsuario)
                .join("");
    }

    function crearTarjetaUsuario(usuario) {
        const esOwner =
            window
                .GridVisionUsuarios
                .esOwner(usuario);

        const estadoVisual =
            window
                .GridVisionUsuarios
                .obtenerEstadoVisual(usuario);

        const rol =
            window
                .GridVisionUsuarios
                .obtenerRol(usuario.rol);

        const vigencia =
            obtenerTextoVigencia(usuario);

        const claseOwner =
            esOwner
                ? "admin-accesos-usuario-owner"
                : "";

        const claseEstado =
            obtenerClaseEstado(
                estadoVisual.estado
            );

        return `
            <article
                class="
                    admin-accesos-usuario
                    ${claseOwner}
                "
                data-usuario-id="${usuario.id}"
            >
                <div class="admin-accesos-usuario-principal">
                    <div class="admin-accesos-identidad">
                        <div class="admin-accesos-avatar">
                            ${esOwner ? "👑" : "👤"}
                        </div>

                        <div>
                            <h3>
                                ${escaparHtml(usuario.nombre)}
                            </h3>

                            <p>
                                ${escaparHtml(
                                    usuario.cargo
                                    || "Sin cargo informado"
                                )}
                                ·
                                ${escaparHtml(
                                    usuario.empresa
                                    || "Sin empresa informada"
                                )}
                            </p>
                        </div>
                    </div>

                    <div class="admin-accesos-insignias">
                        <span
                            class="
                                admin-accesos-insignia
                                ${
                                    esOwner
                                        ? "admin-accesos-insignia-owner"
                                        : "admin-accesos-insignia-rol"
                                }
                            "
                        >
                            ${escaparHtml(
                                rol?.nombre
                                || usuario.rol
                            )}
                        </span>

                        <span
                            class="
                                admin-accesos-insignia
                                ${claseEstado}
                            "
                        >
                            ${escaparHtml(
                                estadoVisual.etiqueta
                            )}
                        </span>
                    </div>

                    <div class="admin-accesos-vigencia">
                        ${escaparHtml(vigencia)}
                    </div>
                </div>

                <div class="admin-accesos-acciones">
                    ${
                        esOwner
                            ? `
                                <span
                                    class="admin-accesos-vigencia"
                                >
                                    Usuario protegido
                                </span>
                            `
                            : `
                                <button
                                    type="button"
                                    class="admin-accesos-accion"
                                >
                                    Cambiar rol
                                </button>

                                <button
                                    type="button"
                                    class="admin-accesos-accion"
                                >
                                    Renovar
                                </button>

                                <button
                                    type="button"
                                    class="admin-accesos-accion"
                                >
                                    Desactivar
                                </button>

                                <button
                                    type="button"
                                    class="
                                        admin-accesos-accion
                                        admin-accesos-accion-peligro
                                    "
                                >
                                    Eliminar
                                </button>
                            `
                    }
                </div>
            </article>
        `;
    }

    function obtenerTextoVigencia(usuario) {
        if (!usuario.fechaExpiracion) {
            return "Sin fecha de expiración";
        }

        const dias =
            window
                .GridVisionUsuarios
                .calcularDiasRestantes(usuario);

        if (dias < 0) {
            return `Caducado hace ${Math.abs(
                dias
            )} día(s)`;
        }

        if (dias === 0) {
            return "Expira hoy";
        }

        if (dias === 1) {
            return "Expira mañana";
        }

        return `Expira en ${dias} días`;
    }

    function obtenerClaseEstado(estado) {
        const ESTADOS =
            window
                .GridVisionUsuarios
                .ESTADOS;

        if (estado === ESTADOS.ACTIVO) {
            return "admin-accesos-insignia-activo";
        }

        if (estado === ESTADOS.CADUCADO) {
            return "admin-accesos-insignia-caducado";
        }

        return "admin-accesos-insignia-inactivo";
    }

    function escaparHtml(valor) {
        return String(valor ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function abrirPanel() {
        await cargarPanel();

        const panel = elemento(
            "panel-administracion-accesos"
        );

        if (panel) {
            panel.hidden = false;
        }

        actualizarPanel();
    }

    function cerrarPanel() {
        const panel = elemento(
            "panel-administracion-accesos"
        );

        if (panel) {
            panel.hidden = true;
        }
    }

    window.GridVisionAdministracionAccesos = {
        cargarPanel,
        abrirPanel,
        cerrarPanel
    };
})();