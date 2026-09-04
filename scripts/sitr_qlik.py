import json
import urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
import websocket


HOST = "qap-prd.coordinador.cl"

APP_ID = "e0efd7e8-d166-4fda-8d73-f5286e0486e4"

OBJETO_RESUMEN = "ktDnS"

MASHUP_URL = (
    "https://qap-prd.coordinador.cl"
    "/ext/extensions/"
    "mashup_Dashboard_Scada_Disponibilidad/"
    "mashup_Dashboard_Scada_Disponibilidad.html"
)


def _rpc(ws, identificador, handle, metodo, params):

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

    # --------------------------------------------------
    # SESION PUBLICA QLIK
    # --------------------------------------------------

    respuesta = sesion.get(
        MASHUP_URL,
        timeout=20
    )

    respuesta.raise_for_status()

    # --------------------------------------------------
    # TOKEN CSRF
    # --------------------------------------------------

    respuesta_csrf = sesion.get(
        "https://qap-prd.coordinador.cl"
        "/ext/qps/csrftoken",
        headers={
            "Accept": "*/*",
            "Referer": MASHUP_URL,
        },
        timeout=20
    )

    if respuesta_csrf.status_code != 204:
        raise RuntimeError(
            f"Qlik CSRF HTTP {respuesta_csrf.status_code}"
        )

    csrf = respuesta_csrf.headers.get(
        "qlik-csrf-token"
    )

    if not csrf:
        raise RuntimeError(
            "Qlik no entrego token CSRF"
        )

    # --------------------------------------------------
    # COOKIE QLIK
    # --------------------------------------------------

    cookie = "; ".join(
        f"{item.name}={item.value}"
        for item in sesion.cookies
    )

    if not cookie:
        raise RuntimeError(
            "Qlik no entrego cookie de sesion"
        )

    # --------------------------------------------------
    # WEBSOCKET QIX
    # --------------------------------------------------

    parametros = urllib.parse.urlencode({
        "reloadUri": MASHUP_URL,
        "qlik-csrf-token": csrf,
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

        # Abrir aplicación

        resultado = _rpc(
            ws,
            1,
            -1,
            "OpenDoc",
            {
                "qDocName": APP_ID
            }
        )

        handle_app = resultado[
            "qReturn"
        ]["qHandle"]

        # Obtener tabla resumen

        resultado = _rpc(
            ws,
            2,
            handle_app,
            "GetObject",
            {
                "qId": OBJETO_RESUMEN
            }
        )

        handle_objeto = resultado[
            "qReturn"
        ]["qHandle"]

        # Layout

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

        ancho = cube["qSize"]["qcx"]
        alto = cube["qSize"]["qcy"]

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

        # Obtener filas

        resultado = _rpc(
            ws,
            4,
            handle_objeto,
            "GetHyperCubeData",
            {
                "qPath": "/qHyperCubeDef",
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
                celda.get("qText", "")
                for celda in fila
            ]
            for fila in matriz
        ]

        # --------------------------------------------------
        # ACTIVOS PECKET
        # --------------------------------------------------

        mapa = {
            "CAPULLO": {
                "id": "capullo",
                "nombre": "Central Capullo",
            },
            "LA LEONERA": {
                "id": "pulelfu",
                "nombre": "Central Pulelfu",
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
                    "periodo": periodo,
                    "disponibilidad": valor,
                    "disponibilidad_texto": valor_texto,
                })
            
            instalaciones.append({
                "id":
                    mapa[coordinado]["id"],

                "nombre":
                    mapa[coordinado]["nombre"],

                "nombre_cen":
                    coordinado,

                "disponibilidad":
                    disponibilidad,

                "disponibilidad_texto":
                    texto,

                     "historial":
                    historial,
            })
        # --------------------------------------------------
        # DETALLE DE VARIABLES SITR
        # --------------------------------------------------

        resultado = _rpc(
            ws,
            5,
            handle_app,
            "GetField",
            {
                "qFieldName": "COORDINADO"
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
                    {"qText": "CAPULLO"},
                    {"qText": "LA LEONERA"},
                ],
                "qToggleMode": False,
                "qSoftLock": True,
            }
        )

        resultado = _rpc(
            ws,
            7,
            handle_app,
            "GetObject",
            {
                "qId": "CmmUfRB"
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

        ancho_detalle = cube_detalle[
            "qSize"
        ]["qcx"]

        alto_detalle = cube_detalle[
            "qSize"
        ]["qcy"]

        resultado = _rpc(
            ws,
            9,
            handle_detalle,
            "GetHyperCubeData",
            {
                "qPath": "/qHyperCubeDef",
                "qPages": [
                    {
                        "qTop": 0,
                        "qLeft": 0,
                        "qWidth": ancho_detalle,
                        "qHeight": min(
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
                celda.get("qText", "")
                for celda in fila
            ]
            for fila in matriz_detalle
        ]

        detalle_por_coordinado = {}

        for instalacion in instalaciones:

            detalle_por_coordinado[
                instalacion["nombre_cen"]
            ] = {
                "variables_total": 0,
                "variables_validas": 0,
                "variables_incidentes": 0,
                "incidencias": [],
            }

        for fila in filas_detalle:

            if len(fila) < 9:
                continue

            coordinado = (
                fila[1]
                .strip()
                .upper()
            )

            if coordinado not in detalle_por_coordinado:
                continue

            resumen = detalle_por_coordinado[
                coordinado
            ]

            resumen[
                "variables_total"
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
                    "irn": fila[0],
                    "coordinado": fila[1],
                    "ssee": fila[2],
                    "valor": fila[3],
                    "tipo": fila[4],
                    "variable": fila[5],
                    "calidad": fila[6],
                    "enlace_iccp_rtu": fila[7],
                    "tag_iccp": fila[8],
                })

        for instalacion in instalaciones:

            detalle = detalle_por_coordinado.get(
                instalacion["nombre_cen"],
                {}
            )

            instalacion.update(
                detalle
            )
        return {
            "ok": True,

            "fuente":
                "Coordinador Eléctrico Nacional",

            "sistema":
                "Disponibilidad OnLine de SITR",

            "actualizado_cen":
                actualizado_cen,

            "consultado_en":
                datetime.now(
                    ZoneInfo("America/Santiago")
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