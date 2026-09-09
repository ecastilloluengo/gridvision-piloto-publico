import argparse
import html
import json
import os
import requests
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sitr_qlik import consultar_sitr


TZ = ZoneInfo("America/Santiago")

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent

# En ejecución local usa data/sitr_monitor.
# En GitHub Actions puede apuntar a una rama de estado
# independiente mediante SITR_MONITOR_DATA_DIR.
CARPETA_MONITOR = Path(
    os.environ.get(
        "SITR_MONITOR_DATA_DIR",
        str(RAIZ_PROYECTO / "data" / "sitr_monitor")
    )
).resolve()

CARPETA_EVIDENCIAS = CARPETA_MONITOR / "evidencias"
CARPETA_REPORTES = CARPETA_MONITOR / "reportes"
ARCHIVO_ESTADO = CARPETA_MONITOR / "estado.json"

HORAS_REPORTE = (9, 17)

# Criterio operativo GridVision.
# No corresponde a un umbral oficial del CEN.
FRESCURA_ADVERTENCIA_MIN = 30
FRESCURA_CRITICA_MIN = 60


def ahora_chile():
    return datetime.now(TZ)


def iso(fecha):
    return fecha.isoformat(timespec="seconds")


def parsear_iso(valor):
    if not valor:
        return None
    return datetime.fromisoformat(valor)


def asegurar_carpetas():
    CARPETA_MONITOR.mkdir(parents=True, exist_ok=True)
    CARPETA_EVIDENCIAS.mkdir(parents=True, exist_ok=True)
    CARPETA_REPORTES.mkdir(parents=True, exist_ok=True)


def cargar_json(ruta, por_defecto):
    if not ruta.exists():
        return por_defecto

    try:
        return json.loads(
            ruta.read_text(encoding="utf-8")
        )
    except Exception:
        return por_defecto


def guardar_json(ruta, datos):
    ruta.parent.mkdir(parents=True, exist_ok=True)

    temporal = ruta.with_suffix(
        ruta.suffix + ".tmp"
    )

    temporal.write_text(
        json.dumps(
            datos,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )

    temporal.replace(ruta)


def estado_inicial():
    return {
        "version": 4,
        "inicializado_en": None,
        "ultima_ejecucion": None,
        "ultima_consulta_cen": None,
        "ultimo_slot_evidencia": None,
        "ultimo_reporte_09": None,
        "ultimo_reporte_17": None,
        "incidencias_activas": {},
        "fuente_cen_alerta_activa": None,
        "eventos": [],
        "eventos_ultima_ejecucion": [],
        "cola_correo": [],
        "ultimo_snapshot": None,
    }


def cargar_estado():
    base = estado_inicial()

    datos = cargar_json(
        ARCHIVO_ESTADO,
        {}
    )

    if isinstance(datos, dict):
        base.update(datos)

    # La versión corresponde al código actual,
    # aunque el estado persistente venga de una
    # ejecución anterior.
    base["version"] = 4

    if not isinstance(
        base.get("incidencias_activas"),
        dict
    ):
        base["incidencias_activas"] = {}

    if not isinstance(
        base.get("eventos"),
        list
    ):
        base["eventos"] = []

    if not isinstance(
        base.get("cola_correo"),
        list
    ):
        base["cola_correo"] = []

    return base


def normalizar_estado_incidencia(incidencia):
    if incidencia.get("estado") == "no_reporta":
        return "NO REPORTA"

    calidad = str(
        incidencia.get("calidad")
        or "MALA CALIDAD"
    ).strip()

    return calidad or "MALA CALIDAD"


def clave_incidencia(instalacion, incidencia):
    coordinado = str(
        incidencia.get("coordinado")
        or instalacion.get("nombre_cen")
        or ""
    ).strip().upper()

    irn = str(
        incidencia.get("irn")
        or ""
    ).strip()

    if irn:
        return f"{coordinado}|{irn}"

    variable = str(
        incidencia.get("variable")
        or ""
    ).strip().upper()

    return f"{coordinado}|{variable}"


def incidencia_actual(instalacion, incidencia, fecha):
    return {
        "clave": clave_incidencia(
            instalacion,
            incidencia
        ),
        "central": instalacion.get("nombre"),
        "coordinado": (
            incidencia.get("coordinado")
            or instalacion.get("nombre_cen")
        ),
        "irn": incidencia.get("irn"),
        "ssee": incidencia.get("ssee"),
        "variable": incidencia.get("variable"),
        "tipo": incidencia.get("tipo"),
        "valor": incidencia.get("valor"),
        "calidad": incidencia.get("calidad"),
        "estado": normalizar_estado_incidencia(
            incidencia
        ),
        "tag_iccp": incidencia.get("tag_iccp"),
        "enlace_iccp_rtu": incidencia.get(
            "enlace_iccp_rtu"
        ),
        "ultima_vez": iso(fecha),
    }



def parsear_actualizado_cen(valor):
    if not valor:
        return None

    texto = str(valor).strip()

    formatos = (
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M",
    )

    for formato in formatos:
        try:
            return datetime.strptime(
                texto,
                formato
            ).replace(
                tzinfo=TZ
            )
        except ValueError:
            continue

    return None


def texto_edad_minutos(minutos):
    if minutos is None:
        return "desconocida"

    minutos = max(
        0,
        int(round(minutos))
    )

    if minutos < 60:
        return f"{minutos} min"

    horas, resto = divmod(
        minutos,
        60
    )

    if resto == 0:
        return f"{horas} h"

    return f"{horas} h {resto} min"


def calcular_frescura_cen(
    actualizado_cen,
    fecha
):
    fecha_cen = parsear_actualizado_cen(
        actualizado_cen
    )

    if fecha_cen is None:
        return {
            "estado": "DESCONOCIDA",
            "nivel": "critico",
            "actualizado_cen": actualizado_cen,
            "edad_minutos": None,
            "edad_texto": "desconocida",
            "criterio": (
                "GridVision: fresco <=30 min; "
                "retrasado 31-60 min; "
                "desactualizado >60 min"
            ),
        }

    edad_minutos = max(
        0.0,
        (
            fecha - fecha_cen
        ).total_seconds()
        / 60
    )

    if (
        edad_minutos
        <= FRESCURA_ADVERTENCIA_MIN
    ):
        estado = "FRESCO"
        nivel = "ok"

    elif (
        edad_minutos
        <= FRESCURA_CRITICA_MIN
    ):
        estado = "RETRASADO"
        nivel = "advertencia"

    else:
        estado = "DESACTUALIZADO"
        nivel = "critico"

    return {
        "estado": estado,
        "nivel": nivel,
        "actualizado_cen": actualizado_cen,
        "edad_minutos": round(
            edad_minutos,
            1
        ),
        "edad_texto": texto_edad_minutos(
            edad_minutos
        ),
        "criterio": (
            "GridVision: fresco <=30 min; "
            "retrasado 31-60 min; "
            "desactualizado >60 min"
        ),
    }


def construir_snapshot(datos, fecha):
    instalaciones = []

    total = 0
    recibidas = 0
    validas = 0
    faltantes = 0
    incidentes = 0

    for item in datos.get(
        "instalaciones",
        []
    ):
        resumen = {
            "id": item.get("id"),
            "nombre": item.get("nombre"),
            "nombre_cen": item.get("nombre_cen"),
            "disponibilidad": item.get(
                "disponibilidad"
            ),
            "disponibilidad_texto": item.get(
                "disponibilidad_texto"
            ),
            "variables_total": int(
                item.get("variables_total")
                or 0
            ),
            "variables_recibidas": int(
                item.get("variables_recibidas")
                or 0
            ),
            "variables_validas": int(
                item.get("variables_validas")
                or 0
            ),
            "variables_faltantes": int(
                item.get("variables_faltantes")
                or 0
            ),
            "variables_incidentes": int(
                item.get("variables_incidentes")
                or 0
            ),
        }

        instalaciones.append(resumen)

        total += resumen["variables_total"]
        recibidas += resumen[
            "variables_recibidas"
        ]
        validas += resumen[
            "variables_validas"
        ]
        faltantes += resumen[
            "variables_faltantes"
        ]
        incidentes += resumen[
            "variables_incidentes"
        ]

    actualizado_cen = datos.get(
        "actualizado_cen"
    )

    frescura_cen = calcular_frescura_cen(
        actualizado_cen,
        fecha
    )

    estado_senales = (
        "OK"
        if (
            total > 0
            and faltantes == 0
            and incidentes == 0
        )
        else "INCIDENCIA"
    )

    if estado_senales != "OK":
        estado_general = "INCIDENCIA_SITR"
    elif frescura_cen["estado"] == "RETRASADO":
        estado_general = "ADVERTENCIA_FUENTE"
    elif frescura_cen["estado"] in (
        "DESACTUALIZADO",
        "DESCONOCIDA",
    ):
        estado_general = "ALERTA_FUENTE"
    else:
        estado_general = "OK"

    return {
        "fecha": iso(fecha),
        "actualizado_cen": actualizado_cen,
        "frescura_cen": frescura_cen,
        "total": total,
        "recibidas": recibidas,
        "validas": validas,
        "faltantes": faltantes,
        "incidentes": incidentes,
        "estado_senales": estado_senales,
        "estado": estado_general,
        "instalaciones": instalaciones,
    }


def registrar_evento(
    estado,
    tipo,
    fecha,
    incidencia,
    detalle_extra=None
):
    evento = {
        "tipo": tipo,
        "fecha": iso(fecha),
        "clave": incidencia.get("clave"),
        "central": incidencia.get("central"),
        "coordinado": incidencia.get(
            "coordinado"
        ),
        "irn": incidencia.get("irn"),
        "ssee": incidencia.get("ssee"),
        "variable": incidencia.get(
            "variable"
        ),
        "estado": incidencia.get("estado"),
        "calidad": incidencia.get(
            "calidad"
        ),
        "tag_iccp": incidencia.get(
            "tag_iccp"
        ),
    }

    if detalle_extra:
        evento.update(detalle_extra)

    estado["eventos"].append(evento)
    estado[
        "eventos_ultima_ejecucion"
    ].append(evento)

    # Evita crecimiento infinito del archivo.
    estado["eventos"] = estado[
        "eventos"
    ][-1000:]


def procesar_incidencias(
    estado,
    datos,
    fecha
):
    previas = dict(
        estado.get(
            "incidencias_activas",
            {}
        )
    )

    actuales = {}

    for instalacion in datos.get(
        "instalaciones",
        []
    ):
        for incidencia in instalacion.get(
            "incidencias",
            []
        ):
            actual = incidencia_actual(
                instalacion,
                incidencia,
                fecha
            )

            clave = actual["clave"]

            anterior = previas.get(clave)

            if anterior is None:
                actual["inicio"] = iso(fecha)

                registrar_evento(
                    estado,
                    "DETECTADA",
                    fecha,
                    actual
                )

            else:
                actual["inicio"] = anterior.get(
                    "inicio"
                ) or iso(fecha)

                if (
                    anterior.get("estado")
                    != actual.get("estado")
                ):
                    registrar_evento(
                        estado,
                        "CAMBIO_ESTADO",
                        fecha,
                        actual,
                        {
                            "estado_anterior":
                                anterior.get(
                                    "estado"
                                )
                        }
                    )

            actuales[clave] = actual

    for clave, anterior in previas.items():
        if clave in actuales:
            continue

        inicio = parsear_iso(
            anterior.get("inicio")
        )

        duracion_min = None

        if inicio:
            duracion_min = max(
                0,
                round(
                    (
                        fecha - inicio
                    ).total_seconds()
                    / 60,
                    1
                )
            )

        normalizada = dict(anterior)
        normalizada["ultima_vez"] = iso(fecha)

        registrar_evento(
            estado,
            "NORMALIZADA",
            fecha,
            normalizada,
            {
                "fin": iso(fecha),
                "duracion_minutos":
                    duracion_min,
            }
        )

    estado[
        "incidencias_activas"
    ] = actuales



def procesar_frescura_fuente(
    estado,
    frescura,
    fecha
):
    anterior = estado.get(
        "fuente_cen_alerta_activa"
    )

    es_critica = (
        frescura.get("estado")
        in (
            "DESACTUALIZADO",
            "DESCONOCIDA",
        )
    )

    if es_critica:
        actual = {
            "clave": "FUENTE_CEN",
            "central": None,
            "coordinado": "CEN",
            "irn": None,
            "ssee": None,
            "variable": "Frescura fuente CEN",
            "estado": frescura.get("estado"),
            "calidad": None,
            "tag_iccp": None,
            "ultima_vez": iso(fecha),
            "actualizado_cen":
                frescura.get(
                    "actualizado_cen"
                ),
            "edad_minutos":
                frescura.get(
                    "edad_minutos"
                ),
            "edad_texto":
                frescura.get(
                    "edad_texto"
                ),
        }

        if anterior is None:
            actual["inicio"] = iso(fecha)

            registrar_evento(
                estado,
                "FUENTE_DESACTUALIZADA",
                fecha,
                actual,
                {
                    "actualizado_cen":
                        actual[
                            "actualizado_cen"
                        ],
                    "edad_minutos":
                        actual[
                            "edad_minutos"
                        ],
                    "edad_texto":
                        actual[
                            "edad_texto"
                        ],
                }
            )

        else:
            actual["inicio"] = (
                anterior.get("inicio")
                or iso(fecha)
            )

            if (
                anterior.get("estado")
                != actual.get("estado")
            ):
                registrar_evento(
                    estado,
                    "FUENTE_CAMBIO_ESTADO",
                    fecha,
                    actual,
                    {
                        "estado_anterior":
                            anterior.get(
                                "estado"
                            ),
                        "actualizado_cen":
                            actual[
                                "actualizado_cen"
                            ],
                        "edad_minutos":
                            actual[
                                "edad_minutos"
                            ],
                    }
                )

        estado[
            "fuente_cen_alerta_activa"
        ] = actual

        return

    if anterior is None:
        return

    inicio = parsear_iso(
        anterior.get("inicio")
    )

    duracion_min = None

    if inicio:
        duracion_min = max(
            0,
            round(
                (
                    fecha - inicio
                ).total_seconds()
                / 60,
                1
            )
        )

    normalizada = dict(anterior)
    normalizada["estado"] = "NORMALIZADA"
    normalizada["ultima_vez"] = iso(fecha)

    registrar_evento(
        estado,
        "FUENTE_NORMALIZADA",
        fecha,
        normalizada,
        {
            "fin": iso(fecha),
            "duracion_minutos":
                duracion_min,
            "actualizado_cen":
                frescura.get(
                    "actualizado_cen"
                ),
            "edad_minutos":
                frescura.get(
                    "edad_minutos"
                ),
            "edad_texto":
                frescura.get(
                    "edad_texto"
                ),
        }
    )

    estado[
        "fuente_cen_alerta_activa"
    ] = None


def slot_evidencia(fecha):
    hora = fecha.hour - (
        fecha.hour % 2
    )

    inicio = fecha.replace(
        hour=hora,
        minute=0,
        second=0,
        microsecond=0
    )

    return inicio.strftime(
        "%Y-%m-%d_%H"
    )


def registrar_evidencia(
    estado,
    snapshot,
    fecha,
    forzar=False
):
    slot = slot_evidencia(fecha)

    if (
        not forzar
        and estado.get(
            "ultimo_slot_evidencia"
        ) == slot
    ):
        return None

    ruta = (
        CARPETA_EVIDENCIAS
        / f"{fecha:%Y-%m-%d}.json"
    )

    documento = cargar_json(
        ruta,
        {
            "fecha": fecha.strftime(
                "%Y-%m-%d"
            ),
            "zona_horaria":
                "America/Santiago",
            "revisiones": [],
        }
    )

    revisiones = documento.setdefault(
        "revisiones",
        []
    )

    evidencia = {
        "slot": slot,
        "registrado_en": iso(fecha),
        "estado": snapshot["estado"],
        "estado_senales":
            snapshot.get(
                "estado_senales"
            ),
        "frescura_cen":
            snapshot.get(
                "frescura_cen"
            ),
        "total": snapshot["total"],
        "recibidas": snapshot["recibidas"],
        "validas": snapshot["validas"],
        "faltantes": snapshot["faltantes"],
        "incidentes": snapshot["incidentes"],
        "actualizado_cen":
            snapshot.get(
                "actualizado_cen"
            ),
        "instalaciones":
            snapshot[
                "instalaciones"
            ],
    }

    # Si se fuerza una prueba, no reemplaza
    # la evidencia operacional normal.
    if forzar:
        evidencia["prueba"] = True
        evidencia["slot"] = (
            "PRUEBA_"
            + fecha.strftime(
                "%H%M%S"
            )
        )
    else:
        revisiones[:] = [
            item
            for item in revisiones
            if item.get("slot") != slot
        ]

    revisiones.append(evidencia)

    revisiones.sort(
        key=lambda item:
            item.get(
                "registrado_en",
                ""
            )
    )

    guardar_json(
        ruta,
        documento
    )

    if not forzar:
        estado[
            "ultimo_slot_evidencia"
        ] = slot

    return evidencia


def ventana_reporte(
    fecha,
    hora_reporte
):
    fin = fecha.replace(
        hour=hora_reporte,
        minute=0,
        second=0,
        microsecond=0
    )

    if hora_reporte == 9:
        inicio = (
            fin - timedelta(days=1)
        ).replace(
            hour=17
        )
    else:
        inicio = fin.replace(
            hour=9
        )

    return inicio, fin


def obtener_revisiones_en_ventana(
    inicio,
    fin
):
    revisiones = []

    dia = inicio.date()
    ultimo_dia = fin.date()

    while dia <= ultimo_dia:
        ruta = (
            CARPETA_EVIDENCIAS
            / f"{dia.isoformat()}.json"
        )

        documento = cargar_json(
            ruta,
            {}
        )

        for item in documento.get(
            "revisiones",
            []
        ):
            if item.get("prueba"):
                continue

            fecha_item = parsear_iso(
                item.get("registrado_en")
            )

            if (
                fecha_item
                and inicio <= fecha_item <= fin
            ):
                revisiones.append(item)

        dia += timedelta(days=1)

    revisiones.sort(
        key=lambda item:
            item.get(
                "registrado_en",
                ""
            )
    )

    return revisiones


def eventos_en_ventana(
    estado,
    inicio,
    fin
):
    resultado = []

    for evento in estado.get(
        "eventos",
        []
    ):
        fecha_evento = parsear_iso(
            evento.get("fecha")
        )

        if (
            fecha_evento
            and inicio <= fecha_evento <= fin
        ):
            resultado.append(evento)

    return resultado


def porcentaje_texto(valor):
    try:
        numero = float(valor)
    except Exception:
        return "--"

    if numero == 100:
        return "100 %"

    return (
        f"{numero:.1f}"
        .replace(".", ",")
        + " %"
    )


def estado_reporte_texto(snapshot):
    if not snapshot:
        return "⚪", "SIN EVIDENCIA AL CORTE"

    faltantes = int(snapshot.get("faltantes") or 0)
    incidentes = int(snapshot.get("incidentes") or 0)

    if (
        snapshot.get("estado_senales") == "INCIDENCIA"
        or faltantes > 0
        or incidentes > 0
    ):
        return "🔴", "INCIDENCIA SITR"

    frescura = snapshot.get("frescura_cen") or {}
    estado_fuente = frescura.get("estado")

    if estado_fuente == "FRESCO":
        return "🟢", "OK"
    if estado_fuente == "RETRASADO":
        return "🟡", "CEN RETRASADO"
    if estado_fuente == "DESACTUALIZADO":
        return "🔴", "CEN DESACTUALIZADO"

    return "🔴", "FRESCURA CEN DESCONOCIDA"


def agregar_bloque_estado(lineas, titulo, snapshot):
    lineas.append(titulo)

    if not snapshot:
        lineas.append(
            "⚪ Sin evidencia operacional disponible para este corte."
        )
        return

    icono, etiqueta = estado_reporte_texto(snapshot)
    lineas.append(f"{icono} Resultado: {etiqueta}")

    referencia = (
        snapshot.get("registrado_en")
        or snapshot.get("fecha")
        or "--"
    )
    lineas.append(f"Referencia: {referencia}")

    total = int(snapshot.get("total") or 0)
    recibidas = int(snapshot.get("recibidas") or 0)
    validas = int(snapshot.get("validas") or 0)
    faltantes = int(snapshot.get("faltantes") or 0)
    incidentes = int(snapshot.get("incidentes") or 0)

    lineas.append(
        "Variables: "
        f"{validas}/{total} válidas · "
        f"{recibidas}/{total} recibidas · "
        f"{faltantes} faltantes · "
        f"{incidentes} incidencias"
    )

    frescura = snapshot.get("frescura_cen") or {}

    icono_fuente = {
        "FRESCO": "🟢",
        "RETRASADO": "🟡",
        "DESACTUALIZADO": "🔴",
        "DESCONOCIDA": "🔴",
    }.get(frescura.get("estado"), "⚪")

    lineas.append(
        "Frescura CEN: "
        f"{icono_fuente} "
        f"{frescura.get('estado') or 'SIN DATO'} · "
        f"{frescura.get('edad_texto') or 'desconocida'}"
    )
    lineas.append(
        "Última actualización CEN: "
        f"{snapshot.get('actualizado_cen') or '--'}"
    )

    for central in snapshot.get("instalaciones", []):
        valor = porcentaje_texto(central.get("disponibilidad"))
        lineas.append(
            f"{central.get('nombre') or 'Central'}: {valor}"
        )


def construir_texto_reporte(reporte):
    corte = reporte.get("estado_corte")
    emision = (
        reporte.get("estado_emision")
        or reporte.get("estado_actual")
        or corte
    )

    hora = reporte.get("hora_programada", "--:--")
    inicio = parsear_iso(reporte.get("periodo_desde"))
    fin = parsear_iso(reporte.get("periodo_hasta"))

    fecha_txt = (
        fin.astimezone(TZ).strftime("%d-%m-%Y")
        if fin
        else _fecha_operacional(reporte.get("emitido_en"))
    )
    desde = (
        inicio.astimezone(TZ).strftime("%H:%M")
        if inicio
        else "--"
    )
    hasta = (
        fin.astimezone(TZ).strftime("%H:%M")
        if fin
        else hora
    )

    icono, estado_general = _estado_general_simple(
        emision
    )

    lineas = [
        "📡 REPORTE SITR",
        f"{fecha_txt} | Corte {hora}",
        "",
        f"{icono} ESTADO GENERAL: {estado_general}",
        "",
        f"Período: {desde} → {hasta}",
        "",
    ]

    instalaciones = (
        emision.get("instalaciones", [])
        if emision
        else []
    )

    for central in instalaciones:
        nombre = _nombre_central_corto(
            central.get("nombre")
        ).upper()

        total = int(
            central.get("variables_total") or 0
        )
        validas = int(
            central.get("variables_validas") or 0
        )

        lineas.extend([
            f"CENTRAL {nombre}",
            f"{validas}/{total} variables válidas",
            (
                "Disponibilidad SITR: "
                f"{porcentaje_texto(central.get('disponibilidad'))}"
            ),
            "",
        ])

    if emision:
        total = int(emision.get("total") or 0)
        validas = int(emision.get("validas") or 0)
        faltantes = int(emision.get("faltantes") or 0)
        incidentes = int(emision.get("incidentes") or 0)

        lineas.extend([
            "RESUMEN",
            f"{validas}/{total} variables válidas",
            f"{faltantes} variables faltantes",
            f"{incidentes} incidencias",
            "",
        ])

        frescura = emision.get("frescura_cen") or {}
        estado_fuente = frescura.get("estado") or "SIN DATO"

        icono_fuente = {
            "FRESCO": "🟢",
            "RETRASADO": "🟡",
            "DESACTUALIZADO": "🔴",
            "DESCONOCIDA": "🔴",
        }.get(estado_fuente, "⚪")

        etiqueta_fuente = {
            "FRESCO": "Actualizada",
            "RETRASADO": "Retrasada",
            "DESACTUALIZADO": "Desactualizada",
            "DESCONOCIDA": "Sin fecha válida",
        }.get(estado_fuente, estado_fuente)

        lineas.extend([
            "FUENTE CEN",
            f"{icono_fuente} {etiqueta_fuente}",
            (
                "Última actualización: "
                f"{emision.get('actualizado_cen') or '--'}"
            ),
            (
                "Antigüedad: "
                f"{frescura.get('edad_texto') or '--'}"
            ),
            "",
        ])

    if corte:
        referencia = (
            corte.get("registrado_en")
            or corte.get("fecha")
        )
        frescura_corte = corte.get("frescura_cen") or {}

        lineas.extend([
            "ÚLTIMA EVIDENCIA PREVIA AL CORTE",
            (
                f"{_hora_operacional(referencia)} · "
                f"{corte.get('validas', 0)}/"
                f"{corte.get('total', 0)} válidas · "
                f"CEN "
                f"{str(frescura_corte.get('estado') or '--').lower()} "
                f"({frescura_corte.get('edad_texto') or '--'})"
            ),
            "",
        ])
    else:
        lineas.extend([
            "ÚLTIMA EVIDENCIA PREVIA AL CORTE",
            "⚪ Sin evidencia registrada antes del corte.",
            "",
        ])

    # EVENTOS_SITR_DETALLADOS_V1
    eventos = reporte.get("eventos", [])

    lineas.append("EVENTOS DEL PERÍODO")

    if eventos:
        for evento in eventos:
            tipo = str(evento.get("tipo") or "")
            normalizada = tipo in (
                "NORMALIZADA",
                "FUENTE_NORMALIZADA",
            )
            es_fuente = tipo.startswith("FUENTE_")
            icono_evento = "🟢" if normalizada else "🔴"
            hora_evento = _hora_operacional(
                evento.get("fecha")
            )

            if es_fuente:
                linea = (
                    f"{icono_evento} {hora_evento} — "
                    f"{_evento_humano(evento)}"
                )

                duracion = _duracion_humana(
                    evento.get("duracion_minutos")
                )
                if duracion:
                    linea += f" · duración {duracion}"

                lineas.append(linea)
                continue

            central = _nombre_central_corto(
                evento.get("central")
                or evento.get("coordinado")
            )
            variable = (
                evento.get("variable")
                or evento.get("irn")
                or "Variable no identificada"
            )

            lineas.append(
                f"{icono_evento} {hora_evento} — "
                f"{central.upper()}"
            )
            lineas.append(
                f"Variable: {variable}"
            )

            if normalizada:
                lineas.append("Condición: Normalizada")
            else:
                estado = str(
                    evento.get("estado") or ""
                ).strip().upper()

                if estado == "NO REPORTA":
                    condicion = "No reporta"
                elif estado:
                    condicion = estado.title()
                else:
                    condicion = _evento_humano(evento)

                lineas.append(
                    f"Condición: {condicion}"
                )

            duracion = _duracion_humana(
                evento.get("duracion_minutos")
            )
            if duracion:
                lineas.append(
                    f"Duración: {duracion}"
                )

            lineas.append("")
    else:
        lineas.append("✓ Sin eventos SITR en el período.")

    lineas.extend([
        "",
        "EVIDENCIAS",
        (
            f"{len(reporte.get('evidencias', []))} controles automáticos "
            "registrados en el período."
        ),
        "",
        "Fuente: Coordinador Eléctrico Nacional",
    ])

    return "\n".join(lineas)


def generar_reporte(
    estado,
    snapshot,
    fecha,
    hora_reporte,
    prueba=False
):
    inicio, fin = ventana_reporte(fecha, hora_reporte)

    evidencias = obtener_revisiones_en_ventana(inicio, fin)
    eventos = eventos_en_ventana(estado, inicio, fin)

    # El estado del reporte representa el corte programado,
    # no el momento tardío en que finalmente se emite.
    estado_corte = evidencias[-1] if evidencias else None

    reporte = {
        "tipo": "REPORTE_SITR",
        "hora_programada": f"{hora_reporte:02d}:00",
        "emitido_en": iso(fecha),
        "periodo_desde": iso(inicio),
        "periodo_hasta": iso(fin),
        "estado_corte": estado_corte,
        "estado_emision": snapshot,
        # Compatibilidad con lecturas/reportes anteriores.
        "estado_actual": snapshot,
        "evidencias": evidencias,
        "eventos": eventos,
        "prueba": prueba,
    }

    sufijo = "_PRUEBA" if prueba else ""
    nombre = (
        f"{fecha:%Y-%m-%d}_"
        f"{hora_reporte:02d}-00"
        f"{sufijo}"
    )

    ruta_json = CARPETA_REPORTES / f"{nombre}.json"
    ruta_txt = CARPETA_REPORTES / f"{nombre}.txt"

    guardar_json(ruta_json, reporte)
    ruta_txt.write_text(
        construir_texto_reporte(reporte),
        encoding="utf-8",
    )

    return {
        "json": str(ruta_json),
        "txt": str(ruta_txt),
        "reporte": reporte,
    }

def inicializar_marcas_reporte(
    estado,
    fecha
):
    """
    En el primer arranque evita fabricar reportes
    retroactivos de horas anteriores, porque todavía
    no existen evidencias históricas del monitor.
    """
    if estado.get("inicializado_en"):
        return

    estado["inicializado_en"] = iso(fecha)

    for hora in HORAS_REPORTE:
        programada = fecha.replace(
            hour=hora,
            minute=0,
            second=0,
            microsecond=0
        )

        if fecha < programada:
            continue

        campo = (
            "ultimo_reporte_09"
            if hora == 9
            else "ultimo_reporte_17"
        )

        estado[campo] = (
            f"{fecha:%Y-%m-%d}_"
            f"{hora:02d}"
        )


def reportes_pendientes(
    estado,
    fecha
):
    pendientes = []

    for hora in HORAS_REPORTE:
        programada = fecha.replace(
            hour=hora,
            minute=0,
            second=0,
            microsecond=0
        )

        if fecha < programada:
            continue

        campo = (
            "ultimo_reporte_09"
            if hora == 9
            else "ultimo_reporte_17"
        )

        clave_hoy = (
            f"{fecha:%Y-%m-%d}_"
            f"{hora:02d}"
        )

        if estado.get(campo) == clave_hoy:
            continue

        pendientes.append(
            (hora, campo, clave_hoy)
        )

    return pendientes



def _env_bool(nombre, por_defecto=False):
    valor = os.environ.get(nombre)

    if valor is None:
        return por_defecto

    return str(valor).strip().lower() in (
        "1",
        "true",
        "yes",
        "si",
        "sí",
        "on",
    )


def configuracion_correo():
    url = os.environ.get(
        "ALERTAS_OPERACIONALES_HTTP_URL",
        ""
    ).strip()

    return {
        "url": url,
    }


def correo_configurado():
    config = configuracion_correo()

    return bool(
        config["url"]
        and config["url"].startswith(
            "https://"
        )
    )


def enviar_correo(asunto, cuerpo):
    config = configuracion_correo()

    if not correo_configurado():
        raise RuntimeError(
            "Power Automate no configurado. "
            "Falta ALERTAS_OPERACIONALES_HTTP_URL."
        )

    asunto_limpio = str(
        asunto or "Notificación Operacional SITR"
    )
    asunto_upper = asunto_limpio.upper()

    es_reporte = "REPORTE" in asunto_upper

    es_normalizacion = (
        "NORMALIZADA" in asunto_upper
        or "NORMALIZADO" in asunto_upper
        or "🟢" in asunto_limpio
    )

    if es_reporte:
        tipo = "REPORTE"

        if any(
            marca in asunto_upper
            for marca in (
                "DESACTUALIZADO",
                "INCIDENCIA",
                "SIN EVIDENCIA",
                "DESCONOCIDA",
            )
        ):
            nivel = "ALERTA"
        elif "RETRASADO" in asunto_upper:
            nivel = "ADVERTENCIA"
        else:
            nivel = "INFORMATIVO"
    else:
        tipo = "SITR"
        nivel = (
            "NORMALIZADA"
            if es_normalizacion
            else "ALERTA"
        )

    texto = (
        str(cuerpo or "")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )

    # Power Automate envía el cuerpo como HTML.
    # Se conservan los saltos de línea para Outlook.
    mensaje_html = html.escape(
        texto,
        quote=False,
    ).replace("\n", "<br>")

    payload = {
        "tipo": tipo,
        "nivel": nivel,
        "asunto": asunto_limpio,
        "mensaje": mensaje_html,
        "instalacion": "Seguimiento SITR",
        "fecha": ahora_chile().strftime(
            "%Y-%m-%d %H:%M:%S"
        ),
        "destinatarios": "",
    }

    respuesta = requests.post(
        config["url"],
        json=payload,
        timeout=30,
    )

    if not (200 <= respuesta.status_code < 300):
        detalle = (
            respuesta.text[:1000]
            if respuesta.text
            else "sin detalle"
        )

        raise RuntimeError(
            "Power Automate HTTP "
            f"{respuesta.status_code}: "
            f"{detalle}"
        )


# FORMATO_CORREO_SITR_SIMPLE_V2

def _hora_operacional(valor):
    fecha = parsear_iso(valor)
    if not fecha:
        return "--"
    return fecha.astimezone(TZ).strftime("%H:%M")


def _fecha_operacional(valor):
    fecha = parsear_iso(valor)
    if not fecha:
        return "--"
    return fecha.astimezone(TZ).strftime("%d-%m-%Y")


def _duracion_humana(minutos):
    if minutos is None:
        return None
    try:
        total = max(0, int(round(float(minutos))))
    except Exception:
        return None

    horas, resto = divmod(total, 60)

    if horas and resto:
        return f"{horas} h {resto} min"
    if horas:
        return f"{horas} h"
    return f"{resto} min"


def _nombre_central_corto(valor):
    valor = str(valor or "").strip()

    equivalencias = {
        "Central Capullo": "Capullo",
        "Central Pulelfu": "Pulelfu",
        "CAPULLO": "Capullo",
        "LA LEONERA": "Pulelfu",
    }

    return equivalencias.get(valor, valor or "SITR")


def _evento_humano(evento):
    tipo = str(evento.get("tipo") or "")
    estado = str(evento.get("estado") or "")

    if tipo == "FUENTE_DESACTUALIZADA":
        return "Fuente CEN desactualizada"
    if tipo == "FUENTE_NORMALIZADA":
        return "Fuente CEN normalizada"
    if tipo == "FUENTE_CAMBIO_ESTADO":
        return "Cambio de estado de la fuente CEN"
    if tipo == "NORMALIZADA":
        return "Señal SITR normalizada"
    if tipo == "DETECTADA":
        if estado == "no_reporta":
            return "Variable SITR no reporta"
        if estado == "mala_calidad":
            return "Variable SITR con mala calidad"
        return "Incidencia SITR detectada"
    if tipo == "CAMBIO_ESTADO":
        if estado == "no_reporta":
            return "Variable SITR dejó de reportar"
        if estado == "mala_calidad":
            return "Variable SITR con mala calidad"
        return "Cambio de estado SITR"

    return tipo.replace("_", " ").capitalize() or "Evento SITR"


def _estado_general_simple(snapshot):
    icono, etiqueta = estado_reporte_texto(snapshot)

    equivalencias = {
        "OK": "NORMAL",
        "CEN RETRASADO": "FUENTE CEN RETRASADA",
        "CEN DESACTUALIZADO": "FUENTE CEN DESACTUALIZADA",
        "INCIDENCIA SITR": "INCIDENCIA SITR",
        "SIN EVIDENCIA AL CORTE": "SIN EVIDENCIA",
    }

    return icono, equivalencias.get(etiqueta, etiqueta)


def asunto_evento(evento):
    tipo = str(evento.get("tipo") or "")
    normalizada = tipo in (
        "NORMALIZADA",
        "FUENTE_NORMALIZADA",
    )

    if tipo.startswith("FUENTE_"):
        if normalizada:
            return "SITR | 🟢 Fuente CEN normalizada"
        return "SITR | 🔴 Alerta fuente CEN"

    central = _nombre_central_corto(
        evento.get("central")
        or evento.get("coordinado")
    )

    if normalizada:
        return f"SITR | 🟢 Normalizado | {central}"

    return f"SITR | 🔴 Alerta | {central}"


def cuerpo_evento(evento, snapshot):
    tipo = str(evento.get("tipo") or "")
    normalizada = tipo in (
        "NORMALIZADA",
        "FUENTE_NORMALIZADA",
    )
    es_fuente = tipo.startswith("FUENTE_")

    icono = "🟢" if normalizada else "🔴"

    if es_fuente:
        titulo = (
            "FUENTE CEN NORMALIZADA"
            if normalizada
            else "ALERTA FUENTE CEN"
        )
    else:
        titulo = (
            "SITR NORMALIZADO"
            if normalizada
            else "ALERTA SITR"
        )

    lineas = [
        f"{icono} {titulo}",
        "",
    ]

    if not es_fuente:
        central = _nombre_central_corto(
            evento.get("central")
            or evento.get("coordinado")
        )
        lineas.append(f"Central: {central}")

    lineas.append(
        f"Condición: {_evento_humano(evento)}"
    )

    if evento.get("variable"):
        lineas.append(
            f"Variable: {evento.get('variable')}"
        )

    etiqueta_hora = (
        "Normalizada"
        if normalizada
        else "Detectada"
    )
    lineas.append(
        f"{etiqueta_hora}: {_hora_operacional(evento.get('fecha'))}"
    )

    duracion = _duracion_humana(
        evento.get("duracion_minutos")
    )
    if duracion:
        lineas.append(f"Duración: {duracion}")

    frescura = snapshot.get("frescura_cen") or {}

    lineas.extend([
        "",
        "ESTADO",
        (
            f"{snapshot.get('validas', 0)}/"
            f"{snapshot.get('total', 0)} variables válidas"
        ),
        f"{snapshot.get('faltantes', 0)} variables faltantes",
    ])

    if es_fuente:
        lineas.extend([
            (
                "Última actualización CEN: "
                f"{snapshot.get('actualizado_cen') or '--'}"
            ),
            (
                "Antigüedad: "
                f"{frescura.get('edad_texto') or '--'}"
            ),
        ])

    lineas.extend([
        "",
        "ACCIÓN",
    ])

    if normalizada:
        lineas.append(
            "Condición normalizada. Mantener seguimiento operacional."
        )
    elif es_fuente:
        lineas.append(
            "Verificar actualización del tablero del Coordinador."
        )
    else:
        lineas.append(
            "Revisar disponibilidad SITR y gestionar SS de alta prioridad "
            "si corresponde según procedimiento interno."
        )

    lineas.extend([
        "",
        "Fuente: Coordinador Eléctrico Nacional",
    ])

    return "\n".join(lineas)


def encolar_correo(
    estado,
    identificador,
    tipo,
    asunto,
    cuerpo,
    fecha
):
    cola = estado.setdefault(
        "cola_correo",
        []
    )

    ids_existentes = {
        item.get("id")
        for item in cola
    }

    if identificador in ids_existentes:
        return False

    cola.append({
        "id": identificador,
        "tipo": tipo,
        "creado_en": iso(fecha),
        "asunto": asunto,
        "cuerpo": cuerpo,
        "intentos": 0,
        "ultimo_error": None,
    })

    # Seguridad frente a crecimiento accidental.
    estado["cola_correo"] = cola[-100:]

    return True


def encolar_eventos_correo(
    estado,
    snapshot,
    fecha
):
    if not correo_configurado():
        return 0

    cantidad = 0

    for evento in estado.get(
        "eventos_ultima_ejecucion",
        []
    ):
        identificador = (
            "evento|"
            f"{evento.get('fecha')}|"
            f"{evento.get('tipo')}|"
            f"{evento.get('clave')}"
        )

        agregado = encolar_correo(
            estado,
            identificador,
            "EVENTO",
            asunto_evento(evento),
            cuerpo_evento(
                evento,
                snapshot
            ),
            fecha
        )

        if agregado:
            cantidad += 1

    return cantidad


def encolar_reportes_correo(estado, reportes, fecha):
    if not correo_configurado():
        return 0

    cantidad = 0

    for item in reportes:
        reporte = item.get("reporte", {})

        if reporte.get("prueba"):
            continue

        hora = reporte.get(
            "hora_programada",
            "--:--"
        )

        emision = (
            reporte.get("estado_emision")
            or reporte.get("estado_actual")
            or reporte.get("estado_corte")
        )

        icono, estado_simple = _estado_general_simple(
            emision
        )

        identificador = (
            "reporte|"
            f"{reporte.get('periodo_hasta')}|"
            f"{hora}"
        )

        asunto = (
            f"SITR | Reporte {hora} | "
            f"{icono} {estado_simple.title()}"
        )

        cuerpo = construir_texto_reporte(
            reporte
        )

        agregado = encolar_correo(
            estado,
            identificador,
            "REPORTE",
            asunto,
            cuerpo,
            fecha,
        )

        if agregado:
            cantidad += 1

    return cantidad


def procesar_cola_correo(
    estado
):
    cola = list(
        estado.get(
            "cola_correo",
            []
        )
    )

    if not cola:
        return {
            "enviados": 0,
            "fallidos": 0,
        }

    if not correo_configurado():
        return {
            "enviados": 0,
            "fallidos": 0,
        }

    pendientes = []
    enviados = 0
    fallidos = 0

    for item in cola:
        try:
            enviar_correo(
                item["asunto"],
                item["cuerpo"]
            )

            enviados += 1

            print(
                "Correo enviado:",
                item.get("tipo"),
                item.get("id")
            )

        except Exception as exc:
            fallidos += 1

            item["intentos"] = (
                int(
                    item.get(
                        "intentos",
                        0
                    )
                )
                + 1
            )

            item["ultimo_error"] = (
                f"{type(exc).__name__}: "
                f"{exc}"
            )

            pendientes.append(
                item
            )

            print(
                "ERROR enviando correo:",
                item["ultimo_error"]
            )

    estado["cola_correo"] = (
        pendientes
    )

    return {
        "enviados": enviados,
        "fallidos": fallidos,
    }


def enviar_correo_prueba():
    if not correo_configurado():
        raise RuntimeError(
            "No se puede enviar correo de prueba: "
            "Power Automate no está configurado."
        )

    fecha = ahora_chile()

    asunto = (
        "Prueba de correo SITR"
    )

    cuerpo = "\n".join([
        "📡 ALERTAS OPERACIONALES - SITR",
        "",
        "Prueba de envío de correo exitosa.",
        f"Fecha Chile: {iso(fecha)}",
        "",
        "Si recibiste este mensaje, "
        "la conexión GitHub Actions → Power Automate → Outlook "
        "está operativa.",
    ])

    enviar_correo(
        asunto,
        cuerpo
    )

    print(
        "Correo de prueba enviado."
    )


def ejecutar(
    forzar_evidencia=False,
    reporte_prueba=None
):
    asegurar_carpetas()

    fecha = ahora_chile()

    print(
        "Consultando SITR:",
        iso(fecha)
    )

    datos = consultar_sitr()

    estado = cargar_estado()
    estado[
        "eventos_ultima_ejecucion"
    ] = []

    procesar_incidencias(
        estado,
        datos,
        fecha
    )

    snapshot = construir_snapshot(
        datos,
        fecha
    )

    procesar_frescura_fuente(
        estado,
        snapshot["frescura_cen"],
        fecha
    )

    estado["ultima_ejecucion"] = iso(fecha)
    estado[
        "ultima_consulta_cen"
    ] = datos.get("actualizado_cen")
    estado[
        "ultimo_snapshot"
    ] = snapshot

    inicializar_marcas_reporte(
        estado,
        fecha
    )

    evidencia = registrar_evidencia(
        estado,
        snapshot,
        fecha,
        forzar=forzar_evidencia
    )

    reportes = []

    for (
        hora,
        campo,
        clave
    ) in reportes_pendientes(
        estado,
        fecha
    ):
        resultado = generar_reporte(
            estado,
            snapshot,
            fecha,
            hora,
            prueba=False
        )

        reportes.append(resultado)
        estado[campo] = clave

    if reporte_prueba in HORAS_REPORTE:
        reportes.append(
            generar_reporte(
                estado,
                snapshot,
                fecha,
                reporte_prueba,
                prueba=True
            )
        )

    nuevos_eventos_correo = (
        encolar_eventos_correo(
            estado,
            snapshot,
            fecha
        )
    )

    nuevos_reportes_correo = (
        encolar_reportes_correo(
            estado,
            reportes,
            fecha
        )
    )

    # Guardamos la cola antes de intentar enviar.
    # Si Power Automate falla, quedará pendiente para la
    # siguiente ejecución del monitor.
    guardar_json(
        ARCHIVO_ESTADO,
        estado
    )

    resultado_correo = (
        procesar_cola_correo(
            estado
        )
    )

    # Persistimos los correos enviados o pendientes.
    guardar_json(
        ARCHIVO_ESTADO,
        estado
    )

    print(
        "Estado:",
        snapshot["estado"]
    )
    print(
        "Variables:",
        f"{snapshot['validas']}/"
        f"{snapshot['total']} válidas"
    )
    print(
        "Faltantes:",
        snapshot["faltantes"]
    )
    print(
        "Incidencias:",
        snapshot["incidentes"]
    )
    print(
        "Frescura CEN:",
        snapshot["frescura_cen"]["estado"],
        "-",
        snapshot["frescura_cen"]["edad_texto"],
        "- última actualización",
        snapshot.get("actualizado_cen")
    )

    if evidencia:
        print(
            "Evidencia guardada:",
            evidencia["slot"]
        )

    if estado[
        "eventos_ultima_ejecucion"
    ]:
        print(
            "Eventos nuevos:"
        )

        for evento in estado[
            "eventos_ultima_ejecucion"
        ]:
            print(
                "-",
                evento["tipo"],
                evento.get(
                    "central"
                ),
                evento.get(
                    "variable"
                ),
                evento.get(
                    "estado"
                )
            )
    else:
        print(
            "Eventos nuevos: 0"
        )

    for item in reportes:
        print(
            "Reporte generado:",
            item["txt"]
        )

    if correo_configurado():
        print(
            "Correo SITR: configurado"
        )
        print(
            "Correos nuevos encolados:",
            nuevos_eventos_correo
            + nuevos_reportes_correo
        )
        print(
            "Correos enviados:",
            resultado_correo[
                "enviados"
            ]
        )
        print(
            "Correos pendientes:",
            len(
                estado.get(
                    "cola_correo",
                    []
                )
            )
        )
    else:
        print(
            "Correo SITR: no configurado"
        )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Monitor operacional SITR "
            "de GridVision"
        )
    )

    parser.add_argument(
        "--forzar-evidencia",
        action="store_true",
        help=(
            "Genera una evidencia de prueba "
            "sin alterar el slot operacional."
        )
    )

    parser.add_argument(
        "--reporte-prueba",
        type=int,
        choices=[9, 17],
        help=(
            "Genera un reporte de prueba "
            "para la ventana 09:00 o 17:00."
        )
    )

    parser.add_argument(
        "--correo-prueba",
        action="store_true",
        help=(
            "Envía un correo de prueba usando "
            "Power Automate."
        )
    )

    args = parser.parse_args()

    if args.correo_prueba:
        enviar_correo_prueba()
        return

    ejecutar(
        forzar_evidencia=args.forzar_evidencia,
        reporte_prueba=args.reporte_prueba
    )


if __name__ == "__main__":
    main()
