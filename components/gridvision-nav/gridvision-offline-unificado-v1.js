/* GridVision Vulcano - Modo sin conexion unificado v1.
 * Solo coordina los preparadores existentes, sin reemplazar datos, cache ni SW.
 * Los mecanismos originales permanecen accesibles en "Detalles avanzados".
 */
(() => {
  'use strict';

  if (!document.getElementById('vulcano-map')) return;
  if (window.GVOfflineUnificado) return;

  const VERSION = 'gv-offline-unificado-v1.3';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let running = false;
  let checking = null;
  let stopRequested = false;
  let stageName = '';
  let panel, mainButton, cancelButton, summary, bar, details, list, mini;
  let panelObserver;
  const stages = [
    {id: 'sen', title: 'SEN y mapa'},
    {id: 'sectores', title: 'Cartografia por sectores'},
    {id: 'referencias', title: 'Capas volcanicas de referencia'},
    {id: 'volcanes', title: 'Datos volcanicos completos'}
  ];

  function apis() {
    return {
      sen: window.GridVisionNavigationV1,
      sectores: window.GV388Offline,
      referencias: window.GridVisionVulcanoOffline,
      volcanes: window.GV388VolcanesOffline
    };
  }

  function message(text, kind = 'normal') {
    summary.textContent = text;
    summary.dataset.kind = kind;
  }

  function saveStates(states) {
    if (!list) return;
    const values = [
      ['SEN y mapa', states.sen ? 'Listo' : 'Pendiente'],
      ['Sectores nacionales', states.sectores ? 'Listos' : 'Pendientes'],
      ['Referencias volcanicas', states.referencias ? 'Listas' : 'Pendientes'],
      ['Inventario volcanico', states.volcanes ? '549/549' : 'Pendiente']
    ];
    list.replaceChildren();
    for (const [name, value] of values) {
      const line = document.createElement('div');
      line.className = 'gv-offline-status-row';
      const label = document.createElement('span');
      const state = document.createElement('strong');
      label.textContent = name;
      state.textContent = value;
      state.style.color = value === 'Pendiente' || value === 'Pendientes' ? '#ffd899' : '#a1edc5';
      line.append(label, state);
      list.append(line);
    }
    if (mini) {
      const small = [
        ['Mapa', states.sen],
        ['Sectores', states.sectores],
        ['Volcanes', states.referencias && states.volcanes]
      ];
      mini.replaceChildren();
      for (const [name, ready] of small) {
        const item = document.createElement('span');
        item.textContent = name + ' ' + (ready ? '✓' : '—');
        item.dataset.ready = String(!!ready);
        mini.appendChild(item);
      }
    }
  }

  function readCurrentStates(referenceMeta) {
    const api = apis();
    return {
      sen: api.sen && window.GVOfflineStorageState?.listo === true,
      sectores: api.sectores?.listo === true,
      referencias: !!referenceMeta,
      volcanes: api.volcanes?.listo === true && api.volcanes?.faltantes?.length === 0
    };
  }

  async function waitVolcanoIdle() {
    const verifyButton = panel.querySelector('#gv388-volcanes-offline button');
    for (let i = 0; verifyButton?.disabled && i < 500; i++) await delay(100);
    if (verifyButton?.disabled) throw Error('Verificacion volcanica ocupada. Reintenta.');
  }

  async function verifyAll() {
    if (checking) return checking;
    checking = (async () => {
      const api = apis();
      if (!api.sen?.refreshOfflineState || !api.sectores?.verificar ||
          !api.referencias?.verify || !api.volcanes?.verificar) {
        throw Error('Uno de los preparadores offline no esta disponible.');
      }
      await api.sen.refreshOfflineState();
      await api.sectores.verificar();
      const referenceMeta = await api.referencias.verify();
      await waitVolcanoIdle();
      await api.volcanes.verificar();
      const states = readCurrentStates(referenceMeta);
      saveStates(states);
      return states;
    })();
    try { return await checking; }
    finally { checking = null; }
  }

  function showAvailability(states) {
    const allReady = stages.every(({id}) => states[id]);
    if (allReady) {
      message('Listo para usar sin internet.', 'ok');
      mainButton.textContent = navigator.onLine ? 'Comprobar / actualizar datos' : 'Verificar datos guardados';
    } else {
      message(navigator.onLine ?
        'Hay datos pendientes. Pulsa el boton para completar la descarga.' :
        'Hay datos pendientes. Conectate a internet para descargarlos.', 'warning');
      mainButton.textContent = navigator.onLine ? 'Descargar datos offline' : 'Verificar datos guardados';
    }
    return allReady;
  }

  function isStopped() {
    if (!stopRequested) return false;
    message('Preparacion detenida. Los archivos descargados se conservan; puedes continuar despues.', 'warning');
    return true;
  }

  function monitorStage(title, node, index) {
    if (!node) return () => {};
    const render = () => {
      if (!running) return;
      const text = (node.textContent || '').trim();
      if (text) message(title + ': ' + text.slice(0, 230));
      const match = text.match(/(\d+)\s*\/\s*(\d+)/);
      if (match && Number(match[2]) > 0) {
        bar.value = index + Math.min(1, Number(match[1]) / Number(match[2]));
      }
    };
    const observer = new MutationObserver(render);
    observer.observe(node, {childList:true, characterData:true, subtree:true});
    return () => observer.disconnect();
  }

  function phaseNode(name) {
    if (name === 'sen') return panel.querySelectorAll('.gv-nav-status')[1] || null;
    if (name === 'sectores') return panel.querySelector('#gv388-sectores-offline > div');
    if (name === 'volcanes') return panel.querySelector('#gv388-volcanes-offline [role="status"]');
    const original = Array.from(panel.querySelectorAll('button.gv-nav-download'))
      .find(x => /Vulcano offline/i.test(x.textContent || '') && !x.closest('#gv388-volcanes-offline'));
    return original?.nextElementSibling || null;
  }

  async function prepareAll() {
    if (running) return;
    running = true;
    stopRequested = false;
    mainButton.disabled = true;
    cancelButton.hidden = false;
    bar.hidden = false;
    bar.max = stages.length;
    bar.value = 0;
    let failed = null;
    try {
      message('Comprobando archivos guardados...');
      const before = await verifyAll();
      const needed = stages.filter(stage => !before[stage.id]);
      if (!needed.length) {
        showAvailability(before);
        return;
      }
      if (!navigator.onLine) {
        showAvailability(before);
        return;
      }
      if (!window.confirm('Se prepararan los mapas, el SEN y los datos volcanicos que falten. La primera descarga puede ser grande; usa Wi-Fi y manten la pagina abierta. No incluye alertas en vivo. ¿Continuar?')) {
        message('Descarga no iniciada. Los archivos guardados se conservan.');
        return;
      }
      const api = apis();
      for (let i=0; i<stages.length; i++) {
        const step = stages[i];
        bar.value = i;
        if (isStopped()) break;
        if (before[step.id]) continue;
        stageName = step.id;
        message('Preparando ' + step.title + '...');
        const disconnect = monitorStage(step.title, phaseNode(step.id), i);
        try {
          if (step.id === 'sen') {
            await api.sen.prepareOffline();
            await api.sen.refreshOfflineState();
            if (!window.GVOfflineStorageState?.listo) throw Error('SEN o mapa incompletos');
          } else if (step.id === 'sectores') {
            await api.sectores.preparar();
            if (!api.sectores.listo) throw Error('Sectores incompletos');
          } else if (step.id === 'referencias') {
            // Confirmacion general concedida arriba; se conserva la validacion original.
            await api.referencias.prepare({modoUnificado:true});
            if (!await api.referencias.verify()) throw Error('Referencias volcanicas incompletas');
          } else if (step.id === 'volcanes') {
            await waitVolcanoIdle();
            await api.volcanes.verificar();
            if (!api.volcanes.listo) await api.volcanes.descargar();
            await waitVolcanoIdle();
            await api.volcanes.verificar();
            if (!api.volcanes.listo) throw Error('Inventario volcanico incompleto');
          }
        } finally { disconnect(); }
        bar.value = i+1;
      }
      if (isStopped()) return;
      message('Comprobando cobertura completa...');
      const after = await verifyAll();
      if (stages.every(step => after[step.id])) {
        message('Datos offline completos y listos. Ya puedes usarlos sin internet.', 'ok');
        mainButton.textContent = 'Comprobar / actualizar datos';
      } else {
        message('Quedan recursos pendientes. Puedes reintentar sin perder lo ya descargado.', 'warning');
      }
    } catch (error) {
      failed = String(error?.message || error);
      message('No se completo la preparacion: ' + failed + '. Abre Ver detalles tecnicos para diagnosticar.', 'warning');
    } finally {
      stageName = '';
      running = false;
      stopRequested = false;
      mainButton.disabled = false;
      cancelButton.hidden = true;
      bar.hidden = true;
      bar.value = 0;
      if (failed) console.warn('GridVision offline unificado:', failed);
    }
  }

  // V1.3: solo el resumen es visible. Los mecanismos antiguos permanecen
  // montados dentro del dialogo para que sus APIs y observadores funcionen.
  function css() {
    if (document.getElementById('gv-offline-unificado-css')) return;
    const style = document.createElement('style');
    style.id = 'gv-offline-unificado-css';
    style.textContent = `
#gv-nav-dialog { width:min(350px,calc(100vw - 28px)); padding:16px; }
#gv-nav-dialog #gv-nav-dialog-title { font-size:17px; }
#gv-nav-dialog .gv-u-view {display:grid;gap:11px;min-width:0;}
#gv-nav-dialog .gv-u-view[hidden] {display:none!important;}
#gv-nav-dialog .gv-u-intro {margin:0;font-size:12px;line-height:1.45;color:#d1e4ed;}
#gv-nav-dialog .gv-u-ready {font-weight:650;font-size:13px;line-height:1.4;color:#b5f0c5;overflow-wrap:anywhere;}
#gv-nav-dialog .gv-u-ready[data-kind="warning"] {color:#ffdb96;}
#gv-nav-dialog .gv-u-badges {display:flex;justify-content:flex-start;flex-wrap:wrap;gap:6px;font-size:11px;}
#gv-nav-dialog .gv-u-badges span {border:1px solid #385b70;border-radius:999px;padding:3px 8px;color:#b8e9cf;}
#gv-nav-dialog .gv-u-badges span[data-ready="false"] {color:#ffd899;}
#gv-nav-dialog button.gv-offline-main {min-height:42px;width:100%;border:1px solid #66bed9;border-radius:9px;background:#136786;color:#fff;font-weight:700;padding:9px 10px;cursor:pointer;}
#gv-nav-dialog button.gv-offline-main:disabled {opacity:.75;cursor:wait;}
#gv-nav-dialog .gv-u-foot {font-size:10px;line-height:1.45;color:#c1d4df;}
#gv-nav-dialog button.gv-u-link {width:100%;min-height:30px;text-align:left;color:#cde9f3;background:transparent;border:0;border-top:1px solid #345b70;border-radius:0;font-size:12px;font-weight:500;padding:7px 0 0;cursor:pointer;}
#gv-nav-dialog button.gv-u-link:hover {color:#fff;}
#gv-nav-dialog button.gv-u-link:focus-visible {outline:2px solid #75d7f1;outline-offset:2px;}
#gv-nav-dialog .gv-u-rows {display:grid;gap:0;min-width:0;}
#gv-nav-dialog .gv-offline-status-row {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #284d61;font-size:12px;line-height:1.35;}
#gv-nav-dialog .gv-offline-status-row span {min-width:0;overflow-wrap:anywhere;}
#gv-nav-dialog .gv-offline-status-row strong {white-space:nowrap;}
#gv-nav-dialog .gv-u-view>progress {width:100%;height:11px;accent-color:#68d3e1;}
#gv-nav-dialog .gv-u-view>progress[hidden],#gv-nav-dialog .gv-u-view>button[hidden] {display:none!important;}
#gv-nav-dialog button.gv-offline-cancel {background:#173c51;border:1px solid #5c8599;padding:7px;color:#fff;}
#gv-nav-dialog #gv-u-maintenance {max-height:min(65dvh,620px);overflow:auto;overscroll-behavior:contain;padding-right:3px;}
#gv-nav-dialog #gv-u-legacy {display:grid;gap:6px;min-width:0;}
#gv-nav-dialog #gv-u-legacy .gv-nav-status {margin:4px 0;}
#gv-nav-dialog #gv-u-legacy #gv388-sectores-offline,
#gv-nav-dialog #gv-u-legacy #gv388-volcanes-offline {margin-top:4px;}
`;
    document.head.append(style);
  }

  function mount() {
    panel = document.getElementById('gv-nav-dialog');
    const api = apis();
    if (!panel || panel.querySelector('#gv-offline-unificado') ||
        !api.sen?.prepareOffline || !api.sectores?.preparar ||
        !api.referencias?.prepare || !api.volcanes?.descargar ||
        !panel.querySelector('#gv388-sectores-offline') ||
        !panel.querySelector('#gv388-volcanes-offline')) return false;

    const header = panel.querySelector('.gv-nav-dialog-head');
    const heading = panel.querySelector('#gv-nav-dialog-title');
    if (!header || !heading) return false;
    css();

    function button(text, name) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = name;
      el.textContent = text;
      return el;
    }
    const main = document.createElement('section');
    main.id = 'gv-offline-unificado';
    main.className = 'gv-u-view';
    const intro = document.createElement('p');
    intro.className = 'gv-u-intro';
    intro.textContent = 'Mapas de Chile y volcanes, disponibles sin internet.';
    summary = document.createElement('div');
    summary.className = 'gv-u-ready';
    summary.setAttribute('role','status');
    summary.setAttribute('aria-live','polite');
    summary.textContent = 'Comprobando datos guardados…';
    mini = document.createElement('div');
    mini.className = 'gv-u-badges';
    mini.setAttribute('aria-label','Estado de los conjuntos de datos');
    mainButton = button('Descargar datos offline','gv-offline-main');
    bar = document.createElement('progress');
    bar.max=4;bar.value=0;bar.hidden=true;
    cancelButton = button('Detener preparación','gv-offline-cancel');
    cancelButton.hidden = true;
    const caveat = document.createElement('div');
    caveat.className='gv-u-foot';
    caveat.textContent='Datos de referencia. Alertas en vivo y satélite necesitan internet.';
    const toDetails=button('Ver detalles técnicos ›','gv-u-link');
    main.append(intro,summary,mini,mainButton,bar,cancelButton,caveat,toDetails);

    details=document.createElement('section');
    details.id='gv-u-details';
    details.className='gv-u-view';
    details.hidden=true;
    const backMain=button('← Volver','gv-u-link');
    const detailIntro=document.createElement('p');
    detailIntro.className='gv-u-intro';
    detailIntro.textContent='Disponibilidad local de mapas y volcanes';
    list=document.createElement('div');
    list.className='gv-u-rows';
    const toMaintenance=button('Herramientas de mantenimiento ›','gv-u-link');
    details.append(backMain,detailIntro,list,toMaintenance);

    const maintenance=document.createElement('section');
    maintenance.id='gv-u-maintenance';
    maintenance.className='gv-u-view';
    maintenance.hidden=true;
    const backDetails=button('← Volver a detalles','gv-u-link');
    const toolsIntro=document.createElement('p');
    toolsIntro.className='gv-u-intro';
    toolsIntro.textContent='Controles originales de diagnóstico y reparación. Usar solo si es necesario.';
    const legacy=document.createElement('div');
    legacy.id='gv-u-legacy';
    // No eliminar, reemplazar ni clonar elementos: los preparadores tienen
    // observadores y callbacks enlazados a los nodos originales.
    for (const el of Array.from(panel.children)) {
      if (el !== header) legacy.appendChild(el);
    }
    maintenance.append(backDetails,toolsIntro,legacy);
    panel.append(main,details,maintenance);
    heading.textContent='Modo sin conexión';

    function view(name, focus=true) {
      main.hidden=name!=='main';
      details.hidden=name!=='details';
      maintenance.hidden=name!=='maintenance';
      heading.textContent=name==='main' ? 'Modo sin conexión' :
        name==='details' ? 'Estado de datos offline' : 'Mantenimiento offline';
      if (focus) (name==='main'?mainButton:name==='details'?backMain:backDetails).focus();
    }
    toDetails.addEventListener('click',()=>view('details'));
    backMain.addEventListener('click',()=>view('main'));
    toMaintenance.addEventListener('click',()=>view('maintenance'));
    backDetails.addEventListener('click',()=>view('details'));
    panel.addEventListener('close',()=>view('main',false));
    mainButton.addEventListener('click',()=>void prepareAll());
    cancelButton.addEventListener('click',()=>{
      stopRequested=true;
      if(stageName==='volcanes') apis().volcanes?.detener?.();
      message('Detención solicitada. Se conservarán los archivos guardados.', 'warning');
    });
    panelObserver=new MutationObserver(()=>{
      if(!panel.open || running)return;
      view('main',false);
      message('Comprobando archivos guardados…');
      void verifyAll().then(showAvailability).catch(e=>message('No se pudo verificar: '+String(e?.message||e),'warning'));
    });
    panelObserver.observe(panel,{attributes:true,attributeFilter:['open']});
    window.GVOfflineUnificado={version:VERSION,verificar:verifyAll};
    if(panel.open){void verifyAll().then(showAvailability).catch(e=>message('No se pudo verificar: '+String(e?.message||e),'warning'));}
    window.addEventListener('pagehide',()=>panelObserver?.disconnect(),{once:true});
    return true;
  }

  function init() {
    if (mount()) return;
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});
    observer.observe(document.documentElement,{subtree:true,childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
