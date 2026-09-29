import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Connection metadata only. Gameplay and votes travel through WebRTC.
export function createSignalingServer({origins=['https://imp.zacsvae.com','http://localhost:5173','http://localhost:5175'],dataDir='',graceMs=8000,heartbeatMs=5000}={}){
 const rooms=new Map(),clients=new Map(),identities=new Map(),attempts=new Map();
 const hash=value=>createHash('sha256').update(value).digest('hex');
 if(dataDir){mkdirSync(dataDir,{recursive:true});try{const saved=JSON.parse(readFileSync(dataDir+'/rooms.json','utf8'));for(const r of saved.rooms||[])if(r.updated>Date.now()-86400000){r.members.forEach(p=>p.online=false);rooms.set(r.code,r);}for(const [id,digest] of saved.identities||[])identities.set(id,digest);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const persist=()=>{if(dataDir){writeFileSync(dataDir+'/rooms.tmp',JSON.stringify({rooms:[...rooms.values()],identities:[...identities]}),{mode:0o600});renameSync(dataDir+'/rooms.tmp',dataDir+'/rooms.json');}};
 const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
 const roomFor=c=>rooms.get(c?.code);
 const info=r=>({type:'ROOM',code:r.code,lobbyId:r.lobbyId,hostId:r.hostId,epoch:r.epoch,members:r.members.map(({id,ready,online,order})=>({id,ready,online,order}))});
 const broadcast=r=>{r.updated=Date.now();for(const [ws,c]of clients)if(c.code===r.code)send(ws,info(r));persist();};
 const elect=r=>{if(r.members.some(p=>p.id===r.hostId&&p.online))return;const next=r.members.filter(p=>p.online&&p.ready).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))[0];if(next&&next.id!==r.hostId){r.hostId=next.id;r.epoch++;}};
 const server=createServer((req,res)=>{if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ok":true,"service":"imp-signaling"}');}else{res.writeHead(404);res.end('Not found');}});
 const wss=new WebSocketServer({noServer:true,maxPayload:32768});
 server.on('upgrade',(req,socket,head)=>{if(req.url!=='/signal'||!origins.includes(req.headers.origin)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
 wss.on('connection',(ws,req)=>{
  const ip=req.socket.remoteAddress||'local';let alive=true;const c={id:'',code:'',count:0,window:Date.now()};clients.set(ws,c);
  const helloTimer=setTimeout(()=>{if(!c.id)ws.close(1008,'Identify first');},5000);
  ws.on('pong',()=>{alive=true;});ws.isAlive=()=>{const before=alive;alive=false;return before;};
  ws.on('message',raw=>{try{
   const m=JSON.parse(raw.toString());if(!m||typeof m.type!=='string')throw Error('Invalid request.');
   if(Date.now()-c.window>1000){c.window=Date.now();c.count=0;}if(++c.count>80){ws.close(1008,'Too many requests');return;}
   if(!c.id){if(m.type!=='HELLO'||!/^[-a-zA-Z0-9]{8,80}$/.test(m.id)||typeof m.token!=='string'||m.token.length<32||m.token.length>128)throw Error('Invalid device identity.');const digest=hash(m.token);if(identities.has(m.id)&&identities.get(m.id)!==digest)throw Error('Device identity could not be verified.');if([...clients.entries()].some(([other,v])=>other!==ws&&v.id===m.id)){send(ws,{type:'DUPLICATE',message:'This player is already open in another tab.'});ws.close(1008);return;}c.id=m.id;identities.set(c.id,digest);clearTimeout(helloTimer);send(ws,{type:'WELCOME'});return;}
   if(m.type==='PING'){send(ws,{type:'PONG',time:Date.now()});return;}
   if(m.type==='CREATE'||m.type==='JOIN_ROOM'){
    const bucket=attempts.get(ip)||{count:0,since:Date.now()};if(Date.now()-bucket.since>60000){bucket.count=0;bucket.since=Date.now();}attempts.set(ip,bucket);if(++bucket.count>60)throw Error('Too many room attempts. Try again in a minute.');
    if(c.code&&roomFor(c))throw Error('Leave your current room first.');
    let r;
    if(m.type==='CREATE'){if(rooms.size>=500)throw Error('The connection service is full. Try later.');const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;do{code=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');}while(rooms.has(code));r={code,lobbyId:randomUUID(),hostId:c.id,epoch:1,members:[],updated:Date.now()};rooms.set(code,r);}
    else{const code=String(m.code||'').toUpperCase().replace(/[ -]/g,'');r=rooms.get(code);if(!r)throw Error('Room not found. Check the code with your host.');}
    let p=r.members.find(p=>p.id===c.id);if(!p){if(r.members.length>=15)throw Error('This room is full.');p={id:c.id,ready:false,online:true,order:Math.max(-1,...r.members.map(p=>p.order))+1};r.members.push(p);}p.online=true;delete p.absent;c.code=r.code;elect(r);broadcast(r);return;
   }
   const r=roomFor(c);if(!r)throw Error('Join a room first.');const p=r.members.find(p=>p.id===c.id);
   if(m.type==='READY'){if(!p.ready){p.ready=true;broadcast(r);}return;}
   if(m.type==='SIGNAL'){
    if(!r.members.some(p=>p.id===m.to&&p.online)||m.to===c.id)throw Error('That player is reconnecting.');const d=m.data;
    if(!d||!['offer','answer','candidate'].includes(d.kind))throw Error('Invalid connection message.');
    const data=d.kind==='candidate'?{kind:d.kind,candidate:d.candidate}:{kind:d.kind,sdp:d.sdp};
    if(d.kind!=='candidate'&&(typeof d.sdp?.sdp!=='string'||d.sdp.type!==d.kind))throw Error('Invalid connection description.');
    for(const [other,v]of clients)if(v.id===m.to&&v.code===r.code)send(other,{type:'SIGNAL',from:c.id,data});return;
   }
   if(m.type==='TRANSFER'){if(r.hostId!==c.id||m.epoch!==r.epoch)throw Error('Only the current host can transfer.');if(!r.members.some(p=>p.id===m.to&&p.online&&p.ready))throw Error('Choose a connected player.');r.hostId=m.to;r.epoch++;broadcast(r);return;}
   if(m.type==='END_ROOM'){if(r.hostId!==c.id)throw Error('Only the host can end the lobby.');for(const [other,v]of clients)if(v.code===r.code){v.code='';send(other,{type:'ENDED'});}rooms.delete(r.code);persist();return;}
   if(m.type==='LEAVE_ROOM'){r.members=r.members.filter(p=>p.id!==c.id);c.code='';send(ws,{type:'LEFT'});elect(r);if(!r.members.length)rooms.delete(r.code);else broadcast(r);persist();return;}
   throw Error('Unknown connection request.');
  }catch(e){send(ws,{type:'ERROR',message:e.message});}});
  ws.on('close',()=>{clearTimeout(helloTimer);clients.delete(ws);const r=roomFor(c),p=r?.members.find(p=>p.id===c.id);if(p)p.absent=Date.now();});
 });
 const timer=setInterval(()=>{const now=Date.now();for(const [ws]of clients){if(!ws.isAlive?.()){ws.terminate();continue;}ws.ping();}
  for(const r of rooms.values()){let changed=false;for(const p of r.members)if(p.absent&&now-p.absent>=graceMs){delete p.absent;p.online=false;changed=true;}if(changed){elect(r);broadcast(r);}if(!r.members.some(p=>p.online)&&now-r.updated>86400000){rooms.delete(r.code);persist();}}
  for(const [ip,b]of attempts)if(now-b.since>60000)attempts.delete(ip);
 },heartbeatMs);timer.unref();
 return {server,close:async()=>{clearInterval(timer);for(const ws of clients.keys())ws.terminate();await new Promise(resolve=>wss.close(resolve));if(server.listening)await new Promise(resolve=>server.close(resolve));},rooms};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const instance=createSignalingServer({origins:(process.env.ALLOWED_ORIGINS||'https://imp.zacsvae.com,http://localhost:5173,http://localhost:5175').split(','),dataDir:process.env.DATA_DIR||'.signal-data'});const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT)||8787;instance.server.listen(port,host,()=>console.log(`Signaling service: http://${host}:${port} (WebSocket /signal)`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>instance.close().then(()=>process.exit(0)));}
