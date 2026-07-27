(() => {
    "use strict";

    const CLAVE_USUARIOS =
        "gridvision.auth.usuarios.v1";

    function obtenerUsuariosGuardados() {
        try {
            const contenido =
                localStorage.getItem(
                    CLAVE_USUARIOS
                );

            if (!contenido) {
                return null;
            }

            const usuarios =
                JSON.parse(contenido);

            return Array.isArray(usuarios)
                ? usuarios
                : null;
        } catch (error) {
            console.error(
                "No fue posible leer los usuarios guardados.",
                error
            );

            return null;
        }
    }

    function guardarUsuarios(usuarios) {
        if (!Array.isArray(usuarios)) {
            throw new Error(
                "La lista de usuarios debe ser un arreglo."
            );
        }

        localStorage.setItem(
            CLAVE_USUARIOS,
            JSON.stringify(usuarios)
        );
    }

    function crearUsuariosIniciales() {
        const usuarios = [
            {
                ...window
                    .GridVisionUsuarios
                    .USUARIO_OWNER
            }
        ];

        guardarUsuarios(usuarios);

        return usuarios;
    }

    function cargarUsuarios() {
        const usuariosGuardados =
            obtenerUsuariosGuardados();

        if (
            usuariosGuardados
            && usuariosGuardados.length
        ) {
            return usuariosGuardados;
        }

        return crearUsuariosIniciales();
    }

    function restablecerUsuarios() {
        localStorage.removeItem(
            CLAVE_USUARIOS
        );

        return crearUsuariosIniciales();
    }

    window.GridVisionAlmacenamientoAccesos = {
        cargarUsuarios,
        guardarUsuarios,
        restablecerUsuarios
    };
})();