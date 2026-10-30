#!/usr/bin/env python3
"""GridVision Vulcano: EAV 0-5 en imágenes oficiales de SERNAGEOMIN.

El sitio publica las tarjetas EAV en PNG, NO como texto HTML ni datos JSON.
Identifica exactamente dos tarjetas oficiales y lee el distintivo EAV#N con
DOS modalidades de OCR independientes. Si discrepan, no asigna ningún EAV.

El número resultante es una LECTURA AUTOMATIZADA de una imagen oficial;
la hora de consulta/actualización web NO equivale a fecha de emisión del EAV.
"""
import argparse
import io
import json
import re
import ssl
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SOURCE = 'https://www.sernageomin.cl/alertas-volcanicas/'
HOSTS = {'www.sernageomin.cl', 'sernageomin.cl'}
CARDS = {
    'nevados_chillan': ('Complejo Volcánico Nevados de Chillán', 'Nevados-de-Chillan.png'),
    'villarrica': ('Volcán Villarrica', 'Volcan-Villarrica.png'),
}

try:
    import truststore
except ImportError:
    truststore = None


def secure_url(url, image=False):
    p = urlparse(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port:
        raise ValueError('URL fuera de HTTPS oficial de SERNAGEOMIN')
    if image and (not p.path.startswith('/wp-content/uploads/') or not p.path.lower().endswith('.png')):
        raise ValueError('La imagen no procede de la carpeta oficial de publicaciones PNG')
    return url


def download(url, timeout, max_bytes, image=False):
    secure_url(url, image)
    req = Request(url, headers={
        'User-Agent': 'GridVisionVulcano/0.2 (+consulta informativa de fuente publica)',
        'Accept': 'image/png' if image else 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
    })
    ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT) if truststore else ssl.create_default_context()
    with urlopen(req, timeout=timeout, context=ctx) as resp:
        secure_url(resp.geturl(), image)
        if resp.status != 200:
            raise RuntimeError(f'SERNAGEOMIN HTTP {resp.status}')
        content = resp.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError('Contenido oficial sobrepasa el límite permitido')
        return content


class OfficialHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images = []
        self.modified = None

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'img':
            self.images.append(d)
        if tag == 'meta' and d.get('property') == 'article:modified_time':
            self.modified = d.get('content')


def extract_refs(html):
    if not re.search(r'Alertas\s+volc[aá]nicas\s+vigentes',
                     re.sub(r'<[^>]*>', ' ', html), flags=re.I):
        raise ValueError('No se reconoce la sección oficial de alertas vigentes')
    parser = OfficialHTML()
    parser.feed(html)
    result = {}
    for key, (name, fname) in CARDS.items():
        matches = []
        for tag in parser.images:
            # La relación entre volcán e imagen debe estar explícita.
            # El sitio WordPress expone el fichero ORIGINAL en srcset,
            # aunque en un HTML guardado src es una ruta local.
            title = str(tag.get('title') or '').lower()
            direct = str(tag.get('src') or '')
            candidates = re.findall(r'https://[^\s,\"\']+?\.png', str(tag.get('srcset') or ''))
            if direct.startswith('https://'):
                candidates.append(direct)
            for u in candidates:
                p = urlparse(u)
                if p.path.rsplit('/', 1)[-1] == fname and (fname.lower() in direct.lower() or
                    fname.lower() in str(tag.get('srcset', '')).lower() or
                    (('chillan' in title) if key == 'nevados_chillan' else ('villarrica' in title))):
                    secure_url(u, image=True)
                    matches.append(u)
        matches = sorted(set(matches))
        if len(matches) != 1:
            raise ValueError(f'La imagen oficial de {name} no es única/encontrable: {len(matches)}')
        result[key] = matches[0]
    return result, parser.modified


def parse_badge(text):
    matches = re.findall(r'\bEAV\s*#\s*([0-5])\b', text.upper())
    return int(matches[0]) if len(matches) == 1 else None


def crop_eav_badge(image):
    """Encuentra SOLO el rectángulo azul del distintivo EAV en la imagen.

    Si SERNAGEOMIN cambia su diseño y no encontramos el distintivo,
    devolvemos None. No se intenta leer números del nombre del volcán,
    del ranking de riesgo ni de otras zonas de la imagen.
    """
    from PIL import Image

    src = image.convert('RGB')
    w, h = src.size
    max_x, max_y = round(w * 0.67), round(h * 0.66)
    px = src.load()

    def azul_oscuro(x, y):
        r, g, b = px[x, y]
        return (25 <= r <= 75 and 30 <= g <= 100 and 75 <= b <= 165
                and b > r * 1.45 and b > g * 1.30)

    # Filas que contienen un bloque ancho de azul oscuro.
    minimo = max(9, round(w * 0.022))
    filas = [sum(azul_oscuro(x, y) for x in range(max_x)) for y in range(max_y)]
    segmentos = []
    inicio = None
    for y, cantidad in enumerate(filas + [0]):
        if cantidad >= minimo and inicio is None:
            inicio = y
        elif cantidad < minimo and inicio is not None:
            segmentos.append((inicio, y))
            inicio = None

    for y0, y1 in sorted(segmentos, key=lambda t: t[1] - t[0], reverse=True):
        alto = y1 - y0
        if alto < 7:
            continue
        columnas = [x for x in range(max_x)
                    if sum(azul_oscuro(x, y) for y in range(y0, y1))
                    >= max(4, round(alto * 0.30))]
        if not columnas:
            continue
        x0, x1 = min(columnas), max(columnas) + 1
        ancho = x1 - x0
        # El tamaño del distintivo debe ser razonable dentro de la tarjeta.
        if not (0.08 * w < ancho < 0.45 * w
                and 0.08 * h < alto < 0.44 * h):
            continue
        if x1 - x0 <= 6 or y1 - y0 <= 6:
            continue
        # Quitamos bordes azul oscuro para evitar artefactos OCR.
        insignia = src.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
        return insignia.resize((insignia.width * 5, insignia.height * 5),
                               Image.Resampling.LANCZOS)
    return None


def recognize_eav_png(content):
    """Dos lecturas OCR coincidentes del distintivo aislado; si no, None."""
    from PIL import Image
    import pytesseract

    with Image.open(io.BytesIO(content)) as src:
        if src.format != 'PNG':
            raise ValueError('Formato inesperado: se requiere imagen PNG')
        w, h = src.size
        if w < 300 or h < 80 or w > 2000 or h > 800 or not 2.0 < w / h < 7.0:
            raise ValueError(f'Dimensiones de imagen no reconocidas: {w}x{h}')
        insignia = crop_eav_badge(src)
    if insignia is None:
        return None
    numeros = []
    # 8 y 13 son modos para una sola palabra/línea; las pruebas con la
    # tarjeta de Chillán muestran errores al procesar toda la franja.
    for psm in (8, 13):
        try:
            texto = pytesseract.image_to_string(insignia,
                         config=f'--psm {psm}', timeout=12)
        except RuntimeError as exc:
            raise RuntimeError('No se pudo completar el OCR con Tesseract') from exc
        numeros.append(parse_badge(texto))
    return numeros[0] if numeros[0] is not None and numeros[0] == numeros[1] else None


def make_payload(records, source_modified, fixture=False):
    valid = sum(isinstance(v['eav'], int) for v in records)
    schema = 'EAV_0_5' if valid else 'EAV_PENDIENTE'
    # No atribuir a SERNAGEOMIN una hora web futura por desfase horario del CMS.
    modified_safe = None
    if source_modified:
        try:
            parsed = datetime.fromisoformat(source_modified.replace('Z', '+00:00'))
            if parsed.tzinfo is not None and parsed <= datetime.now(timezone.utc):
                modified_safe = source_modified
        except ValueError:
            pass
    return {
        'schema': 1,
        'fuente': 'SERNAGEOMIN',
        'fuenteURL': SOURCE,
        'tipo': 'ESTADOS_EAV_PUBLICADOS' if valid == len(records) else 'ESTADOS_EAV_PARCIALES_O_PENDIENTES',
        'modo': 'PRUEBA_FIXTURE' if fixture else 'CONSULTA_AUTOMATICA',
        'esquema': schema,
        'consultadoEn': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'paginaModificadaEn': modified_safe,
        'volcanes': records,
        'nota': ('Números obtenidos mediante dos lecturas OCR coincidentes del distintivo EAV en PNG oficiales. '
                 'Los niveles sin lectura fiable permanecen sin confirmar. '
                 'Fecha de consulta y fecha de modificación web no equivalen a fecha de emisión oficial. '
                 'SERNAGEOMIN es fuente técnica, SENAPRED gestiona alertas territoriales.'),
    }


def process(html, timeout, image_dir=None):
    refs, modified = extract_refs(html)
    records = []
    for key, (name, filename) in CARDS.items():
        url = refs[key]
        if image_dir is not None:
            img_path = Path(image_dir) / filename
            data = img_path.read_bytes()
        else:
            data = download(url, timeout, 2_500_000, image=True)
        try:
            number = recognize_eav_png(data)
        except (ValueError, OSError, RuntimeError) as e:
            print(f'AVISO: {key}: imagen no interpretable ({e}); EAV queda sin confirmar', file=sys.stderr)
            number = None
        records.append({
            'clave': key, 'nombre': name, 'nivel': None, 'eav': number,
            'fuenteURL': SOURCE, 'imagenOficialURL': url,
            'metodoVerificacion': 'OCR_DOBLE_PASADA' if number is not None else 'NO_CONFIRMADO',
            'fechaEmision': None,
        })
    return make_payload(records, modified, fixture=image_dir is not None)


def selftest():
    h = '''<html><h1>Alertas volcánicas vigentes</h1>
       <img title="Nevados de Chillan" srcset="https://www.sernageomin.cl/wp-content/uploads/2026/10/Nevados-de-Chillan-200x57.png 200w, https://www.sernageomin.cl/wp-content/uploads/2026/10/Nevados-de-Chillan.png 577w">
       <img title="Volcan Villarrica" srcset="https://www.sernageomin.cl/wp-content/uploads/2026/10/Volcan-Villarrica.png 576w"></html>'''
    refs, _ = extract_refs(h)
    assert set(refs) == set(CARDS)
    assert parse_badge('EAV#3') == 3 and parse_badge('EAV #1') == 1
    assert parse_badge('EAV#7') is None and parse_badge('EAV#1 EAV#3') is None
    for bad in ('<html><h1>Alertas volcánicas vigentes</h1></html>',
                h.replace('Volcan-Villarrica.png', 'Volcan-Villarrica.webp')):
        try:
            extract_refs(bad)
        except ValueError:
            pass
        else:
            raise AssertionError('Se aceptó una fuente incompleta')
    print('AUTOPRUEBA OK: HTML oficial, URLs y lectura EAV estricta')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--salida', default='data/vulcano/estados_oficiales.json')
    ap.add_argument('--fixture', help='HTML local; requiere --imagenes-fixture; no se etiqueta como consulta automática')
    ap.add_argument('--imagenes-fixture', help='Carpeta local con imágenes PNG originales o muestras')
    ap.add_argument('--autoprueba', action='store_true')
    ap.add_argument('--seco', action='store_true')
    ap.add_argument('--timeout', type=int, default=30)
    args = ap.parse_args()
    if args.autoprueba:
        selftest()
        return
    if bool(args.fixture) != bool(args.imagenes_fixture):
        raise ValueError('Para pruebas locales se requieren --fixture y --imagenes-fixture juntos')
    if args.timeout < 2 or args.timeout > 120:
        raise ValueError('Timeout fuera de límites')
    page = Path(args.fixture).read_text(encoding='utf-8') if args.fixture else download(SOURCE, args.timeout, 4_000_000).decode('utf-8', errors='replace')
    result = process(page, args.timeout, args.imagenes_fixture)
    out = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.seco:
        print(out)
        return
    dest = Path(args.salida)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + '.tmp')
    tmp.write_text(out, encoding='utf-8')
    tmp.replace(dest)
    print('Estados volcánicos procesados: ' + ', '.join(f"{v['clave']}=EAV {v['eav']}" if v['eav'] is not None else f"{v['clave']}=PENDIENTE" for v in result['volcanes']))
    print('Archivo:', dest)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('SIN ACTUALIZAR:', str(exc), file=sys.stderr)
        sys.exit(1)
