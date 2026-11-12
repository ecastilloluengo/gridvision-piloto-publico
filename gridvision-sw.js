/* GridVision SEN Offline V1. Alcance: los tres visores y recursos estáticos,
   nunca API/clima/alertas en vivo ni teselas externas. */
'use strict';
const CACHE='gridvision-nav-offline-v1';
const CORE=['index.html','gridvision-fire.html','gridvision-vulcano.html',
  'components/gridvision-nav/gridvision-nav.css',
  'components/gridvision-nav/gridvision-nav.js',
  'components/gridvision-nav/gridvision-base-offline.js',
  'components/gridvision-nav/gridvision-base-offline.css',
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
  const appPage=['index.html','gridvision-fire.html','gridvision-vulcano.html'].includes(relative);
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
      return result;
    } catch(err){
      const saved=await cache.match(key);
      if(saved)return saved;
      throw err;
    }
  })());
});
