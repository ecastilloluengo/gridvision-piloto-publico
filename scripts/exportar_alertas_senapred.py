import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from senapred_alertas import (
    obtener_alertas,
    obtener_tipos_alerta,
    alerta_es_relevante,
)

from senapred_normalizador import (
    normalizar_alerta,
)


# ============================================================
# CONFIGURACIÓN
# ============================================================

DIAS_CONSULTA = 60

RUTA_PROYECTO = Path(__file__).resolve().parent.parent

ARCHIVO_SALIDA = (
    RUTA_PROYECTO
    / "data"
    / "alertas_senapred.json"
)


# ============================================================
# GENERAR JSON PARA GRIDVISION
# ============================================================

def generar_json():

    print()
    print("========================================")
    print(" GRIDVISION - EXPORTAR ALERTAS SENAPRED")
    print("========================================")
    print()

    tipos = obtener_tipos_alerta()

    alertas = obtener_alertas(
        dias=DIAS_CONSULTA
    )

    relevantes = [
        alerta
        for alerta in alertas
        if alerta_es_relevante(alerta)
    ]

    normalizadas = [
        normalizar_alerta(
            alerta,
            tipos
        )
        for alerta in relevantes
    ]

    # Ordenar de más reciente a más antigua
    normalizadas.sort(
        key=lambda x: x.get("fechaHora") or "",
        reverse=True
    )

    ahora_chile = datetime.now(
        ZoneInfo("America/Santiago")
    )

    salida = {
        "fuente": "SENAPRED",
        "sistema": "GridVision Chile",

        "generadoEn":
            ahora_chile.isoformat(),

        "diasConsulta":
            DIAS_CONSULTA,

        "totalAlertasSenapred":
            len(alertas),

        "totalAlertasRelevantes":
            len(normalizadas),

        "alertas":
            normalizadas
    }

    ARCHIVO_SALIDA.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        ARCHIVO_SALIDA,
        "w",
        encoding="utf-8"
    ) as archivo:

        json.dump(
            salida,
            archivo,
            ensure_ascii=False,
            indent=2
        )

    print(
        f"Alertas SENAPRED recibidas: "
        f"{len(alertas)}"
    )

    print(
        f"Alertas relevantes GridVision: "
        f"{len(normalizadas)}"
    )

    print()

    print(
        "Archivo generado:"
    )

    print(
        ARCHIVO_SALIDA
    )

    print()
    print("OK - Exportación terminada.")
    print()


if __name__ == "__main__":
    generar_json()