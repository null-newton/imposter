export const storageKey='meeting-peer-'+(new URLSearchParams(location.search).get('device')||'default');
let saved:{id:string;token:string}|null=null;
try{saved=JSON.parse(localStorage.getItem(storageKey+'-identity')||'null');}catch{}
export const identity=saved?.token?saved:{id:crypto.randomUUID(),token:crypto.randomUUID()+crypto.randomUUID()};
localStorage.setItem(storageKey+'-identity',JSON.stringify(identity));