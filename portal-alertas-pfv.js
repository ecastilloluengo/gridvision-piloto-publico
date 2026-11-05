/* Portal Pecket — avisos sonoros PFV integrados en las tarjetas existentes.
 * Versión de prueba. Sin acciones sobre inversores ni generación de bitácora.
 * El reconocimiento se guarda por navegador/perfil (independiente de otros PC).
 */
(() => {
  'use strict';

  const ENDPOINT = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin
    : 'https://gridvision-piloto-publico.onrender.com';
  const INTERVAL_MS = 75_000;   // No sustituye el caché existente de las API
  const PITIDOS_MS = 30_000;
  const PREFIJO = 'pecket-pfv-alerta-local-v1:';
  const PLANTAS = {
    'lo-aguirre': {
      nombre: 'ICV Lo Aguirre', api: '/api/solax/lo-aguirre',
      fabricante: 'SolaX Cloud', url: 'https://global.solaxcloud.com/user-center/',
      cantidad: 3, tipo: 'solax'
    },
    techo: {
      nombre: 'VSE Techo', api: '/api/fusionsolar/techo',
      fabricante: 'FusionSolar', url: 'https://la5.fusionsolar.huawei.com/',
      cantidad: 4, tipo: 'fusion'
    },
    paidahuen: {
      nombre: 'VSE Paidahuen', api: '/api/fusionsolar/paidahuen',
      fabricante: 'FusionSolar', url: 'https://la5.fusionsolar.huawei.com/',
      cantidad: 4, tipo: 'fusion'
    }
  };

  let contextoAudio = null;
  let sonidoHabilitado = false;
  const estados = {};
  for (const id of Object.keys(PLANTAS)) {
    estados[id] = { candidato: '', repetidas: 0, activa: '', mensaje: '',
      confirmacionesNormales: 0, sinConexion: 0, datoRecibido: false };
  }

  function leerReconocimiento(id) {
    try { return JSON.parse(localStorage.getItem(PREFIJO + id) || 'null'); }
    catch (_) { return null; }
  }
  function estaReconocida(id) {
    const anterior = leerReconocimiento(id);
    return !!(anterior && anterior.firma === estados[id].activa);
  }
  function guardarReconocimiento(id) {
    try {
      localStorage.setItem(PREFIJO + id,
        JSON.stringify({ firma: estados[id].activa, hora: new Date().toISOString() }));
    } catch (_) { /* Sin almacenamiento: se silencia en esta sesión de todos modos. */ }
    estados[id].reconocidaSesion = estados[id].activa;
    pintar(id);
  }
  function reconocida(id) {
    return estados[id].reconocidaSesion === estados[id].activa || estaReconocida(id);
  }
  function limpiarReconocimiento(id) {
    estados[id].reconocidaSesion = null;
    try { localStorage.removeItem(PREFIJO + id); } catch (_) {}
  }

  function numero(valor) {
    if (valor === '' || valor === null || valor === undefined) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  function edadSolaX(fechaTexto) {
    if (!fechaTexto) return Infinity;
    const ms = new Date(String(fechaTexto).replace(' ', 'T')).getTime();
    if (!Number.isFinite(ms)) return Infinity;
    return Date.now() - ms;
  }
  function sospechaAusenciaPotencia(equipos) {
    // Aviso solamente si OTRO equipo realmente está generando.
    // Nunca se dispara por 0 kW de toda la planta de noche.
    const validos = equipos.filter(e => e.kw !== null && e.vigente);
    if (validos.length < 2) return [];
    const maxKw = Math.max(...validos.map(e => e.kw));
    const maxNominal = Math.max(...validos.map(e => e.nominal || 0), 1);
    if (maxKw < Math.max(2, 0.06 * maxNominal)) return [];
    return validos.filter(e =>
      e.kw <= Math.max(0.25, 0.015 * (e.nominal || maxNominal))
      && validos.some(otro => otro.id !== e.id && otro.kw >= Math.max(2, 0.06 * maxNominal))
    ).map(e => e.id);
  }
  function evaluar(id, datos) {
    const planta = PLANTAS[id];
    const equipos = Array.isArray(datos?.inversores) ? datos.inversores : [];
    if (equipos.length < planta.cantidad) {
      return { firma: 'lista-incompleta', texto: 'Datos incompletos de los inversores. Revisar en fabricante.' };
    }
    if (planta.tipo === 'solax') {
      const fallas = equipos.filter(e => e.nivel === 'falla');
      if (fallas.length) {
        return { firma: 'falla:' + fallas.map(e => e.wifiSn || e.nombre).sort().join(','),
          texto: 'SolaX informa falla en uno o más inversores. Verificar en plataforma.' };
      }
      const faltantes = equipos.filter(e =>
        e.nivel === 'sin_datos' || !e.ultimo_dato ||
        edadSolaX(e.ultimo_dato) > 10 * 60_000 ||
        edadSolaX(e.ultimo_dato) < -120_000
      );
      if (faltantes.length) {
        return { firma: 'datos:' + faltantes.map(e => e.wifiSn || e.nombre).sort().join(','),
          texto: `Atención: ${planta.cantidad - faltantes.length}/${planta.cantidad} inversores con datos vigentes. Revisar SolaX.` };
      }
      const equiposPower = equipos.map(e => ({
        id: e.wifiSn || e.nombre, kw: numero(e.potencia_ac) === null ? null : Number(e.potencia_ac) / 1000,
        nominal: numero(e.potencia_nominal_kw), vigente: true
      }));
      const bajos = sospechaAusenciaPotencia(equiposPower);
      if (bajos.length) {
        return { firma: 'potencia:' + bajos.sort().join(','),
          texto: 'Posible inversor sin generación mientras otros producen. Revisar SolaX.' };
      }
    } else {
      const edad = numero(datos?.edad_dato_segundos);
      if (edad === null || edad > 12 * 60) {
        return { firma: 'fusion-antiguo', texto: 'Datos FusionSolar desactualizados. Revisar plataforma.' };
      }
      const salud = String(datos?.estado || '').toUpperCase();
      if (salud.includes('FALLA') || salud.includes('SIN COMUNICACION')) {
        return { firma: 'fusion-estado:' + salud, texto: 'FusionSolar informa una condición anormal. Revisar plataforma.' };
      }
      const faltantes = equipos.filter(e => e.telemetria !== true || numero(e.potencia_kw) === null);
      if (faltantes.length) {
        return { firma: 'fusion-datos:' + faltantes.map(e => e.devId).sort().join(','),
          texto: `Atención: ${planta.cantidad - faltantes.length}/${planta.cantidad} inversores con telemetría. Revisar FusionSolar.` };
      }
      const bajos = sospechaAusenciaPotencia(equipos.map(e => ({
        id: String(e.devId), kw: numero(e.potencia_kw), nominal: null, vigente: true
      })));
      if (bajos.length) {
        return { firma: 'fusion-potencia:' + bajos.sort().join(','),
          texto: 'Posible inversor sin generación mientras otros producen. Revisar FusionSolar.' };
      }
    }
    return null;
  }

  function actualizarCondicion(id, condicion) {
    const e = estados[id];
    if (condicion) {
      e.confirmacionesNormales = 0;
      if (e.candidato === condicion.firma) e.repetidas += 1;
      else { e.candidato = condicion.firma; e.repetidas = 1; }
      // Doble comprobación para no activar alarmas por transitorios.
      if (e.repetidas >= 2) {
        if (e.activa !== condicion.firma) {
          e.activa = condicion.firma;
          e.reconocidaSesion = null;
        }
        e.mensaje = condicion.texto;
      }
    } else {
      e.candidato = '';
      e.repetidas = 0;
      e.confirmacionesNormales += 1;
      if (e.confirmacionesNormales >= 2) {
        e.activa = '';
        e.mensaje = '';
        limpiarReconocimiento(id);
      }
    }
    pintar(id);
  }

  function pintar(id) {
    const e = estados[id];
    const contenedor = document.getElementById('pfv-alerta-' + id);
    if (!contenedor) return;
    const texto = contenedor.querySelector('.pfv-aviso-texto');
    const boton = contenedor.querySelector('.pfv-silenciar');
    if (e.activa) {
      const silenciada = reconocida(id);
      contenedor.dataset.nivel = silenciada ? 'reconocida' : 'alarma';
      texto.textContent = (silenciada ? '✓ Reconocida en este PC. ' : '🔔 ') + e.mensaje;
      boton.hidden = silenciada;
    } else {
      contenedor.dataset.nivel = 'normal';
      texto.textContent = e.sinConexion
        ? 'Sin conexión a GridVision. Revisar fabricante (sin alarma de inversores).'
        : (!e.datoRecibido ? 'Esperando lecturas…' : (e.candidato ? 'Verificando lectura anormal…' : 'Sin avisos detectados'));
      boton.hidden = true;
    }
  }

  async function leerPlanta(id) {
    const estado = estados[id];
    try {
      const cancelador = new AbortController();
      const timeout = setTimeout(() => cancelador.abort(), 130_000);
      let respuesta;
      try {
        respuesta = await fetch(ENDPOINT + PLANTAS[id].api,
          { cache: 'no-store', signal: cancelador.signal });
      } finally { clearTimeout(timeout); }
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      const datos = await respuesta.json();
      estado.sinConexion = 0;
      estado.datoRecibido = true;
      actualizarCondicion(id, evaluar(id, datos));
    } catch (error) {
      estado.sinConexion += 1;
      // Una falla de conectividad de GridVision NO es una falla de los inversores.
      // Se muestra la advertencia informativa, sin generar una alarma sonora nueva.
      pintar(id);
      console.warn('Avisos PFV, consulta ' + id + ':', error);
    }
  }

  async function revisar() {
    await Promise.allSettled(Object.keys(PLANTAS).map(id => leerPlanta(id)));
  }

  function emitirTresPitidos() {
    if (!sonidoHabilitado || !contextoAudio || contextoAudio.state !== 'running') return;
    const ahora = contextoAudio.currentTime + 0.03;
    for (let i = 0; i < 3; i++) {
      const oscilador = contextoAudio.createOscillator();
      const ganancia = contextoAudio.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = 840;
      ganancia.gain.value = 0.0001;
      oscilador.connect(ganancia);
      ganancia.connect(contextoAudio.destination);
      const t = ahora + i * 0.22;
      ganancia.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      oscilador.start(t);
      oscilador.stop(t + 0.18);
    }
  }
  function comprobarSonido() {
    if (Object.keys(PLANTAS).some(id => estados[id].activa && !reconocida(id))) {
      emitirTresPitidos();
    }
  }

  function montar() {
    const titulo = document.querySelector('.solar-section-title strong');
    if (titulo && !document.getElementById('pfv-activar-audio')) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.id = 'pfv-activar-audio';
      boton.className = 'pfv-audio-toggle';
      boton.textContent = '🔊 Activar sonido';
      boton.title = 'Habilitar los avisos sonoros en este computador';
      titulo.appendChild(boton);
      boton.addEventListener('click', async () => {
        try {
          if (!contextoAudio) contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
          await contextoAudio.resume();
          sonidoHabilitado = contextoAudio.state === 'running';
          boton.textContent = sonidoHabilitado ? '🔊 Sonido activado' : '🔇 Activar sonido';
          boton.classList.toggle('activado', sonidoHabilitado);
          if (sonidoHabilitado) comprobarSonido();
        } catch (_) { boton.textContent = 'Audio bloqueado por navegador'; }
      });
    }

    for (const [id, planta] of Object.entries(PLANTAS)) {
      const tarjeta = document.getElementById('solar-' + id);
      if (!tarjeta || document.getElementById('pfv-alerta-' + id)) continue;
      const bloque = document.createElement('div');
      bloque.id = 'pfv-alerta-' + id;
      bloque.className = 'pfv-alerta-integrada';
      bloque.dataset.nivel = 'normal';
      bloque.innerHTML = '<span class="pfv-aviso-texto" role="status">Esperando lecturas…</span>' +
        '<div class="pfv-aviso-acciones"><button type="button" class="pfv-silenciar" hidden>Silenciar</button>' +
        '<a class="pfv-fabricante" target="_blank" rel="noopener noreferrer">Abrir ' + planta.fabricante + ' ↗</a></div>';
      bloque.querySelector('.pfv-fabricante').href = planta.url;
      bloque.querySelector('.pfv-silenciar').addEventListener('click', () => {
        if (estados[id].activa) guardarReconocimiento(id);
      });
      // Las tarjetas actuales abren GridVision al pulsar su superficie.
      // Los controles nuevos NO deben disparar esa navegación.
      for (const control of bloque.querySelectorAll('button,a')) {
        control.addEventListener('click', evento => evento.stopPropagation());
        control.addEventListener('keydown', evento => evento.stopPropagation());
      }
      const pie = tarjeta.querySelector('.solar-open-map');
      if (pie) pie.before(bloque);
      else tarjeta.appendChild(bloque);
      pintar(id);
    }
  }

  const css = document.createElement('style');
  css.textContent = `
    .solar-section-title strong{display:inline-flex;align-items:center;gap:10px}
    .solar-section-title .pfv-audio-toggle{margin:0 8px;flex-shrink:0;cursor:pointer;background:#15354b;border:1px solid #3c6d84;color:#e6f7ff;border-radius:7px;font:600 11px system-ui;padding:6px 10px}
    .solar-section-title .pfv-audio-toggle.activado{border-color:#9be000;color:#baf466}
    .pfv-alerta-integrada{margin-top:10px;border-radius:8px;border:1px solid #314f5c;background:rgba(12,43,56,.7);padding:8px 10px;display:flex;flex-wrap:wrap;gap:7px;align-items:center;justify-content:space-between}
    .pfv-alerta-integrada[data-nivel="alarma"]{border-color:#ff6565;background:rgba(153,35,47,.24);box-shadow:inset 3px 0 #ff5d65}
    .pfv-alerta-integrada[data-nivel="reconocida"]{border-color:#f5b948;background:rgba(148,99,21,.13)}
    .pfv-aviso-texto{color:#bad0dc;font:600 11px/1.45 system-ui;flex:1 1 190px}
    .pfv-alerta-integrada[data-nivel="alarma"] .pfv-aviso-texto{color:#ffd4d4}
    .pfv-aviso-acciones{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .pfv-aviso-acciones button,.pfv-aviso-acciones a{font:600 10px system-ui;cursor:pointer;border-radius:6px;padding:6px 8px;border:1px solid #406a82;background:#112e44;color:#e9f8ff;text-decoration:none;white-space:nowrap}
    .pfv-aviso-acciones .pfv-silenciar{color:#fef2f2;background:#a62d39;border-color:#ea6570}
    .pfv-aviso-acciones [hidden]{display:none!important}
    .pfv-aviso-acciones a:hover,.pfv-aviso-acciones button:hover{filter:brightness(1.2)}
    .solar-card:has(.pfv-alerta-integrada[data-nivel="alarma"]){border-color:#ff5d65}
    @media(max-width:900px){.solar-section-title .pfv-audio-toggle{font-size:10px;padding:5px 7px}}
  `;
  document.head.appendChild(css);
  montar();
  revisar();
  setInterval(revisar, INTERVAL_MS);
  setInterval(comprobarSonido, PITIDOS_MS);
  window.addEventListener('storage', evento => {
    if (evento.key?.startsWith(PREFIJO)) {
      const id = evento.key.slice(PREFIJO.length);
      if (estados[id]) pintar(id);
    }
  });
})();
