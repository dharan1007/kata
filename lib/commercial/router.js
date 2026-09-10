import {commercialError,publicCommercialError} from './errors.js';
import {provisionAccount} from './identity.js';
import {requireSafeSessionMutation} from './authz.js';
import {createOrganization,createInvitation,acceptInvitation} from './organizations.js';
import {createProject,createEnvironment} from './projects.js';
import {issueApiKey,revokeApiKey,verifyApiKey} from './keys.js';
import {evaluateCommercialReadiness} from './readiness.js';

const MAX_BODY_BYTES=131072;

function json(data,status=200,cache='private, no-store'){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':cache,'x-content-type-options':'nosniff'}});
}

async function body(request,maxBytes=MAX_BODY_BYTES){
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw commercialError('PAYLOAD_TOO_LARGE',413);
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.byteLength>maxBytes)throw commercialError('PAYLOAD_TOO_LARGE',413);
  if(!bytes.byteLength)return{};
  const contentType=request.headers.get('content-type')||'';
  if(!/^application\/json(?:\s*;|$)/i.test(contentType))throw commercialError('UNSUPPORTED_MEDIA_TYPE',415);
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw commercialError('INVALID_JSON',400);}
}

function routeParts(pathname){return pathname.split('/').filter(Boolean);}

export function createCommercialRouter({store,identity,pepper,expectedOrigin,release={sourceBound:false,releaseSha:null},env=process.env}){
  if(!identity||typeof identity.getPrincipal!=='function')throw commercialError('IDENTITY_PROVIDER_NOT_CONFIGURED',503);
  async function authenticate(request){
    const authorization=request.headers.get('authorization')||'';
    if(/^Bearer\s+kata_(?:live|test)_/i.test(authorization))return verifyApiKey({store,presentedKey:authorization.replace(/^Bearer\s+/i,''),pepper});
    return identity.getPrincipal(request);
  }

  return Object.freeze({async handle(request){
    try{
      const url=new URL(request.url);
      const parts=routeParts(url.pathname);
      const method=request.method.toUpperCase();

      if(url.pathname==='/api/readiness/commercial'&&method==='GET')return json({ok:true,readiness:evaluateCommercialReadiness({env,release})},200,'no-store');
      if(!url.pathname.startsWith('/api/'))return json({ok:false,error:{code:'NOT_FOUND',message:'NOT_FOUND'}},404,'no-store');

      const principal=await authenticate(request);
      if(!principal)throw commercialError('AUTH_REQUIRED',401);
      requireSafeSessionMutation({request,principal,expectedOrigin});

      if(url.pathname==='/api/account'&&method==='GET'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const account=await provisionAccount({store,principal});
        const organizations=await store.listOrganizationsForUser(account.user.id);
        return json({ok:true,account:{user:account.user,personalOrganization:account.personalOrganization,organizations}});
      }

      if(url.pathname==='/api/organizations'&&method==='GET'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const account=await provisionAccount({store,principal});
        return json({ok:true,organizations:await store.listOrganizationsForUser(account.user.id)});
      }
      if(url.pathname==='/api/organizations'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        const organization=await createOrganization({store,actor:principal,name:input.name});
        return json({ok:true,organization},201);
      }

      if(parts.length===4&&parts[0]==='api'&&parts[1]==='organizations'&&parts[3]==='invitations'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        const issued=await createInvitation({store,actor:principal,organizationId:parts[2],email:input.email,role:input.role,expiresInSeconds:input.expiresInSeconds,pepper});
        return json({ok:true,...issued},201,'no-store');
      }
      if(url.pathname==='/api/invitations/accept'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        return json({ok:true,...await acceptInvitation({store,principal,token:input.token,pepper})},200,'no-store');
      }

      if(url.pathname==='/api/projects'&&method==='GET'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const account=await provisionAccount({store,principal});
        return json({ok:true,projects:await store.listProjectsForUser(account.user.id)});
      }
      if(url.pathname==='/api/projects'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        const project=await createProject({store,actor:principal,organizationId:input.organizationId,name:input.name,slug:input.slug,defaultTargetUrl:input.defaultTargetUrl,visibility:input.visibility});
        return json({ok:true,project},201);
      }
      if(parts.length===4&&parts[0]==='api'&&parts[1]==='projects'&&parts[3]==='environments'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        const environment=await createEnvironment({store,actor:principal,projectId:parts[2],name:input.name,targetUrl:input.targetUrl});
        return json({ok:true,environment},201);
      }

      if(url.pathname==='/api/keys'&&method==='GET'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const organizationId=url.searchParams.get('organizationId');
        if(!organizationId)throw commercialError('ORGANIZATION_REQUIRED',400);
        const account=await provisionAccount({store,principal});
        const membership=await store.getMembership(organizationId,account.user.id);
        if(!membership)throw commercialError('FORBIDDEN',403);
        const keys=await store.listApiKeysForOrganization(organizationId);
        return json({ok:true,keys:keys.map(({secretHash,...safe})=>safe)});
      }
      if(url.pathname==='/api/keys'&&method==='POST'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        const input=await body(request);
        const issued=await issueApiKey({store,actor:principal,organizationId:input.organizationId,projectId:input.projectId??null,scopes:input.scopes,environment:input.environment??'live',pepper});
        return json({ok:true,...issued},201,'no-store');
      }
      if(parts.length===3&&parts[0]==='api'&&parts[1]==='keys'&&method==='DELETE'){
        if(principal.type!=='user')throw commercialError('USER_SESSION_REQUIRED',401);
        return json({ok:true,...await revokeApiKey({store,actor:principal,keyId:parts[2]})},200,'no-store');
      }

      return json({ok:false,error:{code:'NOT_FOUND',message:'NOT_FOUND'}},404,'no-store');
    }catch(error){
      const out=publicCommercialError(error);
      return json(out.body,out.status,'no-store');
    }
  }});
}
