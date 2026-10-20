#!/usr/bin/env python3
"""Importar uno o varios GeoJSON DMC (archivo/carpeta/ZIP) en GridVision.

Preparado para todo Chile. Trabaja con documentos descargados de la DMC:
NO descarga automáticamente el catálogo nacional ni declara oficial una lista parcial.

Uso:
  python scripts/importar_dmc_nacional.py --entrada "C:/Users/.../Downloads/DMC" --raiz .
  python scripts/importar_dmc_nacional.py --entrada "C:/.../avisos.zip" --raiz . --prueba

Sólo use --reemplazar --confirmar-catalogo-completo cuando haya verificado que
la entrada es una foto COMPLETA de TODOS los avisos DMC actuales. Sin ello,
se conservan los avisos existentes (con su fecha de vencimiento documental).
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import datetime
from io import BytesIO
import json
from pathlib import Path
import re
import sys
import zipfile
from zoneinfo import ZoneInfo

MESES = dict(zip('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(),range(1,13)))
REGIONES = {
 '15':'Arica y Parinacota','01':'Tarapacá','02':'Antofagasta',
 '03':'Atacama','04':'Coquimbo','05':'Valparaíso','13':'Metropolitana',
 '06':"O’Higgins",'07':'Maule','16':'Ñuble','08':'Biobío',
 '09':'La Araucanía','10a':'Los Ríos','10b':'Los Lagos',
 '11':'Aysén','12':'Magallanes',
}
PATRON_CODIGO = re.compile(r'^(AA?|A)\d+(?:-\d+)?/20\d{2}$', re.I)
PATRON_VERSION = re.compile(r'^([A-Z]+\d+)(?:-(\d+))?/(20\d{2})$', re.I)
LIMITE_BYTES = 50 * 1024 * 1024

def escribir_json(dest:Path, data):
    dest.parent.mkdir(parents=True,exist_ok=True)
    temporal=dest.with_name(dest.name+'.tmp')
    temporal.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temporal.replace(dest)

def leer_entradas(ruta:Path):
    if ruta.is_dir():
        paths=sorted(ruta.rglob('*.geojson'))
        if not paths: raise ValueError('No hay archivos .geojson en esa carpeta')
        for p in paths:
            if p.stat().st_size > LIMITE_BYTES: raise ValueError(f'Archivo demasiado grande: {p.name}')
            yield str(p),p.read_bytes()
    elif ruta.suffix.lower()=='.zip':
        with zipfile.ZipFile(ruta) as z:
            names=[i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.geojson')]
            if not names: raise ValueError('El ZIP no contiene archivos .geojson')
            for i in names:
                if i.file_size>LIMITE_BYTES: raise ValueError(f'Archivo demasiado grande: {i.filename}')
                yield i.filename,z.read(i)
    elif ruta.suffix.lower()=='.geojson':
        if ruta.stat().st_size > LIMITE_BYTES: raise ValueError('Archivo demasiado grande')
        yield str(ruta),ruta.read_bytes()
    else: raise ValueError('Use un .geojson, un .zip de GeoJSON o una carpeta')

def fecha_dia(texto):
    m=re.search(r'(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+d(?:e|el)\s+(20\d{2})',str(texto).lower())
    if not m or m.group(2) not in MESES: return None
    return f'{int(m.group(3)):04d}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}'

def version(codigo):
    m=PATRON_VERSION.fullmatch(codigo)
    if not m: return None
    return (m.group(1).upper(),int(m.group(2) or 0),m.group(3))

def regions(zonas, propiedades):
    resultado=set()
    for n,_ in zonas:
        p=str(n).split('_',1)[0].lower()
        if p in REGIONES: resultado.add(REGIONES[p])
    for nombre in propiedades.get('regiones',[]) if isinstance(propiedades.get('regiones'),list) else []:
        resultado.add(str(nombre))
    return sorted(resultado)

def leer_catalogo(entrada):
    grupos=defaultdict(list)
    for nombre,bytes_ in leer_entradas(entrada):
        try: obj=json.loads(bytes_.decode('utf-8-sig'))
        except (ValueError,UnicodeError) as ex: raise ValueError(f'GeoJSON inválido: {nombre}') from ex
        if obj.get('type')!='FeatureCollection' or not isinstance(obj.get('features'),list) or not obj['features']:
            raise ValueError(f'Se esperaba FeatureCollection no vacía: {nombre}')
        metadata=obj.get('metadata') or {}
        if not isinstance(metadata,dict): raise ValueError(f'Metadata inválida: {nombre}')
        for feat in obj['features']:
            p=feat.get('properties') or {}
            if not isinstance(p,dict): raise ValueError(f'Propiedades inválidas: {nombre}')
            props={**metadata,**p}
            codigo=str(props.get('codigoMeteo') or '').upper().strip()
            if not PATRON_CODIGO.fullmatch(codigo): raise ValueError(f'Código de aviso inválido en {nombre}: {codigo}')
            if (feat.get('geometry') or {}).get('type') not in ('Polygon','MultiPolygon'):
                raise ValueError(f'Geometría no poligonal en {nombre}: {codigo}')
            grupos[codigo].append({'type':'Feature','geometry':feat['geometry'],'properties':props})
    return grupos

def preparar(registros,raiz,emision=None):
    try:
        from shapely.geometry import shape,mapping
        from shapely.ops import unary_union
        from shapely.prepared import prep
    except ImportError as e:
        raise RuntimeError('Falta Shapely: ejecute python -m pip install shapely') from e
    nombres={
        'activos':'activos_puntuales_validados.geojson',
        'lineas':'lineas_validadas.geojson',
        'netbilling':'pfv_netbilling.geojson',
    }
    inventario={}
    for categoria,nombre in nombres.items():
        archivo=raiz/'data'/'processed'/nombre
        if not archivo.is_file(): raise FileNotFoundError(f'Inventario requerido no encontrado: {archivo}')
        obj=json.loads(archivo.read_text(encoding='utf-8-sig'))
        inventario[categoria]=[(feat.get('properties') or {},shape(feat['geometry']))
                               for feat in obj.get('features',[]) if feat.get('geometry')]

    todos={}
    for codigo,fs in registros.items():
        zonas=[]
        for f in fs:
            g=shape(f['geometry'])
            if not g.is_valid: g=g.buffer(0)
            if g.is_empty: raise ValueError(f'Geometría vacía: {codigo}')
            zonas.append((str(f['properties'].get('indice') or 'Zona DMC'),g))
        union=unary_union([g for _,g in zonas])
        if not union.is_valid: union=union.buffer(0)
        if union.is_empty: raise ValueError(f'Cobertura vacía: {codigo}')
        pred=prep(union)
        impactos={'codigo':codigo,'criterio':'intersección geográfica',
                  'advertencia':'Área del aviso: exposición potencial, no impacto confirmado.',
                  'totales':{},'elementos':{}}
        for categoria,items in inventario.items():
            hits=[]
            for props,g in items:
                if not pred.intersects(g):continue
                # Preserve original categorical names; no estimated kilometres.
                hits.append({'id':str(props.get('id') or ''),
                    'nombre':str(props.get('nombre') or props.get('name') or ''),
                    'categoria':str(props.get('categoria') or ''),
                    'zonas':sorted({nombre for nombre,geom in zonas if geom.intersects(g)})})
            hits.sort(key=lambda x:x['nombre'].casefold())
            impactos['totales'][categoria]=len(hits)
            impactos['elementos'][categoria]=hits
        meta=fs[0]['properties']
        slug=codigo.replace('/','_')
        registro={
            'codigo':codigo,'tipo':str(meta.get('tipo') or 'Aviso'),
            'fenomeno':str(meta.get('fenomeno') or ''),
            'titulo':str(meta.get('titulo') or ''),
            'desdeTexto':str(meta.get('desde') or ''),
            'hastaTexto':str(meta.get('hasta') or ''),
            'fechaInicioDia':fecha_dia(meta.get('desde') or ''),
            'fechaFinDia':fecha_dia(meta.get('hasta') or ''),
            'fechaEmision':emision,
            'regiones':regions(zonas,meta),'numeroPoligonos':len(zonas),
            'archivoGeojson':f'data/dmc/{slug}.geojson',
            'archivoCobertura':f'data/dmc/{slug}_cobertura.geojson',
            'archivoImpactos':f'data/dmc/{slug}_impactos.json',
        }
        cobertura={'type':'FeatureCollection','features':[
            {'type':'Feature','geometry':mapping(union),
             'properties':{'tipo':registro['tipo'],'codigoMeteo':codigo,
                           'fenomeno':registro['fenomeno']}}]}
        zonas_geo={'type':'FeatureCollection','metadata':{'codigoMeteo':codigo},'features':fs}
        todos[codigo]=(registro,zonas_geo,cobertura,impactos)
    return todos

def hacer_indice(raiz,documentos,reemplazar,emision):
    archivo=raiz/'data'/'dmc'/'indice.json'
    anterior=json.loads(archivo.read_text(encoding='utf-8-sig')) if archivo.exists() else {'avisos':[]}
    existentes={} if reemplazar else {a['codigo']:a for a in anterior.get('avisos',[])}
    for codigo,(nuevo,*_) in documentos.items():
        previo=existentes.get(codigo) or {}
        if not nuevo['fechaEmision'] and previo.get('fechaEmision'):
            nuevo['fechaEmision']=previo['fechaEmision']
        existentes[codigo]=nuevo
    # Una única versión vigente en la interfaz por cada código base.
    mejor={}
    for codigo,r in existentes.items():
        ver=version(codigo)
        if not ver: continue
        llave=(ver[0],ver[2])
        if llave not in mejor or ver[1] > version(mejor[llave]['codigo'])[1]:
            mejor[llave]=r
    avisos=list(mejor.values())
    avisos.sort(key=lambda a: (a.get('fechaFinDia') or '', a.get('fechaEmision') or '',a['codigo']),reverse=True)
    nuevo={**{k:v for k,v in anterior.items() if k not in ('avisos','fuente','modoActualizacion','generadoEn')},
        'fuente':'DMC','modoActualizacion':'MANUAL',
        'alcanceCatalogo': 'DECLARADO_COMPLETO' if reemplazar else 'PARCIAL_NO_VERIFICADO',
        'avisos':avisos,
        'generadoEn':datetime.now(ZoneInfo('America/Santiago')).isoformat()}
    return nuevo

def main():
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--entrada',required=True,type=Path)
    parser.add_argument('--raiz',type=Path,default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--emision',help='Fecha/hora emisión ISO 8601; opcional y aplicable a todos los archivos de la entrada')
    parser.add_argument('--prueba',action='store_true',help='Calcular y validar sin escribir')
    parser.add_argument('--reemplazar',action='store_true',help='Sustituir el catálogo visible por los documentos de la entrada')
    parser.add_argument('--confirmar-catalogo-completo',action='store_true',help='Confirmar que la entrada contiene todos los avisos vigentes')
    a=parser.parse_args()
    if a.reemplazar and not a.confirmar_catalogo_completo:
        parser.error('--reemplazar requiere --confirmar-catalogo-completo para evitar desaparición de avisos')
    if a.emision: datetime.fromisoformat(a.emision)
    raiz=a.raiz.resolve()
    registros=leer_catalogo(a.entrada.resolve())
    documentos=preparar(registros,raiz,a.emision)
    indice=hacer_indice(raiz,documentos,a.reemplazar,a.emision)
    print('Documentos distintos en entrada:',len(documentos))
    print('Catálogo visible después del proceso:',len(indice['avisos']))
    for codigo,(r,*resto) in sorted(documentos.items()):
        impactos=resto[-1]
        print(f"  {r['tipo']} {codigo} · {r['numeroPoligonos']} zonas · {', '.join(r['regiones']) or 'sin región identificada'} · impactos {impactos['totales']}")
    if a.prueba:
        print('MODO PRUEBA: no se modificó ningún archivo.')
        return 0
    carpeta=raiz/'data'/'dmc'
    for codigo,(r,raw,coverage,impactos) in documentos.items():
        slug=codigo.replace('/','_')
        escribir_json(carpeta/f'{slug}.geojson',raw)
        escribir_json(carpeta/f'{slug}_cobertura.geojson',coverage)
        escribir_json(carpeta/f'{slug}_impactos.json',impactos)
    escribir_json(carpeta/'indice.json',indice)  # índice se escribe al final
    print('Actualizado:',carpeta/'indice.json')
    print('Fuente: GeoJSON local DMC; no constituye actualización online en vivo.')
    return 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,ValueError,RuntimeError,zipfile.BadZipFile) as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        sys.exit(1)
