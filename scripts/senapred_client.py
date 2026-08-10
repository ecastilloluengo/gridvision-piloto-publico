import json
from datetime import datetime, timedelta

import boto3
import requests

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials


# ============================================================
# CONFIGURACIÓN SENAPRED
# ============================================================

AWS_REGION = "us-east-1"

IDENTITY_POOL_ID = (
    "us-east-1:17c696bc-53e1-49a2-991f-f1b65f752fda"
)

APPSYNC_URL = (
    "https://rz2uv7ifxbgflh2bqmp6kmh4le."
    "appsync-api.us-east-1.amazonaws.com/graphql"
)


# ============================================================
# CONSULTA GRAPHQL
# ============================================================

QUERY_EVENTOS = """
query EventosByDate(
    $type: String!,
    $fechaHora: ModelStringKeyConditionInput,
    $sortDirection: ModelSortDirection,
    $filter: ModelEventoFilterInput,
    $limit: Int,
    $nextToken: String
) {
    eventosByDate(
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
            autor
            isActive
            isDeleted
            urlAccess
            metaData

            variableInformate {
                nombre
                iconImg
            }
        }

        nextToken
    }
}
"""


# ============================================================
# CREDENCIALES TEMPORALES COGNITO
# ============================================================

def obtener_credenciales_temporales():

    print("1. Solicitando identidad temporal a SENAPRED...")

    cognito = boto3.client(
        "cognito-identity",
        region_name=AWS_REGION
    )

    identidad = cognito.get_id(
        IdentityPoolId=IDENTITY_POOL_ID
    )

    identity_id = identidad["IdentityId"]

    respuesta = cognito.get_credentials_for_identity(
        IdentityId=identity_id
    )

    credenciales = respuesta["Credentials"]

    print("   OK - Credenciales temporales obtenidas.")

    return Credentials(
        access_key=credenciales["AccessKeyId"],
        secret_key=credenciales["SecretKey"],
        token=credenciales["SessionToken"]
    )


# ============================================================
# CONSULTA APPSYNC
# ============================================================

def ejecutar_graphql(query, variables):

    credenciales = obtener_credenciales_temporales()

    payload = {
        "query": query,
        "variables": variables
    }

    body = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":")
    ).encode("utf-8")

    solicitud = AWSRequest(
        method="POST",
        url=APPSYNC_URL,
        data=body,
        headers={
            "Content-Type":
                "application/json; charset=UTF-8"
        }
    )

    SigV4Auth(
        credenciales,
        "appsync",
        AWS_REGION
    ).add_auth(solicitud)

    print("2. Consultando AWS AppSync de SENAPRED...")

    respuesta = requests.post(
        APPSYNC_URL,
        data=body,
        headers=dict(solicitud.headers.items()),
        timeout=30
    )

    print(
        f"   HTTP {respuesta.status_code}"
    )

    respuesta.raise_for_status()

    datos = respuesta.json()

    if datos.get("errors"):

        print("\nSENAPRED respondió con errores GraphQL:")

        print(
            json.dumps(
                datos["errors"],
                indent=2,
                ensure_ascii=False
            )
        )

        raise RuntimeError(
            "Error en consulta GraphQL."
        )

    return datos


# ============================================================
# METADATOS
# ============================================================

def convertir_metadata(metadata):

    if not metadata:
        return {}

    try:
        return json.loads(metadata)

    except json.JSONDecodeError:
        return {}


# ============================================================
# OBTENER EVENTOS
# ============================================================

def obtener_eventos(
    dias=10,
    limite=10
):

    ahora = datetime.now()

    fecha_inicio = (
        ahora - timedelta(days=dias)
    ).strftime("%Y-%m-%d")

    fecha_fin = (
        ahora.strftime(
            "%Y-%m-%dT23:59:59"
        )
    )

    variables = {

        "type": "Evento",

        "fechaHora": {
            "between": [
                fecha_inicio,
                fecha_fin
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

        "limit": limite,

        "nextToken": None,

        "sortDirection": "DESC"
    }

    respuesta = ejecutar_graphql(
        QUERY_EVENTOS,
        variables
    )

    return (
        respuesta
        ["data"]
        ["eventosByDate"]
        ["items"]
    )


# ============================================================
# PRUEBA
# ============================================================

if __name__ == "__main__":

    print()
    print("========================================")
    print(" GRIDVISION - PRUEBA SENAPRED")
    print("========================================")
    print()

    eventos = obtener_eventos(
        dias=10,
        limite=10
    )

    print()
    print(
        f"Eventos obtenidos: {len(eventos)}"
    )
    print()

    for numero, evento in enumerate(
        eventos,
        start=1
    ):

        metadata = convertir_metadata(
            evento.get("metaData")
        )

        tipo = (
            metadata.get("nombreVariable")
            or
            (
                evento.get(
                    "variableInformate"
                )
                or {}
            ).get("nombre")
            or
            "Sin clasificar"
        )

        regiones = (
            metadata.get("regiones")
            or "Sin región"
        )

        print(
            "=" * 70
        )

        print(
            f"{numero}. "
            f"{evento.get('titulo', 'Sin título')}"
        )

        print(
            "Fecha:",
            evento.get("fechaHora", "")
        )

        print(
            "Tipo:",
            tipo
        )

        print(
            "Regiones:",
            regiones
        )

        print(
            "Identificador:",
            evento.get("id", "")
        )

    print()
    print("========================================")
    print(" FIN PRUEBA SENAPRED")
    print("========================================")