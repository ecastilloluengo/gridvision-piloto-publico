/* GridVision Vulcano Mobile v1 - compact tools; existing button handlers retained */
(() => {
  const boot = () => {
    if(document.getElementById('gv-v-mobile-tools')) return;
    const shell = document.querySelector('.map-shell');
    const left = document.querySelector('.map-left-controls');
    const right = document.querySelector('.map-top-right');
    if(!shell || !left || !right) return;
    const bar=document.createElement('div');bar.id='gv-v-mobile-tools';bar.className='gv-v-mobile-tools';
    bar.innerHTML='<button type="button" data-action="search" aria-expanded="false">Buscar</button><button type="button" data-action="layers">Capas</button><button type="button" data-action="tools" aria-expanded="false">Herramientas</button>';
    shell.appendChild(bar);
    const search=bar.querySelector('[data-action="search"]');
    const tools=bar.querySelector('[data-action="tools"]');
    const hide=()=>{document.body.classList.remove('gv-v-search-open','gv-v-actions-open');search.setAttribute('aria-expanded','false');tools.setAttribute('aria-expanded','false');};
    search.addEventListener('click',()=>{const open=!document.body.classList.contains('gv-v-search-open');hide();if(open){document.body.classList.add('gv-v-search-open');search.setAttribute('aria-expanded','true');}});
    tools.addEventListener('click',()=>{const open=!document.body.classList.contains('gv-v-actions-open');hide();if(open){document.body.classList.add('gv-v-actions-open');tools.setAttribute('aria-expanded','true');}});
    bar.querySelector('[data-action="layers"]').addEventListener('click',()=>{hide();document.getElementById('open-sidebar')?.click();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
    const map = document.getElementById('vulcano-map');
    if(map) map.addEventListener('pointerdown',()=>{if(window.matchMedia('(max-width:700px)').matches)hide();},{passive:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);else boot();
})();
