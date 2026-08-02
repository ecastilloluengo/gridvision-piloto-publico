(() => {
    "use strict";

    /*
     * IMPORTANTE:
     *
     * 1. La clave anterior quedó visible en el chat.
     *    Elimínala en Google Cloud y crea una nueva.
     *
     * 2. Pega la nueva clave solamente entre las comillas.
     */
    const CLAVE_API =
        "AIzaSyAwlU9mJRcyJF8_cOOhiytzkh_7Kb0KyHM";

    const RADIO_MAXIMO_METROS = 1000;
    const TIEMPO_MAXIMO_CARGA_MS = 15000;

    let promesaGoogleMaps = null;

    function validarClave() {
    const clave = String(CLAVE_API || "").trim();

    return (
        clave.startsWith("AIza") &&
        clave.length >= 35
    );
}

    function cargarGoogleMaps() {
        /*
         * Si Google Maps ya está cargado,
         * no volvemos a cargar el script.
         */
        if (
            window.google?.maps?.StreetViewService
        ) {
            return Promise.resolve();
        }

        /*
         * Solo rechaza si la clave está vacía
         * o todavía contiene el marcador.
         */
        if (!validarClave()) {
            return Promise.reject(
                new Error(
                    "La clave API de Google Maps " +
                    "no está configurada."
                )
            );
        }

        /*
         * Evita cargar Google Maps dos veces.
         */
        if (promesaGoogleMaps) {
            return promesaGoogleMaps;
        }

        promesaGoogleMaps =
            new Promise((resolve, reject) => {
                const idScript =
                    "gridvision-google-maps-js";

                const nombreCallback =
                    "GridVisionGoogleMapsListo";

                let finalizado = false;

                const limpiar = () => {
                    window.clearTimeout(
                        temporizador
                    );

                    delete window[
                        nombreCallback
                    ];
                };

                const fallar = (mensaje) => {
                    if (finalizado) {
                        return;
                    }

                    finalizado = true;
                    limpiar();

                    document
                        .getElementById(idScript)
                        ?.remove();

                    promesaGoogleMaps = null;

                    reject(
                        new Error(mensaje)
                    );
                };

                /*
                 * Google ejecuta este callback
                 * cuando la API termina de cargar.
                 */
                window[nombreCallback] = () => {
                    if (finalizado) {
                        return;
                    }

                    if (
                        !window.google
                            ?.maps
                            ?.StreetViewService
                    ) {
                        fallar(
                            "Google Maps cargó, " +
                            "pero Street View no " +
                            "quedó disponible."
                        );

                        return;
                    }

                    finalizado = true;
                    limpiar();
                    resolve();
                };

                /*
                 * Google ejecuta esta función
                 * cuando rechaza la clave.
                 */
                window.gm_authFailure = () => {
                    fallar(
                        "Google Maps rechazó la " +
                        "clave API. Revisa la clave, " +
                        "la facturación y las " +
                        "restricciones de dominio."
                    );
                };

                /*
                 * IMPORTANTE:
                 * key debe usar CLAVE_API.
                 * No debe contener la clave escrita
                 * directamente ni sin comillas.
                 */
                const parametros =
                    new URLSearchParams({
                        key: CLAVE_API.trim(),
                        loading: "async",
                        libraries: "streetView",
                        callback:nombreCallback,
                        v: "weekly",
                        language: "es",
                        region: "CL"
                    });

                const script =
                    document.createElement(
                        "script"
                    );

                script.id = idScript;
                script.async = true;
                script.defer = true;

                script.src =
                    "https://maps.googleapis.com/" +
                    "maps/api/js?" +
                    parametros.toString();

                script.onerror = () => {
                    fallar(
                        "No fue posible descargar " +
                        "Maps JavaScript API."
                    );
                };

                const temporizador =
                    window.setTimeout(() => {
                        fallar(
                            "Google Maps tardó " +
                            "demasiado en responder."
                        );
                    }, TIEMPO_MAXIMO_CARGA_MS);

                document.head.appendChild(
                    script
                );
            });

        return promesaGoogleMaps;
    }

    function gradosARadianes(valor) {
        return valor * Math.PI / 180;
    }

    /*
     * Calcula la distancia entre el activo
     * y la panorámica encontrada.
     */
    function distanciaMetros(
        latitudInicial,
        longitudInicial,
        latitudFinal,
        longitudFinal
    ) {
        const radioTierra = 6371000;

        const lat1 =
            gradosARadianes(
                latitudInicial
            );

        const lat2 =
            gradosARadianes(
                latitudFinal
            );

        const diferenciaLatitud =
            gradosARadianes(
                latitudFinal -
                latitudInicial
            );

        const diferenciaLongitud =
            gradosARadianes(
                longitudFinal -
                longitudInicial
            );

        const a =
            Math.sin(
                diferenciaLatitud / 2
            ) ** 2 +
            Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(
                    diferenciaLongitud / 2
                ) ** 2;

        return (
            2 *
            radioTierra *
            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            )
        );
    }

    /*
     * Calcula hacia dónde debe mirar
     * inicialmente Street View.
     */
    function calcularRumbo(
        latitudInicial,
        longitudInicial,
        latitudObjetivo,
        longitudObjetivo
    ) {
        const lat1 =
            gradosARadianes(
                latitudInicial
            );

        const lat2 =
            gradosARadianes(
                latitudObjetivo
            );

        const diferenciaLongitud =
            gradosARadianes(
                longitudObjetivo -
                longitudInicial
            );

        const y =
            Math.sin(
                diferenciaLongitud
            ) *
            Math.cos(lat2);

        const x =
            Math.cos(lat1) *
                Math.sin(lat2) -
            Math.sin(lat1) *
                Math.cos(lat2) *
                Math.cos(
                    diferenciaLongitud
                );

        return (
            Math.atan2(y, x) *
            180 /
            Math.PI +
            360
        ) % 360;
    }

    /*
     * La ventana se abre inmediatamente
     * para evitar que el navegador bloquee
     * la pestaña después de la espera.
     */
    function abrirVentanaDeEspera() {
        const ventana =
            window.open(
                "about:blank",
                "_blank"
            );

        if (!ventana) {
            return null;
        }

        ventana.opener = null;

        ventana.document.title =
            "Buscando Street View";

        ventana.document.body.style
            .fontFamily =
            "Arial, sans-serif";

        ventana.document.body.style
            .padding =
            "24px";

        ventana.document.body.textContent =
            "Buscando el Street View " +
            "más cercano dentro de 1 km…";

        return ventana;
    }

    async function buscarPanorama(
        latitud,
        longitud
    ) {
        await cargarGoogleMaps();

        const servicio =
            new window.google.maps
                .StreetViewService();

        const respuesta =
            await servicio.getPanorama({
                location: {
                    lat: latitud,
                    lng: longitud
                },

                radius:
                    RADIO_MAXIMO_METROS,

                preference:
                    window.google
                        .maps
                        .StreetViewPreference
                        .NEAREST
            });

        const ubicacion =
            respuesta
                ?.data
                ?.location;

        const coordenadasPanorama =
            ubicacion?.latLng;

        if (
            !ubicacion?.pano ||
            !coordenadasPanorama
        ) {
            const error =
                new Error(
                    "ZERO_RESULTS"
                );

            error.code =
                "ZERO_RESULTS";

            throw error;
        }

        const latitudPanorama =
            coordenadasPanorama.lat();

        const longitudPanorama =
            coordenadasPanorama.lng();

        const distancia =
            distanciaMetros(
                latitud,
                longitud,
                latitudPanorama,
                longitudPanorama
            );

        /*
         * Protección adicional:
         * nunca aceptar panoramas fuera
         * del radio máximo solicitado.
         */
        if (
            distancia >
            RADIO_MAXIMO_METROS + 1
        ) {
            const error =
                new Error(
                    "ZERO_RESULTS"
                );

            error.code =
                "ZERO_RESULTS";

            throw error;
        }

        return {
            pano: ubicacion.pano,
            latitud:
                latitudPanorama,
            longitud:
                longitudPanorama,
            distancia
        };
    }

    function construirUrlStreetView(
        resultado,
        latitudActivo,
        longitudActivo
    ) {
        const rumbo =
            calcularRumbo(
                resultado.latitud,
                resultado.longitud,
                latitudActivo,
                longitudActivo
            );

        const parametros =
            new URLSearchParams({
                api: "1",
                map_action: "pano",
                pano: resultado.pano,
                heading:
                    rumbo.toFixed(1),
                pitch: "0",
                fov: "90"
            });

        return (
            "https://www.google.com/" +
            "maps/@?" +
            parametros.toString()
        );
    }

    function esErrorSinCobertura(
        error
    ) {
        const texto =
            String(
                error?.code ||
                error?.status ||
                error?.message ||
                error
            ).toUpperCase();

        return (
            texto.includes(
                "ZERO_RESULTS"
            ) ||
            texto.includes(
                "NOT_FOUND"
            )
        );
    }

    async function abrirMasCercano({
        latitud,
        longitud,
        boton,
        estado
    }) {
        const latitudNumero =
            Number(latitud);

        const longitudNumero =
            Number(longitud);

        if (
            !Number.isFinite(
                latitudNumero
            ) ||
            !Number.isFinite(
                longitudNumero
            )
        ) {
            if (estado) {
                estado.textContent =
                    "Las coordenadas del " +
                    "activo no son válidas.";
            }

            return;
        }

        /*
         * Si ya se encontró una panorámica,
         * el segundo clic la abre directamente.
         */
        const urlGuardada =
            boton
                ?.dataset
                ?.streetViewUrl;

        if (urlGuardada) {
            window.open(
                urlGuardada,
                "_blank",
                "noopener,noreferrer"
            );

            return;
        }

        const textoOriginal =
            boton?.textContent ||
            "🛣️ Street View más cercano";

        const ventana =
            abrirVentanaDeEspera();

        if (boton) {
            boton.disabled = true;

            boton.textContent =
                "Buscando Street View…";
        }

        if (estado) {
            estado.textContent =
                "Buscando cobertura " +
                "dentro de 1 km…";
        }

        try {
            const resultado =
                await buscarPanorama(
                    latitudNumero,
                    longitudNumero
                );

            const distanciaRedondeada =
                Math.round(
                    resultado.distancia
                );

            const url =
                construirUrlStreetView(
                    resultado,
                    latitudNumero,
                    longitudNumero
                );

            if (boton) {
                boton.dataset
                    .streetViewUrl =
                    url;

                boton.textContent =
                    "🛣️ Street View " +
                    "cercano · " +
                    `${distanciaRedondeada} m`;
            }

            if (estado) {
                estado.textContent =
                    "Cobertura encontrada " +
                    `a ${distanciaRedondeada} ` +
                    "m del activo.";
            }

            if (
                ventana &&
                !ventana.closed
            ) {
                ventana.location.replace(
                    url
                );
            } else if (estado) {
                estado.textContent =
                    "Cobertura encontrada " +
                    `a ${distanciaRedondeada} ` +
                    "m. Haz clic nuevamente " +
                    "para abrirla.";
            }
        } catch (error) {
            if (
                ventana &&
                !ventana.closed
            ) {
                ventana.close();
            }

            if (estado) {
                estado.textContent =
                    esErrorSinCobertura(
                        error
                    )
                        ? (
                            "No existe " +
                            "Street View " +
                            "dentro de 1 km."
                        )
                        : (
                            "No fue posible " +
                            "consultar Street View: " +
                            error.message
                        );
            }

            if (boton) {
                boton.textContent =
                    textoOriginal;
            }

            console.error(
                "GridVision Street View:",
                error
            );
        } finally {
            if (boton) {
                boton.disabled = false;
            }
        }
    }

    /*
     * Servicio disponible para app.js.
     */
    window.GridVisionStreetView = {
        abrirMasCercano
    };
})();