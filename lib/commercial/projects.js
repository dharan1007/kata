import {commercialError} from './errors.js';
import {requireOrgRole,requireProjectAccess} from './authz.js';

const VISIBILITIES=new Set(['PUBLIC','PRIVATE']);

export function validateTargetUrl(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>2048)throw commercialError('INVALID_TARGET_URL',400);
  let url;
  try{url=new URL(raw);}catch{throw commercialError('INVALID_TARGET_URL',400);}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw commercialError('INVALID_TARGET_URL',400);
  return url;
}

function validateSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))throw commercialError('INVALID_PROJECT_SLUG',400);
  return slug;
}

export async function createProject({store,actor,organizationId,name,slug,defaultTargetUrl,visibility='PRIVATE'}){
  const cleanName=String(name||'').trim();
  if(cleanName.length<1||cleanName.length>120)throw commercialError('INVALID_PROJECT_NAME',400);
  if(!VISIBILITIES.has(visibility))throw commercialError('INVALID_PROJECT_VISIBILITY',400);
  const auth=await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER','ADMIN']});
  const target=validateTargetUrl(defaultTargetUrl);
  return store.insertProject({organizationId,name:cleanName,slug:validateSlug(slug),defaultTargetUrl:target.href,visibility,createdBy:auth.user.id});
}

export async function createEnvironment({store,actor,projectId,name,targetUrl}){
  const cleanName=String(name||'').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-_]{0,62}[a-z0-9])?$/.test(cleanName))throw commercialError('INVALID_ENVIRONMENT_NAME',400);
  const {project}=await requireProjectAccess({store,principal:actor,projectId,allowedRoles:['OWNER','ADMIN']});
  const target=validateTargetUrl(targetUrl);
  return store.insertEnvironment({projectId:project.id,name:cleanName,targetUrl:target.href,expectedOrigin:target.origin,createdBy:(await store.getUserBySubject(actor.subject)).id});
}
