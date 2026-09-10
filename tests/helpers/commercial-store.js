export function createMemoryCommercialStore(){
  const state={users:[],organizations:[],memberships:[],invitations:[],projects:[],environments:[],apiKeys:[],auditEvents:[]};
  let sequence=0;
  const id=prefix=>`${prefix}-${++sequence}`;
  const store={
    ...state,
    async transaction(fn){return fn(store);},
    async getUserBySubject(subject){return state.users.find(x=>x.subject===subject)??null;},
    async insertUser({subject,email}){const existing=await store.getUserBySubject(subject);if(existing)return existing;const row={id:id('usr'),subject,email,createdAt:new Date().toISOString()};state.users.push(row);return row;},
    async findPersonalOrganizationForUser(userId){const membership=state.memberships.find(x=>x.userId===userId&&x.role==='OWNER'&&state.organizations.find(o=>o.id===x.organizationId)?.kind==='PERSONAL');return membership?state.organizations.find(o=>o.id===membership.organizationId):null;},
    async insertOrganization({name,slug,kind='TEAM',createdBy}){if(state.organizations.some(x=>x.slug===slug&&x.createdBy===createdBy&&x.kind===kind))throw Object.assign(new Error('DUPLICATE_ORGANIZATION'),{code:'DUPLICATE_ORGANIZATION'});const row={id:id('org'),name,slug,kind,createdBy,createdAt:new Date().toISOString()};state.organizations.push(row);return row;},
    async insertMembership({organizationId,userId,role}){const existing=state.memberships.find(x=>x.organizationId===organizationId&&x.userId===userId);if(existing)return existing;const row={id:id('mem'),organizationId,userId,role,createdAt:new Date().toISOString()};state.memberships.push(row);return row;},
    async getMembership(organizationId,userId){return state.memberships.find(x=>x.organizationId===organizationId&&x.userId===userId)??null;},
    async listMembershipsForUpdate(organizationId){return state.memberships.filter(x=>x.organizationId===organizationId);},
    async updateMembershipRole(organizationId,userId,role){const row=await store.getMembership(organizationId,userId);if(!row)return null;row.role=role;return row;},
    async deleteMembership(organizationId,userId){const i=state.memberships.findIndex(x=>x.organizationId===organizationId&&x.userId===userId);if(i<0)return false;state.memberships.splice(i,1);return true;},
    async listOrganizationsForUser(userId){return state.memberships.filter(x=>x.userId===userId).map(m=>({...state.organizations.find(o=>o.id===m.organizationId),role:m.role}));},
    async insertInvitation(input){const row={id:id('inv'),...input,acceptedAt:null,revokedAt:null,createdAt:new Date().toISOString()};state.invitations.push(row);return row;},
    async getInvitationByHashForUpdate(tokenHash){return state.invitations.find(x=>x.tokenHash===tokenHash)??null;},
    async getInvitationById(invitationId){return state.invitations.find(x=>x.id===invitationId)??null;},
    async markInvitationAccepted(invitationId,{userId,acceptedAt}){const row=state.invitations.find(x=>x.id===invitationId);if(!row)return null;row.acceptedBy=userId;row.acceptedAt=acceptedAt;return row;},
    async markInvitationRevoked(invitationId,revokedAt){const row=state.invitations.find(x=>x.id===invitationId);if(!row)return null;row.revokedAt=revokedAt;return row;},
    async insertProject(input){if(state.projects.some(x=>x.organizationId===input.organizationId&&x.slug===input.slug))throw Object.assign(new Error('PROJECT_SLUG_EXISTS'),{code:'PROJECT_SLUG_EXISTS'});const row={id:id('prj'),...input,archivedAt:null,createdAt:new Date().toISOString()};state.projects.push(row);return row;},
    async getProject(projectId){return state.projects.find(x=>x.id===projectId)??null;},
    async listProjectsForUser(userId){const orgs=new Set(state.memberships.filter(x=>x.userId===userId).map(x=>x.organizationId));return state.projects.filter(x=>orgs.has(x.organizationId));},
    async insertEnvironment(input){if(state.environments.some(x=>x.projectId===input.projectId&&x.name===input.name))throw Object.assign(new Error('ENVIRONMENT_NAME_EXISTS'),{code:'ENVIRONMENT_NAME_EXISTS'});const row={id:id('env'),...input,createdAt:new Date().toISOString()};state.environments.push(row);return row;},
    async insertApiKey(input){const row={id:id('key'),...input,createdAt:new Date().toISOString(),lastUsedAt:null,revokedAt:null};state.apiKeys.push(row);return row;},
    async getApiKeyByPrefix(prefix){return state.apiKeys.find(x=>x.prefix===prefix)??null;},
    async getApiKeyById(keyId){return state.apiKeys.find(x=>x.id===keyId)??null;},
    async revokeApiKey(keyId,revokedAt){const row=state.apiKeys.find(x=>x.id===keyId);if(!row)return null;row.revokedAt=revokedAt;return row;},
    async touchApiKey(keyId,lastUsedAt){const row=state.apiKeys.find(x=>x.id===keyId);if(row)row.lastUsedAt=lastUsedAt;return row??null;},
    async listApiKeysForOrganization(organizationId){return state.apiKeys.filter(x=>x.organizationId===organizationId);},
    async appendAuditEvent(event){const row={id:id('aud'),...event,createdAt:new Date().toISOString()};state.auditEvents.push(row);return row;}
  };
  return store;
}
