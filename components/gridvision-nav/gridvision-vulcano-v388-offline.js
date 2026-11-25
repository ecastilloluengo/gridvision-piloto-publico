/* GV388A: Control de cartografia sectorizada dentro del panel Navegacion y SEN offline.
 * No modifica el Service Worker global ni borra las caches anteriores.
 */
(() => {
  'use strict';
  const ROOT = new URL('../../', document.currentScript.src);
  const SECTORS = 'data/offline/sectores-v382/';
  const MANIFEST = SECTORS + 'manifest-v382.json';
  const ORIGINAL = 'data/offline/base-chile-vulcano-v388.geojson';
  const CACHE = 'gridvision-v388b-sectores-offline-v1';
  const abs = p => new URL(p, ROOT).href;
  let processing=false;
  const state = {version:'3.8.8a', listo:false, documentos:0, faltantes:[], errores:[]};
  window.GV388Offline = state;
  async function readManifest(){
    let r=('caches' in window) ? await caches.match(abs(MANIFEST)) : null;
    if(!r)r=await fetch(abs(MANIFEST),{cache:'default'});
    if(!r.ok)throw Error('Manifiesto no disponible: HTTP '+r.status);
    const d=await r.json();
    if(d.schema!=='gv-sectores-v382'||d.total_features!==42112||Object.keys(d.celdas||{}).length!==205||!d.compartidas)
      throw Error('Manifiesto incompatible');
    const files=[MANIFEST,ORIGINAL];
    for(const item of [d.compartidas,...Object.values(d.celdas)]){
      const p=item?.archivo;
      if(typeof p!=='string'||p.includes('..')||!/^[a-z0-9_+./-]+\.geojson$/i.test(p))
        throw Error('Ruta de sector no autorizada');
      files.push(SECTORS+p);
    }
    return files;
  }
  function attach(){
    const panel=document.getElementById('gv-nav-dialog');
    if(!panel||panel.querySelector('#gv388-sectores-offline'))return;
    const wrap=document.createElement('div');
    wrap.id='gv388-sectores-offline';
    wrap.style.cssText='border-top:1px solid #517b8a;margin-top:8px;padding-top:9px;display:grid;gap:5px';
    const b=document.createElement('button');
    b.type='button';b.textContent='⬇ Preparar / verificar sectores offline';
    b.className='gv-nav-download';
    const label=document.createElement('div');
    label.style.cssText='font-size:12px;line-height:1.45';
    label.textContent='Cartografía por sectores: pulsar para verificar los 206 documentos de todo Chile.';
    wrap.append(b,label);
    const anchor=panel.querySelector('.gv-nav-base-choice');
    if(anchor)anchor.insertAdjacentElement('afterend',wrap);else panel.append(wrap);
    async function check(prepare){
      if(processing)return;
      processing=true;b.disabled=true;
      try{
        if(!('caches' in window))throw Error('Cache Storage no disponible');
        const files=await readManifest(),cache=await caches.open(CACHE);
        let existing=0,added=0,missing=[],errors=[];
        for(let i=0;i<files.length;i++){
          const path=files[i];
          if((await caches.match(abs(path)))?.ok){existing++;}
          else if(prepare){
            try{
              const r=await fetch(abs(path),{cache:'no-store'});
              if(!r.ok)throw Error('HTTP '+r.status);
              await cache.put(abs(path),r.clone());
              if(!(await caches.match(abs(path)))?.ok)throw Error('No quedó almacenado');
              added++;
            }catch(e){errors.push(path+' ('+e.message+')');}
          }else missing.push(path);
          if(i%15===0){label.textContent='Verificando '+(i+1)+'/'+files.length+' documentos…';await Promise.resolve();}
        }
        state.documentos=files.length;state.faltantes=missing;state.errores=errors;
        state.listo=!missing.length&&!errors.length;
        label.textContent=state.listo?
          'Sectores offline listos · '+(files.length-2)+' GeoJSON sectorizados + manifiesto y respaldo · '+existing+' reutilizados · '+added+' nuevos.':
          'Faltan '+missing.length+' archivos, errores '+errors.length+'. '+(errors[0]||missing[0]||'');
      }catch(e){state.listo=false;state.errores=[String(e)];label.textContent='Sectores: '+String(e.message||e);}
      finally{processing=false;b.disabled=false;}
    }
    b.addEventListener('click',async()=>{
      await check(false);
      if(state.listo)return;
      if(!navigator.onLine){label.textContent+=' · Conéctate para preparar los sectores faltantes.';return;}
      if(confirm('Faltan sectores nacionales offline. ¿Descargar solo los archivos faltantes?'))await check(true);
    });
    // API reutilizada por el panel unificado. No inicia descargas de forma automatica.
    state.verificar = () => check(false);
    state.preparar = () => check(true);
    // No iniciar descarga automáticamente. Permitir verificar al abrir el panel.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
})();
