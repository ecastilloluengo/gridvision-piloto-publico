"use strict";

window.GRIDVISION_ALERTAS_CONFIG = {
    niveles: {
        normal: {
            etiqueta: "Normal",
            prioridad: 0,
        },
        precaucion: {
            etiqueta: "Precaución",
            prioridad: 1,
        },
        alto: {
            etiqueta: "Alto",
            prioridad: 2,
        },
        critico: {
            etiqueta: "Crítico",
            prioridad: 3,
        },
    },

    fuentes: [
        {
            id: "GV-ALR-ACT-001",
            nombre: "Riesgo meteorológico de activo",
            tipo: "activo",
            nivelMinimo: "precaucion",
            activa: true,
            mostrarInicio: true,
            compartirWhatsApp: true,
        },
        {
            id: "GV-ALR-LIN-001",
            nombre: "Riesgo meteorológico de línea",
            tipo: "linea",
            nivelMinimo: "precaucion",
            activa: true,
            mostrarInicio: true,
            compartirWhatsApp: true,
        },
        {
            id: "GV-ALR-RAF-001",
            nombre: "Ráfaga crítica",
            tipo: "meteorologia",
            variable: "rafaga",
            nivelMinimo: "critico",
            activa: true,
            mostrarInicio: true,
            compartirWhatsApp: true,
        },
        {
            id: "GV-ALR-TRA-001",
            nombre: "Ráfaga transversal crítica",
            tipo: "linea",
            variable: "rafagaTransversal",
            nivelMinimo: "alto",
            activa: true,
            mostrarInicio: true,
            compartirWhatsApp: true,
        },
    ],
};