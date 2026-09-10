import {commercialError} from './errors.js';

export const COMMERCIAL_STORE_METHODS=Object.freeze([
  'transaction','getUserBySubject','insertUser','findPersonalOrganizationForUser','insertOrganization','insertMembership','getMembership','listMembershipsForUpdate','updateMembershipRole','deleteMembership','listOrganizationsForUser','insertInvitation','getInvitationByHashForUpdate','markInvitationAccepted','markInvitationRevoked','insertProject','getProject','listProjectsForUser','insertEnvironment','insertApiKey','getApiKeyByPrefix','getApiKeyById','revokeApiKey','touchApiKey','listApiKeysForOrganization','appendAuditEvent'
]);

export function assertCommercialStore(store){
  if(!store||typeof store!=='object')throw commercialError('DATABASE_NOT_CONFIGURED',503);
  const missing=COMMERCIAL_STORE_METHODS.filter(name=>typeof store[name]!=='function');
  if(missing.length)throw commercialError('DATABASE_ADAPTER_INVALID',500,{missing});
  return store;
}
