/* GridVision Fire Mobile v1 - presentation controls; does not touch Leaflet state */
(() => {
  const boot = () => {
    if (document.getElementById('gv-fire-mobile-tools')) return;
    const header = document.querySelector('.fire-header');
    const sidebar = document.querySelector('.fire-sidebar');
    const detail = document.querySelector('.fire-detail');
    const incidents = document.querySelector('.incidents-panel');
    if (!header || !sidebar || !detail || !incidents) return;
    const mobile = document.createElement('nav');
    mobile.id = 'gv-fire-mobile-tools';
    mobile.className = 'gv-mobile-tools';
    mobile.setAttribute('aria-label', 'Herramientas móviles Fire');
    mobile.innerHTML = '<button type="button" data-view="filters" aria-expanded="false">Filtros y capas</button><button type="button" data-view="events">Incendios</button><button type="button" data-view="detail" aria-expanded="false">Ficha</button>';
    header.insertAdjacentElement('afterend', mobile);
    const filters = mobile.querySelector('[data-view="filters"]');
    const details = mobile.querySelector('[data-view="detail"]');
    const close = () => { document.body.classList.remove('gv-fire-sidebar-open', 'gv-fire-detail-open'); filters.setAttribute('aria-expanded','false'); details.setAttribute('aria-expanded','false'); };
    filters.addEventListener('click', () => { const show = !document.body.classList.contains('gv-fire-sidebar-open'); close(); if(show){document.body.classList.add('gv-fire-sidebar-open');filters.setAttribute('aria-expanded','true');} });
    details.addEventListener('click', () => { const show = !document.body.classList.contains('gv-fire-detail-open'); close(); if(show){document.body.classList.add('gv-fire-detail-open');details.setAttribute('aria-expanded','true');} });
    mobile.querySelector('[data-view="events"]').addEventListener('click', () => {close();incidents.scrollIntoView({behavior:'smooth',block:'start'});});
    document.addEventListener('keydown', (e) => {if(e.key==='Escape')close();});
    // Tapping the map dismisses overlays; mobile controls remain usable.
    const map = document.getElementById('fire-map');
    if(map) map.addEventListener('pointerdown', () => { if(window.matchMedia('(max-width:700px)').matches)close(); }, {passive:true});
    // If a selected incident updates the right-hand panel, allow opening via Ficha.
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
