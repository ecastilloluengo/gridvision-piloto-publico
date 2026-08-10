from senapred_alertas import (
    obtener_alertas,
    obtener_tipos_alerta,
    alerta_es_relevante,
)

from senapred_normalizador import (
    normalizar_alerta,
)


print()
print("========================================")
print(" GRIDVISION - ALERTAS NORMALIZADAS")
print("========================================")
print()


tipos = obtener_tipos_alerta()

alertas = obtener_alertas(
    dias=60
)

relevantes = [
    alerta
    for alerta in alertas
    if alerta_es_relevante(alerta)
]


for numero, alerta in enumerate(
    relevantes,
    start=1
):

    dato = normalizar_alerta(
        alerta,
        tipos
    )

    print("=" * 70)

    print(
        f"{numero}. {dato['titulo']}"
    )

    print(
        f"Fecha: {dato['fechaHora']}"
    )

    print(
        f"Nivel GridVision: "
        f"{dato['nivel']}"
    )

    print(
        f"Código visual: "
        f"{dato['codigoVisual']}"
    )

    print(
        f"Riesgo GridVision: "
        f"{dato['riesgo']}"
    )

    print(
        f"Regiones: "
        f"{dato['regiones']}"
    )

    if dato["provincias"]:
        print(
            f"Provincias: "
            f"{dato['provincias']}"
        )

    if dato["comunas"]:
        print(
            f"Comunas: "
            f"{dato['comunas']}"
        )

    print(
        f"Nivel original SENAPRED: "
        f"{dato['nivelSenapred']}"
    )


print()
print("========================================")