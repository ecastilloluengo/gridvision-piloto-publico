/* GridVision SEN Offline V1. Alcance: los tres visores y recursos estáticos,
   nunca API/clima/alertas en vivo ni teselas externas. */
'use strict';
const CACHE='gridvision-nav-offline-v1';
const CORE=['portal.html',
  'portal.css',
  'portal.js',
  'portal-offline.js',
  'portal-solax-diagnostico-potencias.js',
  'portal-alertas-pfv.js',
  'fusionsolar-detalle-v1.css',
  'fusionsolar-detalle-v1.js',
  'components/alertas/activos-meteorologicos.js',
  'components/alertas/estado-alertas.js',
  'assets/logo-pecket-energy.png',
  'portal-fondo-control-renovable.png',
  'data/processed/pfv_netbilling.geojson',
  'index.html','gridvision-fire.html','gridvision-vulcano.html',
  'components/gridvision-nav/gridvision-nav.css',
  'components/gridvision-nav/gridvision-nav.js',
  'components/gridvision-nav/gridvision-base-offline.js',
  'components/gridvision-nav/gridvision-base-offline.css',
  'components/gridvision-nav/gridvision-modo-clima.js',
'components/gridvision-nav/gridvision-modo-clima.css',
'vendor/leaflet/leaflet.css','vendor/leaflet/leaflet.js'];
const root = new URL('./', self.registration.scope);
const urlFor = p => new URL(p,root).href;
function normURL(input){const u=new URL(input);u.search='';u.hash='';return u.href;}
self.addEventListener('install', event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Cada recurso se gestiona individualmente para no impedir la instalación
    // por una descarga ocasionalmente fallida.
    await Promise.all(CORE.map(async p=>{
      try {const r=await fetch(urlFor(p),{cache:'no-store'});
        if(r.ok) await cache.put(urlFor(p),r);
      } catch(e) {console.warn('SW sin recurso inicial',p,e);} 
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  if(u.origin!==root.origin || !u.pathname.startsWith(root.pathname)) return;
  const relative=u.pathname.slice(root.pathname.length);
  if(!relative || relative.startsWith('api/') ||
     /^data\/(alertas_senapred\.json|dmc\/|sitr_)/i.test(relative)) return;
  const appPage=['portal.html','index.html','gridvision-fire.html','gridvision-vulcano.html',
'components/localizador-fallas/localizador-fallas.html',
'components/panel-operacional.html'].includes(relative);
  const appStatic=/\.(js|css|svg|png|webmanifest|ico|woff2?)$/i.test(relative);
  const geo=/^data\/processed\/.+\.geojson$/i.test(relative) || relative==='data/offline/base-chile-v2.geojson';
  const vol=/^data\/vulcano\/.+\.(geojson|json)$/i.test(relative);
  if(!appPage && !appStatic && !geo && !vol)return;
  const key=normURL(req.url);
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const result=await fetch(req);
      if(result.ok){
        // El material de Vulcano es muy voluminoso: únicamente se
        // almacena cuando el usuario lo prepara explícitamente.
        if(!vol) event.waitUntil(cache.put(key,result.clone()).catch(()=>{}));
      }
      if([502,503,504].includes(result.status)){
        const saved=await cache.match(key);
        if(saved)return saved;
      }
      return result;
    } catch(err){
      const saved=await cache.match(key);
      if(saved)return saved;
      throw err;
    }
  })());
});
