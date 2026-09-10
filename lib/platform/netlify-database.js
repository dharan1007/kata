import {commercialError} from '../commercial/errors.js';

const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const mapRow=row=>row&&Object.fromEntries(Object.entries(row).map(([k,v])=>[camel(k),v]));
const rows=result=>(result?.rows??[]).map(mapRow);

function createStore(executor,{nested=false}={}){
  const q=(text,params=[])=>executor.query(text,params);
  return{
    async transaction(fn){
      if(nested)return fn(this);
      if(typeof executor.connect!=='function')throw commercialError('DATABASE_TRANSACTION_UNAVAILABLE',503);
      const client=await executor.connect();
      const tx=createStore(client,{nested:true});
      try{await client.query('begin');const value=await fn(tx);await client.query('commit');return value;}
      catch(error){try{await client.query('rollback');}catch{}throw error;}
      finally{client.release();}
    },
    async getUserBySubject(subject){return rows(await q('select * from users where identity_subject=$1 limit 1',[subject]))[0]??null;},
    async insertUser({subject,email}){return rows(await q('insert into users(identity_subject,email) values($1,$2) on conflict(identity_subject) do update set email=excluded.email,updated_at=now() returning *',[subject,email]))[0];},
    async findPersonalOrganizationForUser(userId){return rows(await q("select o.* from organizations o join organization_members m on m.organization_id=o.id where o.kind='PERSONAL' and m.user_id=$1 and m.role='OWNER' and o.archived_at is null limit 1",[userId]))[0]??null;},
    async insertOrganization({name,slug,kind='TEAM',createdBy,personalOwnerUserId=null}){
      if(kind==='PERSONAL')return rows(await q("insert into organizations(name,slug,kind,created_by,personal_owner_user_id) values($1,$2,'PERSONAL',$3,$3) on conflict(personal_owner_user_id) do update set personal_owner_user_id=excluded.personal_owner_user_id returning *",[name,slug,createdBy]))[0];
      return rows(await q("insert into organizations(name,slug,kind,created_by,personal_owner_user_id) values($1,$2,'TEAM',$3,$4) returning *",[name,slug,createdBy,personalOwnerUserId]))[0];
    },
    async insertMembership({organizationId,userId,role}){return rows(await q('insert into organization_members(organization_id,user_id,role) values($1,$2,$3) on conflict(organization_id,user_id) do update set role=organization_members.role returning *',[organizationId,userId,role]))[0];},
    async getMembership(organizationId,userId){return rows(await q('select * from organization_members where organization_id=$1 and user_id=$2 limit 1',[organizationId,userId]))[0]??null;},
    async listMembershipsForUpdate(organizationId){return rows(await q('select * from organization_members where organization_id=$1 order by created_at,id for update',[organizationId]));},
    async updateMembershipRole(organizationId,userId,role){return rows(await q('update organization_members set role=$3,updated_at=now() where organization_id=$1 and user_id=$2 returning *',[organizationId,userId,role]))[0]??null;},
    async deleteMembership(organizationId,userId){return (await q('delete from organization_members where organization_id=$1 and user_id=$2',[organizationId,userId])).rowCount>0;},
    async listOrganizationsForUser(userId){return rows(await q('select o.*,m.role from organizations o join organization_members m on m.organization_id=o.id where m.user_id=$1 and o.archived_at is null order by o.created_at,o.id',[userId]));},
    async insertInvitation({organizationId,email,role,tokenHash,expiresAt,createdBy}){return rows(await q('insert into organization_invitations(organization_id,email,role,token_hash,expires_at,created_by) values($1,$2,$3,$4,$5,$6) returning *',[organizationId,email,role,tokenHash,expiresAt,createdBy]))[0];},
    async getInvitationByHashForUpdate(tokenHash){return rows(await q('select * from organization_invitations where token_hash=$1 limit 1 for update',[tokenHash]))[0]??null;},
    async markInvitationAccepted(invitationId,{userId,acceptedAt}){return rows(await q('update organization_invitations set accepted_by=$2,accepted_at=$3 where id=$1 returning *',[invitationId,userId,acceptedAt]))[0]??null;},
    async markInvitationRevoked(invitationId,revokedAt){return rows(await q('update organization_invitations set revoked_at=$2 where id=$1 returning *',[invitationId,revokedAt]))[0]??null;},
    async insertProject({organizationId,name,slug,defaultTargetUrl,visibility,createdBy}){return rows(await q('insert into projects(organization_id,name,slug,default_target_url,visibility,created_by) values($1,$2,$3,$4,$5,$6) returning *',[organizationId,name,slug,defaultTargetUrl,visibility,createdBy]))[0];},
    async getProject(projectId){return rows(await q('select * from projects where id=$1 and archived_at is null limit 1',[projectId]))[0]??null;},
    async listProjectsForUser(userId){return rows(await q('select p.* from projects p join organization_members m on m.organization_id=p.organization_id where m.user_id=$1 and p.archived_at is null order by p.created_at,p.id',[userId]));},
    async insertEnvironment({projectId,name,targetUrl,expectedOrigin,createdBy}){return rows(await q('insert into project_environments(project_id,name,target_url,expected_origin,created_by) values($1,$2,$3,$4,$5) returning *',[projectId,name,targetUrl,expectedOrigin,createdBy]))[0];},
    async insertApiKey({organizationId,projectId,prefix,secretHash,scopes,createdBy,expiresAt}){return rows(await q('insert into api_keys(organization_id,project_id,prefix,secret_hash,scopes,created_by,expires_at) values($1,$2,$3,$4,$5::jsonb,$6,$7) returning *',[organizationId,projectId,prefix,secretHash,JSON.stringify(scopes),createdBy,expiresAt]))[0];},
    async getApiKeyByPrefix(prefix){return rows(await q('select * from api_keys where prefix=$1 limit 1',[prefix]))[0]??null;},
    async getApiKeyById(keyId){return rows(await q('select * from api_keys where id=$1 limit 1',[keyId]))[0]??null;},
    async revokeApiKey(keyId,revokedAt){return rows(await q('update api_keys set revoked_at=$2 where id=$1 returning *',[keyId,revokedAt]))[0]??null;},
    async touchApiKey(keyId,lastUsedAt){return rows(await q('update api_keys set last_used_at=$2 where id=$1 returning *',[keyId,lastUsedAt]))[0]??null;},
    async listApiKeysForOrganization(organizationId){return rows(await q('select * from api_keys where organization_id=$1 order by created_at desc,id',[organizationId]));},
    async appendAuditEvent({organizationId,actorType,actorId,action,targetType,targetId,outcome,requestId,metadata={}}){return rows(await q('insert into audit_events(organization_id,actor_type,actor_id,action,target_type,target_id,outcome,request_id,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) returning *',[organizationId,actorType,actorId,action,targetType,targetId,outcome,requestId,JSON.stringify(metadata)]))[0];}
  };
}

export function createNetlifyDatabaseStore({pool}={}){
  if(!pool||typeof pool.query!=='function')throw commercialError('DATABASE_NOT_CONFIGURED',503);
  return createStore(pool);
}

export const createPostgresCommercialStore=createNetlifyDatabaseStore;
