(() => {
    const VARIABLES_METEOROLOGICAS = {
        rafaga: {
            id: "rafaga",
            icono: "💨",
            nombre: "Ráfaga",
            unidad: "km/h"
        },

        transversal: {
            id: "transversal",
            icono: "↔️",
            nombre: "Transversal",
            unidad: "km/h"
        },

        viento: {
            id: "viento",
            icono: "🌬️",
            nombre: "Viento",
            unidad: "km/h"
        },

        lluvia: {
            id: "lluvia",
            icono: "🌧️",
            nombre: "Lluvia",
            unidad: "mm/h"
        }
    };

    window.GridVisionMeteorologia = {
        variables: VARIABLES_METEOROLOGICAS
    };
})();