import json
import os
import time
import secrets
import threading
import sys

from datetime import datetime
from zoneinfo import ZoneInfo

from http.cookies import SimpleCookie
import urllib.parse
import urllib.request

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


# ============================================================
# CONFIGURACIÃ“N
# ============================================================

CARPETA_PROYECTO = Path(__file__).resolve().parent
ARCHIVO_ENV = CARPETA_PROYECTO / ".env"

CARPETA_SCRIPTS = CARPETA_PROYECTO / "scripts"

if str(CARPETA_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(CARPETA_SCRIPTS))

from senapred_alertas import (
    obtener_alertas,
    obtener_tipos_alerta,
    alerta_es_relevante,
)

from senapred_normalizador import (
    normalizar_alerta,
)

PUERTO = int(os.environ.get("PORT", "8000"))

google_session_token = None
google_session_expiry = 0
# Sesiones autorizadas para utilizar Google SatÃ©lite
google_auth_sessions = {}

# Tiempo que permanecerÃ¡ autorizado un usuario:
# 8 horas
GOOGLE_AUTH_DURATION = 8 * 60 * 60

# ============================================================
# CARGAR ARCHIVO .env
# ============================================================

def cargar_env():
    if not ARCHIVO_ENV.exists():
        return

    with open(ARCHIVO_ENV, "r", encoding="utf-8") as archivo:
        for linea in archivo:
            linea = linea.strip()

            if not linea or linea.startswith("#"):
                continue

            if "=" not in linea:
                continue

            clave, valor = linea.split("=", 1)

            os.environ.setdefault(
                clave.strip(),
                valor.strip()
            )


cargar_env()

GOOGLE_API_KEY = os.getenv("GOOGLE_MAP_TILES_API_KEY")

if not GOOGLE_API_KEY:
    raise RuntimeError(
        "No se encontrÃ³ GOOGLE_MAP_TILES_API_KEY en .env"
    )
GOOGLE_SATELLITE_PASSWORD = os.getenv(
    "GOOGLE_SATELLITE_PASSWORD"
)

if not GOOGLE_SATELLITE_PASSWORD:
    raise RuntimeError(
        "No se encontrÃ³ GOOGLE_SATELLITE_PASSWORD en .env"
    )
# ============================================================
# SOLAX CLOUD - PFV ICV LO AGUIRRE
# ============================================================

SOLAX_TOKEN_ID = os.getenv("SOLAX_TOKEN_ID")

SOLAX_API_URL = (
    "https://global.solaxcloud.com"
    "/api/v2/dataAccess/realtimeInfo/get"
)

SOLAX_LO_AGUIRRE = [
    {
        "nombre": "Inversor 60 kW",
        "wifiSn": "SRY38GCFAC",
        "potencia_nominal_kw": 60
    },
    {
        "nombre": "Inversor 40 kW",
        "wifiSn": "SRKM2RJAVU",
        "potencia_nominal_kw": 40
    },
    {
        "nombre": "Inversor 50 kW",
        "wifiSn": "SRZ8FFF7QE",
        "potencia_nominal_kw": 50
    }
]


def estado_operacional_solax(codigo):

    codigo = str(codigo or "")

    estados = {
        "100": ("ESPERA", "espera"),
        "101": ("AUTOTEST", "espera"),
        "102": ("OK", "ok"),
        "103": ("FALLA RECUPERABLE", "falla"),
        "104": ("FALLA PERMANENTE", "falla"),
        "105": ("ACTUALIZANDO", "espera"),
        "109": ("SLEEP", "espera"),
        "110": ("STANDBY", "espera")
    }

    nombre, nivel = estados.get(
        codigo,
        ("ESTADO " + codigo, "espera")
    )

    return {
        "codigo": codigo,
        "estado": nombre,
        "nivel": nivel
    }


# ============================================================
# CACHE SOLAX CLOUD
# ============================================================

# Una actualizaci?n completa de Lo Aguirre utiliza
# exactamente 3 llamadas: una por inversor.
# SolaX permite 3 llamadas cada 5 minutos.
#
# Usamos un peque?o margen adicional para no consultar
# exactamente en el l?mite de la ventana.
SOLAX_CACHE_SECONDS = 5 * 60 + 20

solax_cache = {}

solax_cache_lock = threading.Lock()

solax_blocked_until = 0


def consultar_solax(wifi_sn):

    global solax_blocked_until

    if not SOLAX_TOKEN_ID:
        raise RuntimeError(
            "No se encontr? SOLAX_TOKEN_ID"
        )

    ahora = time.time()

    cache = solax_cache.get(
        wifi_sn
    )

    # -----------------------------------------------------
    # DATO VIGENTE EN CACHE
    # -----------------------------------------------------

    if (
        cache
        and ahora - cache["time"]
            < SOLAX_CACHE_SECONDS
    ):
        return cache["data"]


    # -----------------------------------------------------
    # EVITAR CONSULTAS SIMULTANEAS
    # -----------------------------------------------------

    with solax_cache_lock:

        ahora = time.time()

        cache = solax_cache.get(
            wifi_sn
        )

        # Otro hilo puede haber actualizado
        # mientras esper?bamos.
        if (
            cache
            and ahora - cache["time"]
                < SOLAX_CACHE_SECONDS
        ):
            return cache["data"]


        # -------------------------------------------------
        # COOLDOWN POR LIMITE DE API
        # -------------------------------------------------

        if ahora < solax_blocked_until:

            if cache:

                print(
                    "SolaX usando ultimo dato valido "
                    "durante cooldown:",
                    wifi_sn,
                    flush=True
                )

                return cache["data"]

            return {
                "success": False,
                "exception":
                    "SolaX temporalmente en cooldown "
                    "por limite de consultas API"
            }


        # -------------------------------------------------
        # CONSULTA REAL A SOLAX
        # -------------------------------------------------

        cuerpo = json.dumps({
            "wifiSn": wifi_sn
        }).encode("utf-8")

        solicitud = urllib.request.Request(
            SOLAX_API_URL,
            data=cuerpo,
            method="POST",
            headers={
                "Content-Type":
                    "application/json",
                "tokenId":
                    SOLAX_TOKEN_ID
            }
        )


        try:

            with urllib.request.urlopen(
                solicitud,
                timeout=20
            ) as respuesta:

                datos_respuesta = json.loads(
                    respuesta
                    .read()
                    .decode("utf-8")
                )

        except Exception as error:

            # Si existe un ?ltimo dato v?lido,
            # nunca lo destruimos por una falla
            # temporal de comunicaci?n.
            if cache:

                print(
                    "SolaX consulta fallida; "
                    "usando cache anterior:",
                    wifi_sn,
                    error,
                    flush=True
                )

                return cache["data"]

            raise


        # -------------------------------------------------
        # RESPUESTA VALIDA
        # -------------------------------------------------

        if datos_respuesta.get(
            "success"
        ):

            solax_cache[wifi_sn] = {
                "data":
                    datos_respuesta,

                "time":
                    time.time()
            }

            return datos_respuesta


        # -------------------------------------------------
        # DETECTAR LIMITE DE SOLAX
        # -------------------------------------------------

        mensaje = str(
            datos_respuesta.get(
                "exception"
            )
            or ""
        )

        mensaje_minuscula = mensaje.lower()

        if (
            "requests within 5 minutes"
            in mensaje_minuscula
            or
            "call threshold"
            in mensaje_minuscula
        ):

            solax_blocked_until = (
                time.time()
                + SOLAX_CACHE_SECONDS
            )

            print(
                "SolaX alcanzo limite API. "
                "Cooldown activado por "
                f"{SOLAX_CACHE_SECONDS} segundos.",
                flush=True
            )


        # -------------------------------------------------
        # CONSERVAR ULTIMO DATO VALIDO
        # -------------------------------------------------

        if cache:

            print(
                "SolaX rechazo nueva consulta; "
                "usando ultimo dato valido:",
                wifi_sn,
                flush=True
            )

            return cache["data"]


        return datos_respuesta


# ============================================================
# HUAWEI FUSIONSOLAR - VSE TECHO / VSE PAIDAHUEN
# ============================================================

FUSIONSOLAR_BASE_URL = (
    "https://la5.fusionsolar.huawei.com"
)

FUSIONSOLAR_USERNAME = os.getenv(
    "FUSIONSOLAR_USERNAME"
)

FUSIONSOLAR_PASSWORD = os.getenv(
    "FUSIONSOLAR_PASSWORD"
)

FUSIONSOLAR_PLANTAS = {
    "techo": {
        "nombre": "VSE Techo",
        "stationCode": "NE=36085058",
        "devIds": [
            1000000036085062,
            1000000036085063,
            1000000036085064,
            1000000036085065
        ]
    },
    "paidahuen": {
        "nombre": "VSE Paidahuen",
        "stationCode": "NE=38719718",
        "devIds": [
            1000000038719723,
            1000000038719725,
            1000000038719724,
            1000000038719722
        ]
    }
}


fusionsolar_token = None
fusionsolar_token_expiry = 0

# Reutilizamos la sesión para no hacer login cada minuto.
FUSIONSOLAR_TOKEN_DURATION = 20 * 60

# Si Huawei informa failCode 20003, evitamos
# insistir con nuevos logins durante 30 minutos.
FUSIONSOLAR_NORTHBOUND_COOLDOWN_SECONDS = 30 * 60
fusionsolar_northbound_blocked_until = 0


class FusionSolarNorthboundExpired(RuntimeError):
    pass


def obtener_fusionsolar_token():

    global fusionsolar_token
    global fusionsolar_token_expiry
    global fusionsolar_northbound_blocked_until

    ahora = time.time()

    if ahora < fusionsolar_northbound_blocked_until:
        segundos_restantes = max(
            1,
            int(
                fusionsolar_northbound_blocked_until
                - ahora
            )
        )

        raise FusionSolarNorthboundExpired(
            "FusionSolar Northbound en cooldown "
            + str(segundos_restantes)
            + " s"
        )

    if (
        fusionsolar_token
        and fusionsolar_token_expiry > ahora + 30
    ):
        return fusionsolar_token

    if (
        not FUSIONSOLAR_USERNAME
        or not FUSIONSOLAR_PASSWORD
    ):
        raise RuntimeError(
            "Faltan credenciales FusionSolar"
        )

    cuerpo = json.dumps({
        "userName": FUSIONSOLAR_USERNAME,
        "systemCode": FUSIONSOLAR_PASSWORD
    }).encode("utf-8")

    solicitud = urllib.request.Request(
        FUSIONSOLAR_BASE_URL + "/thirdData/login",
        data=cuerpo,
        method="POST",
        headers={
            "Content-Type": "application/json"
        }
    )

    with urllib.request.urlopen(
        solicitud,
        timeout=20
    ) as respuesta:

        contenido = json.loads(
            respuesta.read().decode("utf-8")
        )

        token = (
            respuesta.headers.get("XSRF-TOKEN")
            or respuesta.headers.get("xsrf-token")
        )

    if not contenido.get("success"):
        print("LOGIN FUSIONSOLAR RECHAZADO:", contenido, flush=True)

        if contenido.get("failCode") == 20003:

            fusionsolar_northbound_blocked_until = (
                time.time()
                + FUSIONSOLAR_NORTHBOUND_COOLDOWN_SECONDS
            )

            print(
                "FusionSolar Northbound bloqueado por 30 min "
                "debido a failCode 20003.",
                flush=True
            )

            raise FusionSolarNorthboundExpired(
                "Huawei informa Northbound expirado"
            )
        raise RuntimeError(
            "FusionSolar rechazó autenticación"
        )

    if not token:
        raise RuntimeError(
            "FusionSolar no entregó XSRF-TOKEN"
        )

    fusionsolar_token = token
    fusionsolar_token_expiry = (
        ahora + FUSIONSOLAR_TOKEN_DURATION
    )

    print(
        "Sesión FusionSolar creada correctamente."
    )

    return fusionsolar_token


def consultar_fusionsolar(ruta, datos):

    token = obtener_fusionsolar_token()

    cuerpo = json.dumps(
        datos
    ).encode("utf-8")

    solicitud = urllib.request.Request(
        FUSIONSOLAR_BASE_URL + ruta,
        data=cuerpo,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "XSRF-TOKEN": token
        }
    )

    with urllib.request.urlopen(
        solicitud,
        timeout=20
    ) as respuesta:

        contenido = json.loads(
            respuesta.read().decode("utf-8")
        )

    if not contenido.get("success"):
        raise RuntimeError(
            "Consulta FusionSolar rechazada: "
            + str(contenido)
        )

    return contenido
# ============================================================
# CACHE FUSIONSOLAR
# ============================================================

# Huawei será consultado como máximo aproximadamente
# una vez cada 5 minutos.
FUSIONSOLAR_CACHE_SECONDS = (
    5 * 60 + 15
)

fusionsolar_cache = {}
fusionsolar_cache_time = 0

# Evita que Techo y Paidahuen disparen
# consultas simultáneas a Huawei.
fusionsolar_cache_lock = (
    threading.Lock()
)


def actualizar_cache_fusionsolar():

    global fusionsolar_cache
    global fusionsolar_cache_time

    # -----------------------------------------------------
    # CONSULTA CONJUNTA DE LAS DOS PLANTAS
    # -----------------------------------------------------

    station_codes = ",".join(
        planta["stationCode"]
        for planta
        in FUSIONSOLAR_PLANTAS.values()
    )

    respuesta_plantas = consultar_fusionsolar(
        "/thirdData/getStationRealKpi",
        {
            "stationCodes":
                station_codes
        }
    )

    kpi_por_station = {}

    for item in (
        respuesta_plantas.get("data")
        or []
    ):

        station_code = item.get(
            "stationCode"
        )

        if station_code:
            kpi_por_station[
                station_code
            ] = (
                item.get("dataItemMap")
                or {}
            )


    # -----------------------------------------------------
    # CONSULTA CONJUNTA DE LOS 8 INVERSORES
    # -----------------------------------------------------

    todos_dev_ids = []

    for planta in (
        FUSIONSOLAR_PLANTAS.values()
    ):

        todos_dev_ids.extend(
            planta["devIds"]
        )

    dev_ids = ",".join(
        str(dev_id)
        for dev_id
        in todos_dev_ids
    )

    respuesta_inversores = (
        consultar_fusionsolar(
            "/thirdData/getDevRealKpi",
            {
                "devIds": dev_ids,
                "devTypeId": 1
            }
        )
    )

    inversores_por_id = {}

    for item in (
        respuesta_inversores.get("data")
        or []
    ):

        dev_id = item.get("devId")

        if dev_id is not None:
            inversores_por_id[
                str(dev_id)
            ] = item


    # -----------------------------------------------------
    # SEPARAR RESPUESTA POR PLANTA
    # -----------------------------------------------------

    cache_nueva = {}

    for clave, planta in (
        FUSIONSOLAR_PLANTAS.items()
    ):

        station_code = (
            planta["stationCode"]
        )

        inversores = []

        for dev_id in planta["devIds"]:

            item = (
                inversores_por_id.get(
                    str(dev_id),
                    {}
                )
            )

            inversores.append({
                "devId":
                    dev_id,

                "sn":
                    item.get("sn"),

                "datos":
                    (
                        item.get(
                            "dataItemMap"
                        )
                        or {}
                    )
            })

        cache_nueva[clave] = {
            "nombre":
                planta["nombre"],

            "stationCode":
                station_code,

            "kpi_planta":
                kpi_por_station.get(
                    station_code,
                    {}
                ),

            "inversores":
                inversores
        }


    # Solo reemplazamos la caché cuando
    # las consultas completas fueron exitosas.
    fusionsolar_cache = cache_nueva
    fusionsolar_cache_time = time.time()

    print(
        "Cache FusionSolar actualizada: "
        "Techo + Paidahuen."
    )


def obtener_planta_fusionsolar(clave):

    global fusionsolar_cache
    global fusionsolar_cache_time

    if clave not in FUSIONSOLAR_PLANTAS:
        raise ValueError(
            "Planta FusionSolar no encontrada"
        )

    ahora = time.time()

    edad_cache = (
        ahora
        - fusionsolar_cache_time
    )

    # -----------------------------------------------------
    # USAR CACHE VIGENTE
    # -----------------------------------------------------

    if (
        clave in fusionsolar_cache
        and edad_cache
            < FUSIONSOLAR_CACHE_SECONDS
    ):
        return fusionsolar_cache[
            clave
        ]


    # -----------------------------------------------------
    # SOLO UN HILO PUEDE CONSULTAR HUAWEI
    # -----------------------------------------------------

    with fusionsolar_cache_lock:

        # Otro hilo puede haber actualizado
        # mientras esperábamos el bloqueo.
        ahora = time.time()

        edad_cache = (
            ahora
            - fusionsolar_cache_time
        )

        if (
            clave in fusionsolar_cache
            and edad_cache
                < FUSIONSOLAR_CACHE_SECONDS
        ):
            return fusionsolar_cache[
                clave
            ]


        try:

            actualizar_cache_fusionsolar()

        except Exception as error:

            print(
                "FusionSolar no pudo "
                "renovar cache:",
                error
            )

            # Si Huawei rechaza temporalmente
            # una consulta, conservamos el
            # último dato disponible.
            if clave in fusionsolar_cache:

                print(
                    "FusionSolar usando "
                    "cache anterior."
                )

                return fusionsolar_cache[
                    clave
                ]

            # Si nunca hubo datos válidos,
            # no podemos inventarlos.
            raise


    return fusionsolar_cache[
        clave
    ]

# ============================================================
# SESIÃ“N GOOGLE MAP TILES
# ============================================================

# ============================================================
# SENAPRED - CONSULTA EN VIVO
# ============================================================

SENAPRED_CACHE_SECONDS = 60

senapred_cache = None
senapred_cache_time = 0
senapred_cache_lock = threading.Lock()


def consultar_senapred_en_vivo():

    global senapred_cache
    global senapred_cache_time

    ahora = time.time()

    if (
        senapred_cache is not None
        and ahora - senapred_cache_time < SENAPRED_CACHE_SECONDS
    ):
        return senapred_cache

    with senapred_cache_lock:

        ahora = time.time()

        if (
            senapred_cache is not None
            and ahora - senapred_cache_time < SENAPRED_CACHE_SECONDS
        ):
            return senapred_cache

        tipos = obtener_tipos_alerta()

        alertas = obtener_alertas(
            dias=60
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

        normalizadas.sort(
            key=lambda item:
                item.get("fechaHora") or "",
            reverse=True
        )

        ahora_chile = datetime.now(
            ZoneInfo("America/Santiago")
        )

        respuesta = {
            "fuente": "SENAPRED",
            "sistema": "GridVision Chile",
            "generadoEn": ahora_chile.isoformat(),
            "diasConsulta": 60,
            "totalAlertasSenapred": len(alertas),
            "totalAlertasRelevantes": len(normalizadas),
            "alertas": normalizadas,
            "consultaEnVivo": True
        }

        senapred_cache = respuesta
        senapred_cache_time = time.time()

        return respuesta


def obtener_google_session():
    global google_session_token
    global google_session_expiry

    ahora = int(time.time())

    # Si la sesiÃ³n todavÃ­a es vÃ¡lida, se reutiliza.
    if (
        google_session_token
        and google_session_expiry > ahora + 300
    ):
        return google_session_token

    url = (
    "https://tile.googleapis.com/v1/createSession"
    f"?key={urllib.parse.quote(GOOGLE_API_KEY)}"
)

    datos = json.dumps({
        "mapType": "satellite",
        "language": "es-419",
        "region": "CL"
    }).encode("utf-8")

    solicitud = urllib.request.Request(
        url,
        data=datos,
        method="POST",
        headers={
            "Content-Type": "application/json"
        }
    )

    with urllib.request.urlopen(
        solicitud,
        timeout=20
    ) as respuesta:

        contenido = json.loads(
            respuesta.read().decode("utf-8")
        )

    google_session_token = contenido["session"]
    google_session_expiry = int(contenido["expiry"])

    print(
        "SesiÃ³n Google SatÃ©lite creada correctamente."
    )

    return google_session_token


# ============================================================
# SERVIDOR GRIDVISION
# ============================================================
def token_google_autorizado(token):
    if not token:
        return False

    expiracion = google_auth_sessions.get(token)

    if not expiracion:
        return False

    if expiracion < time.time():
        google_auth_sessions.pop(token, None)
        return False

    return True
ORIGENES_GOOGLE_PERMITIDOS = {
    "https://" + "ecastilloluengo.github.io",
    "http://" + "localhost:8000",
    "http://" + "127.0.0.1:8000",
    "https://" + "gridvision-piloto-publico.onrender.com",
}


def agregar_cors_google(handler):
    origen = handler.headers.get("Origin")

    if origen in ORIGENES_GOOGLE_PERMITIDOS:
        handler.send_header(
            "Access-Control-Allow-Origin",
            origen
        )
        handler.send_header(
            "Vary",
            "Origin"
        )
class GridVisionHandler(SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)

        self.send_header(
            "Access-Control-Allow-Origin",
            "https://" + "ecastilloluengo.github.io"
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        self.end_headers()

    def do_POST(self):

        ruta = urllib.parse.urlparse(self.path)

        # ----------------------------------------------------
        # AUTORIZACIÃ“N GOOGLE SATÃ‰LITE
        # ----------------------------------------------------

        if ruta.path == "/google-auth":

            try:
                longitud = int(
                    self.headers.get("Content-Length", "0")
                )

                cuerpo = self.rfile.read(longitud)

                datos = json.loads(
                    cuerpo.decode("utf-8")
                )

                password = datos.get("password", "")

                if not secrets.compare_digest(
                    password,
                    GOOGLE_SATELLITE_PASSWORD
                ):
                    self.send_response(401)
                    self.send_header(
                        "Content-Type",
                        "application/json"
                    )
                    self.end_headers()

                    self.wfile.write(
                        json.dumps({
                            "ok": False,
                            "message": "ContraseÃ±a incorrecta"
                        }).encode("utf-8")
                    )

                    return

                token = secrets.token_urlsafe(32)

                expiracion = (
                    time.time() +
                    GOOGLE_AUTH_DURATION
                )

                google_auth_sessions[token] = expiracion

                self.send_response(200)

                self.send_header(
                    "Content-Type",
                    "application/json"
                )
                agregar_cors_google(self)

                self.send_header(
                    "Set-Cookie",
                    (
                        f"gv_google_auth={token}; "
                        "Path=/; "
                        "HttpOnly; "
                        "SameSite=Strict; "
                        f"Max-Age={GOOGLE_AUTH_DURATION}"
                    )
                )

                self.end_headers()

                self.wfile.write(
    json.dumps({
        "ok": True,
        "token": token
    }).encode("utf-8")
)
            except Exception as error:

                print(
                    "Error autorizaciÃ³n Google:",
                    error
                )

                self.send_error(
                    500,
                    "Error de autorizacion"
                )

            return

        self.send_error(
            404,
            "Ruta no encontrada"
        )
    def do_GET(self):
        ruta = urllib.parse.urlparse(self.path)
                # ----------------------------------------------------
        # FUSIONSOLAR - VSE TECHO / VSE PAIDAHUEN
        # ----------------------------------------------------

        # SENAPRED - ACTUALIZACION EN VIVO
        if ruta.path == "/api/senapred/actualizar":

            try:
                datos = consultar_senapred_en_vivo()

                self.send_response(200)

                self.send_header(
                    "Content-Type",
                    "application/json; charset=utf-8"
                )

                agregar_cors_google(self)

                self.send_header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate"
                )

                self.end_headers()

                self.wfile.write(
                    json.dumps(
                        datos,
                        ensure_ascii=False
                    ).encode("utf-8")
                )

            except Exception as error:

                print(
                    "Error SENAPRED en vivo:",
                    error,
                    flush=True
                )

                self.send_response(502)

                self.send_header(
                    "Content-Type",
                    "application/json; charset=utf-8"
                )

                agregar_cors_google(self)

                self.send_header(
                    "Cache-Control",
                    "no-store"
                )

                self.end_headers()

                self.wfile.write(
                    json.dumps({
                        "ok": False,
                        "servicio": "SENAPRED",
                        "mensaje":
                            "No fue posible consultar SENAPRED"
                    }).encode("utf-8")
                )

            return


        if ruta.path.startswith("/api/fusionsolar/"):

            clave = ruta.path.replace(
                "/api/fusionsolar/",
                ""
            ).strip("/")

            if clave not in FUSIONSOLAR_PLANTAS:
                self.send_error(
                    404,
                    "Planta FusionSolar no encontrada"
                )
                return

            try:
                datos = obtener_planta_fusionsolar(
                    clave
                )

                kpi = datos.get(
                    "kpi_planta",
                    {}
                )
                inversores_resumen = []
                potencias_validas = []

                for inversor in datos.get(
                    "inversores",
                    []
                ):

                    valores = inversor.get(
                        "datos",
                        {}
                    )

                    potencia = valores.get(
                        "active_power"
                    )

                    if isinstance(
                        potencia,
                        (int, float)
                    ):
                        potencias_validas.append(
                            float(potencia)
                        )

                    inversores_resumen.append({
                        "devId":
                            inversor.get("devId"),

                        "sn":
                            inversor.get("sn"),

                        "telemetria":
                            potencia is not None,

                        "potencia_kw":
                            potencia,

                        "estado_operacion":
                            valores.get("run_state"),

                        "temperatura_c":
                            valores.get("temperature"),

                        "energia_hoy_kwh":
                            valores.get("day_cap"),

                        "energia_total_kwh":
                            valores.get("total_cap")
                    })

                if potencias_validas:
                    potencia_total_kw = round(
                        sum(potencias_validas),
                        3
                    )
                else:
                    potencia_total_kw = None

                estado_codigo = kpi.get(
                    "real_health_state"
                )

                estados = {
                    1: "SIN COMUNICACION",
                    2: "FALLA",
                    3: "OK"
                }

                respuesta = {
                    "nombre":
                        datos["nombre"],

                    "stationCode":
                        datos["stationCode"],

                    "estado_codigo":
                        estado_codigo,

                    "estado":
                        estados.get(
                            estado_codigo,
                            "DESCONOCIDO"
                        ),

                    "potencia_instantanea_kw":
                        potencia_total_kw,

                    "energia_hoy_kwh":
                        kpi.get("day_power"),

                    "energia_mes_kwh":
                        kpi.get("month_power"),

                    "energia_total_kwh":
                        kpi.get("total_power"),

                    "energia_red_hoy_kwh":
                        kpi.get(
                            "day_on_grid_energy"
                        ),

                    "consumo_hoy_kwh":
                        kpi.get(
                            "day_use_energy"
                        ),

                    "inversores":
                        inversores_resumen
                }

                self.send_response(200)

                self.send_header(
                    "Content-Type",
                    "application/json; charset=utf-8"
                )

                agregar_cors_google(self)

                self.send_header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate"
                )

                self.end_headers()

                self.wfile.write(
                    json.dumps(
                        respuesta,
                        ensure_ascii=False
                    ).encode("utf-8")
                )

            except FusionSolarNorthboundExpired as error:

                reintento = max(
                    1,
                    int(
                        fusionsolar_northbound_blocked_until
                        - time.time()
                    )
                )

                respuesta = {
                    "ok": False,
                    "servicio": "FusionSolar",
                    "codigo": 20003,
                    "estado": "NORTHBOUND_EXPIRADO",
                    "mensaje":
                        "Huawei informa acceso Northbound expirado",
                    "reintento_segundos": reintento
                }

                self.send_response(503)

                self.send_header(
                    "Content-Type",
                    "application/json; charset=utf-8"
                )

                agregar_cors_google(self)

                self.send_header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate"
                )

                self.send_header(
                    "Retry-After",
                    str(reintento)
                )

                self.end_headers()

                self.wfile.write(
                    json.dumps(
                        respuesta,
                        ensure_ascii=False
                    ).encode("utf-8")
                )

            except Exception as error:

                print(
                    "Error FusionSolar:",
                    error
                )

                self.send_error(
                    502,
                    "No fue posible consultar FusionSolar"
                )

            return
        ruta = urllib.parse.urlparse(self.path)
                # ----------------------------------------------------
        # SOLAX CLOUD - PFV ICV LO AGUIRRE
        # ----------------------------------------------------

        if ruta.path == "/api/solax/lo-aguirre":

            inversores = []

            for equipo in SOLAX_LO_AGUIRRE:

                try:
                    respuesta_solax = consultar_solax(
                        equipo["wifiSn"]
                    )

                    if not respuesta_solax.get("success"):
                        inversores.append({
                            "nombre": equipo["nombre"],
                            "wifiSn": equipo["wifiSn"],
                            "potencia_nominal_kw":
                                equipo["potencia_nominal_kw"],
                            "estado": "SIN DATOS",
                            "nivel": "sin_datos",
                            "codigo": None,
                            "mensaje":
                                respuesta_solax.get(
                                    "exception",
                                    "Consulta SolaX rechazada"
                                )
                        })

                        continue

                    datos = (
                        respuesta_solax.get("result")
                        or {}
                    )

                    estado = estado_operacional_solax(
                        datos.get("inverterStatus")
                    )

                    inversores.append({
                        "nombre": equipo["nombre"],
                        "wifiSn": equipo["wifiSn"],
                        "potencia_nominal_kw":
                            equipo["potencia_nominal_kw"],

                        "estado": estado["estado"],
                        "nivel": estado["nivel"],
                        "codigo": estado["codigo"],

                        "potencia_ac":
                            datos.get("acpower"),

                        "energia_hoy":
                            datos.get("yieldtoday"),

                        "energia_total":
                            datos.get("yieldtotal"),

                        "potencia_red":
                            datos.get("feedinpower"),

                        "ultimo_dato":
                            datos.get("uploadTime")
                    })

                except Exception as error:

                    print(
                        "Error SolaX",
                        equipo["wifiSn"],
                        error
                    )

                    inversores.append({
                        "nombre": equipo["nombre"],
                        "wifiSn": equipo["wifiSn"],
                        "potencia_nominal_kw":
                            equipo["potencia_nominal_kw"],
                        "estado": "SIN COMUNICACION",
                        "nivel": "sin_datos",
                        "codigo": None
                    })


            niveles = [
                inversor["nivel"]
                for inversor in inversores
            ]

            if "falla" in niveles:
                estado_general = "FALLA"
                nivel_general = "falla"

            elif niveles and all(
                nivel == "ok"
                for nivel in niveles
            ):
                estado_general = "OK"
                nivel_general = "ok"

            elif "sin_datos" in niveles:
                estado_general = "SIN DATOS"
                nivel_general = "sin_datos"

            else:
                estado_general = "ESPERA"
                nivel_general = "espera"


            respuesta = {
                "planta": "PFV ICV Lo Aguirre",
                "tipo": "PFV Net Billing",
                "potencia_nominal_kw": 150,

                "estado_general": estado_general,
                "nivel_general": nivel_general,

                "inversores": inversores
            }


            self.send_response(200)

            self.send_header(
                "Content-Type",
                "application/json; charset=utf-8"
            )

            agregar_cors_google(self)

            self.end_headers()

            self.wfile.write(
                json.dumps(
                    respuesta,
                    ensure_ascii=False
                ).encode("utf-8")
            )

            return

        # ----------------------------------------------------
        # GOOGLE SATÃ‰LITE
        # /google-tiles/z/x/y
        # ----------------------------------------------------

        if ruta.path.startswith("/google-tiles/"):

            parametros = urllib.parse.parse_qs(
                ruta.query
            )

            token = parametros.get(
                "token",
                [""]
            )[0]

            if not token_google_autorizado(token):
                self.send_error(
                    401,
                    "Google Satelite requiere autorizacion"
                )
                return

            try:
                partes = ruta.path.strip("/").split("/")

                if len(partes) != 4:
                    self.send_error(
                        400,
                        "Ruta de mosaico invalida"
                    )
                    return

                _, z, x, y = partes

                int(z)
                int(x)
                int(y)

                session = obtener_google_session()

                url_google = (
                    "https://tile.googleapis.com/v1/2dtiles/"
                    f"{z}/{x}/{y}"
                    f"?session={urllib.parse.quote(session)}"
                    f"&key={urllib.parse.quote(GOOGLE_API_KEY)}"
                )

                solicitud = urllib.request.Request(
                    url_google,
                    method="GET"
                )

                with urllib.request.urlopen(
                    solicitud,
                    timeout=20
                ) as respuesta:

                    datos = respuesta.read()

                    content_type = respuesta.headers.get(
                        "Content-Type",
                        "image/jpeg"
                    )

                    cache_control = respuesta.headers.get(
                        "Cache-Control"
                    )

                self.send_response(200)

                self.send_header(
                    "Content-Type",
                    content_type
                )
                agregar_cors_google(self)
                if cache_control:
                    self.send_header(
                        "Cache-Control",
                        cache_control
                    )

                self.end_headers()

                self.wfile.write(datos)

            except Exception as error:

                print(
                    "Error Google Map Tiles:",
                    error
                )

                self.send_error(
                    502,
                    "No fue posible obtener Google Satelite"
                )

            return

        # ----------------------------------------------------
        # ARCHIVOS NORMALES DE GRIDVISION
        # ----------------------------------------------------

        super().do_GET()
# ============================================================
# INICIAR SERVIDOR
# ============================================================

if __name__ == "__main__":

    os.chdir(CARPETA_PROYECTO)

    servidor = ThreadingHTTPServer(
    ("0.0.0.0", PUERTO),
    GridVisionHandler
)

    print("")
    print("============================================")
    print(" GRIDVISION CHILE")
    print("============================================")
    print("")
    print(
        f"Servidor iniciado en http://localhost:{PUERTO}"
    )
    print("")
    print("Presiona Ctrl + C para detenerlo.")
    print("")

    try:
        servidor.serve_forever()

    except KeyboardInterrupt:
        print("")
        print("Servidor detenido.")

    finally:
        servidor.server_close()


