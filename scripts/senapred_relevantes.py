from senapred_client import obtener_eventos, convertir_metadata


REGIONES_INTERES = [
    "los lagos",
    "los ríos",
    "los rios",
    "magallanes",
]


def evento_es_relevante(evento):

    metadata = convertir_metadata(
        evento.get("metaData")
    )

    regiones = (
        metadata.get("regiones")
        or ""
    ).lower()

    return any(
        region in regiones
        for region in REGIONES_INTERES
    )


if __name__ == "__main__":

    print()
    print("========================================")
    print(" GRIDVISION - EVENTOS SENAPRED RELEVANTES")
    print("========================================")
    print()

    # Ampliamos a 30 días para probar mejor el filtro
    eventos = obtener_eventos(
        dias=30,
        limite=100
    )

    relevantes = [
        evento
        for evento in eventos
        if evento_es_relevante(evento)
    ]

    print()
    print(
        f"Eventos SENAPRED recibidos: {len(eventos)}"
    )

    print(
        f"Eventos relevantes GridVision: {len(relevantes)}"
    )

    print()

    for numero, evento in enumerate(
        relevantes,
        start=1
    ):

        metadata = convertir_metadata(
            evento.get("metaData")
        )

        tipo = (
            metadata.get("nombreVariable")
            or
            (
                evento.get("variableInformate")
                or {}
            ).get("nombre")
            or "Sin clasificar"
        )

        regiones = (
            metadata.get("regiones")
            or "Sin región"
        )

        print("=" * 70)

        print(
            f"{numero}. {evento.get('titulo')}"
        )

        print(
            f"Fecha: {evento.get('fechaHora')}"
        )

        print(
            f"Tipo: {tipo}"
        )

        print(
            f"Regiones: {regiones}"
        )

    print()
    print("========================================")