import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {commercialError} from './errors.js';
import {requireOrgRole} from './authz.js';

const ALLOWED_SCOPES=new Set(['runs:create','runs:read','reports:read','ci:enforce']);
const PUBLIC_ID_BYTES=9;
const SECRET_BYTES=32;
const PUBLIC_ID_LENGTH=12;
const SECRET_LENGTH=43;

function digest(value,pepper){
  if(typeof pepper!=='string'||!pepper)throw commercialError('KEY_PEPPER_NOT_CONFIGURED',503);
  return createHmac('sha256',pepper).update(value).digest('hex');
}
function normalizeScopes(scopes){
  if(!Array.isArray(scopes)||scopes.length<1||scopes.length>8)throw commercialError('INVALID_SCOPES',400);
  const unique=[...new Set(scopes.map(String))];
  if(unique.some(scope=>!ALLOWED_SCOPES.has(scope)))throw commercialError('INVALID_SCOPES',400);
  return unique;
}
function parseToken(value){
  const token=String(value||'').trim();
  const match=new RegExp(`^(kata_ci_([A-Za-z0-9_-]{${PUBLIC_ID_LENGTH}}))_([A-Za-z0-9_-]{${SECRET_LENGTH}})$`).exec(token);
  if(!match)throw commercialError('INVALID_CI_TOKEN',401);
  return{token,prefix:match[1]};
}
function requireCiEntitlement(entitlements,scopes){
  if(entitlements?.ciTokens!==true)throw commercialError('ENTITLEMENT_REQUIRED',403,{capability:'ciTokens'});
  if(scopes.includes('ci:enforce')&&entitlements?.ciEnforcement!==true)throw commercialError('ENTITLEMENT_REQUIRED',403,{capability:'ciEnforcement'});
}

export async function issueCiToken({store,actor,projectId,environmentId=null,scopes,entitlements,pepper}){
  const normalizedScopes=normalizeScopes(scopes);
  requireCiEntitlement(entitlements,normalizedScopes);
  const project=await store.getProject(projectId);
  if(!project)throw commercialError('PROJECT_NOT_FOUND',404);
  const {user}=await requireOrgRole({store,principal:actor,organizationId:project.organizationId,allowedRoles:['OWNER','ADMIN']});
  if(environmentId){
    if(typeof store.getEnvironment!=='function')throw commercialError('DATABASE_NOT_CONFIGURED',503);
    const environment=await store.getEnvironment(environmentId);
    if(!environment||environment.projectId!==project.id)throw commercialError('ENVIRONMENT_NOT_FOUND',404);
  }
  const publicId=randomBytes(PUBLIC_ID_BYTES).toString('base64url');
  const secret=randomBytes(SECRET_BYTES).toString('base64url');
  const prefix=`kata_ci_${publicId}`;
  const token=`${prefix}_${secret}`;
  const tokenHash=digest(token,pepper);
  const stored=await store.insertCiToken({organizationId:project.organizationId,projectId:project.id,environmentId,prefix,tokenHash,scopes:normalizedScopes,createdBy:user.id});
  const record={...stored};delete record.token;delete record.secret;delete record.tokenHash;
  return{token,record};
}

export async function verifyCiToken({store,presentedToken,requiredScope,projectId=null,environmentId=null,pepper}){
  const parsed=parseToken(presentedToken);
  const record=await store.getCiTokenByPrefix(parsed.prefix);
  if(!record)throw commercialError('INVALID_CI_TOKEN',401);
  const actual=Buffer.from(digest(parsed.token,pepper),'hex');
  const expected=Buffer.from(String(record.tokenHash||''),'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw commercialError('INVALID_CI_TOKEN',401);
  if(record.revokedAt)throw commercialError('CI_TOKEN_REVOKED',401);
  if(requiredScope&&!record.scopes?.includes(requiredScope))throw commercialError('INSUFFICIENT_SCOPE',403);
  if(projectId&&record.projectId!==projectId)throw commercialError('FORBIDDEN',403);
  if(record.environmentId&&environmentId!==record.environmentId)throw commercialError('FORBIDDEN',403);
  if(environmentId&&record.environmentId&&record.environmentId!==environmentId)throw commercialError('FORBIDDEN',403);
  if(typeof store.touchCiToken==='function')await store.touchCiToken(record.id,new Date().toISOString());
  return Object.freeze({type:'service',authn:'ci-token',organizationId:record.organizationId,projectId:record.projectId,environmentId:record.environmentId??null,scopes:Object.freeze([...record.scopes]),tokenId:record.id});
}

export async function revokeCiToken({store,actor,tokenId}){
  const record=await store.getCiTokenById(tokenId);
  if(!record)throw commercialError('CI_TOKEN_NOT_FOUND',404);
  await requireOrgRole({store,principal:actor,organizationId:record.organizationId,allowedRoles:['OWNER','ADMIN']});
  await store.revokeCiToken(tokenId,new Date().toISOString());
  return{revoked:true,tokenId};
}
