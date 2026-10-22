#!/usr/bin/env python3
"""GridVision Vulcano: lectura conservadora de las alertas técnicas visibles en SERNAGEOMIN.

No equivale a monitoreo volcánico en vivo ni inventa estados verdes.
La lectura automatizada acepta exclusivamente iconos de alerta inequívocos del
sitio oficial. Ante cambios de estructura o errores NO modifica el último JSON.
"""
import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import ssl
try:
    import truststore
except ImportError:
    truststore = None

SOURCE = 'https://www.sernageomin.cl/alertas-volcanicas/'
KNOWN = {
    'villarrica': 'Volcán Villarrica',
    'nevados_chillan': 'Complejo Volcánico Nevados de Chillán',
}
COLORS = {'verde': 'VERDE', 'amarilla': 'AMARILLA', 'amarillo': 'AMARILLA',
          'naranja': 'NARANJA', 'roja': 'ROJA', 'rojo': 'ROJA'}


class ImgParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.labels = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'img':
            return
        d = dict(attrs)
        self.labels.append(' '.join(str(d.get(k) or '') for k in
                                    ('alt', 'title', 'src', 'data-src', 'srcset', 'data-lazy-src')))


def normalize(value):
    value = unicodedata.normalize('NFD', value)
    value = ''.join(x for x in value if unicodedata.category(x) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '_', value).strip('_')


def catalog_aliases(indice=None):
    """Relaciona etiquetas de alerta del sitio oficial con el índice geográfico local."""
    result = dict(KNOWN)
    if not indice or not Path(indice).is_file():
        return result
    data = json.loads(Path(indice).read_text(encoding='utf-8'))
    for item in data.get('volcanes', []):
        name = item.get('nombre')
        if not isinstance(name, str) or not name:
            continue
        slug = normalize(name)
        aliases = {slug, slug.replace('_de_', '_')}
        for prefix in ('volcan_', 'complejo_volcanico_'):
            aliases |= {x[len(prefix):] for x in list(aliases) if x.startswith(prefix)}
        for alias in aliases:
            if len(alias) > 2 and alias not in result:
                result[alias] = name
    return result


def extract(html, aliases=None):
    # Exigimos que el sitio siga exponiendo la sección oficial prevista.
    readable = normalize(re.sub(r'<[^>]+>', ' ', html))
    if 'alertas_volcanicas_vigentes' not in readable:
        raise ValueError('La página oficial cambió: no se reconoce la sección de alertas vigentes')
    parser = ImgParser()
    parser.feed(html)
    aliases = aliases or dict(KNOWN)
    detected = {}
    unknown = set()
    for label in parser.labels:
        label = normalize(label)
        # El atributo alt puede indicar "Alerta amarilla..." y el src
        # puede incluir "Alerta_nevados_chillan_amarilla". Separar cada
        # identificador evita concatenar ambos como un volcan desconocido.
        for segment in re.split(r'(?=_alerta_)', label):
            match = re.match(
                r'^alerta_([a-z0-9_]{3,100}?)_(verde|amarilla|amarillo|naranja|roja|rojo)(?=_|$)',
                segment.lstrip('_'))
            if match is None:
                continue
            slug, color = match.groups()
            slug = slug.strip('_')
            if slug not in aliases:
                unknown.add(slug)
                continue
            detected.setdefault(slug, set()).add(COLORS[color])
    if unknown:
        raise ValueError('Nuevos volcanes/formatos de alerta por revisar: ' + ', '.join(sorted(unknown)))
    if not detected:
        raise ValueError('No se reconocieron iconos oficiales de alerta: no sobrescribir datos anteriores')
    for key, colors in detected.items():
        if len(colors) != 1:
            raise ValueError(f'Alertas contradictorias en {key}: {sorted(colors)}')
    return [(key, aliases[key], next(iter(levels))) for key, levels in sorted(detected.items())]


def fetch_html(url, timeout):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.sernageomin.cl', 'sernageomin.cl'):
        raise ValueError('Únicamente se permite la fuente oficial HTTPS de SERNAGEOMIN')
    request = Request(url, headers={'User-Agent': 'GridVision-Vulcano-ConsultaFuentes/0.1 (uso informativo)',
                                    'Accept': 'text/html,application/xhtml+xml'})
    # Usar los certificados de confianza del sistema operativo si esta
    # disponible truststore. El fallback de Python tambien valida certificados.
    tls_context = (truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                   if truststore is not None else ssl.create_default_context())
    with urlopen(request, timeout=timeout, context=tls_context) as response:
        dest = urlparse(response.geturl())
        if dest.scheme != 'https' or dest.hostname not in ('www.sernageomin.cl', 'sernageomin.cl'):
            raise ValueError('Redirección fuera de dominio SERNAGEOMIN')
        if response.status != 200:
            raise RuntimeError(f'SERNAGEOMIN HTTP {response.status}')
        body = response.read(4_000_001)
        if len(body) > 4_000_000:
            raise ValueError('La página supera el límite de seguridad de 4 MB')
        return body.decode('utf-8', errors='replace')


def payload(found, mode):
    return {
        'schema': 1,
        'fuente': 'SERNAGEOMIN',
        'fuenteURL': SOURCE,
        'tipo': 'ALERTAS_TECNICAS_PUBLICADAS',
        'modo': mode,
        'esquema': 'COLORES_PRE_EAV',
        'consultadoEn': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'volcanes': [
            {'clave': key, 'nombre': nombre, 'nivel': nivel, 'eav': None,
             'fuenteURL': SOURCE, 'fechaEmision': None}
            for key, nombre, nivel in found
        ],
        'nota': ('Estados reconocidos en la página pública oficial. '
                 'No es monitoreo instrumental en vivo; no implica que otros volcanes estén en verde. '
                 'La fecha de consulta no equivale a fecha de emisión de la alerta. '
                 'Al entrar en vigor los EAV se requiere validar su nueva fuente y formato.'),
    }


def selftest():
    sample = '''<html><h1>Alertas volcánicas vigentes</h1>
        <img alt="Alerta_villarrica_amarilla" src="/images/x.png">
        <img alt="Alerta_nevados_chillan_amarilla">
        </html>'''
    assert {k: level for k, _, level in extract(sample)} == {'nevados_chillan': 'AMARILLA', 'villarrica': 'AMARILLA'}
    for bad in [
        '<html><h1>Alertas volcánicas vigentes</h1></html>',
        '<html><img alt="Alerta_villarrica_amarilla"></html>',
        '<h1>Alertas volcánicas vigentes</h1><img alt="Alerta_villarrica_roja"><img alt="Alerta_villarrica_verde">',
    ]:
        try:
            extract(bad)
        except ValueError:
            continue
        raise AssertionError('Se aceptó contenido ambiguo o incompleto')
    print('AUTOPRUEBA OK: extracción oficial controlada y errores seguros')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--salida', default='data/vulcano/estados_oficiales.json')
    ap.add_argument('--indice', default='data/vulcano/volcanes_v068.json')
    ap.add_argument('--fixture', help='HTML local para ensayar sin red, no se marca como automático')
    ap.add_argument('--autoprueba', action='store_true')
    ap.add_argument('--seco', action='store_true', help='Mostrar resultado sin escribir archivo')
    ap.add_argument('--timeout', type=int, default=20)
    args = ap.parse_args()
    if args.autoprueba:
        selftest()
        return
    # El protocolo EAV sustituye los colores técnicos el 28-10-2026.
    # No se permite seguir actualizando con el esquema antiguo sin validación.
    eav_inicio_utc = datetime(2026, 10, 28, 3, 0, tzinfo=timezone.utc)
    if not args.fixture and datetime.now(timezone.utc) >= eav_inicio_utc:
        raise RuntimeError('Entró en vigor el esquema EAV: detener lectura de iconos de colores hasta validar la nueva publicación oficial')
    html = Path(args.fixture).read_text(encoding='utf-8') if args.fixture else fetch_html(SOURCE, args.timeout)
    found = extract(html, catalog_aliases(args.indice))
    result = payload(found, 'PRUEBA_FIXTURE' if args.fixture else 'CONSULTA_AUTOMATICA')
    output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    print('Lectura:', ', '.join(k + '=' + level for k, _, level in found))
    if args.seco:
        print(output)
        return
    path = Path(args.salida)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(output, encoding='utf-8')
    tmp.replace(path)
    print('Generado:', path)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('SIN ACTUALIZAR (se conserva respaldo):', str(exc), file=sys.stderr)
        sys.exit(1)
