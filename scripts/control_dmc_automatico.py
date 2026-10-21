#!/usr/bin/env python3
"""Validaciones conservadoras para DMC nacional en marcha blanca."""
import argparse
from collections import Counter
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.request import Request, urlopen

URL = 'https://archivos.meteochile.gob.cl/portaldmc/AAA/datos_AAA.json'
PAGES = 'https://ecastilloluengo.github.io/gridvision-piloto-publico/data/dmc/indice.json'
TIPOS = {'Aviso': 'Avisos', 'Alerta': 'Alertas', 'Alarma': 'Alarmas'}
PATRON = re.compile(r'^(?:A|AA)\d+(?:-\d+)?/20\d{2}$')


def leer(ruta):
    return json.loads(Path(ruta).read_text(encoding='utf-8-sig'))


def web_json(url):
    req = Request(url, headers={'User-Agent':'GridVision-DMC-MarchaBlanca/1.0', 'Cache-Control':'no-cache'})
    with urlopen(req, timeout=30) as resp:
        if resp.status != 200 or 'html' in resp.headers.get('Content-Type','').lower():
            raise ValueError('La fuente no devolvio JSON')
        datos = resp.read(25*1024*1024+1)
        if len(datos) > 25*1024*1024:
            raise ValueError('Fuente demasiado grande')
    return json.loads(datos.decode('utf-8-sig'))


def fecha(v):
    return datetime.strptime(v, '%Y-%m-%d %H:%M')


def comprobar(raiz):
    previo = leer(raiz/'data/dmc/indice.json')
    nuevo = web_json(URL)
    docs = nuevo.get('AAA')
    if not isinstance(docs,list) or not docs: raise ValueError('Catalogo DMC vacio')
    if any(type(nuevo.get(c)) is not int or nuevo[c]<0 for c in TIPOS.values()):
        raise ValueError('Contadores DMC invalidos')
    if len(docs) != sum(nuevo[c] for c in TIPOS.values()):
        raise ValueError('Contadores incompletos')
    codigos=[]; tipos=Counter()
    for d in docs:
        if not isinstance(d,dict):raise ValueError('Documento DMC invalido')
        codigo=str(d.get('codigoMeteo','')).strip().upper()
        tipo=d.get('tipo')
        if not PATRON.fullmatch(codigo) or tipo not in TIPOS: raise ValueError('Codigo o tipo invalido')
        codigos.append(codigo); tipos[tipo]+=1
    if len(codigos)!=len(set(codigos)) or any(tipos[t]!=nuevo[c] for t,c in TIPOS.items()):
        raise ValueError('Duplicados o tipos inconsistentes')
    actual=fecha(nuevo['fecha_actualizacion']); guardada=fecha(previo['catalogoActualizadoEn'])
    if actual<guardada:raise ValueError('Fuente DMC retrocedio en fecha')
    if actual==guardada and not {x['codigo'] for x in previo['avisos']}.issubset(codigos):
        raise ValueError('Documentos cambiados sin cambiar fecha de catalogo')
    actualizar=actual>guardada
    print('Actualizacion DMC disponible:',actualizar)
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as f:
            f.write('actualizar='+str(actualizar).lower()+'\n')


def validar(raiz, antes):
    previo=leer(antes); nuevo=leer(raiz/'data/dmc/indice.json')
    if nuevo.get('fuente')!='DMC' or nuevo.get('alcanceCatalogo')!='DECLARADO_COMPLETO':
        raise ValueError('Faltan metadatos de origen y completitud')
    if fecha(nuevo['catalogoActualizadoEn'])<=fecha(previo['catalogoActualizadoEn']):
        raise ValueError('No hay fecha nueva')
    docs=nuevo.get('avisos')
    if not isinstance(docs,list) or not docs:raise ValueError('Catalogo vacio')
    if len(docs)<max(1,(len(previo.get('avisos',[]))+1)//2):
        raise ValueError('Reduccion anormal de documentos; requiere revision')
    codigos=set()
    for d in docs:
        c=d.get('codigo')
        if not isinstance(c,str) or not PATRON.fullmatch(c) or c in codigos:raise ValueError('Codigo indice invalido')
        codigos.add(c)
        if d.get('tipo') not in TIPOS or int(d.get('numeroPoligonos',0))<1:raise ValueError('Geometria sin poligonos')
        for campo,sufijo in [('archivoGeojson','.geojson'),('archivoCobertura','_cobertura.geojson'),('archivoImpactos','_impactos.json'),('archivoDocumento','_documento.json')]:
            rel=d.get(campo)
            if not isinstance(rel,str) or not rel.startswith('data/dmc/') or not rel.endswith(sufijo):raise ValueError('Ruta invalida '+campo)
            path=(raiz/rel).resolve()
            if not path.is_relative_to((raiz/'data/dmc').resolve()) or not path.is_file():raise ValueError('Archivo no encontrado '+rel)
            obj=leer(path)
            if campo in ('archivoGeojson','archivoCobertura') and (obj.get('type')!='FeatureCollection' or not obj.get('features')):raise ValueError('GeoJSON invalido '+rel)
            if campo in ('archivoImpactos','archivoDocumento') and obj.get('codigo')!=c:raise ValueError('JSON corresponde a otro documento '+rel)
    print('Validacion completa:',len(docs),'documentos')


def verificar_web(raiz):
    objetivo=leer(raiz/'data/dmc/indice.json')['catalogoActualizadoEn']
    for n in range(24):
        try:
            publicado=web_json(PAGES+'?ver='+str(int(time.time())))
            if publicado.get('catalogoActualizadoEn')==objetivo:
                print('GitHub Pages actualizado:',objetivo)
                return
        except (OSError,ValueError,json.JSONDecodeError) as e:
            print('Esperando Pages:',e)
        time.sleep(15)
    raise ValueError('GitHub Pages no muestra el ultimo catalogo tras seis minutos')


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('accion',choices=['comprobar','validar','verificar-web'])
    ap.add_argument('--raiz',default='.',type=Path)
    ap.add_argument('--antes',type=Path)
    a=ap.parse_args(); raiz=a.raiz.resolve()
    if a.accion=='comprobar':comprobar(raiz)
    elif a.accion=='validar':
        if a.antes is None:ap.error('Falta --antes')
        validar(raiz,a.antes)
    else:verificar_web(raiz)


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as exc:
        print('SIN PUBLICAR: '+str(exc),file=sys.stderr);sys.exit(1)
