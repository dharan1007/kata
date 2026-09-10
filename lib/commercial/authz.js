import {commercialError} from './errors.js';
import {requireUserPrincipal} from './identity.js';

const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);

export function requirePrincipal(principal){
  if(!principal||typeof principal!=='object')throw commercialError('AUTH_REQUIRED',401);
  if(principal.type==='user')return requireUserPrincipal(principal);
  if(principal.type==='service'&&(principal.authn==='api-key'||principal.authn==='ci-token'))return principal;
  throw commercialError('AUTH_REQUIRED',401);
}

async function resolveUser(store,principal){
  requireUserPrincipal(principal);
  const user=await store.getUserBySubject(principal.subject);
  if(!user)throw commercialError('AUTH_REQUIRED',401);
  return user;
}

export async function requireOrgRole({store,principal,organizationId,allowedRoles}){
  requirePrincipal(principal);
  if(principal.type==='service'){
    if(principal.organizationId!==organizationId)throw commercialError('FORBIDDEN',403);
    return{principal,organizationId,role:null};
  }
  const user=await resolveUser(store,principal);
  const membership=await store.getMembership(organizationId,user.id);
  if(!membership||!allowedRoles.includes(membership.role))throw commercialError('FORBIDDEN',403);
  return{user,membership};
}

export async function requireProjectAccess({store,principal,projectId,allowedRoles}){
  requirePrincipal(principal);
  const project=await store.getProject(projectId);
  if(!project)throw commercialError('PROJECT_NOT_FOUND',404);
  if(principal.type==='service'){
    if(principal.organizationId!==project.organizationId)throw commercialError('FORBIDDEN',403);
    if(principal.projectId&&principal.projectId!==project.id)throw commercialError('FORBIDDEN',403);
    return{principal,project};
  }
  const auth=await requireOrgRole({store,principal,organizationId:project.organizationId,allowedRoles});
  return{...auth,project};
}

export function requireScope(principal,scope){
  requirePrincipal(principal);
  if(principal.type!=='service'||!Array.isArray(principal.scopes)||!principal.scopes.includes(scope))throw commercialError('INSUFFICIENT_SCOPE',403);
  return principal;
}

export function requireSafeSessionMutation({request,principal,expectedOrigin}){
  requirePrincipal(principal);
  const method=String(request?.method||'GET').toUpperCase();
  if(SAFE_METHODS.has(method)||principal.authn!=='identity-session')return principal;
  let canonical;
  try{canonical=new URL(expectedOrigin||request.url).origin;}catch{throw commercialError('CSRF_ORIGIN_REQUIRED',403);}
  const origin=request.headers?.get?.('origin');
  if(!origin||origin==='null')throw commercialError('CSRF_ORIGIN_REQUIRED',403);
  let observed;
  try{observed=new URL(origin).origin;}catch{throw commercialError('CSRF_ORIGIN_REQUIRED',403);}
  if(origin!==observed||observed!==canonical)throw commercialError('CSRF_ORIGIN_REQUIRED',403);
  return principal;
}
