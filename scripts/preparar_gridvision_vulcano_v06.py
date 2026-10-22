#!/usr/bin/env python3
"""GridVision Vulcano v0.6. Importador nacional Chile Preparado 2024.

--inspeccionar: lee metadatos y recuentos remotos; no escribe.
--aplicar: descarga el catálogo nacional completo (sin limitarlo a Calbuco).
--validar-local: comprueba el catálogo y GeoJSON descargados; no usa internet.
Nunca modifica archivos de otros módulos ni publica en GitHub.
"""
from __future__ import annotations
import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SERV='https://services5.arcgis.com/i7S5PSnIJAUcWvSE/arcgis/rest/services'
VOL=SERV+'/AMENAZA_VOLC%C3%81NICA_2024/FeatureServer'
BBOX_REGIONAL=(-73.45,-42.00,-71.80,-40.65)
LAYERS={
    'peligro':(VOL+'/2',('Polygon','MultiPolygon')),
    'centros':(VOL+'/3',('Point','MultiPoint')),
    'vias':(VOL+'/1',('LineString','MultiLineString')),
    'puntos':(VOL+'/0',('Point','MultiPoint')),
    'evacuacion':(SERV+'/%C3%81rea_de_Evacuaci%C3%B3n_Volcanes/FeatureServer/0',('Polygon','MultiPolygon')),
    'anillos':(SERV+'/BUFFER_VOLCANES_2024/FeatureServer/1',('LineString','MultiLineString'))
}
MAX_RESPONSE=23*1024*1024
MAX_CHUNK=9*1024*1024
MAX_FEATURES=6000


def get(url,params=None):
    q=url+('?' + urlencode(params) if params else '')
    req=Request(q,headers={'User-Agent':'GridVision-Vulcano-v06-Local/1.0','Accept':'application/json,application/geo+json'})
    with urlopen(req,timeout=45) as r:
        if r.status!=200:raise ValueError(f'Error HTTP {r.status}: {url}')
        raw=r.read(MAX_RESPONSE+1)
    if len(raw)>MAX_RESPONSE:raise ValueError('Respuesta demasiado grande: '+url)
    d=json.loads(raw.decode('utf-8-sig'))
    if not isinstance(d,dict) or d.get('error'):
        raise ValueError('Error ArcGIS: '+str(d.get('error') if isinstance(d,dict) else 'Respuesta incorrecta')[:400])
    return d


def get_ids(url,ambito='nacional'):
    params={'where':'1=1','returnIdsOnly':'true','f':'json'}
    if ambito=='regional':
        params.update({'geometry':','.join(map(str,BBOX_REGIONAL)),
            'geometryType':'esriGeometryEnvelope','spatialRel':'esriSpatialRelIntersects','inSR':'4326'})
    d=get(url+'/query',params)
    ids=d.get('objectIds')
    if not isinstance(ids,list) or len(ids)>MAX_FEATURES or any(not isinstance(n,int) for n in ids) or len(ids)!=len(set(ids)):
        raise ValueError('IDs incompletos, excesivos o repetidos')
    return sorted(ids)


def positions(o):
    if isinstance(o,list):
        if len(o)>=2 and all(isinstance(v,(int,float)) for v in o[:2]):
            yield o
        else:
            for part in o:yield from positions(part)


def query_geojson(url,ids,geom_types):
    records=[];vertices=0
    for i in range(0,len(ids),25):
        batch=ids[i:i+25]
        doc=get(url+'/query',{'objectIds':','.join(map(str,batch)),
            'outFields':'*','returnGeometry':'true','outSR':'4326','f':'geojson'})
        sub=doc.get('features')
        if doc.get('type')!='FeatureCollection' or not isinstance(sub,list) or len(sub)!=len(batch):
            raise ValueError(f'Lote incompleto: {url} [{i},{i+len(batch)}]')
        for f in sub:
            if f.get('type')!='Feature' or not isinstance(f.get('properties'),dict) or f.get('geometry',{}).get('type') not in geom_types:
                raise ValueError('Geometría o propiedades inesperadas')
            count=0
            for c in positions(f['geometry']['coordinates']):
                lon,lat=c[:2]
                if not math.isfinite(lon) or not math.isfinite(lat) or not(-180<=lon<=180 and -90<=lat<=90):
                    raise ValueError('Coordenadas WGS84 incorrectas')
                count+=1
            if count<1:raise ValueError('Geometría sin coordenadas')
            vertices+=count
        records.extend(sub)
    if vertices>10_000_000:raise ValueError('Cantidad de vértices excesiva para el módulo experimental')
    return records,vertices


def chunks(key,records):
    portions=[];part=[];size=42
    for item in records:
        enc=json.dumps(item,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        need=len(enc)+2
        if need>MAX_CHUNK-200:raise ValueError('Polígono individual demasiado grande')
        if part and size+need>MAX_CHUNK:
            portions.append(part);part=[];size=42
        part.append(item);size+=need
    if part:portions.append(part)
    if len(portions)>90:raise ValueError('Más de 90 archivos por capa')
    return [(f'{key}_nacional2024_{i:02d}.geojson',{'type':'FeatureCollection','features':sub}) for i,sub in enumerate(portions,1)]


def save_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf-8')
    tmp=path.with_suffix(path.suffix+'.tmp')
    with open(tmp,'wb') as out:
        out.write(raw);out.flush();os.fsync(out.fileno())
    os.replace(tmp,path)
    return hashlib.sha256(raw).hexdigest(),len(raw)


def validate(root):
    folder=root/'data'/'vulcano';cat=folder/'catalogo_vulcano_v06.json'
    if not cat.is_file():raise ValueError('No existe el catálogo local v0.6')
    d=json.loads(cat.read_text(encoding='utf-8'))
    if d.get('schema')!=60 or d.get('ambito') not in ('NACIONAL_CHILE','VENTANA_GEOGRAFICA_MULTIVOLCAN'):raise ValueError('Esquema o ámbito incorrecto')
    for k in LAYERS:
        spec=d['capas'][k];found=[]
        for name in spec['archivos']:
            if not name.startswith('data/vulcano/') or '..' in name:raise ValueError('Ruta no permitida')
            file=root/name
            raw=file.read_bytes()
            expected=spec['hashes'][name]
            if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('SHA-256 no coincide: '+name)
            obj=json.loads(raw)
            if obj.get('type')!='FeatureCollection' or not isinstance(obj.get('features'),list):raise ValueError('GeoJSON inválido: '+name)
            found+=obj['features']
        if len(found)!=spec['conteo']:raise ValueError('Cantidad de entidades incorrecta para '+k)
        print(f'  {k:<12} {len(found):>5} entidades · hashes CORRECTOS')
    print('VALIDACIÓN LOCAL: CORRECTA. Archivo de referencia, no alerta en vivo.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raiz',type=Path,default=Path('.'))
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--inspeccionar',action='store_true')
    modes.add_argument('--aplicar',action='store_true')
    modes.add_argument('--validar-local',action='store_true')
    parser.add_argument('--ambito',choices=['nacional','regional'],default='nacional',help='Nacional por defecto; regional solo para pruebas')
    a=parser.parse_args()
    root=a.raiz.resolve()
    if not (root/'gridvision-vulcano.html').is_file() or not(root/'vendor'/'leaflet'/'leaflet.js').is_file():
        raise ValueError('Ejecute desde la carpeta de GridVision después de instalar Vulcano v0.6')
    if a.validar_local:return validate(root)
    meta={};ids={}
    print('GRIDVISION VULCANO 0.6 · Fuente nacional Chile Preparado · sin alerta en vivo · ámbito:',a.ambito)
    for key,(url,typ) in LAYERS.items():
        m=get(url,{'f':'json'})
        if m.get('geometryType') is None or not isinstance(m.get('fields'),list):raise ValueError('Metadatos incompatibles '+key)
        ids[key]=get_ids(url,a.ambito);meta[key]=m
        print(f'  {key:<12} {len(ids[key]):>5} objetos en {a.ambito} · {m["geometryType"]}')
    if a.inspeccionar:
        print('SOLO INSPECCIÓN: no se ha guardado ningún archivo.')
        return
    docs={};catalog={}
    for key,(url,typ) in LAYERS.items():
        features,verts=query_geojson(url,ids[key],typ)
        if len(features)!=len(ids[key]):raise ValueError('Recuento inconsistente '+key)
        if key=='peligro':
            kinds={f['properties'].get('peligro') for f in features}
            if kinds-{'Alto','Medio','Bajo'}:raise ValueError('Categoría no reconocida: '+str(kinds))
        if key=='anillos':
            kinds={str(f['properties'].get('distance')) for f in features}
            if kinds-{'5','10','15','20','40','5.0','10.0','15.0','20.0','40.0'}:raise ValueError('Distancia no reconocida: '+str(kinds))
        names=[]
        if key in ['centros','vias','puntos','peligro']:
            names=sorted({str(f['properties'].get('volcan')).strip() for f in features if f['properties'].get('volcan')})
        parts=chunks(key,features)
        for filename,obj in parts:docs[filename]=obj
        spec={'servicio':url,'nombre':meta[key].get('name',key),'conteo':len(features),
            'vertices':verts,'nombresVolcan':names,'archivos':['data/vulcano/'+n for n,_ in parts],
            'copyright':meta[key].get('copyrightText',''),
            'renderer':meta[key].get('drawingInfo',{}).get('renderer',{}),'hashes':{}}
        catalog[key]=spec
        print(f'  {key:<12} {len(features):>5} entidades · {verts:>7} vértices · {len(parts)} archivo(s)')
        if key=='puntos':print('    PE/PET:',dict(collections.Counter(str(f['properties'].get('tipo')) for f in features)))
        if key=='centros':print('    Volcanes:',', '.join(names[:30]) if names else 'sin etiquetas')
    folder=root/'data'/'vulcano'
    # Los seis paquetes se validan en memoria antes de escribir. Manifest se guarda último.
    for filename,obj in docs.items():
        digest,size=save_json(folder/filename,obj)
        for spec in catalog.values():
            key='data/vulcano/'+filename
            if key in spec['archivos']:spec['hashes'][key]=digest
    result={'schema':60,'proyecto':'GridVision Vulcano','version':'0.6','ambito':('NACIONAL_CHILE' if a.ambito=='nacional' else 'VENTANA_GEOGRAFICA_MULTIVOLCAN'),
        'bbox':(None if a.ambito=='nacional' else BBOX_REGIONAL),'fuente':'Chile Preparado / ArcGIS FeatureServer 2024',
        'referencia':'https://www.visorchilepreparado.cl/',
        'descargadoEn':dt.datetime.now().astimezone().isoformat(timespec='seconds'),
        'advertencia':'Cobertura oficial a escala nacional. Algunos atributos volcan pueden estar vacíos. Flechas según digitalización, no dirección oficial de evacuación acreditada. No representa alerta vigente ni orden de evacuación.',
        'capas':catalog}
    save_json(folder/'catalogo_vulcano_v06.json',result)
    print('GUARDADO: 6 capas en data/vulcano/ + catálogo v06. No se tocaron datos antiguos, DMC, SENAPRED ni GitHub.')
    print('COMPROBACIÓN: python scripts/preparar_gridvision_vulcano_v06.py --raiz . --validar-local')

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,TypeError,TimeoutError,json.JSONDecodeError) as e:
        print('BLOQUEADO: '+str(e),file=sys.stderr)
        sys.exit(1)
