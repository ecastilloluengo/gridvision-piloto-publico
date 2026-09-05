import json
import urllib.parse
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
import websocket


HOST = "qap-prd.coordinador.cl"

APP_ID = "e0efd7e8-d166-4fda-8d73-f5286e0486e4"

OBJETO_RESUMEN = "ktDnS"
OBJETO_DETALLE = "CmmUfRB"

MASHUP_URL = (
    "https://qap-prd.coordinador.cl"
    "/ext/extensions/"
    "mashup_Dashboard_Scada_Disponibilidad/"
    "mashup_Dashboard_Scada_Disponibilidad.html"
)

ARCHIVO_VARIABLES_ESPERADAS = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "sitr_variables_esperadas.json"
)


def cargar_variables_esperadas():

    if not ARCHIVO_VARIABLES_ESPERADAS.exists():
        raise RuntimeError(
            "No existe data/sitr_variables_esperadas.json"
        )

    datos = json.loads(
        ARCHIVO_VARIABLES_ESPERADAS.read_text(
            encoding="utf-8"
        )
    )

    variables = datos.get(
        "variables",
        []
    )

    return {
        item["clave"]: item
        for item in variables
        if item.get("clave")
    }


def _rpc(
    ws,
    identificador,
    handle,
    metodo,
    params
):

    ws.send(
        json.dumps({
            "jsonrpc": "2.0",
            "id": identificador,
            "handle": handle,
            "method": metodo,
            "params": params,
        })
    )

    while True:

        respuesta = json.loads(
            ws.recv()
        )

        if respuesta.get("id") != identificador:
            continue

        if "error" in respuesta:
            raise RuntimeError(
                json.dumps(
                    respuesta["error"],
                    ensure_ascii=False
                )
            )

        return respuesta["result"]


def consultar_sitr():

    sesion = requests.Session()

    sesion.headers.update({
        "User-Agent": "Mozilla/5.0"
    })

    # ==================================================
    # SESION PUBLICA QLIK
    # ==================================================

    respuesta = sesion.get(
        MASHUP_URL,
        timeout=20
    )

    respuesta.raise_for_status()

    # ==================================================
    # TOKEN CSRF
    # ==================================================

    respuesta_csrf = sesion.get(
        (
            "https://qap-prd.coordinador.cl"
            "/ext/qps/csrftoken"
        ),
        headers={
            "Accept": "*/*",
            "Referer": MASHUP_URL,
        },
        timeout=20
    )

    if respuesta_csrf.status_code != 204:
        raise RuntimeError(
            f"Qlik CSRF HTTP "
            f"{respuesta_csrf.status_code}"
        )

    csrf = respuesta_csrf.headers.get(
        "qlik-csrf-token"
    )

    if not csrf:
        raise RuntimeError(
            "Qlik no entrego token CSRF"
        )

    # ==================================================
    # COOKIE QLIK
    # ==================================================

    cookie = "; ".join(
        f"{item.name}={item.value}"
        for item in sesion.cookies
    )

    if not cookie:
        raise RuntimeError(
            "Qlik no entrego cookie de sesion"
        )

    # ==================================================
    # WEBSOCKET QIX
    # ==================================================

    parametros = urllib.parse.urlencode({
        "reloadUri":
            MASHUP_URL,

        "qlik-csrf-token":
            csrf,
    })

    url_ws = (
        f"wss://{HOST}"
        f"/ext/app/{APP_ID}"
        f"?{parametros}"
    )

    ws = websocket.create_connection(
        url_ws,
        cookie=cookie,
        origin=f"https://{HOST}",
        timeout=30
    )

    try:

        # ==================================================
        # ABRIR APP
        # ==================================================

        resultado = _rpc(
            ws,
            1,
            -1,
            "OpenDoc",
            {
                "qDocName":
                    APP_ID
            }
        )

        handle_app = resultado[
            "qReturn"
        ]["qHandle"]

        # ==================================================
        # RESUMEN DE DISPONIBILIDAD
        # ==================================================

        resultado = _rpc(
            ws,
            2,
            handle_app,
            "GetObject",
            {
                "qId":
                    OBJETO_RESUMEN
            }
        )

        handle_objeto = resultado[
            "qReturn"
        ]["qHandle"]

        resultado = _rpc(
            ws,
            3,
            handle_objeto,
            "GetLayout",
            {}
        )

        cube = resultado[
            "qLayout"
        ]["qHyperCube"]

        ancho = cube[
            "qSize"
        ]["qcx"]

        alto = cube[
            "qSize"
        ]["qcy"]

        medidas = [
            medida.get(
                "qFallbackTitle",
                ""
            )
            for medida
            in cube.get(
                "qMeasureInfo",
                []
            )
        ]

        actualizado_cen = (
            medidas[-1]
            if medidas
            else None
        )

        resultado = _rpc(
            ws,
            4,
            handle_objeto,
            "GetHyperCubeData",
            {
                "qPath":
                    "/qHyperCubeDef",

                "qPages": [
                    {
                        "qTop": 0,
                        "qLeft": 0,
                        "qWidth": ancho,
                        "qHeight": alto,
                    }
                ]
            }
        )

        matriz = resultado[
            "qDataPages"
        ][0]["qMatrix"]

        filas = [
            [
                celda.get(
                    "qText",
                    ""
                )
                for celda in fila
            ]
            for fila in matriz
        ]

        # ==================================================
        # ACTIVOS PECKET
        # ==================================================

        mapa = {
            "CAPULLO": {
                "id":
                    "capullo",

                "nombre":
                    "Central Capullo",
            },

            "LA LEONERA": {
                "id":
                    "pulelfu",

                "nombre":
                    "Central Pulelfu",
            }
        }

        instalaciones = []

        for fila in filas:

            if not fila:
                continue

            coordinado = (
                fila[0]
                .strip()
                .upper()
            )

            if coordinado not in mapa:
                continue

            texto = fila[-1]

            disponibilidad = None

            try:

                disponibilidad = float(
                    texto
                    .replace("%", "")
                    .replace(",", ".")
                )

            except Exception:
                pass

            historial = []

            for periodo, valor_texto in zip(
                medidas,
                fila[1:]
            ):

                valor = None

                try:

                    valor = float(
                        valor_texto
                        .replace("%", "")
                        .replace(",", ".")
                    )

                except Exception:
                    pass

                historial.append({
                    "periodo":
                        periodo,

                    "disponibilidad":
                        valor,

                    "disponibilidad_texto":
                        valor_texto,
                })

            instalaciones.append({
                "id":
                    mapa[
                        coordinado
                    ]["id"],

                "nombre":
                    mapa[
                        coordinado
                    ]["nombre"],

                "nombre_cen":
                    coordinado,

                "disponibilidad":
                    disponibilidad,

                "disponibilidad_texto":
                    texto,

                "historial":
                    historial,
            })

        # ==================================================
        # DETALLE DE VARIABLES SITR
        # ==================================================

        resultado = _rpc(
            ws,
            5,
            handle_app,
            "GetField",
            {
                "qFieldName":
                    "COORDINADO"
            }
        )

        handle_campo = resultado[
            "qReturn"
        ]["qHandle"]

        _rpc(
            ws,
            6,
            handle_campo,
            "SelectValues",
            {
                "qFieldValues": [
                    {
                        "qText":
                            "CAPULLO"
                    },
                    {
                        "qText":
                            "LA LEONERA"
                    },
                ],

                "qToggleMode":
                    False,

                "qSoftLock":
                    True,
            }
        )

        resultado = _rpc(
            ws,
            7,
            handle_app,
            "GetObject",
            {
                "qId":
                    OBJETO_DETALLE
            }
        )

        handle_detalle = resultado[
            "qReturn"
        ]["qHandle"]

        resultado = _rpc(
            ws,
            8,
            handle_detalle,
            "GetLayout",
            {}
        )

        cube_detalle = resultado[
            "qLayout"
        ]["qHyperCube"]

        ancho_detalle = (
            cube_detalle[
                "qSize"
            ]["qcx"]
        )

        alto_detalle = (
            cube_detalle[
                "qSize"
            ]["qcy"]
        )

        resultado = _rpc(
            ws,
            9,
            handle_detalle,
            "GetHyperCubeData",
            {
                "qPath":
                    "/qHyperCubeDef",

                "qPages": [
                    {
                        "qTop": 0,
                        "qLeft": 0,

                        "qWidth":
                            ancho_detalle,

                        "qHeight":
                            min(
                                alto_detalle,
                                1000
                            ),
                    }
                ],
            }
        )

        matriz_detalle = resultado[
            "qDataPages"
        ][0]["qMatrix"]

        filas_detalle = [
            [
                celda.get(
                    "qText",
                    ""
                )
                for celda in fila
            ]
            for fila in matriz_detalle
        ]

        # ==================================================
        # LINEA BASE DE VARIABLES ESPERADAS
        # ==================================================

        variables_esperadas = (
            cargar_variables_esperadas()
        )

        esperadas_por_coordinado = {}

        for variable in (
            variables_esperadas.values()
        ):

            coordinado = (
                variable.get(
                    "coordinado",
                    ""
                )
                .strip()
                .upper()
            )

            esperadas_por_coordinado.setdefault(
                coordinado,
                []
            ).append(
                variable
            )

        # ==================================================
        # RESUMEN POR CENTRAL
        # ==================================================

        detalle_por_coordinado = {}

        for instalacion in instalaciones:

            coordinado = (
                instalacion[
                    "nombre_cen"
                ]
                .strip()
                .upper()
            )

            esperadas = (
                esperadas_por_coordinado.get(
                    coordinado,
                    []
                )
            )

            detalle_por_coordinado[
                coordinado
            ] = {
                "variables_total":
                    len(esperadas),

                "variables_recibidas":
                    0,

                "variables_validas":
                    0,

                "variables_faltantes":
                    0,

                "variables_incidentes":
                    0,

                "incidencias":
                    [],
            }

        claves_recibidas = set()

        # ==================================================
        # VARIABLES QUE SI LLEGARON
        # ==================================================

        for fila in filas_detalle:

            if len(fila) < 9:
                continue

            coordinado = (
                fila[1]
                .strip()
                .upper()
            )

            if coordinado not in (
                detalle_por_coordinado
            ):
                continue

            clave = (
                f"{coordinado}|"
                f"{fila[0].strip()}"
            )

            # Si aparece una señal nueva
            # que no pertenece a la línea base,
            # no altera el cumplimiento esperado.
            if clave not in (
                variables_esperadas
            ):
                continue

            claves_recibidas.add(
                clave
            )

            resumen = (
                detalle_por_coordinado[
                    coordinado
                ]
            )

            resumen[
                "variables_recibidas"
            ] += 1

            calidad = (
                fila[6]
                .strip()
            )

            if calidad.lower() in (
                "válido",
                "valido",
            ):

                resumen[
                    "variables_validas"
                ] += 1

            else:

                resumen[
                    "variables_incidentes"
                ] += 1

                resumen[
                    "incidencias"
                ].append({
                    "estado":
                        "mala_calidad",

                    "irn":
                        fila[0],

                    "coordinado":
                        fila[1],

                    "ssee":
                        fila[2],

                    "valor":
                        fila[3],

                    "tipo":
                        fila[4],

                    "variable":
                        fila[5],

                    "calidad":
                        fila[6],

                    "enlace_iccp_rtu":
                        fila[7],

                    "tag_iccp":
                        fila[8],
                })

        # ==================================================
        # VARIABLES ESPERADAS QUE NO LLEGARON
        # ==================================================

        for clave, esperada in (
            variables_esperadas.items()
        ):

            if clave in claves_recibidas:
                continue

            coordinado = (
                esperada.get(
                    "coordinado",
                    ""
                )
                .strip()
                .upper()
            )

            if coordinado not in (
                detalle_por_coordinado
            ):
                continue

            resumen = (
                detalle_por_coordinado[
                    coordinado
                ]
            )

            resumen[
                "variables_faltantes"
            ] += 1

            resumen[
                "variables_incidentes"
            ] += 1

            resumen[
                "incidencias"
            ].append({
                "estado":
                    "no_reporta",

                "irn":
                    esperada.get(
                        "irn",
                        ""
                    ),

                "coordinado":
                    esperada.get(
                        "coordinado",
                        ""
                    ),

                "ssee":
                    esperada.get(
                        "ssee",
                        ""
                    ),

                "valor":
                    "--",

                "tipo":
                    esperada.get(
                        "tipo",
                        ""
                    ),

                "variable":
                    esperada.get(
                        "variable",
                        ""
                    ),

                "calidad":
                    "NO REPORTA",

                "enlace_iccp_rtu":
                    esperada.get(
                        "enlace_iccp_rtu",
                        ""
                    ),

                "tag_iccp":
                    esperada.get(
                        "tag_iccp",
                        ""
                    ),
            })

        # ==================================================
        # AGREGAR DETALLE A CADA CENTRAL
        # ==================================================

        for instalacion in instalaciones:

            detalle = (
                detalle_por_coordinado.get(
                    instalacion[
                        "nombre_cen"
                    ],
                    {}
                )
            )

            instalacion.update(
                detalle
            )

        # ==================================================
        # RESPUESTA FINAL
        # ==================================================

        return {
            "ok":
                True,

            "fuente":
                "Coordinador Eléctrico Nacional",

            "sistema":
                "Disponibilidad OnLine de SITR",

            "actualizado_cen":
                actualizado_cen,

            "consultado_en":
                datetime.now(
                    ZoneInfo(
                        "America/Santiago"
                    )
                ).isoformat(
                    timespec="seconds"
                ),

            "instalaciones":
                instalaciones,
        }

    finally:

        ws.close()


if __name__ == "__main__":

    print(
        json.dumps(
            consultar_sitr(),
            ensure_ascii=False,
            indent=2
        )
    )