import {commercialError} from '../commercial/errors.js';

const MAX_USERINFO_BYTES=16384;

function normalizeEmail(value){return typeof value==='string'?value.trim().toLowerCase():'';}

function userinfoEndpoint(value){
  let url;
  try{url=new URL(String(value||''));}catch{throw commercialError('IDENTITY_PROVIDER_NOT_CONFIGURED',503);}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw commercialError('IDENTITY_PROVIDER_NOT_CONFIGURED',503);
  return url.toString();
}

async function readBoundedJson(response){
  const declared=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_USERINFO_BYTES)throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);
  const contentType=response.headers.get('content-type')||'';
  if(!/^application\/json(?:\s*;|$)/i.test(contentType))throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);

  if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader();
    const chunks=[];
    let total=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>MAX_USERINFO_BYTES){try{await reader.cancel();}catch{}throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);}
        chunks.push(value);
      }
    }finally{try{reader.releaseLock();}catch{}}
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);}
  }

  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength>MAX_USERINFO_BYTES)throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw commercialError('IDENTITY_PROVIDER_INVALID_RESPONSE',503);}
}

export function createOidcIdentityAdapter({userinfoUrl,fetchImpl=globalThis.fetch}={}){
  const endpoint=userinfoEndpoint(userinfoUrl);
  if(typeof fetchImpl!=='function')throw commercialError('IDENTITY_PROVIDER_NOT_CONFIGURED',503);

  return Object.freeze({
    async getPrincipal(request){
      const authorization=request?.headers?.get?.('authorization')||'';
      const match=/^Bearer\s+(.+)$/i.exec(authorization);
      if(!match)return null;
      const token=match[1].trim();
      if(!token)return null;

      let response;
      try{
        response=await fetchImpl(endpoint,{method:'GET',headers:{accept:'application/json',authorization:`Bearer ${token}`},redirect:'error',signal:request.signal});
      }catch{throw commercialError('IDENTITY_PROVIDER_UNAVAILABLE',503);}
      if(response.status===401||response.status===403)throw commercialError('AUTH_REQUIRED',401);
      if(!response.ok)throw commercialError('IDENTITY_PROVIDER_UNAVAILABLE',503);

      const user=await readBoundedJson(response);
      const subject=typeof user?.sub==='string'?user.sub.trim():'';
      if(!subject)throw commercialError('IDENTITY_INVALID',401);
      return Object.freeze({type:'user',subject,email:normalizeEmail(user.email),authn:'oidc-bearer'});
    }
  });
}
