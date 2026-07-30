window.estadoAlertas = (
    Array.isArray(window.ACTIVOS_MONITOREADOS)
        ? window.ACTIVOS_MONITOREADOS
        : []
).map((activo) => ({
    id: activo.id,
    alias: activo.alias,
    tipo: activo.tipo,
    estado: "NORMAL",
    mensaje: "Sin alertas meteorológicas",
    actualizacion: null
}));