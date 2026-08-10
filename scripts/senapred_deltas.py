from datetime import datetime

from senapred_alertas import obtener_alertas


# Momento de la publicación SENAPRED que contenía
# el último listado "ALERTAS RELEVANTES VIGENTES"
CORTE = datetime.fromisoformat(
    "2026-08-07T11:19:06.066-04:00"
)


def convertir_fecha(valor):

    if not valor:
        return None

    try:
        return datetime.fromisoformat(valor)

    except ValueError:
        return None


if __name__ == "__main__":

    print()
    print("========================================")
    print(" GRIDVISION - CAMBIOS POSTERIORES")
    print(" AL RESUMEN SENAPRED")
    print("========================================")
    print()

    alertas = obtener_alertas(
        dias=60
    )

    posteriores = []

    for alerta in alertas:

        fecha = convertir_fecha(
            alerta.get("fechaHora")
        )

        if (
            fecha
            and fecha > CORTE
        ):
            posteriores.append(
                alerta
            )


    posteriores.sort(
        key=lambda x:
            x.get("fechaHora") or ""
    )


    print(
        "Publicaciones posteriores:",
        len(posteriores)
    )

    print()


    for numero, alerta in enumerate(
        posteriores,
        start=1
    ):

        print("=" * 70)

        print(
            f"{numero}. "
            f"{alerta.get('titulo')}"
        )

        print(
            "Fecha:",
            alerta.get("fechaHora")
        )

        print(
            "URL:",
            alerta.get("urlAccess")
        )

        print(
            "Principal:",
            alerta.get("isPrincipal")
        )


    print()
    print("========================================")