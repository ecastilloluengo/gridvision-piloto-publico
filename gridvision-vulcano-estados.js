/* GridVision Vulcano · Estados técnicos publicados · piloto 0.1
   Carga estática verificable, nunca interpreta no reportado como verde. */
(()=>{'use strict';
const DATA='data/vulcano/estados_oficiales.json';
const INDEX='data/vulcano/volcanes_v068.json';
const SOURCE='https://www.sernageomin.cl/alertas-volcanicas/';
const SENAPRED='https://senapred.cl/alertas/';
const $=id=>document.getElementById(id);
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const mk=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!=null)e.textContent=content;return e;};
const label={VERDE:'Verde',AMARILLA:'Amarilla',NARANJA:'Naranja',ROJA:'Roja'};
let last=null,open=false,indexPromise=null;
const bar=document.querySelector('.map-top-right');
const shell=document.querySelector('.map-shell');
if(!bar||!shell)return;
const toggle=mk('button','', '♨ Estados');toggle.type='button';toggle.id='gv-estados-toggle';toggle.setAttribute('aria-controls','gv-estados-panel');toggle.setAttribute('aria-expanded','false');toggle.title='Estados técnicos publicados por SERNAGEOMIN; no es monitoreo instrumental en vivo';
bar.insertBefore(toggle,bar.firstChild);
const panel=mk('aside');panel.id='gv-estados-panel';panel.hidden=true;panel.setAttribute('aria-label','Estados técnicos volcánicos');
const head=mk('div','gvst-head');head.append(mk('h2','', 'Estados volcánicos oficiales'));
const close=mk('button','gvst-close','×');close.type='button';close.setAttribute('aria-label','Cerrar estados volcánicos');head.append(close);panel.append(head);
const body=mk('div','gvst-body');panel.append(body);shell.append(panel);
function show(flag){open=!!flag;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open&&last)draw(last);}
toggle.addEventListener('click',()=>show(!open));close.addEventListener('click',()=>show(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)show(false)});
function link(text,href){const a=mk('a','',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function infoRow(a,b){const row=mk('div','gvst-row');row.append(mk('span','',a),b);return row;}
function safeUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&(/(^|\.)sernageomin\.cl$/).test(x.hostname)?x.href:SOURCE}catch(_){return SOURCE}}
function timeLabel(s){if(!s)return 'Sin hora de consulta automatizada';const d=new Date(s);return Number.isNaN(d.getTime())?'Fecha no válida':new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short',timeZone:'America/Santiago'}).format(d)+' (Chile)'}
function age(s){return s&&Number.isFinite(Date.parse(s))?Math.max(0,(Date.now()-Date.parse(s))/3600000):Infinity}
function availableStatus(v){return v&&typeof v==='object'&&typeof v.nombre==='string'&&(label[v.nivel]||Number.isInteger(v.eav)&&v.eav>=0&&v.eav<=5)}
async function chooseMapVolcano(name){
  const btn=$('volcano-one'),region=$('region-selector'),zone=$('macrozona-selector');
  if(!btn||!region||!zone)return false;
  if(!indexPromise)indexPromise=fetch(INDEX,{cache:'default'}).then(r=>{if(!r.ok)throw Error('Sin índice de volcanes');return r.json()});
  const data=await indexPromise;const key=norm(name).replace(/^complejo volcanico /,'').replace(/^volcan /,'').replace(/ de /g,' ');
  const matches=(data.volcanes||[]).filter(v=>{const n=norm(v.nombre).replace(/ de /g,' ');return n===key||n.endsWith(' '+key)||key.endsWith(' '+n)});
  const found=matches[0];if(!found)return false;
  const targetRegion=(found.regiones||[]).find(x=>x===region.value)||(found.regiones||[])[0];
  if(!targetRegion)return false;
  const zoneMap={norte:['15','01','02','03','04'],centro:['05','13','06','07','16','08'],sur:['09','14','10','11','12']};
  const newZone=Object.keys(zoneMap).find(k=>zoneMap[k].includes(targetRegion));
  if(newZone&&zone.value!==newZone){zone.value=newZone;zone.dispatchEvent(new Event('change',{bubbles:true}));}
  if(region.value!==targetRegion){region.value=targetRegion;region.dispatchEvent(new Event('change',{bubbles:true}));}
  if(![...btn.options].some(o=>o.value===found.id))return false;
  btn.value=found.id;btn.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
function draw(feed){
  body.replaceChildren();
  const mode=feed?.modo||'';const automated=mode==='CONSULTA_AUTOMATICA';const hours=age(feed?.consultadoEn);const stale=automated&&hours>12;
  const status=mk('div','gvst-status '+(!automated?'demo':stale?'stale':'') ,
    !automated?'MODO PRUEBA · Estados referenciales':stale?'CONSULTA DESACTUALIZADA · Verificar fuente oficial':'CONSULTA AUTOMÁTICA · Página oficial revisada');
  body.append(status);
  const records=Array.isArray(feed?.volcanes)?feed.volcanes.filter(availableStatus):[];
  const intro=mk('p','gvst-sub',records.length+' estado(s) publicado(s) y reconocido(s) en la fuente. No implica que el resto de los volcanes esté en verde.');body.append(intro);
  body.append(mk('p','gvst-sub','Última consulta: '+timeLabel(automated?feed.consultadoEn:null)));
  if(stale)body.append(mk('p','gvst-warning','La última lectura automatizada supera 12 horas. Los estados se muestran como antecedentes históricos, no como condición vigente verificada.'));
  if(!automated)body.append(mk('p','gvst-warning','Esta es una versión local para comprobar el panel. No está conectada todavía a una consulta oficial programada.'));
  if(new Date()>=new Date('2026-10-28T00:00:00-03:00')&&feed?.esquema==='COLORES_PRE_EAV')
    body.append(mk('p','gvst-warning','Desde el 28/10/2026 se aplica la escala EAV 0–5. Los colores históricos no sustituyen la confirmación del EAV oficial.'));
  records.forEach(v=>{
    const card=mk('article','gvst-entry');const header=mk('div','gvst-entry-head');
    header.append(mk('span','gvst-name',v.nombre));
    const state=Number.isInteger(v.eav)&&v.eav>=0&&v.eav<=5?`EAV ${v.eav}`:(label[v.nivel]||'Sin verificar');
    header.append(mk('span','gvst-pill '+String(v.nivel||'').toLowerCase(),state));card.append(header);
    const row=mk('div','gvst-row');const a=link('Ver fuente oficial ↗',safeUrl(v.fuenteURL));row.append(a);
    const go=mk('button','gvst-go','Ver en mapa');go.type='button';go.addEventListener('click',async()=>{go.disabled=true;try{const ok=await chooseMapVolcano(v.nombre);if(ok)show(false);else go.textContent='No encontrado en índice';}catch(e){console.warn('Vulcano estados:',e);go.textContent='No disponible';}finally{go.disabled=false}});row.append(go);card.append(row);
    body.append(card);
  });
  if(!records.length)body.append(mk('div','gvst-warning','No hay estados interpretables. Consultar SERNAGEOMIN directamente.'));
  body.append(mk('div','gvst-divider'));
  body.append(infoRow('Fuente técnica',link('SERNAGEOMIN ↗',SOURCE)));
  body.append(infoRow('Alertas territoriales',link('SENAPRED ↗',SENAPRED)));
  body.append(mk('p','gvst-foot','Los estados técnicos publicados no equivalen a alertas territoriales SENAPRED ni a una orden de evacuación. La cartografía de peligro no es un pronóstico eruptivo.'));
}
async function refresh(){
  try{
    const r=await fetch(DATA+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const obj=await r.json();
    if(obj?.schema!==1||obj?.fuente!=='SERNAGEOMIN'||!Array.isArray(obj.volcanes))throw new Error('JSON incompatible');
    last=obj;const auto=obj.modo==='CONSULTA_AUTOMATICA';
    const live=auto&&age(obj.consultadoEn)<=12;
    const count=obj.volcanes.filter(availableStatus).length;
    toggle.textContent=live?'♨ Estados ('+count+')':'♨ Estados · revisar';
    toggle.title=live?'Estados de la página oficial; no es monitoreo instrumental en vivo':'Estados sin verificación automática reciente';
    if(open)draw(obj);
  }catch(e){
    toggle.textContent='♨ Estados · sin datos';
    last={schema:1,fuente:'SERNAGEOMIN',modo:'ERROR',volcanes:[]};
    if(open)draw(last);
    console.warn('Vulcano estados: no se pudo cargar la fuente local',e);
  }
}
refresh();setInterval(refresh,15*60*1000);
})();
