#!/usr/bin/env python3
"""Prueba local aislada Web Push. Sin cambios en Portal ni Render."""
import base64
import json
import sys
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from pathlib import Path

PORT = 8778
ORIGIN = f'http://127.0.0.1:{PORT}'
# py_vapid exige un origen HTTPS sin ruta ni barra final (o mailto).
CONTACT = 'https://ecastilloluengo.github.io'
HTML = '''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GridVision V5 | Prueba Web Push</title><style>body{background:#102432;color:#e8f2f6;font:16px system-ui;margin:0;padding:28px}main{max-width:540px;margin:auto;background:#173544;border:1px solid #456070;border-radius:12px;padding:24px}h1{font-size:24px}b{color:#b8e55b}button{background:#b8e55b;color:#14232a;border:0;padding:12px 20px;border-radius:8px;font:600 16px system-ui;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px system-ui}</style><main><b>PECKET ENERGY · GRIDVISION V5</b><h1>Prueba de notificación Web Push</h1><p>Prueba local, sin datos operacionales. Autoriza este dispositivo. Después cierra esta pestaña y envía un aviso desde PowerShell.</p><button id="activar" disabled>Autorizar y registrar dispositivo</button><pre id="estado" role="status">Preparando Service Worker...</pre></main><script src="/prueba.js"></script></html>'''
JS = r'''const boton=document.querySelector('#activar'), estado=document.querySelector('#estado');
let reg,key;
function bytes(s){const a=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(a+'='.repeat((4-a.length%4)%4)), c=>c.charCodeAt(0));}
async function json(url,opts){const r=await fetch(url,opts);const d=await r.json();if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d;}
(async()=>{try{if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Este navegador no ofrece Web Push en este contexto.');
await navigator.serviceWorker.register('/sw.js');reg=await navigator.serviceWorker.ready;
key=bytes((await json('/api/clave')).publicKey);boton.disabled=false;estado.textContent='Service Worker activo. Permiso: '+Notification.permission+'. Pulsa Autorizar.';}catch(e){estado.textContent=String(e);}})();
boton.onclick=async()=>{boton.disabled=true;try{const permiso=await Notification.requestPermission();if(permiso!=='granted')throw Error('Permiso '+permiso+'. Revisa permisos de Edge para 127.0.0.1:8778.');
let sub=await reg.pushManager.getSubscription();if(sub){const actual=new Uint8Array(sub.options.applicationServerKey||new ArrayBuffer(0));if(actual.length!==key.length||actual.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null;}}
if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
await json('/api/registrar',{method:'POST',headers:{'Content-Type':'application/json','X-GV-Test':'1'},body:JSON.stringify(sub.toJSON())});estado.textContent='DISPOSITIVO REGISTRADO. Puedes cerrar esta pestaña. No cierres el servidor de pruebas.';}catch(e){estado.textContent='Error: '+e.message;}finally{boton.disabled=false;}};'''
SW = r'''self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(_){};e.waitUntil(self.registration.showNotification('GRIDVISION V5 · PRUEBA WEB PUSH',{body:typeof d.body==='string'?d.body:'Aviso de prueba. No es un evento real.',icon:'/logo.png',tag:typeof d.id==='string'?d.id:'gv-v5-prueba',requireInteraction:true,data:{url:'/'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(c=>c.url.startsWith(self.location.origin+'/'));return c?c.focus():self.clients.openWindow('/');}));});'''

def b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')

def valido(sub):
    try:
        u=urlsplit(sub['endpoint']); host=u.hostname or ''
        if u.scheme!='https' or u.username or u.password or u.port not in (None,443): return False
        if not (host in ('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com') or host.endswith(('.notify.windows.com','.push.microsoft.com','.push.apple.com'))): return False
        keys=sub['keys']; p=base64.urlsafe_b64decode(keys['p256dh']+'=='); a=base64.urlsafe_b64decode(keys['auth']+'==')
        return len(p)==65 and p[0]==4 and len(a)==16
    except (KeyError, TypeError, ValueError, AttributeError): return False

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # No exponer endpoints ni claves de suscripcion.
        pass
    def output(self,status,data,ctype):
        if isinstance(data,str): data=data.encode('utf-8')
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def reply(self,status,**data): self.output(status,json.dumps(data,ensure_ascii=False),'application/json; charset=utf-8')
    def guard(self,post=False):
        if self.headers.get('Host')!=f'127.0.0.1:{PORT}' or (self.headers.get('Origin') not in (None,ORIGIN)) or (post and (self.headers.get('X-GV-Test')!='1' or self.headers.get_content_type()!='application/json')):
            self.reply(403,error='Solicitud no autorizada. Prueba solo local.');return False
        return True
    def do_GET(self):
        if not self.guard():return
        if self.path=='/': self.output(200,HTML,'text/html; charset=utf-8')
        elif self.path=='/prueba.js': self.output(200,JS,'application/javascript; charset=utf-8')
        elif self.path=='/sw.js': self.output(200,SW,'application/javascript; charset=utf-8')
        elif self.path=='/logo.png' and self.server.logo: self.output(200,self.server.logo,'image/png')
        elif self.path=='/api/clave': self.reply(200,publicKey=self.server.public)
        elif self.path=='/api/estado':
            with self.server.lock: n=len(self.server.subs)
            self.reply(200,dispositivos=n,modo='PRUEBA LOCAL')
        else:self.reply(404,error='Ruta no disponible')
    def do_POST(self):
        if not self.guard(True):return
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=16384:raise ValueError()
            d=json.loads(self.rfile.read(n))
            if not isinstance(d,dict):raise ValueError()
        except (ValueError,TypeError):self.reply(400,error='JSON invalido');return
        if self.path=='/api/registrar':
            if not valido(d):self.reply(400,error='Suscripcion invalida o proveedor push no reconocido');return
            with self.server.lock:self.server.subs[d['endpoint']]=d;n=len(self.server.subs)
            print(f'DISPOSITIVO REGISTRADO: {n}',flush=True);self.reply(200,dispositivos=n)
        elif self.path=='/api/prueba':
            with self.server.lock:subs=list(self.server.subs.values())
            if not subs:self.reply(409,error='No hay dispositivos registrados');return
            enviados=0;errores=[]
            payload=json.dumps({'id':str(uuid.uuid4()),'body':'PRUEBA NO REAL. Aviso enviado desde el servidor, incluso con la pestaña cerrada. '+datetime.now().strftime('%H:%M:%S')})
            for sub in subs:
                try:
                    r=self.server.send(subscription_info=sub,data=payload,vapid_private_key=self.server.private,vapid_claims={'sub':CONTACT},ttl=120,timeout=15)
                    enviados+=1;print('PUSH ACEPTADO HTTP',r.status_code,flush=True)
                except Exception as e:
                    response=getattr(e,'response',None);code=getattr(response,'status_code',None)
                    errores.append(str(code) if code else type(e).__name__)
                    print('PUSH NO ACEPTADO:', str(code) if code else type(e).__name__, flush=True)
                    if code in (404,410):
                        with self.server.lock:self.server.subs.pop(sub['endpoint'],None)
            self.reply(200 if enviados else 502,aceptados=enviados,errores=errores,nota='Aceptacion del proveedor no confirma visualizacion en Windows')
        else:self.reply(404,error='Ruta no disponible')

def main():
    try:
        from pywebpush import webpush
        from py_vapid import Vapid
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization as s
    except ImportError:raise SystemExit('Falta pywebpush. Instala las dependencias en el entorno de prueba.')
    private=ec.generate_private_key(ec.SECP256R1())
    # DER base64url admitido por pywebpush; solo en memoria, no escribir claves.
    der=private.private_bytes(s.Encoding.DER,s.PrivateFormat.PKCS8,s.NoEncryption())
    public=private.public_key().public_bytes(s.Encoding.X962,s.PublicFormat.UncompressedPoint)
    # Verifica localmente la firma con la biblioteca instalada, sin contactar al proveedor.
    try:
        Vapid.from_string(b64(der)).sign({'sub': CONTACT, 'aud': 'https://example.com'})
    except Exception as exc:
        raise SystemExit('Autocomprobacion VAPID fallida: ' + type(exc).__name__) from None
    print('OK: firma VAPID local validada.', flush=True)
    root=Path(sys.argv[1]) if len(sys.argv)>1 else Path.cwd();logo=root/'assets'/'logo-pecket-energy.png'
    with ThreadingHTTPServer(('127.0.0.1',PORT),Handler) as server:
        server.private=b64(der);server.public=b64(public);server.logo=logo.read_bytes() if logo.is_file() else None;server.subs={};server.lock=threading.Lock();server.send=webpush
        print('GRIDVISION V5 - PRUEBA LOCAL WEB PUSH',flush=True);print(ORIGIN+'/',flush=True);print('Claves y registros temporales en memoria. No modifica archivos del repositorio.',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:print('\nSimulador detenido. Registros de prueba descartados.',flush=True)
if __name__=='__main__':main()
