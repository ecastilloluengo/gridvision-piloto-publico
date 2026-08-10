from datetime import datetime, timedelta

from senapred_client import (
    ejecutar_graphql,
    convertir_metadata,
)


QUERY_ALERTAS = """
query AlertasByDate(
    $type: String!,
    $fechaHora: ModelStringKeyConditionInput,
    $sortDirection: ModelSortDirection,
    $filter: ModelAlertaFilterInput,
    $limit: Int,
    $nextToken: String
) {
    alertasByDate(
        type: $type
        fechaHora: $fechaHora
        sortDirection: $sortDirection
        filter: $filter
        limit: $limit
        nextToken: $nextToken
    ) {
        items {
    id
    titulo
    contenido
    fechaHora

    isActive
    isDeleted
    isPrincipal

    createdAt
    updatedAt
    parentId

    urlAccess
    metaData
    tipoAlertaId

    variableRiesgo {
        nombre
        codigo
        iconImg
    }
}

        nextToken
    }
}
"""


QUERY_TIPOS_ALERTA = """
query ListTipoAlertas(
    $filter: ModelTipoAlertaFilterInput,
    $limit: Int,
    $nextToken: String
) {
    listTipoAlertas(
        filter: $filter
        limit: $limit
        nextToken: $nextToken
    ) {
        items {
            id
            nombre
            codigo
        }

        nextToken
    }
}
"""


REGIONES_INTERES = [
    "los lagos",
    "los ríos",
    "los rios",
    "magallanes",
]


def obtener_tipos_alerta():

    respuesta = ejecutar_graphql(
        QUERY_TIPOS_ALERTA,
        {
            "filter": None,
            "limit": 100,
            "nextToken": None,
        }
    )

    items = (
        respuesta["data"]
        ["listTipoAlertas"]
        ["items"]
    )

    return {
        item["id"]: item
        for item in items
    }


def obtener_alertas(dias=60):

    ahora = datetime.now()

    inicio = (
        ahora - timedelta(days=dias)
    ).strftime("%Y-%m-%d")

    fin = ahora.strftime(
        "%Y-%m-%dT23:59:59"
    )

    variables = {

        "type": "Alerta",

        "fechaHora": {
            "between": [
                inicio,
                fin
            ]
        },

        "filter": {
            "isDeleted": {
                "eq": False
            },
            "isActive": {
                "eq": True
            },
            "isPrincipal": {
                "eq": True
            }
        },

        "sortDirection": "DESC",

        "limit": 100,

        "nextToken": None,
    }

    respuesta = ejecutar_graphql(
        QUERY_ALERTAS,
        variables
    )

    return (
        respuesta["data"]
        ["alertasByDate"]
        ["items"]
    )


def regiones_de_alerta(alerta):

    metadata = convertir_metadata(
        alerta.get("metaData")
    )

    return (
        metadata.get("regiones")
        or ""
    )


def alerta_es_relevante(alerta):

    regiones = regiones_de_alerta(
        alerta
    ).lower()

    return any(
        region in regiones
        for region in REGIONES_INTERES
    )


if __name__ == "__main__":

    print()
    print("========================================")
    print(" GRIDVISION - ALERTAS OFICIALES SENAPRED")
    print("========================================")
    print()

    tipos = obtener_tipos_alerta()

    print()
    print("Tipos oficiales encontrados:")
    print()

    for tipo in tipos.values():

        print(
            f"- {tipo.get('nombre')} "
            f"(codigo: {tipo.get('codigo')})"
        )

    alertas = obtener_alertas(
        dias=60
    )

    relevantes = [
        alerta
        for alerta in alertas
        if alerta_es_relevante(alerta)
    ]

    print()
    print(
        f"Alertas SENAPRED recibidas: "
        f"{len(alertas)}"
    )

    print(
        f"Alertas relevantes GridVision: "
        f"{len(relevantes)}"
    )

    print()

    for numero, alerta in enumerate(
        relevantes,
        start=1
    ):

        tipo = tipos.get(
            alerta.get("tipoAlertaId"),
            {}
        )

        riesgo = (
            alerta.get("variableRiesgo")
            or {}
        )

        print("=" * 70)

        print(
            f"{numero}. "
            f"{alerta.get('titulo', 'Sin título')}"
        )

        print(
            "Fecha:",
            alerta.get("fechaHora")
        )

        print(
            "Nivel SENAPRED:",
            tipo.get(
                "nombre",
                "No identificado"
            )
        )

        print(
            "Código nivel:",
            tipo.get(
                "codigo",
                ""
            )
        )

        print(
            "Riesgo:",
            riesgo.get(
                "nombre",
                "No identificado"
            )
        )

        print(
            "Regiones:",
            regiones_de_alerta(
                alerta
            )
        )

    print()
    print("========================================")