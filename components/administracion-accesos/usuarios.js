(() => {
    "use strict";

    const ROLES = Object.freeze({
        OWNER: {
            codigo: "OWNER",
            nombre: "Propietario",
            nivel: 100,
            descripcion:
                "Control total de la plataforma."
        },

        ADMIN: {
            codigo: "ADMIN",
            nombre: "Administrador",
            nivel: 80,
            descripcion:
                "Gestiona usuarios, permisos y configuración."
        },

        SUPERVISOR: {
            codigo: "SUPERVISOR",
            nombre: "Supervisor",
            nivel: 60,
            descripcion:
                "Supervisa la operación y consulta reportes."
        },

        OPERADOR: {
            codigo: "OPERADOR",
            nombre: "Operador",
            nivel: 40,
            descripcion:
                "Registra y consulta información operacional."
        },

        INVITADO: {
            codigo: "INVITADO",
            nombre: "Invitado",
            nivel: 10,
            descripcion:
                "Acceso limitado y principalmente de lectura."
        }
    });

    const ESTADOS = Object.freeze({
        ACTIVO: "ACTIVO",
        INACTIVO: "INACTIVO",
        CADUCADO: "CADUCADO"
    });

    const USUARIO_OWNER = Object.freeze({
        id: "OWNER-0001",
        nombre: "Ezequiel Castillo Luengo",
        correo: "",
        empresa: "Pecket Energy",
        cargo: "Jefe de Operaciones",
        rol: ROLES.OWNER.codigo,
        estado: ESTADOS.ACTIVO,
        fechaCreacion: "2026-07-25",
        fechaExpiracion: null,
        ultimoAcceso: null,
        protegido: true
    });

    function obtenerRol(codigoRol) {
        return ROLES[codigoRol] || null;
    }

    function esOwner(usuario) {
        return usuario?.rol === ROLES.OWNER.codigo;
    }

    function estaProtegido(usuario) {
        return Boolean(usuario?.protegido);
    }

    function tieneAccesoVigente(usuario, fechaActual = new Date()) {
        if (!usuario) {
            return false;
        }

        if (usuario.estado !== ESTADOS.ACTIVO) {
            return false;
        }

        if (!usuario.fechaExpiracion) {
            return true;
        }

        const fechaExpiracion =
            new Date(`${usuario.fechaExpiracion}T23:59:59`);

        return fechaActual <= fechaExpiracion;
    }

    function calcularDiasRestantes(
        usuario,
        fechaActual = new Date()
    ) {
        if (!usuario?.fechaExpiracion) {
            return null;
        }

        const fechaExpiracion =
            new Date(`${usuario.fechaExpiracion}T23:59:59`);

        const diferenciaMs =
            fechaExpiracion.getTime()
            - fechaActual.getTime();

        return Math.ceil(
            diferenciaMs / (1000 * 60 * 60 * 24)
        );
    }

    function obtenerEstadoVisual(usuario) {
        if (!usuario) {
            return {
                estado: ESTADOS.INACTIVO,
                etiqueta: "Sin información"
            };
        }

        if (
            usuario.fechaExpiracion
            && !tieneAccesoVigente(usuario)
        ) {
            return {
                estado: ESTADOS.CADUCADO,
                etiqueta: "Caducado"
            };
        }

        if (usuario.estado === ESTADOS.INACTIVO) {
            return {
                estado: ESTADOS.INACTIVO,
                etiqueta: "Inactivo"
            };
        }

        return {
            estado: ESTADOS.ACTIVO,
            etiqueta: "Activo"
        };
    }

    function crearUsuario({
        id,
        nombre,
        correo = "",
        empresa = "",
        cargo = "",
        rol = ROLES.INVITADO.codigo,
        estado = ESTADOS.ACTIVO,
        fechaCreacion = new Date()
            .toISOString()
            .slice(0, 10),
        fechaExpiracion = null
    }) {
        if (!id || !nombre) {
            throw new Error(
                "El usuario requiere ID y nombre."
            );
        }

        if (!obtenerRol(rol)) {
            throw new Error(
                `El rol ${rol} no es válido.`
            );
        }

        return {
            id,
            nombre,
            correo,
            empresa,
            cargo,
            rol,
            estado,
            fechaCreacion,
            fechaExpiracion,
            ultimoAcceso: null,
            protegido: false
        };
    }

    function puedeModificarUsuario(
        usuarioActual,
        usuarioObjetivo
    ) {
        if (!usuarioActual || !usuarioObjetivo) {
            return false;
        }

        if (estaProtegido(usuarioObjetivo)) {
            return esOwner(usuarioActual);
        }

        const rolActual =
            obtenerRol(usuarioActual.rol);

        const rolObjetivo =
            obtenerRol(usuarioObjetivo.rol);

        if (!rolActual || !rolObjetivo) {
            return false;
        }

        return rolActual.nivel > rolObjetivo.nivel;
    }

    window.GridVisionUsuarios = {
        ROLES,
        ESTADOS,
        USUARIO_OWNER,
        obtenerRol,
        esOwner,
        estaProtegido,
        tieneAccesoVigente,
        calcularDiasRestantes,
        obtenerEstadoVisual,
        crearUsuario,
        puedeModificarUsuario
    };
})();