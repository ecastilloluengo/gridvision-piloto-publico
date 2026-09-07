import argparse
import json
import os
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
        "version": 2,
        "inicializado_en": None,
        "ultima_ejecucion": None,
        "ultima_consulta_cen": None,
        "ultimo_slot_evidencia": None,
        "ultimo_reporte_09": None,
        "ultimo_reporte_17": None,
        "incidencias_activas": {},
        "eventos": [],
        "eventos_ultima_ejecucion": [],
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

    return {
        "fecha": iso(fecha),
        "actualizado_cen": datos.get(
            "actualizado_cen"
        ),
        "total": total,
        "recibidas": recibidas,
        "validas": validas,
        "faltantes": faltantes,
        "incidentes": incidentes,
        "estado": (
            "OK"
            if (
                total > 0
                and faltantes == 0
                and incidentes == 0
            )
            else "INCIDENCIA"
        ),
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


def construir_texto_reporte(
    reporte
):
    lineas = []

    lineas.append(
        "📡 REPORTE SITR - PECKET ENERGY"
    )
    lineas.append(
        f"Emisión: {reporte['emitido_en']}"
    )
    lineas.append(
        "Período: "
        f"{reporte['periodo_desde']} "
        "→ "
        f"{reporte['periodo_hasta']}"
    )
    lineas.append("")

    actual = reporte["estado_actual"]

    icono = (
        "🟢"
        if actual["estado"] == "OK"
        else "🔴"
    )

    lineas.append(
        f"{icono} Estado actual: "
        f"{actual['validas']}/"
        f"{actual['total']} válidas"
    )
    lineas.append(
        f"Recibidas: "
        f"{actual['recibidas']}/"
        f"{actual['total']}"
    )
    lineas.append(
        f"Faltantes: "
        f"{actual['faltantes']}"
    )
    lineas.append(
        f"Incidencias activas: "
        f"{actual['incidentes']}"
    )
    lineas.append("")

    for central in actual["instalaciones"]:
        valor = porcentaje_texto(
            central.get("disponibilidad")
        )
        lineas.append(
            f"{central['nombre']}: {valor}"
        )

    lineas.append("")
    lineas.append(
        "Evidencias en el período: "
        f"{len(reporte['evidencias'])}"
    )

    if reporte["evidencias"]:
        for evidencia in reporte["evidencias"]:
            fecha_evidencia = parsear_iso(
                evidencia["registrado_en"]
            )

            hora = (
                fecha_evidencia.strftime("%H:%M")
                if fecha_evidencia
                else "--:--"
            )

            marca = (
                "🟢"
                if evidencia["estado"] == "OK"
                else "🔴"
            )

            lineas.append(
                f"{hora} {marca} "
                f"{evidencia['validas']}/"
                f"{evidencia['total']} válidas · "
                f"{evidencia['faltantes']} faltantes · "
                f"{evidencia['incidentes']} incidencias"
            )

    lineas.append("")

    eventos = reporte["eventos"]

    if eventos:
        lineas.append(
            "⚠ Eventos del período:"
        )

        for evento in eventos:
            fecha_evento = parsear_iso(
                evento["fecha"]
            )

            hora = (
                fecha_evento.strftime("%d-%m %H:%M")
                if fecha_evento
                else "--"
            )

            detalle = (
                f"{hora} · "
                f"{evento['tipo']} · "
                f"{evento.get('central') or '-'} · "
                f"{evento.get('variable') or '-'} · "
                f"{evento.get('estado') or '-'}"
            )

            if (
                evento.get("duracion_minutos")
                is not None
            ):
                detalle += (
                    " · duración "
                    f"{evento['duracion_minutos']} min"
                )

            lineas.append(detalle)
    else:
        lineas.append(
            "✓ Sin eventos SITR en el período."
        )

    lineas.append("")
    lineas.append(
        "Fuente: Coordinador Eléctrico Nacional"
    )

    return "\n".join(lineas)

def generar_reporte(
    estado,
    snapshot,
    fecha,
    hora_reporte,
    prueba=False
):
    inicio, fin = ventana_reporte(
        fecha,
        hora_reporte
    )

    evidencias = (
        obtener_revisiones_en_ventana(
            inicio,
            fin
        )
    )

    eventos = eventos_en_ventana(
        estado,
        inicio,
        fin
    )

    reporte = {
        "tipo":
            "REPORTE_SITR",
        "hora_programada":
            f"{hora_reporte:02d}:00",
        "emitido_en":
            iso(fecha),
        "periodo_desde":
            iso(inicio),
        "periodo_hasta":
            iso(fin),
        "estado_actual":
            snapshot,
        "evidencias":
            evidencias,
        "eventos":
            eventos,
        "prueba":
            prueba,
    }

    sufijo = (
        "_PRUEBA"
        if prueba
        else ""
    )

    nombre = (
        f"{fecha:%Y-%m-%d}_"
        f"{hora_reporte:02d}-00"
        f"{sufijo}"
    )

    ruta_json = (
        CARPETA_REPORTES
        / f"{nombre}.json"
    )

    ruta_txt = (
        CARPETA_REPORTES
        / f"{nombre}.txt"
    )

    guardar_json(
        ruta_json,
        reporte
    )

    ruta_txt.write_text(
        construir_texto_reporte(
            reporte
        ),
        encoding="utf-8"
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

    args = parser.parse_args()

    ejecutar(
        forzar_evidencia=args.forzar_evidencia,
        reporte_prueba=args.reporte_prueba
    )


if __name__ == "__main__":
    main()
