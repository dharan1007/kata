import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {commercialError} from './errors.js';
import {requireOrgRole} from './authz.js';

const ALLOWED_SCOPES=new Set(['projects:read','runs:create','runs:read','reports:read','ci:enforce','keys:manage']);

function digest(value,pepper){
  if(typeof pepper!=='string'||!pepper)throw commercialError('KEY_PEPPER_NOT_CONFIGURED',503);
  return createHmac('sha256',pepper).update(value).digest('hex');
}

function normalizeScopes(scopes){
  if(!Array.isArray(scopes)||scopes.length<1||scopes.length>12)throw commercialError('INVALID_SCOPES',400);
  const unique=[...new Set(scopes.map(String))];
  if(unique.some(scope=>!ALLOWED_SCOPES.has(scope)))throw commercialError('INVALID_SCOPES',400);
  return unique;
}

function parsePresentedKey(value){
  const key=String(value||'').trim();
  const match=/^(kata_(live|test)_[A-Za-z0-9_-]{6,40})_([A-Za-z0-9_-]{20,80})$/.exec(key);
  if(!match)throw commercialError('INVALID_API_KEY',401);
  return{key,prefix:match[1],environment:match[2]};
}

export async function issueApiKey({store,actor,organizationId,projectId=null,scopes,environment='live',pepper}){
  if(!['live','test'].includes(environment))throw commercialError('INVALID_KEY_ENVIRONMENT',400);
  const normalizedScopes=normalizeScopes(scopes);
  const {user}=await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER','ADMIN']});
  if(projectId){
    const project=await store.getProject(projectId);
    if(!project||project.organizationId!==organizationId)throw commercialError('FORBIDDEN',403);
  }
  const publicId=randomBytes(9).toString('base64url');
  const secret=randomBytes(32).toString('base64url');
  const prefix=`kata_${environment}_${publicId}`;
  const key=`${prefix}_${secret}`;
  const secretHash=digest(key,pepper);
  const stored=await store.insertApiKey({organizationId,projectId,prefix,secretHash,scopes:normalizedScopes,createdBy:user.id,expiresAt:null});
  const record={...stored};
  delete record.key;
  delete record.secret;
  return{key,record};
}

export async function verifyApiKey({store,presentedKey,requiredScope,pepper}){
  const parsed=parsePresentedKey(presentedKey);
  const record=await store.getApiKeyByPrefix(parsed.prefix);
  if(!record)throw commercialError('INVALID_API_KEY',401);
  const actual=Buffer.from(digest(parsed.key,pepper),'hex');
  const expected=Buffer.from(String(record.secretHash||''),'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw commercialError('INVALID_API_KEY',401);
  if(record.revokedAt)throw commercialError('API_KEY_REVOKED',401);
  if(record.expiresAt&&new Date(record.expiresAt).getTime()<=Date.now())throw commercialError('API_KEY_EXPIRED',401);
  if(requiredScope&&!record.scopes?.includes(requiredScope))throw commercialError('INSUFFICIENT_SCOPE',403);
  await store.touchApiKey(record.id,new Date().toISOString());
  return Object.freeze({type:'service',authn:'api-key',organizationId:record.organizationId,projectId:record.projectId??null,scopes:Object.freeze([...record.scopes]),keyId:record.id});
}

export async function revokeApiKey({store,actor,keyId}){
  const record=await store.getApiKeyById(keyId);
  if(!record)throw commercialError('API_KEY_NOT_FOUND',404);
  await requireOrgRole({store,principal:actor,organizationId:record.organizationId,allowedRoles:['OWNER','ADMIN']});
  await store.revokeApiKey(keyId,new Date().toISOString());
  return{revoked:true,keyId};
}
