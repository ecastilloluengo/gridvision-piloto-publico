(() => {
    function limitar(valor, minimo = 0, maximo = 100) {
        const numero = Number(valor);

        if (!Number.isFinite(numero)) {
            return minimo;
        }

        return Math.min(
            maximo,
            Math.max(minimo, numero)
        );
    }

    function interpolar(valor, puntos) {
        const numero = Number(valor);

        if (
            !Number.isFinite(numero)
            || !Array.isArray(puntos)
            || puntos.length === 0
        ) {
            return 0;
        }

        const primero = puntos[0];
        const ultimo = puntos.at(-1);

        if (numero <= primero[0]) {
            return limitar(primero[1]);
        }

        if (numero >= ultimo[0]) {
            return limitar(ultimo[1]);
        }

        for (
            let indice = 0;
            indice < puntos.length - 1;
            indice += 1
        ) {
            const [x1, y1] = puntos[indice];
            const [x2, y2] = puntos[indice + 1];

            if (
                numero >= x1
                && numero <= x2
            ) {
                const proporcion =
                    (numero - x1) / (x2 - x1);

                const resultado =
                    y1 + proporcion * (y2 - y1);

                return limitar(resultado);
            }
        }

        return 0;
    }

    function redondearPuntaje(valor, decimales = 1) {
        const factor = 10 ** decimales;

        return Math.round(
            limitar(valor) * factor
        ) / factor;
    }

    window.GridVisionIROInterpolacion = {
        limitar,
        interpolar,
        redondearPuntaje
    };
})();