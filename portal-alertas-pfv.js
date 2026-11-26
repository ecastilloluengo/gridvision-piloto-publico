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

  let epocaConexion = 0;
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

  // GV ALARMAS VIGENTES V21551
  function vigenciaAlarma(id, datos, ahora = Date.now()) {

    if (id === 'lo-aguirre') {

      const equipos = Array.isArray(datos?.inversores)
        ? datos.inversores : [];

      if (!equipos.length) return 0;

      const lecturas = equipos.map(e => {

        const fecha = Date.parse(
          String(e?.ultimo_dato || '').replace(' ', 'T')
        );

        const valida = Number.isFinite(fecha) &&
          fecha <= ahora + 120000 &&
          ahora < fecha + 600000;

        return {
          valida,
          falla: e?.nivel === 'falla',
          vence: fecha + 600000
        };
      });

      const fallas = lecturas.filter(
        e => e.valida && e.falla
      );

      if (fallas.length) {
        return Math.min(...fallas.map(e => e.vence));
      }

      if (!lecturas.every(e => e.valida)) return 0;

      return Math.min(...lecturas.map(e => e.vence));
    }

    const fecha = Date.parse(datos?.actualizado_en);

    const valor = datos?.edad_dato_segundos;

    if (valor == null || String(valor).trim() === '') return 0;

    const edad = Number(valor);

    if (!Number.isFinite(fecha) ||
        !Number.isFinite(edad) ||
        edad < 0 ||
        edad >= 720 ||
        fecha > ahora + 120000 ||
        ahora >= fecha + 720000) return 0;

    return Math.min(
      fecha + 720000,
      ahora + (720 - edad) * 1000
    );
  }

  function evaluar(id, datos) {
    const planta = PLANTAS[id];
    const equipos = Array.isArray(datos?.inversores) ? datos.inversores : [];
    if (equipos.length < planta.cantidad) {
      return { firma: 'lista-incompleta', texto: 'Datos incompletos de los inversores. Revisar en fabricante.' };
    }
    if (planta.tipo === 'solax') {
      const fallas = equipos.filter(e =>
        e.nivel === 'falla' &&
        edadSolaX(e.ultimo_dato) >= -120000 &&
        edadSolaX(e.ultimo_dato) < 600000
      );
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


  // GV NOTIFICACIONES PFV V1: observador de las lecturas existentes.
  // No interviene en alarmas sonoras ni reconoce alarmas automaticamente.
  const avisoPFV = (() => {
    const prefijo = 'gv-pfv-notificaciones-v1:';
    const candidatos = Object.create(null);
    const memoria = Object.create(null);
    const mensajeConexion = 'Sin conexión. Revisar directamente la página del fabricante.';
    const guardar = (k, v) => { memoria[k] = v; try { localStorage.setItem(prefijo+k,v); } catch (_) {} };
    const leer = k => { try { return localStorage.getItem(prefijo+k) ?? memoria[k] ?? null; } catch (_) { return memoria[k] ?? null; } };
    const soporte = () => 'Notification' in window && window.isSecureContext;
    const activo = () => soporte() && Notification.permission === 'granted' && leer('escritorio') === 'si';
    function resultado(tipo, texto) { return {tipo, texto}; }
    function clasificar(id, datos, ahora = Date.now()) {
      const planta = PLANTAS[id];
      const equipos = (Array.isArray(datos?.inversores) ? datos.inversores : []).filter(Boolean);
      let cantidad = 0;
      if (planta.tipo === 'solax') {
        const vigentes = equipos.filter(e => {
          const fecha = Date.parse(String(e.ultimo_dato || '').replace(' ', 'T'));
          return Number.isFinite(fecha) && fecha <= ahora + 120000 && ahora < fecha + 600000 && e.nivel !== 'sin_datos';
        });
        const fallas = vigentes.filter(e => e.nivel === 'falla');
        if (fallas.length) return resultado('falla', `${fallas.length} inversor(es) con falla vigente. Revisar SolaX.`);
        cantidad = vigentes.filter(e => numero(e.potencia_ac) !== null && String(e.potencia_ac).trim() !== '').length;
      } else {
        if (vigenciaAlarma(id, datos, ahora) <= ahora) return resultado('sin-datos', mensajeConexion);
        const salud = String(datos?.estado || '').toUpperCase();
        if (salud.includes('FALLA')) return resultado('falla', 'FusionSolar informa una falla vigente. Revisar plataforma.');
        if (/SIN COMUNICACI[ÓO]N/.test(salud)) return resultado('sin-datos', mensajeConexion);
        cantidad = equipos.filter(e => e.telemetria === true && numero(e.potencia_kw) !== null && String(e.potencia_kw).trim() !== '').length;
      }
      cantidad = Math.min(cantidad, planta.cantidad);
      if (cantidad === 0) return resultado('sin-datos', `0/${planta.cantidad} inversores con potencia vigente. ${mensajeConexion}`);
      if (cantidad < planta.cantidad || equipos.length !== planta.cantidad) return resultado('parcial', `${cantidad}/${planta.cantidad} inversores con potencia vigente. Revisar fabricante.`);
      const otra = evaluar(id, datos);
      if (otra?.firma?.includes('potencia:')) return resultado('potencia', otra.texto);
      if (otra) return resultado('aviso', otra.texto);
      return resultado('normal', 'Telemetría vigente y sin avisos detectados en dos consultas.');
    }
    // GV PFV V3: mecanismo nativo validado en Edge; no confundir show con entrega fisica.
    let secuenciaAvisos = 0;
    function enviarNativo(titulo, texto, clave, persistente, alClic, respuesta = () => {}) {
      if (!activo()) { respuesta('bloqueado'); return null; }
      try {
        const marca = Date.now() + '-' + (++secuenciaAvisos) + '-' + Math.random().toString(36).slice(2,8);
        const hora = new Date().toLocaleString('es-CL');
        const n = new Notification(titulo, {
          body: texto + '\n' + hora,
          tag: 'gv-pfv-' + clave + '-' + marca,
          icon: new URL('assets/logo-pecket-energy.png', location.href).href,
          requireInteraction: persistente,
          silent: false
        });
        n.onshow = () => { console.info('GV PFV V3: show', clave, marca); respuesta('show'); };
        n.onerror = () => { console.warn('GV PFV V3: error', clave, marca); respuesta('error'); };
        n.onclick = () => { window.focus(); if (alClic) alClic(); n.close(); };
        return n;
      } catch (err) { console.warn('GV PFV V3: aviso no disponible', err); respuesta('error'); return null; }
    }
    const avisosNativos = Object.create(null);
    function mostrar(id, estado, prueba = false) {
      const planta = PLANTAS[id];
      const titulo = prueba ? 'GridVision · Notificación de prueba' : 'GridVision · ' + planta.nombre;
      const bandejaId = 'gv-pfv-notificaciones';
      let bandeja = document.getElementById(bandejaId);
      if (!bandeja) {
        bandeja = document.createElement('div'); bandeja.id = bandejaId;
        bandeja.setAttribute('aria-live','polite'); document.body.appendChild(bandeja);
      }
      // Como maximo una tarjeta por instalacion y una de prueba.
      const clave = prueba ? 'prueba' : id;
      const anterior = Array.from(bandeja.children).find(el => el.dataset.clave === clave);
      if (anterior) anterior.remove();
      const tarjeta = document.createElement('section'); tarjeta.className = 'gv-pfv-toast';
      tarjeta.dataset.clave = clave; tarjeta.dataset.tipo = estado.tipo;
      const cab = document.createElement('div'); cab.className = 'gv-pfv-toast-cab';
      const h = document.createElement('strong'); h.textContent = titulo;
      const cerrar = document.createElement('button'); cerrar.type='button'; cerrar.textContent='×'; cerrar.setAttribute('aria-label','Cerrar aviso');
      cerrar.onclick = () => tarjeta.remove(); cab.append(h,cerrar);
      const texto = document.createElement('p'); texto.textContent = estado.texto;
      const pie = document.createElement('div'); pie.className = 'gv-pfv-toast-pie';
      const hora = document.createElement('small'); hora.textContent = new Date().toLocaleTimeString('es-CL'); pie.appendChild(hora);
      if (planta && !prueba) { const a = document.createElement('a'); a.href=planta.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='Abrir '+planta.fabricante; pie.appendChild(a); }
      tarjeta.append(cab,texto,pie); bandeja.appendChild(tarjeta);
      setTimeout(() => tarjeta.remove(), 15000);
      // Reemplazar el aviso previo de la misma planta solo al cambiar de estado.
      if (activo()) {
        avisosNativos[clave]?.close();
        avisosNativos[clave] = enviarNativo(titulo, estado.texto, clave,
          !prueba && estado.tipo !== 'normal',
          () => document.getElementById('solar-'+id)?.scrollIntoView({block:'center'}));
      }
    }
    // La misma maquina de estados sirve para lecturas reales y simuladas.
    function confirmar(candidatosLocal, id, estado, leerEstado, guardarEstado, emitir) {
      const anterior = candidatosLocal[id];
      const veces = anterior?.tipo === estado.tipo ? anterior.veces+1 : 1;
      candidatosLocal[id] = {tipo:estado.tipo, veces};
      if (veces < 2) return;
      const clave = 'estado:'+id;
      const previo = leerEstado(clave);
      if (previo === estado.tipo) return;
      guardarEstado(clave,estado.tipo);
      if (estado.tipo !== 'normal' || previo !== null) emitir(id,estado);
    }
    function recibir(id, estado) {
      confirmar(candidatos, id, estado, leer, guardar, mostrar);
    }
    function montarAvisos() {
      const audio = document.getElementById('pfv-activar-audio');
      if (!audio || document.getElementById('gv-pfv-notificar')) return;
      const boton = document.createElement('button');
      boton.id = 'gv-pfv-notificar'; boton.type = 'button';
      boton.className = 'gv-pfv-campana';
      boton.setAttribute('aria-label', 'Notificaciones PFV');
      boton.setAttribute('aria-haspopup', 'dialog');
      boton.setAttribute('aria-expanded', 'false');
      boton.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
      const menu = document.createElement('div');
      menu.id = 'gv-pfv-notif-menu'; menu.setAttribute('role','dialog');
      menu.setAttribute('aria-label','Notificaciones PFV'); menu.hidden = true;
      menu.innerHTML = '<div class="gv-pfv-menu-head"><strong>Notificaciones</strong><button type="button" data-cerrar aria-label="Cerrar">×</button></div>' +
        '<div class="gv-pfv-menu-row"><div><strong>Avisos de escritorio</strong><small data-estado></small></div><button type="button" data-activar role="switch" aria-label="Avisos de escritorio" aria-checked="false"><i></i></button></div>' +
        '<p data-ayuda></p><button type="button" data-prueba>Probar aviso en 5 segundos</button><button type="button" data-simular>Simular pérdida y normalización</button><small data-resultado role="status"></small>';
      const activar = menu.querySelector('[data-activar]');
      const prueba = menu.querySelector('[data-prueba]');
      const estado = menu.querySelector('[data-estado]');
      const ayuda = menu.querySelector('[data-ayuda]');
      const res = menu.querySelector('[data-resultado]');
      let probando = false;
      function refrescar() {
        const habilitado = activo();
        boton.classList.toggle('activado', habilitado);
        boton.title = habilitado ? 'Notificaciones de escritorio activadas' : 'Configurar notificaciones';
        activar.setAttribute('aria-checked', String(habilitado));
        const disponible = soporte();
        const permiso = disponible ? Notification.permission : 'no-disponible';
        activar.disabled = !disponible || permiso === 'denied';
        prueba.disabled = !habilitado || probando || simulando;
        simular.disabled = !habilitado || probando || simulando;
        estado.textContent = habilitado ? 'Activados' : permiso === 'denied' ? 'Bloqueados por Edge' : 'Desactivados';
        ayuda.textContent = !disponible ? 'Este navegador o contexto no admite avisos de escritorio.' : permiso === 'denied' ? 'En Edge, abre los permisos del sitio y permite Notificaciones. Después recarga el Portal.' : 'Recibe avisos con el Portal abierto. Las alarmas internas siguen disponibles.';
      }
      function ubicar() {
        const r = boton.getBoundingClientRect();
        const ancho = menu.offsetWidth;
        const alto = menu.offsetHeight;
        menu.style.left = Math.max(8, Math.min(window.innerWidth-ancho-8, r.right-ancho))+'px';
        menu.style.top = Math.max(8, Math.min(window.innerHeight-alto-8, r.bottom+8))+'px';
      }
      function cerrar() { menu.hidden = true; boton.setAttribute('aria-expanded','false'); }
      boton.addEventListener('click', e => {
        e.stopPropagation();
        if (!menu.hidden) { cerrar(); return; }
        refrescar(); menu.hidden = false; boton.setAttribute('aria-expanded','true'); ubicar();
      });
      menu.querySelector('[data-cerrar]').onclick = cerrar;
      document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !boton.contains(e.target)) cerrar(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { cerrar(); boton.focus(); } });
      window.addEventListener('resize', () => { if (!menu.hidden) ubicar(); });
      activar.addEventListener('click', async () => {
        if (!soporte()) return;
        res.textContent = '';
        if (activo()) { guardar('escritorio','no'); refrescar(); return; }
        try {
          const permiso = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
          guardar('escritorio', permiso === 'granted' ? 'si' : 'no');
          res.textContent = permiso === 'granted' ? 'Permiso concedido.' : 'Permiso no concedido.';
        } catch (_) { res.textContent = 'No se pudo solicitar permiso.'; }
        refrescar(); if (!menu.hidden) ubicar();
      });
      prueba.addEventListener('click', () => {
        if (!activo() || probando) return;
        probando = true; refrescar(); res.textContent = 'Minimiza Edge. Aviso en 5 segundos.';
        setTimeout(() => {
          try {
            res.textContent = 'Aviso solicitado a Edge. Comprueba Windows + N.';
            enviarNativo('PECKET ENERGY · PRUEBA', 'Alarma operacional de prueba. No corresponde a un evento real.',
              'prueba', true, null, r => {
                res.textContent = r === 'show' ? 'Edge informó que mostró el aviso. Revisa Windows + N.' : 'Aviso no confirmado: ' + r;
              });
          } catch (_) { res.textContent = 'No se pudo enviar el aviso. Revisa permisos.'; }
          finally { probando = false; refrescar(); }
        }, 5000);
      });
      const simular = menu.querySelector('[data-simular]');
      let simulando = false;
      simular.addEventListener('click', () => {
        if (!activo() || simulando || probando) return;
        simulando = true; refrescar();
        res.textContent = 'Simulación aislada: aviso en 5 s y normalización en 20 s. Minimiza Edge.';
        const temporal = Object.create(null), historial = Object.create(null);
        let avisoAnterior = null;
        const leerPrueba = k => historial[k] ?? null;
        const guardarPrueba = (k,v) => { historial[k]=v; };
        function emitirPrueba(id, estado) {
          if (avisoAnterior) avisoAnterior.close();
          avisoAnterior = enviarNativo('PECKET ENERGY · SIMULACIÓN PFV',
            estado.texto + '\nPRUEBA: no corresponde a un evento real.', 'simulacion',
            estado.tipo !== 'normal', null, resultado => {
              res.textContent = 'Simulación ' + estado.tipo + ': ' + resultado + '. Revisa Windows + N.';
            });
        }
        const id = 'lo-aguirre';
        const emitir = e => confirmar(temporal,id,e,leerPrueba,guardarPrueba,emitirPrueba);
        setTimeout(() => {
          const e = resultado('sin-datos', 'ICV Lo Aguirre: pérdida de comunicación (simulada).');
          emitir(e); emitir(e); emitir(e); // La tercera lectura no debe repetir el aviso.
        }, 5000);
        setTimeout(() => {
          try {
            const e = resultado('normal', 'ICV Lo Aguirre: comunicación restablecida (simulada).');
            emitir(e); emitir(e); emitir(e);
          } finally { simulando=false; refrescar(); }
        }, 20000);
      });
      audio.after(boton); document.body.appendChild(menu); refrescar();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
      const css = document.createElement('style'); css.textContent = `
        .solar-section-title strong{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px}
        .solar-section-title strong .pfv-audio-toggle{margin:0!important}
        .solar-section-title strong .gv-pfv-campana{display:inline-grid;place-items:center;flex:0 0 30px;width:30px;height:30px;box-sizing:border-box;margin:0!important;padding:0;background:#15354b;border:1px solid #3c6d84;color:#bde9fc;border-radius:7px;cursor:pointer;vertical-align:middle}
        .gv-pfv-campana.activado{color:#baf466!important;border-color:#9be000!important}
        #gv-pfv-notif-menu{position:fixed;width:min(290px,calc(100vw - 16px));box-sizing:border-box;padding:13px;border:1px solid #36566b;border-radius:10px;background:#10293a;color:#e7f3fa;box-shadow:0 8px 24px #0007;z-index:2147482001;font:12px/1.4 system-ui;text-align:left}
        #gv-pfv-notif-menu[hidden]{display:none!important}
        .gv-pfv-menu-head,.gv-pfv-menu-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .gv-pfv-menu-head{padding-bottom:8px;border-bottom:1px solid #304c60}.gv-pfv-menu-head strong{font-size:14px}.gv-pfv-menu-head button{background:none;border:0;color:#d8ebf4;font-size:20px;cursor:pointer;line-height:1}
        .gv-pfv-menu-row{margin-top:12px}.gv-pfv-menu-row small,#gv-pfv-notif-menu [data-resultado]{display:block;color:#a8becd;font-size:11px;margin-top:3px}
        #gv-pfv-notif-menu [data-activar]{position:relative;flex:none;width:36px;height:21px;border:0;border-radius:12px;background:#536776;cursor:pointer;padding:3px;box-sizing:border-box}
        #gv-pfv-notif-menu [data-activar] i{display:block;width:15px;height:15px;border-radius:50%;background:#fff}
        #gv-pfv-notif-menu [data-activar][aria-checked="true"]{background:#629c20}#gv-pfv-notif-menu [data-activar][aria-checked="true"] i{transform:translateX(15px)}
        #gv-pfv-notif-menu [data-ayuda]{margin:10px 0;color:#a8becd;font-size:11px}#gv-pfv-notif-menu [data-simular]{margin-top:6px}#gv-pfv-notif-menu [data-prueba],#gv-pfv-notif-menu [data-simular]{width:100%;padding:7px;border:1px solid #42677c;border-radius:6px;background:#15354b;color:#e7f3fa;font:600 11px system-ui;cursor:pointer}
        #gv-pfv-notif-menu button:disabled{opacity:.5;cursor:not-allowed}
        #gv-pfv-notificaciones{position:fixed;right:14px;bottom:14px;width:min(315px,calc(100vw - 28px));z-index:2147482000;display:grid;gap:6px;pointer-events:none;max-height:60vh;overflow:auto}
        .gv-pfv-toast{pointer-events:auto;background:#10293a;color:#e7f3fa;border:1px solid #36566b;border-left:3px solid #e1b351;border-radius:7px;padding:10px;box-shadow:0 4px 16px #0007;font:12px/1.4 system-ui}
        .gv-pfv-toast[data-tipo="falla"]{border-left-color:#fa7379}.gv-pfv-toast[data-tipo="normal"]{border-left-color:#65ca89}
        .gv-pfv-toast-cab,.gv-pfv-toast-pie{display:flex;justify-content:space-between;align-items:center;gap:6px}.gv-pfv-toast-cab button{background:transparent;border:0;color:inherit;font-size:18px;cursor:pointer}.gv-pfv-toast p{margin:5px 0 7px}.gv-pfv-toast-pie small{color:#a5bccb;font-size:10px}.gv-pfv-toast-pie a{color:#a1e5ff;font-size:10px}
      `; document.head.appendChild(css);
    }
    return {clasificar,recibir,montar:montarAvisos,conexion:()=>resultado('sin-datos',mensajeConexion)};
  })();

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
    // Una interrupcion del backend suspende el sonido, pero conserva visible
    // la ultima alarma como dato NO verificado hasta recuperar telemetria.
    if (e.sinConexion) {
      contenedor.dataset.nivel = 'sin-conexion';
      texto.textContent = e.activa
        ? '⚠ Sin conexión. Revisar directamente la página del fabricante. Última alerta NO verificada: ' + e.mensaje
        : '⚠ Sin conexión. Revisar directamente la página del fabricante.';
      boton.hidden = true;
    } else if (e.activa) {
      const silenciada = reconocida(id);
      contenedor.dataset.nivel = silenciada ? 'reconocida' : 'alarma';
      texto.textContent = (silenciada ? '✓ Reconocida en este PC. ' : '🔔 ') + e.mensaje;
      boton.hidden = silenciada;
    } else {
      contenedor.dataset.nivel = 'normal';
      texto.textContent = !e.datoRecibido ? 'Esperando lecturas…'
        : (e.candidato ? 'Verificando lectura anormal…' : 'Sin avisos detectados');
      boton.hidden = true;
    }
  }

  async function leerPlanta(id) {
    const estado = estados[id];
    const epoca = epocaConexion;
    let avisoRecibido = false;

    if (!navigator.onLine) {
      estado.sinConexion = 1;
      avisoPFV.recibir(id, avisoPFV.conexion());
      pintar(id);
      return;
    }

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

      if (!navigator.onLine || epoca !== epocaConexion) return;
      // Algunos proxies responden HTTP 200 con un JSON de error.
      if (datos && typeof datos === 'object' && datos.error) {
        throw new Error('Error de GridVision: ' + String(datos.error));
      }
      avisoPFV.recibir(id, avisoPFV.clasificar(id, datos));
      avisoRecibido = true;
      estado.vigenteHasta = vigenciaAlarma(id, datos);

      if (estado.vigenteHasta <= Date.now()) {
        throw new Error('Lectura antigua o no verificable');
      }

      estado.sinConexion = 0;
      estado.datoRecibido = true;
      actualizarCondicion(id, evaluar(id, datos));
    } catch (error) {
      if (epoca !== epocaConexion) return;
      if (!avisoRecibido) avisoPFV.recibir(id, avisoPFV.conexion());
      estado.vigenteHasta = 0;
      estado.candidato = '';
      estado.repetidas = 0;
      estado.confirmacionesNormales = 0;
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
    if (!navigator.onLine) return;
    if (Object.keys(PLANTAS).some(id =>
      estados[id].activa &&
      !estados[id].sinConexion &&
      estados[id].vigenteHasta > Date.now() &&
      !reconocida(id))) {
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
    .pfv-alerta-integrada[data-nivel="sin-conexion"]{border-color:#f5b948;background:rgba(148,99,21,.13)}
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
  avisoPFV.montar();

  window.addEventListener('offline', () => {

    epocaConexion++;

    for (const id of Object.keys(PLANTAS)) {

      const estado = estados[id];

      estado.sinConexion = 1;
      estado.activa = '';
      estado.candidato = '';
      estado.repetidas = 0;
      estado.confirmacionesNormales = 0;
      estado.datoRecibido = false;

      pintar(id);
    }
  });
  // Evitar solapamiento: programar siguiente sondeo solo al terminar el actual.
  async function cicloConsulta() {
    try { await revisar(); }
    finally { setTimeout(cicloConsulta, INTERVAL_MS); }
  }
  cicloConsulta();
  setInterval(comprobarSonido, PITIDOS_MS);
  window.addEventListener('storage', evento => {
    if (evento.key?.startsWith(PREFIJO)) {
      const id = evento.key.slice(PREFIJO.length);
      if (estados[id]) pintar(id);
    }
  });
})();
