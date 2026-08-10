from senapred_client import convertir_metadata


def texto_alerta(alerta):
    return (
        alerta.get("titulo")
        or ""
    ).lower()


def obtener_nivel_gridvision(alerta, tipo_senapred):
    """
    Determina el nivel vigente de la alerta.

    Regla:
    1. Si el título identifica una Alerta Temprana Preventiva,
       GridVision la muestra como ATP.
    2. Para Roja / Amarilla / Verde se utiliza primero
       el nivel estructurado entregado por SENAPRED.
    3. El título solo se usa como respaldo si SENAPRED
       no entrega el nivel estructurado.
    """

    titulo = texto_alerta(alerta)

    # ----------------------------------------------------
    # ALERTA TEMPRANA PREVENTIVA
    # SENAPRED la entrega técnicamente como Alerta Verde.
    # ----------------------------------------------------

    if "alerta temprana preventiva" in titulo:
        return "Alerta Temprana Preventiva"

    # ----------------------------------------------------
    # NIVEL ESTRUCTURADO SENAPRED
    # Este representa el estado vigente de la publicación.
    # ----------------------------------------------------

    nivel_original = (
        tipo_senapred.get("nombre")
        or ""
    ).strip()

    if nivel_original:
        return nivel_original

    # ----------------------------------------------------
    # RESPALDO
    # Solo se utiliza si no existe nivel estructurado.
    # ----------------------------------------------------

    if "declara alerta roja" in titulo:
        return "Alerta Roja"

    if "declara alerta amarilla" in titulo:
        return "Alerta Amarilla"

    if "declara alerta verde" in titulo:
        return "Alerta Verde"

    return "Sin nivel"
    """
    Mantiene el nivel original SENAPRED,
    pero mejora la presentación para GridVision.
    """

    titulo = texto_alerta(alerta)

    if "alerta temprana preventiva" in titulo:
        return "Alerta Temprana Preventiva"

    if "alerta roja" in titulo:
        return "Alerta Roja"

    if "alerta amarilla" in titulo:
        return "Alerta Amarilla"

    return (
        tipo_senapred.get("nombre")
        or "Sin nivel"
    )


def obtener_codigo_visual(nivel):
    if nivel == "Alerta Roja":
        return "ROJA"

    if nivel == "Alerta Amarilla":
        return "AMARILLA"

    if nivel == "Alerta Temprana Preventiva":
        return "ATP"

    if nivel == "Alerta Verde":
        return "VERDE"

    return "OTRA"


def obtener_riesgo_gridvision(alerta):
    """
    Primero usa la clasificación estructurada
    entregada por SENAPRED.

    Si SENAPRED informa 'Otros',
    complementa usando el título.
    """

    variable = (
        alerta.get("variableRiesgo")
        or {}
    )

    riesgo_original = (
        variable.get("nombre")
        or ""
    )

    if (
        riesgo_original
        and riesgo_original.lower() != "otros"
    ):
        return riesgo_original

    titulo = texto_alerta(alerta)

    reglas = [
        (
            [
                "evento meteorológico",
                "evento meteorologico",
                "sistema frontal",
                "precipitaciones",
            ],
            "Evento meteorológico"
        ),
        (
            [
                "crecida",
                "aumento de caudal",
            ],
            "Crecida"
        ),
        (
            [
                "desborde",
                "desbordamiento",
            ],
            "Desborde"
        ),
        (
            [
                "inundación",
                "inundacion",
                "anegamiento",
            ],
            "Inundación / Anegamiento"
        ),
        (
            [
                "incendio forestal",
            ],
            "Incendio forestal"
        ),
        (
            [
                "incendio estructural",
            ],
            "Incendio estructural"
        ),
        (
            [
                "actividad volcánica",
                "actividad volcanica",
                "volcán",
                "volcan",
            ],
            "Actividad volcánica"
        ),
        (
            [
                "sismo",
                "terremoto",
            ],
            "Sismo"
        ),
        (
            [
                "tsunami",
            ],
            "Tsunami"
        ),
        (
            [
                "zoosanitario",
            ],
            "Evento zoosanitario"
        ),
        (
            [
                "material peligroso",
                "derrame",
            ],
            "Material peligroso"
        ),
    ]

    for palabras, categoria in reglas:

        if any(
            palabra in titulo
            for palabra in palabras
        ):
            return categoria

    return (
        riesgo_original
        or "Otros"
    )


def obtener_territorio(alerta):

    metadata = convertir_metadata(
        alerta.get("metaData")
    )

    return {
        "regiones":
            metadata.get("regiones") or "",

        "provincias":
            metadata.get("provincias") or "",

        "comunas":
            metadata.get("comunas") or "",
    }
def obtener_estado_vigencia(alerta):
    """
    Clasifica la vigencia operacional de la publicación principal.

    IMPORTANTE:
    isActive/isPrincipal indican el estado técnico del registro
    en SENAPRED, no por sí solos la vigencia operacional.
    """

    titulo = (
    alerta.get("titulo")
    or ""
).strip().lower()

    es_publicacion_actual = (
        alerta.get("isActive") is True
        and alerta.get("isPrincipal") is True
        and alerta.get("isDeleted") is not True
    )

    if not es_publicacion_actual:
        return "HISTORICA"

    # ----------------------------------------------------
    # CANCELACIÓN + NUEVO NIVEL
    # Ejemplo:
    # "cancela Alerta Roja y declara Alerta Amarilla"
    # La alerta continúa, pero actualizada.
    # ----------------------------------------------------

    tiene_cancelacion = (
        "cancela alerta" in titulo
        or "se cancela alerta" in titulo
    )

    tiene_declaracion = (
        "declara alerta" in titulo
        or "se declara alerta" in titulo
    )

    if (
        tiene_cancelacion
        and tiene_declaracion
    ):
        return "VIGENTE_ACTUALIZADA"

    # ----------------------------------------------------
    # CANCELACIÓN SIN NUEVA DECLARACIÓN
    # ----------------------------------------------------

    if tiene_cancelacion:
        return "CANCELADA"

    # ----------------------------------------------------
    # MONITOREO
    # SENAPRED está informando continuidad de la alerta.
    # ----------------------------------------------------

    if titulo.startswith("monitoreo"):
        return "VIGENTE"

    # ----------------------------------------------------
    # MODIFICACIÓN
    # Se modifica cobertura, causalidad, etc.
    # ----------------------------------------------------

    if (
        "se modifica" in titulo
        or titulo.startswith("modifica")
    ):
        return "VIGENTE_ACTUALIZADA"

    # ----------------------------------------------------
    # DECLARACIÓN DE UNA ALERTA
    # ----------------------------------------------------

    if tiene_declaracion:
        return "VIGENTE"

    # ----------------------------------------------------
    # No existe evidencia suficiente para clasificarla.
    # ----------------------------------------------------

    return "POR_VERIFICAR"

def normalizar_alerta(
    alerta,
    tipos_alerta
):

    tipo_senapred = tipos_alerta.get(
        alerta.get("tipoAlertaId"),
        {}
    )

    nivel = obtener_nivel_gridvision(
        alerta,
        tipo_senapred
    )

    territorio = obtener_territorio(
        alerta
    )

    return {

        # ------------------------------------------------
        # IDENTIFICACIÓN
        # ------------------------------------------------

        "id":
            alerta.get("id"),

        "titulo":
    (alerta.get("titulo") or "").strip(),
"contenido":
    alerta.get("contenido") or "",

        "fechaHora":
            alerta.get("fechaHora"),
"isActive":
    alerta.get("isActive"),

"isDeleted":
    alerta.get("isDeleted"),

"isPrincipal":
    alerta.get("isPrincipal"),

"createdAt":
    alerta.get("createdAt"),

"updatedAt":
    alerta.get("updatedAt"),

"parentId":
    alerta.get("parentId"),
        "urlAccess":
            alerta.get("urlAccess"),

        # ------------------------------------------------
        # CLASIFICACIÓN GRIDVISION
        # ------------------------------------------------

        "nivel":
            nivel,

        "codigoVisual":
            obtener_codigo_visual(
                nivel
            ),
"estadoRegistro":
    "PUBLICACION_ACTUAL"
    if alerta.get("isActive") is True
    and alerta.get("isPrincipal") is True
    and alerta.get("isDeleted") is not True
    else "HISTORICA",
"estadoVigencia":
    obtener_estado_vigencia(
        alerta
    ),
        "riesgo":
            obtener_riesgo_gridvision(
                alerta
            ),

        # ------------------------------------------------
        # TERRITORIO
        # ------------------------------------------------

        "regiones":
            territorio["regiones"],

        "provincias":
            territorio["provincias"],

        "comunas":
            territorio["comunas"],

        # ------------------------------------------------
        # DATO ORIGINAL SENAPRED
        # ------------------------------------------------

        "nivelSenapred":
            tipo_senapred.get(
                "nombre"
            ),

        "codigoSenapred":
            tipo_senapred.get(
                "codigo"
            ),
    }