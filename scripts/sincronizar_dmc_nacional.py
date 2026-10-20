#!/usr/bin/env python3
"""DMC -> GridVision: normalización y cruce espacial de catálogo nacional.

Fuentes visibles en la red de la página oficial de DMC (ruta presumida a partir de
los nombres de petición; confirmar en el equipo antes de operación periódica):
  https://archivos.meteochile.gob.cl/portaldmc/AAA/datos_AAA.json
  https://archivos.meteochile.gob.cl/portaldmc/AAA/coordenadas_zonas_DMC_v3.geojson
  https://archivos.meteochile.gob.cl/portaldmc/AAA/coordenadas_regiones_DMC.geojson

Instalar primero GridVision DMC Nacional v7. Por defecto NUNCA escribe datos:
  python scripts/sincronizar_dmc_nacional.py --raiz .
  python scripts/sincronizar_dmc_nacional.py --raiz . --aplicar

Prueba sin internet, después de descargar estos tres archivos en un directorio:
  python scripts/sincronizar_dmc_nacional.py --raiz . --fuentes "C:/ruta/DMC"

El script aborta sin actualizar el indice si alguna zona del catálogo no se
puede representar. El índice local es una INSTANTÁNEA, no datos en vivo.
"""
from __future__ import annotations
import argparse
from html.parser import HTMLParser
import html
import importlib.util
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
import re
import sys
import tempfile
import urllib.request
import urllib.error
from zoneinfo import ZoneInfo

BASE = "https://archivos.meteochile.gob.cl/portaldmc/AAA/"
FUENTES = {
    "catalogo": "datos_AAA.json",
    "zonas": "coordenadas_zonas_DMC_v3.geojson",
    "regiones": "coordenadas_regiones_DMC.geojson",
}
MAX_BYTES = 25 * 1024 * 1024
CL = ZoneInfo("America/Santiago")
MESES = {v: i for i, v in enumerate("enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(), 1)}
PATRON_CODIGO = re.compile(r"^(?:A|AA)\d+(?:-\d+)?/20\d{2}$", re.IGNORECASE)



class TablaDMC(HTMLParser):
    """Convierte la tabla HTML de la DMC en filas de texto seguras para la interfaz."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.filas=[]
        self.fila=None
        self.celda=None
    def handle_starttag(self,tag,attrs):
        atributos=dict(attrs)
        if tag=='tr': self.fila=[]
        elif tag in ('th','td') and self.fila is not None:
            try: cols=max(1,min(20,int(atributos.get('colspan') or 1)))
            except (TypeError,ValueError): cols=1
            self.celda={'encabezado':tag=='th','colspan':cols,'texto':''}
        elif tag=='img' and self.celda is not None:
            origen=str(atributos.get('src') or '').lower()
            icono= ('⚡' if 'lightning' in origen else '🌧' if ('rain' in origen or 'shower' in origen) else
                    '💨' if ('wind' in origen) else '❄' if ('snow' in origen) else '●')
            self.celda['texto']+=icono
        elif tag=='br' and self.celda is not None: self.celda['texto']+=' '
    def handle_data(self,data):
        if self.celda is not None: self.celda['texto']+=data
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.celda is not None and self.fila is not None:
            self.celda['texto']=' '.join(self.celda['texto'].split())
            self.fila.append(self.celda)
            self.celda=None
        elif tag=='tr' and self.fila is not None:
            if self.fila: self.filas.append(self.fila)
            self.fila=None

def convertir_tabla(html_tabla):
    p=TablaDMC()
    p.feed(str(html_tabla or ''))
    return p.filas

def texto_multilinea(raw):
    text=re.sub(r'<br\s*/?>','\\n',str(raw or ''),flags=re.I)
    text=re.sub(r'<[^>]+>','',text)
    return '\n'.join(' '.join(line.split()) for line in html.unescape(text).splitlines()).strip()

def normalizar(v):
    s = html.unescape(str(v or ""))
    return re.sub(r"\s+", " ", s).strip()


def limpiar_html(v):
    return re.sub(r"<[^>]*>", " ", normalizar(v)).strip()


def regiones_texto(v):
    """Etiquetas informativas del boletín, sin suplantar la cartografía oficial."""
    texto = limpiar_html(v).lower()
    nombres = (
        'Arica y Parinacota','Tarapacá','Antofagasta','Atacama','Coquimbo',
        'Valparaíso','Metropolitana',"O’Higgins",'Maule','Ñuble','Biobío',
        'La Araucanía','Los Ríos','Los Lagos','Aysén','Magallanes',
    )
    encontradas = [n for n in nombres if n.lower() in texto]
    if not encontradas and 'juan fernández' in texto:
        encontradas = ['Juan Fernández']
    return encontradas


def leer_remoto(nombre: str):
    url = BASE + nombre
    req = urllib.request.Request(url, headers={"Accept": "application/json, application/geo+json, */*", "User-Agent": "GridVision-DMC/0.8 (operational monitoring; low-frequency)"})
    with urllib.request.urlopen(req, timeout=25) as r:
        if int(r.status) != 200:
            raise ValueError(f"HTTP {r.status} para {nombre}")
        mime = (r.headers.get("Content-Type") or "").lower()
        if "html" in mime:
            raise ValueError(f"La respuesta de {nombre} es HTML, no JSON")
        raw = r.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError(f"La fuente supera 25 MB: {nombre}")
    return json.loads(raw.decode("utf-8-sig"))


def leer_fuentes(carpeta: Path | None):
    objetos = {}
    for clave, nombre in FUENTES.items():
        if carpeta:
            p = carpeta / nombre
            if not p.is_file():
                raise FileNotFoundError(f"Falta fuente {p}")
            if p.stat().st_size > MAX_BYTES:
                raise ValueError(f"Archivo demasiado grande: {p}")
            objetos[clave] = json.loads(p.read_text(encoding="utf-8-sig"))
        else:
            objetos[clave] = leer_remoto(nombre)
        print(f"OK: {nombre}")
    return objetos


def claves_feature(feat):
    props = feat.get("properties") or {}
    vals = []
    for name in ("indice", "codigo", "codigoZona", "cod_zona", "id", "ID", "nombre", "name", "zona", "region", "Region"):
        v = props.get(name)
        if isinstance(v, (str, int)) and str(v).strip(): vals.append(normalizar(v).lower())
    if feat.get("id") is not None: vals.append(normalizar(feat["id"]).lower())
    return vals


def indexar_geo(geo):
    if geo.get("type") != "FeatureCollection" or not isinstance(geo.get("features"), list):
        raise ValueError("Se esperaba GeoJSON FeatureCollection en fuentes cartográficas")
    idx = defaultdict(list)
    for feat in geo["features"]:
        if not isinstance(feat, dict) or (feat.get("geometry") or {}).get("type") not in ("Polygon", "MultiPolygon"):
            continue
        for clave in set(claves_feature(feat)):
            idx[clave].append(feat)
    return idx


def fecha_emision(texto):
    # Ej.: Martes 20 de octubre del 2026 a las 12:02 hrs.
    texto = normalizar(texto).lower()
    m = re.search(r"(\d{1,2}) de ([a-záéíóúñ]+) del? (20\d{2}) a las (\d{1,2}):(\d{2})", texto)
    if not m or m.group(2) not in MESES: return None
    try:
        return datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=CL).isoformat()
    except ValueError:
        return None


def crear_area(valor, codigo):
    vertices = []
    for part in str(valor).split("|"):
        campos = part.strip().split(",")
        if len(campos) != 2: raise ValueError(f"Área de {codigo}: vértice no reconocido")
        lat, lon = (float(x) for x in campos)
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError(f"Área de {codigo}: coordenada inválida")
        vertices.append([lon, lat])  # DMC lat,lon -> GeoJSON lon,lat
    if len(vertices) < 3: raise ValueError(f"Área de {codigo}: menos de 3 vértices")
    if vertices[-1] != vertices[0]: vertices.append(vertices[0])
    return {"type": "Polygon", "coordinates": [vertices]}


def obtener_geometrias(objetos):
    catalogo,zonas,regiones = (objetos[k] for k in ("catalogo", "zonas", "regiones"))
    documentos = catalogo.get("AAA")
    if not isinstance(documentos, list) or not documentos:
        raise ValueError("Catálogo sin AAA o lista vacía: no se reemplazará información")
    if not isinstance(catalogo.get("Avisos"), int) or not isinstance(catalogo.get("Alertas"), int) or not isinstance(catalogo.get("Alarmas"), int):
        raise ValueError("Catálogo sin contadores DMC")
    esperado = catalogo["Avisos"] + catalogo["Alertas"] + catalogo["Alarmas"]
    if len(documentos) != esperado:
        raise ValueError(f"Catálogo incompleto: {len(documentos)} registros, contadores DMC suman {esperado}")
    if any(d.get('tipo') not in ('Aviso', 'Alerta', 'Alarma') for d in documentos):
        raise ValueError('Documento con tipo meteorológico desconocido')
    actual = Counter(d['tipo'] for d in documentos)
    if actual != Counter({k:v for k,v in (("Aviso",catalogo["Avisos"]),("Alerta",catalogo["Alertas"]),("Alarma",catalogo["Alarmas"])) if v > 0}):
        raise ValueError('Conteo por tipo no coincide con los datos oficiales')
    # Estos índices permiten trabajar con zonas, áreas dibujadas y regiones.
    indice_zonas = indexar_geo(zonas)
    indice_regiones = indexar_geo(regiones)
    if not indice_zonas or not indice_regiones: raise ValueError("Una fuente cartográfica no tiene geometrías utilizables")
    lotes = {}
    faltantes = []
    for d in documentos:
        codigo = normalizar(d.get("codigoMeteo")).upper()
        if not PATRON_CODIGO.fullmatch(codigo): raise ValueError(f"Código inválido: {codigo}")
        if codigo in lotes: raise ValueError(f"Código duplicado en catálogo: {codigo}")
        tipo = d['tipo']
        origen = normalizar(d.get("tipoZonaAfecta")).lower()
        data = normalizar(d.get("dataZonaAfecta"))
        props = {
            'codigoMeteo': codigo,'tipo':tipo,'titulo':limpiar_html(d.get('titulo')),
            'fenomeno': limpiar_html(d.get('fenomeno')),
            'desde': limpiar_html(d.get('desde')),'hasta': limpiar_html(d.get('hasta')),
            'observacion': limpiar_html(d.get('observacion')),
            'emisionTexto': limpiar_html(d.get('emision')),
            'fechaEmision': fecha_emision(d.get('emision')),
            'regiones': regiones_texto(d.get('textoZonaAfecta')),
        }
        if not props['fechaEmision']:
            raise ValueError(f"No se reconoce la hora de emisión de {codigo}: {props['emisionTexto']}")
        feats = []
        if origen in ('zonas', 'regiones'):
            indice = indice_zonas if origen == 'zonas' else indice_regiones
            claves = [i.strip().lower() for i in data.split(',') if i.strip()]
            if not claves: raise ValueError(f"Documento {codigo} sin zonas")
            for clave in claves:
                features = indice.get(clave, [])
                # Juan Fernández puede figurar por nombre en vez del código jf.
                if not features and origen == 'regiones' and clave == 'jf':
                    features = [f for f in regiones['features'] if
                        any('juan fernandez' in t.replace('á','a').replace('é','e') or 'juan fernández' in t
                            for t in claves_feature(f))]
                if not features:
                    faltantes.append(f"{codigo}: {clave} ({origen})")
                    continue
                for f in features:
                    feats.append({"type":"Feature", "geometry":f['geometry'],
                                  "properties":{**props,'indice': clave}})
        elif origen == 'area':
            feats.append({"type":"Feature", "geometry":crear_area(data,codigo),
                          "properties":{**props, 'indice':'Area DMC'}})
        else:
            raise ValueError(f"{codigo}: tipoZonaAfecta no soportado: {origen!r}")
        lotes[codigo] = {"type":"FeatureCollection", "metadata":props, "features":feats}
    if faltantes:
        ejemplos = list(indice_zonas.keys())[:10]
        ejemplos_region = list(indice_regiones.keys())[:10]
        raise ValueError("Faltan geometrías para " + str(len(faltantes)) + " referencias: " +
            '; '.join(faltantes[:12]) + '. Ejemplos de índices en zona=' + repr(ejemplos) +
            ', región=' + repr(ejemplos_region) + '. No se ha actualizado GridVision.')
    if any(not f['features'] for f in lotes.values()):
        raise ValueError("Uno o más documentos sin geometrías: no se modifica GridVision")
    return lotes


def cargar_importador(raiz):
    path=raiz/'scripts'/'importar_dmc_nacional.py'
    if not path.is_file():
        raise FileNotFoundError('Debe instalar DMC Nacional v7 (falta scripts/importar_dmc_nacional.py)')
    spec=importlib.util.spec_from_file_location('dmc_importador_v7',path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for metodo in ('leer_catalogo', 'preparar','hacer_indice','escribir_json'):
        if not callable(getattr(mod,metodo,None)):
            raise ValueError(f'Importador v7 incompatible: {metodo}')
    return mod


def sincronizar(raiz: Path, fuentes: Path|None, aplicar: bool):
    importador=cargar_importador(raiz)
    origenes=leer_fuentes(fuentes)
    registros=obtener_geometrias(origenes)
    catalogo_fecha=str(origenes['catalogo'].get('fecha_actualizacion') or '')
    try:
        instante=datetime.strptime(catalogo_fecha, '%Y-%m-%d %H:%M').replace(tzinfo=CL)
    except ValueError as exc:
        raise ValueError('El catálogo DMC no incluye fecha_actualizacion válida') from exc
    indice_previo=raiz/'data'/'dmc'/'indice.json'
    if indice_previo.is_file():
        guardado=json.loads(indice_previo.read_text(encoding='utf-8-sig'))
        anterior=guardado.get('catalogoActualizadoEn')
        if anterior:
            previo=datetime.strptime(anterior, '%Y-%m-%d %H:%M').replace(tzinfo=CL)
            if instante < previo:
                raise ValueError('El catálogo recibido es más ANTIGUO que el último sincronizado; se conserva la versión local')
    print('Catálogo DMC publicado:',catalogo_fecha)
    print('Documentos DMC encontrados:', len(registros))
    with tempfile.TemporaryDirectory(prefix='dmc-nacional-') as carpeta:
        temp=Path(carpeta)
        for codigo,geojson in registros.items():
            (temp/(codigo.replace('/','_')+'.geojson')).write_text(json.dumps(geojson,ensure_ascii=False),encoding='utf-8')
        geos=importador.leer_catalogo(temp)
        documentos=importador.preparar(geos,raiz,None)  # Requiere shapely.
        # Conservar la hora individual de cada documento, no la del catálogo completo.
        for codigo, (registro, zonas, cobertura, impactos) in documentos.items():
            registro['fechaEmision']=registros[codigo]['metadata']['fechaEmision']
            registro['observacion']=registros[codigo]['metadata'].get('observacion')
            slug=codigo.replace('/','_')
            registro['archivoDocumento']=f'data/dmc/{slug}_documento.json'
            print(f"  {codigo:<18} {registro['tipo']:<6} {registro['numeroPoligonos']:>3} pol.  "
                  f"{impactos['totales'].get('activos',0):>4} activos, "
                  f"{impactos['totales'].get('lineas',0):>4} líneas")
        indice=importador.hacer_indice(raiz,documentos,True,None)
        # Indicar siempre que los datos no son transmisión en tiempo real.
        indice.update({
            'modoActualizacion': 'INSTANTANEA_DMC',
            'alcanceCatalogo': 'DECLARADO_COMPLETO',
            'catalogoActualizadoEn': str(origenes['catalogo'].get('fecha_actualizacion') or ''),
            'origenCatalogo': BASE + FUENTES['catalogo'],
            'fuente': 'DMC',
        })
        if not aplicar:
            print('\nMODO PRUEBA: 0 archivos modificados. Ejecute de nuevo con --aplicar para actualizar el índice.')
            return
        destino=raiz/'data'/'dmc'
        # Escribir índice ÚLTIMO; si falla algo antes, no cambia el catálogo visible.
        for codigo,(registro,raw,cobertura,impactos) in documentos.items():
            slug=codigo.replace('/','_')
            fuente=next((d for d in origenes['catalogo']['AAA'] if normalizar(d.get('codigoMeteo')).upper()==codigo),None)
            if fuente is None: raise ValueError(f'Falta documento DMC para {codigo}')
            detalle={
                'codigo':codigo,'tipo':registro['tipo'],
                'titulo':limpiar_html(fuente.get('titulo')),
                'fenomeno':limpiar_html(fuente.get('fenomeno')),
                'emisionTexto':limpiar_html(fuente.get('emision')),
                'condicionSinoptica':limpiar_html(fuente.get('condicionSinoptica')),
                'desde':limpiar_html(fuente.get('desde')),
                'hasta':limpiar_html(fuente.get('hasta')),
                'observacion':limpiar_html(fuente.get('observacion')),
                'textoZonaAfecta':texto_multilinea(fuente.get('textoZonaAfecta')),
                'tablaTitulo':limpiar_html(fuente.get('tablaTitulo')),
                'tablaFilas':convertir_tabla(fuente.get('tablaHTML')),
            }
            importador.escribir_json(destino/(slug+'_documento.json'),detalle)
            importador.escribir_json(destino/(slug+'.geojson'),raw)
            importador.escribir_json(destino/(slug+'_cobertura.geojson'),cobertura)
            importador.escribir_json(destino/(slug+'_impactos.json'),impactos)
        importador.escribir_json(destino/'indice.json',indice)
        print('\nACTUALIZACIÓN LOCAL COMPLETA: ' + str(destino/'indice.json'))
        print('Copia DMC: ' + str(origenes['catalogo'].get('fecha_actualizacion', 'sin fecha')))
        print('No se publicó GitHub ni se creó tarea periódica. Validar visualmente antes de programar.')


def main():
    ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raiz',type=Path,default=Path(__file__).resolve().parent.parent)
    ap.add_argument('--fuentes',type=Path,help='Carpeta con tres fuentes DMC descargadas; evita acceso web')
    ap.add_argument('--aplicar',action='store_true',help='Escribir datos calculados e índice local después de validar todo')
    a=ap.parse_args()
    raiz=a.raiz.resolve()
    sincronizar(raiz,a.fuentes.resolve() if a.fuentes else None,a.aplicar)

if __name__=='__main__':
    try:
        main()
    except (OSError,ValueError,RuntimeError,urllib.error.URLError,json.JSONDecodeError) as e:
        print(f'ERROR DE VALIDACIÓN: {e}',file=sys.stderr)
        sys.exit(1)
