import json
import os
import time
import secrets

from http.cookies import SimpleCookie
import urllib.parse
import urllib.request

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


# ============================================================
# CONFIGURACIÓN
# ============================================================

CARPETA_PROYECTO = Path(__file__).resolve().parent
ARCHIVO_ENV = CARPETA_PROYECTO / ".env"

PUERTO = 8000

google_session_token = None
google_session_expiry = 0
# Sesiones autorizadas para utilizar Google Satélite
google_auth_sessions = {}

# Tiempo que permanecerá autorizado un usuario:
# 8 horas
GOOGLE_AUTH_DURATION = 8 * 60 * 60

# ============================================================
# CARGAR ARCHIVO .env
# ============================================================

def cargar_env():
    if not ARCHIVO_ENV.exists():
        raise RuntimeError("No se encontró el archivo .env")

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
        "No se encontró GOOGLE_MAP_TILES_API_KEY en .env"
    )
GOOGLE_SATELLITE_PASSWORD = os.getenv(
    "GOOGLE_SATELLITE_PASSWORD"
)

if not GOOGLE_SATELLITE_PASSWORD:
    raise RuntimeError(
        "No se encontró GOOGLE_SATELLITE_PASSWORD en .env"
    )

# ============================================================
# SESIÓN GOOGLE MAP TILES
# ============================================================

def obtener_google_session():
    global google_session_token
    global google_session_expiry

    ahora = int(time.time())

    # Si la sesión todavía es válida, se reutiliza.
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
        "Sesión Google Satélite creada correctamente."
    )

    return google_session_token


# ============================================================
# SERVIDOR GRIDVISION
# ============================================================
def usuario_google_autorizado(headers):
    cookie_header = headers.get("Cookie")

    if not cookie_header:
        return False

    cookies = SimpleCookie()
    cookies.load(cookie_header)

    cookie_auth = cookies.get("gv_google_auth")

    if not cookie_auth:
        return False

    token = cookie_auth.value

    expiracion = google_auth_sessions.get(token)

    if not expiracion:
        return False

    if expiracion < time.time():
        google_auth_sessions.pop(token, None)
        return False

    return True
class GridVisionHandler(SimpleHTTPRequestHandler):
    def do_POST(self):

        ruta = urllib.parse.urlparse(self.path)

        # ----------------------------------------------------
        # AUTORIZACIÓN GOOGLE SATÉLITE
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
                            "message": "Contraseña incorrecta"
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
                        "ok": True
                    }).encode("utf-8")
                )

            except Exception as error:

                print(
                    "Error autorización Google:",
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
        # GOOGLE SATÉLITE
        # /google-tiles/z/x/y
        # ----------------------------------------------------

        if ruta.path.startswith("/google-tiles/"):

            if not usuario_google_autorizado(self.headers):
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
        ("localhost", PUERTO),
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