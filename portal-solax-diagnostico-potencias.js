/* GridVision Lo Aguirre: diagnostico de potencia, sin llamadas adicionales al backend. */
(() => {
  'use strict';
  const ID = 'gv-solax-v7-potencias';
  const URL_SOLAX = 'https://global.solaxcloud.com/user-center/';
  const UMBRAL_MS = 10 * 60 * 1000;
  let ultimaLectura = Array.isArray(window.__gvSolaxLoAguirreSnapshot)
    ? window.__gvSolaxLoAguirreSnapshot : [];

  function horaYVigencia(equipo) {
    const fecha = equipo && equipo.ultimo_dato
      ? new Date(String(equipo.ultimo_dato).replace(' ', 'T')) : null;
    if (!fecha || !Number.isFinite(fecha.getTime())) return { vigente: false, mensaje: 'Sin fecha verificable' };
    const edad = Date.now() - fecha.getTime();
    const vigente = edad >= -120000 && edad <= UMBRAL_MS;
    const minutos = Math.max(0, Math.floor(edad / 60000));
    const antiguedad = minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
    return { vigente, mensaje: `${String(equipo.ultimo_dato)} Â· ${antiguedad}` };
  }
  function kw(equipo) {
    if (!equipo || equipo.potencia_ac === '' || equipo.potencia_ac == null) return null;
    const vatios = Number(equipo.potencia_ac);
    return Number.isFinite(vatios) ? vatios / 1000 : null;
  }
  const formato = v => v.toLocaleString('es-CL', {minimumFractionDigits: 1, maximumFractionDigits: 2}) + ' kW';

  function crear() {
    const dlg = document.getElementById('gv-solax-v5-dialogo');
    if (!dlg) return null;
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('section');
    el.id = ID;
    el.className = 'gv-solax-v7-potencias';
    el.setAttribute('aria-label', 'Potencia instantanea de inversores');
    const indicadores = dlg.querySelector('#gv-solax-v5-indicadores');
    if (indicadores) indicadores.insertAdjacentElement('afterend', el);
    else dlg.appendChild(el);
    return el;
  }
  function renderizar() {
    const destino = crear();
    if (!destino) return;
    destino.replaceChildren();
    const equipos = ultimaLectura;
    const datos = equipos.map(e => ({...e, control: horaYVigencia(e), potencia: kw(e)}));
    const completos = equipos.length === 3 && datos.every(e => e.control.vigente && e.potencia !== null);
    const suma = datos.filter(e => e.control.vigente && e.potencia !== null).reduce((acc, e) => acc + e.potencia, 0);
    const validos = datos.filter(e => e.control.vigente && e.potencia !== null).length;

    const titulo = document.createElement('div');
    titulo.className = 'gv-solax-v7-head';
    const bloque = document.createElement('div');
    const etiqueta = document.createElement('span');
    etiqueta.textContent = 'POTENCIA INSTANTÃNEA TOTAL';
    const valor = document.createElement('strong');
    valor.textContent = completos ? formato(suma) : 'No verificable';
    const nota = document.createElement('small');
    nota.textContent = completos
      ? 'Suma de los 3 inversores Â· lecturas vigentes'
      : `Potencia vigente conocida: ${formato(suma)} (${validos}/3 equipos). Total no confirmado.`;
    bloque.append(etiqueta, valor, nota);
    const enlace = document.createElement('a');
    enlace.textContent = 'Abrir SolaX Cloud â†—';
    enlace.href = URL_SOLAX;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.addEventListener('click', e => e.stopPropagation());
    titulo.append(bloque, enlace);
    destino.appendChild(titulo);

    // Agregar potencia a las filas YA EXISTENTES del diagnostico V5.
    // Evita duplicar nombres, estados y horarios en el modal.
    const filas = document.querySelectorAll('#gv-solax-v5-filas .gv-solax-v5-fila');
    filas.forEach((fila, i) => {
      const e = datos[i];
      if (!e) return;
      let marcador = fila.querySelector('.gv-solax-v7-kw');
      if (!marcador) {
        marcador = document.createElement('strong');
        marcador.className = 'gv-solax-v7-kw';
        const contenedor = fila.querySelector('.gv-solax-v5-estados') || fila;
        contenedor.appendChild(marcador);
      }
      marcador.textContent = e.control.vigente && e.potencia !== null
        ? formato(e.potencia) : 'Potencia no verificable';
      marcador.title = e.control.mensaje;
    });
  }
  function preparar() { if (document.getElementById('gv-solax-v5-dialogo')) renderizar(); }
  window.addEventListener('gv:solax:lo-aguirre-actualizado', e => {
    ultimaLectura = Array.isArray(e.detail) ? e.detail : [];
    queueMicrotask(preparar);
  });
  document.addEventListener('click', e => {
    if (e.target.closest('.gv-solax-v5-abrir')) queueMicrotask(preparar);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.gv-solax-v5-abrir')) queueMicrotask(preparar);
  }, true);
  const estilos = document.createElement('style');
  estilos.textContent = `
    .gv-solax-v7-potencias{margin:0 24px 18px;border:1px solid #2d516b;background:#092439;border-radius:12px;padding:14px;color:#ecfaff}
    .gv-solax-v7-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid #32506a;padding-bottom:12px;margin-bottom:8px}
    .gv-solax-v7-head>div{display:grid;gap:5px;min-width:0}
    .gv-solax-v7-head span{font-size:10px;letter-spacing:.07em;color:#98c1d8;font-weight:800}
    .gv-solax-v7-head strong{font-size:24px;line-height:1.2;color:#a8e9c2}
    .gv-solax-v7-head small,.gv-solax-v7-fila small{font-size:10px;line-height:1.4;color:#a6bdcc}
    .gv-solax-v7-head a{flex:none;text-decoration:none;border:1px solid #3a7595;border-radius:8px;padding:9px 11px;color:#a1e5ff;font-size:11px;font-weight:700}
    .gv-solax-v7-head a:hover{background:#153d56}
    .gv-solax-v7-kw{display:block!important;margin-top:5px;color:#c1e7fb!important;font-size:12px!important;font-weight:800}
    @media(max-width:600px){.gv-solax-v7-potencias{margin:0 14px 15px;padding:12px}.gv-solax-v7-head{flex-direction:column}.gv-solax-v7-head a{align-self:flex-start}.gv-solax-v7-head small{overflow-wrap:anywhere}}
  `;
  document.head.appendChild(estilos);
})();