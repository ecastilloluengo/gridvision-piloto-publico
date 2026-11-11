/* GridVision Portal - diagnostico FusionSolar por inversor, V1.
 * Solo Techo y Paidahuen. No altera consultas principales ni estados/alertas.
 */
(() => {
  'use strict';
  const PLANTAS = {
    techo: { nombre: 'VSE Techo', card: 'solar-techo' },
    paidahuen: { nombre: 'VSE Paidahuen', card: 'solar-paidahuen' }
  };
  const BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin : 'https://gridvision-piloto-publico.onrender.com';
  const FUSIONSOLAR = 'https://la5.fusionsolar.huawei.com/';
  const LIMITE_EDAD = 12 * 60;
  const fNum = n => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  const valido = n => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
  const fechaLocal = iso => {
    if (!iso) return 'No informada';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('es-CL');
  };
  const el = (tag, className, texto) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  let dialogo;
  let origen = null;
  let secuencia = 0;

  function crearDialogo() {
    if (dialogo) return dialogo;
    dialogo = el('dialog', 'gv-fusion-modal');
    dialogo.id = 'gv-fusion-diagnostico';
    dialogo.setAttribute('aria-labelledby', 'gv-fusion-titulo');
    const cabecera = el('div', 'gv-fusion-cabecera');
    const titulo = el('div');
    titulo.append(el('small', '', 'DIAGNOSTICO FUSIONSOLAR'), el('h2', '', ''));
    titulo.querySelector('h2').id = 'gv-fusion-titulo';
    const cerrar = el('button', 'gv-fusion-cerrar');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar diagnóstico');
    cerrar.title = 'Cerrar';
    cerrar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    cerrar.addEventListener('click', () => dialogo.close());
    cabecera.append(titulo, cerrar);
    const cuerpo = el('div', 'gv-fusion-cuerpo');
    cuerpo.id = 'gv-fusion-cuerpo';
    const pie = el('div', 'gv-fusion-pie');
    const link = el('a', '', 'Abrir FusionSolar Cloud');
    link.href = FUSIONSOLAR;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    pie.append(link);
    dialogo.append(cabecera, cuerpo, pie);
    dialogo.addEventListener('click', e => { if (e.target === dialogo) dialogo.close(); });
    dialogo.addEventListener('close', () => { secuencia++; if (origen) origen.focus(); });
    document.body.append(dialogo);
    return dialogo;
  }

  function agregarDato(parent, etiqueta, valor, clase = '') {
    const d = el('div', 'gv-fusion-metrica ' + clase);
    d.append(el('span', '', etiqueta), el('strong', '', valor));
    parent.append(d);
  }

  function pintar(datos) {
    const body = document.getElementById('gv-fusion-cuerpo');
    body.replaceChildren();
    const inversores = Array.isArray(datos.inversores) ? datos.inversores : [];
    const edad = valido(datos.edad_dato_segundos) ? Number(datos.edad_dato_segundos) : null;
    const vigente = edad !== null && edad >= 0 && edad <= LIMITE_EDAD;
    const conTelemetria = inversores.filter(i => i && i.telemetria === true && valido(i.potencia_kw));
    const completo = vigente && inversores.length > 0 && conTelemetria.length === inversores.length;
    const potencia = completo ? conTelemetria.reduce((s, i) => s + Number(i.potencia_kw), 0) : null;
    const nota = el('p', 'gv-fusion-nota',
      `Estado planta informado por FusionSolar: ${datos.estado || 'Sin información'}. ` +
      `Actualización: ${fechaLocal(datos.actualizado_en)}. ` +
      (vigente ? `Dato vigente (hace ${Math.floor(edad / 60)} min).` : 'Dato desactualizado o sin hora verificable.'));
    body.append(nota);
    const indicadores = el('div', 'gv-fusion-indicadores');
    agregarDato(indicadores, 'POTENCIA INSTANTANEA TOTAL', potencia === null ? 'No verificable' : `${fNum(potencia)} kW`, potencia === null ? 'precaucion' : 'potencia');
    agregarDato(indicadores, 'EQUIPOS CON TELEMETRIA', `${conTelemetria.length}/${inversores.length}`);
    agregarDato(indicadores, 'ESTADO DE DATOS', vigente ? 'Vigente' : 'Desactualizado', vigente ? 'ok' : 'precaucion');
    body.append(indicadores);
    body.append(el('p', 'gv-fusion-explicacion',
      'El contador de telemetría no representa disponibilidad operacional. La potencia total se confirma solo si todas las lecturas son válidas y están vigentes.'));
    const titulo = el('h3', 'gv-fusion-subtitulo', 'Detalle por inversor');
    body.append(titulo);
    if (!inversores.length) {
      body.append(el('p', 'gv-fusion-aviso', 'La API no entregó inversores.'));
      return;
    }
    const lista = el('div', 'gv-fusion-lista');
    inversores.forEach((i, n) => {
      const fila = el('div', 'gv-fusion-fila');
      const info = el('div', 'gv-fusion-equipo');
      info.append(el('strong', '', `Inversor ${n + 1}`),
        el('small', '', `ID: ${i.devId ?? 'No disponible'}${i.sn ? ' · SN: ' + i.sn : ''}`),
        el('small', '', `Estado operativo API: ${i.estado_operacion ?? 'No informado'}`));
      const valores = el('div', 'gv-fusion-valores');
      const datoEquipoValido = vigente && i.telemetria === true && valido(i.potencia_kw);
      valores.append(el('strong', datoEquipoValido ? 'gv-fusion-pot-ok' : '',
        datoEquipoValido ? `${fNum(i.potencia_kw)} kW` : 'Potencia no verificable'));
      valores.append(el('small', '', valido(i.energia_hoy_kwh) && vigente
        ? `Energía hoy: ${fNum(i.energia_hoy_kwh)} kWh` : 'Energía de hoy no verificable'));
      if (valido(i.temperatura_c) && vigente) {
        valores.append(el('small', '', `Temperatura: ${fNum(i.temperatura_c)} °C`));
      }
      valores.append(el('span', datoEquipoValido ? 'gv-fusion-vigente' : 'gv-fusion-antiguo',
        datoEquipoValido ? 'Telemetría vigente' : 'No verificable'));
      fila.append(info, valores);
      lista.append(fila);
    });
    body.append(lista);
  }

  async function abrir(id, boton) {
    const planta = PLANTAS[id];
    if (!planta) return;
    const d = crearDialogo();
    origen = boton;
    d.querySelector('h2').textContent = planta.nombre;
    const body = d.querySelector('#gv-fusion-cuerpo');
    body.replaceChildren(el('p', 'gv-fusion-nota', 'Consultando diagnóstico de inversores…'));
    if (!d.open) d.showModal();
    const consulta = ++secuencia;
    try {
      const r = await fetch(`${BASE}/api/fusionsolar/${id}`, { cache: 'no-store' });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const datos = await r.json();
      if (datos.error) throw Error('Respuesta de API con error');
      if (consulta === secuencia && d.open) pintar(datos);
    } catch (e) {
      if (consulta === secuencia && d.open) {
        body.replaceChildren(el('p', 'gv-fusion-aviso',
          'No fue posible consultar FusionSolar desde GridVision. Verificar la conexión con el backend.'));
      }
      console.warn('GridVision diagnóstico FusionSolar:', e);
    }
  }

  function instalar() {
    for (const [id, config] of Object.entries(PLANTAS)) {
      const tarjeta = document.getElementById(config.card);
      const valores = tarjeta?.querySelector('.solar-values');
      if (!tarjeta || !valores || tarjeta.querySelector('.gv-fusion-banda')) continue;
      const banda = el('div', 'gv-fusion-banda');
      const texto = el('span', '', 'Diagnóstico por inversor');
      const boton = el('button', 'gv-fusion-ver', 'Ver equipos');
      boton.type = 'button';
      boton.setAttribute('aria-haspopup', 'dialog');
      boton.setAttribute('aria-controls', 'gv-fusion-diagnostico');
      // Detener la navegación de la tarjeta hacia GridVision.
      boton.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); abrir(id, boton);
      });
      boton.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
      banda.append(texto, boton);
      valores.insertAdjacentElement('afterend', banda);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar);
  else instalar();
})();
