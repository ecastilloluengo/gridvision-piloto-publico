from datetime import datetime, timedelta

from senapred_client import ejecutar_graphql
from senapred_alertas import obtener_alertas


QUERY_HISTORIAL = """
query AlertasByTypeAndUrlAccessAndFechaHora(
    $type: String!,
    $urlAccessFechaHora:
        ModelAlertaByUrlAccessByDateCompositeKeyConditionInput,
    $sortDirection: ModelSortDirection,
    $filter: ModelAlertaFilterInput,
    $limit: Int,
    $nextToken: String
) {
    alertasByTypeAndUrlAccessAndFechaHora(
        type: $type
        urlAccessFechaHora: $urlAccessFechaHora
        sortDirection: $sortDirection
        filter: $filter
        limit: $limit
        nextToken: $nextToken
    ) {
        items {
            id
            titulo
            fechaHora

            isActive
            isDeleted
            isPrincipal

            parentId
            createdAt
            updatedAt

            urlAccess
            tipoAlertaId
        }

        nextToken
    }
}
"""


def obtener_historial(url_access, dias=365):

    ahora = datetime.now()

    inicio = (
        ahora - timedelta(days=dias)
    ).strftime("%Y-%m-%d")

    fin = ahora.strftime(
        "%Y-%m-%dT23:59:59"
    )

    variables = {
        "type": "Alerta",

        "urlAccessFechaHora": {
            "between": [
                {
                    "urlAccess": url_access,
                    "fechaHora": inicio
                },
                {
                    "urlAccess": url_access,
                    "fechaHora": fin
                }
            ]
        },

        # IMPORTANTE:
        # aquí NO filtramos isActive ni isPrincipal.
        # Queremos ver toda la historia.
        "filter": {
            "isDeleted": {
                "eq": False
            }
        },

        "sortDirection": "DESC",
        "limit": 100,
        "nextToken": None
    }

    respuesta = ejecutar_graphql(
        QUERY_HISTORIAL,
        variables
    )

    return (
        respuesta["data"]
        ["alertasByTypeAndUrlAccessAndFechaHora"]
        ["items"]
    )


if __name__ == "__main__":

    print()
    print("========================================")
    print(" GRIDVISION - HISTORIAL ALERTA SENAPRED")
    print("========================================")
    print()

    alertas = obtener_alertas(
        dias=60
    )

    # Para la primera prueba usamos San Pablo,
    # porque sabemos que hubo Roja -> Amarilla.
    alerta_prueba = next(
        (
            alerta
            for alerta in alertas
            if "San Pablo"
            in (alerta.get("titulo") or "")
        ),
        None
    )

    if not alerta_prueba:
        print(
            "No se encontró la alerta de San Pablo."
        )

        raise SystemExit(1)

    print("ALERTA PRINCIPAL ACTUAL:")
    print(
        alerta_prueba.get("titulo")
    )

    print()
    print("URL ACCESS:")
    print(
        alerta_prueba.get("urlAccess")
    )

    print()
    print("Consultando historial...")
    print()

    historial = obtener_historial(
        alerta_prueba["urlAccess"]
    )

    print(
        f"Versiones encontradas: "
        f"{len(historial)}"
    )

    print()

    for numero, item in enumerate(
        historial,
        start=1
    ):

        print("=" * 70)

        print(
            f"{numero}. "
            f"{item.get('titulo')}"
        )

        print(
            "Fecha:",
            item.get("fechaHora")
        )

        print(
            "isActive:",
            item.get("isActive")
        )

        print(
            "isPrincipal:",
            item.get("isPrincipal")
        )

        print(
            "parentId:",
            item.get("parentId")
        )

        print(
            "createdAt:",
            item.get("createdAt")
        )

        print(
            "updatedAt:",
            item.get("updatedAt")
        )

    print()
    print("========================================")