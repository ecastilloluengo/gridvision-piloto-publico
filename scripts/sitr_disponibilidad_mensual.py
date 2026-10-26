"""Acumulador referencial SITR: observaciones del monitor, no dato oficial CEN."""
from datetime import datetime

MAX_GAP_SECONDS = 20 * 60

def _mes(fecha):
    return fecha.strftime('%Y-%m')

def _resumen(snapshot):
    if not isinstance(snapshot, dict):
        return {}
    fuente = (snapshot.get('frescura_cen') or {}).get('estado')
    valido = fuente in ('FRESCO', 'RETRASADO')
    salida = {}
    for central in snapshot.get('instalaciones') or []:
        ident = central.get('id')
        n = int(central.get('variables_total') or 0)
        v = int(central.get('variables_validas') or 0)
        if ident and n > 0:
            salida[ident] = {'n': n, 'v': max(0, min(v,n)), 'fuente_valida': valido}
    return salida

def acumular_disponibilidad_mensual(estado, snapshot, fecha):
    """Integra con estado anterior únicamente en intervalos <=20 min.

    El estado entre muestreos es una aproximación de retención del último
    valor observado. No atribuye horas sin consulta a las centrales.
    """
    mes = _mes(fecha)
    datos = estado.setdefault('disponibilidad_mensual_gv', {})
    if datos.get('mes') != mes:
        datos.clear()
        datos.update({'mes': mes, 'ultima_muestra': None, 'centrales': {}})
    actual = _resumen(snapshot)
    previo = datos.get('ultima_muestra')
    if previo:
        try:
            anterior = datetime.fromisoformat(previo['fecha'])
            delta = (fecha - anterior).total_seconds()
        except (ValueError, KeyError, TypeError):
            delta = 0
        if 0 < delta <= MAX_GAP_SECONDS:
            for ident, last in (previo.get('centrales') or {}).items():
                ahora = actual.get(ident)
                if not ahora or ahora['n'] != last['n']:
                    continue
                cuenta = datos['centrales'].setdefault(ident, {
                    'esperadas_seg_senal': 0.0, 'validas_seg_senal': 0.0,
                    'observadas_seg': 0.0, 'sin_fuente_seg': 0.0
                })
                cuenta['esperadas_seg_senal'] += delta * last['n']
                if last.get('fuente_valida'):
                    cuenta['validas_seg_senal'] += delta * last['v']
                    cuenta['observadas_seg'] += delta
                else:
                    cuenta['sin_fuente_seg'] += delta
    datos['ultima_muestra'] = {'fecha': fecha.isoformat(timespec='seconds'), 'centrales': actual}
    return datos

def resumen_publico_mensual(estado, fecha):
    datos = estado.get('disponibilidad_mensual_gv') or {}
    inicio = fecha.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    transcurridos = max(0.0, (fecha-inicio).total_seconds())
    salida = {'mes': fecha.strftime('%Y-%m'), 'corte': fecha.isoformat(timespec='seconds'),
              'metodologia': 'GridVision referencial. Última observación retenida máximo 20 minutos; no oficial CEN.',
              'centrales': {}}
    if datos.get('mes') != salida['mes']:
        return salida
    for central, c in (datos.get('centrales') or {}).items():
        denom = c.get('esperadas_seg_senal',0)
        observadas = c.get('observadas_seg',0)
        n = (datos.get('ultima_muestra') or {}).get('centrales',{}).get(central,{}).get('n',0)
        validas = c.get('validas_seg_senal',0)
        # El denominador del índice excluye intervalos sin fuente, pero se informa cobertura total.
        tiempo_clasificado = observadas * n
        porcentaje = (100*validas/tiempo_clasificado) if tiempo_clasificado else None
        salida['centrales'][central] = {
           'disponibilidad_estimada_pct': round(porcentaje,3) if porcentaje is not None else None,
           'cobertura_temporal_pct': round(100*observadas/transcurridos,2) if transcurridos else 0,
           'horas_observadas': round(observadas/3600,2),
           'horas_sin_fuente': round(c.get('sin_fuente_seg',0)/3600,2),
           'horas_senal_invalidas': round((tiempo_clasificado-validas)/3600,2),
           'variables': n}
    return salida
