from html.parser import HTMLParser

from senapred_client import obtener_eventos


# ============================================================
# CONVERTIR HTML SENAPRED A TEXTO LEGIBLE
# ============================================================

class ExtractorTexto(HTMLParser):

    def __init__(self):
        super().__init__()
        self.partes = []

    def handle_starttag(self, tag, attrs):

        if tag in (
            "p",
            "br",
            "li",
            "tr",
            "div",
            "h1",
            "h2",
            "h3",
            "h4"
        ):
            self.partes.append("\n")

        if tag in ("td", "th"):
            self.partes.append(" | ")

    def handle_data(self, data):

        texto = data.strip()

        if texto:
            self.partes.append(texto)

    def obtener_texto(self):

        return " ".join(
            self.partes
        )


def html_a_texto(html):

    parser = ExtractorTexto()

    parser.feed(
        html or ""
    )

    texto = parser.obtener_texto()

    # Limpieza básica
    while "  " in texto:
        texto = texto.replace(
            "  ",
            " "
        )

    return texto


# ============================================================
# BUSCAR PUBLICACIÓN CON ALERTAS VIGENTES
# ============================================================

def buscar_alertas_vigentes():

    print()
    print("==============================================")
    print(" GRIDVISION - VERIFICACIÓN VIGENCIA SENAPRED")
    print("==============================================")
    print()

    eventos = obtener_eventos(
        dias=60,
        limite=100
    )

    print()
    print(
        f"Eventos SENAPRED revisados: {len(eventos)}"
    )
    print()

    frase_objetivo = (
        "ALERTAS RELEVANTES VIGENTES"
    )

    encontrado = None
    texto_encontrado = None

    for evento in eventos:

        contenido = (
            evento.get("contenido")
            or ""
        )

        texto = html_a_texto(
            contenido
        )

        if (
            frase_objetivo
            in texto.upper()
        ):
            encontrado = evento
            texto_encontrado = texto
            break


    if not encontrado:

        print(
            "No se encontró una publicación que contenga:"
        )

        print(
            frase_objetivo
        )

        return


    print("PUBLICACIÓN ENCONTRADA")
    print("----------------------")

    print(
        "Título:",
        encontrado.get("titulo")
    )

    print(
        "Fecha:",
        encontrado.get("fechaHora")
    )

    print()

    texto_mayuscula = (
        texto_encontrado.upper()
    )

    posicion = texto_mayuscula.find(
        frase_objetivo
    )

    # Mostramos desde la tabla/listado de alertas vigentes
    fragmento = texto_encontrado[
        posicion:
        posicion + 8000
    ]

    print("==============================================")
    print(" ALERTAS RELEVANTES VIGENTES INFORMADAS")
    print("==============================================")
    print()

    print(fragmento)

    print()
    print("==============================================")


if __name__ == "__main__":
    buscar_alertas_vigentes()