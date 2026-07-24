(() => {
    const PESOS_IRO = {
        rafaga: 0.35,
        transversal: 0.35,
        viento: 0.10,
        lluvia: 0.10,
        tendencia: 0.10
    };

    const PESOS_LLUVIA = {
        acumulada24h: 0.70,
        maximaHoraria: 0.30
    };

    const CURVAS_IRO = {
        rafaga: [
            [0, 0],
            [60, 25],
            [80, 50],
            [100, 75],
            [120, 100]
        ],

        transversal: [
            [0, 0],
            [50, 25],
            [70, 50],
            [90, 75],
            [110, 100]
        ],

        viento: [
            [0, 0],
            [40, 25],
            [60, 50],
            [80, 75],
            [100, 100]
        ],

        lluvia24h: [
            [0, 0],
            [20, 25],
            [50, 50],
            [80, 75],
            [120, 100]
        ],

        lluviaHora: [
            [0, 0],
            [5, 25],
            [10, 50],
            [20, 75],
            [30, 100]
        ],

        tendencia: [
            [-20, 0],
            [-10, 15],
            [0, 30],
            [10, 60],
            [20, 85],
            [30, 100]
        ]
    };

    window.GridVisionIROConfig = {
        PESOS_IRO,
        PESOS_LLUVIA,
        CURVAS_IRO
    };
})();