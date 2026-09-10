import {createHmac,randomBytes} from 'node:crypto';
import {commercialError} from './errors.js';
import {provisionAccount,requireUserPrincipal} from './identity.js';
import {requireOrgRole} from './authz.js';

const INVITE_ROLES=new Set(['ADMIN','MEMBER']);
const MEMBER_ROLES=new Set(['OWNER','ADMIN','MEMBER']);

function normalizeEmail(value){
  const email=String(value||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw commercialError('INVALID_EMAIL',400);
  return email;
}

function slugify(value){
  const slug=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,54);
  if(!slug)throw commercialError('INVALID_ORGANIZATION_NAME',400);
  return `${slug}-${randomBytes(4).toString('hex')}`;
}

function invitationDigest(token,pepper){
  if(typeof pepper!=='string'||pepper.length<1)throw commercialError('KEY_PEPPER_NOT_CONFIGURED',503);
  return createHmac('sha256',pepper).update(token).digest('hex');
}

async function currentUser(store,actor){
  requireUserPrincipal(actor);
  const account=await provisionAccount({store,principal:actor});
  return account.user;
}

export async function createOrganization({store,actor,name}){
  const clean=String(name||'').trim();
  if(clean.length<2||clean.length>120)throw commercialError('INVALID_ORGANIZATION_NAME',400);
  const user=await currentUser(store,actor);
  return store.transaction(async tx=>{
    const organization=await tx.insertOrganization({name:clean,slug:slugify(clean),kind:'TEAM',createdBy:user.id});
    await tx.insertMembership({organizationId:organization.id,userId:user.id,role:'OWNER'});
    return organization;
  });
}

export async function createInvitation({store,actor,organizationId,email,role,expiresInSeconds=86400,pepper}){
  const normalizedEmail=normalizeEmail(email);
  if(!INVITE_ROLES.has(role))throw commercialError('INVALID_INVITATION_ROLE',400);
  if(!Number.isInteger(expiresInSeconds)||expiresInSeconds<300||expiresInSeconds>604800)throw commercialError('INVALID_INVITATION_EXPIRY',400);
  const {user}=await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER','ADMIN']});
  const token=`kata_inv_${randomBytes(32).toString('base64url')}`;
  const tokenHash=invitationDigest(token,pepper);
  const expiresAt=new Date(Date.now()+expiresInSeconds*1000).toISOString();
  const invitation=await store.insertInvitation({organizationId,email:normalizedEmail,role,tokenHash,expiresAt,createdBy:user.id});
  return{invitation,token};
}

export async function acceptInvitation({store,principal,token,pepper}){
  requireUserPrincipal(principal);
  const raw=String(token||'');
  if(!/^kata_inv_[A-Za-z0-9_-]{20,}$/.test(raw))throw commercialError('INVITATION_NOT_FOUND',404);
  const tokenHash=invitationDigest(raw,pepper);
  return store.transaction(async tx=>{
    const invitation=await tx.getInvitationByHashForUpdate(tokenHash);
    if(!invitation)throw commercialError('INVITATION_NOT_FOUND',404);
    if(invitation.revokedAt)throw commercialError('INVITATION_REVOKED',409);
    if(invitation.acceptedAt)throw commercialError('INVITATION_ALREADY_USED',409);
    if(new Date(invitation.expiresAt).getTime()<=Date.now())throw commercialError('INVITATION_EXPIRED',410);
    const email=normalizeEmail(principal.email);
    if(email!==invitation.email)throw commercialError('INVITATION_EMAIL_MISMATCH',403);
    const account=await provisionAccount({store:tx,principal});
    const membership=await tx.insertMembership({organizationId:invitation.organizationId,userId:account.user.id,role:invitation.role});
    await tx.markInvitationAccepted(invitation.id,{userId:account.user.id,acceptedAt:new Date().toISOString()});
    return{invitation,membership};
  });
}

export async function revokeInvitation({store,actor,invitationId}){
  const invitation=await store.getInvitationById(invitationId);
  if(!invitation)throw commercialError('INVITATION_NOT_FOUND',404);
  await requireOrgRole({store,principal:actor,organizationId:invitation.organizationId,allowedRoles:['OWNER','ADMIN']});
  return store.markInvitationRevoked(invitationId,new Date().toISOString());
}

export async function changeMemberRole({store,actor,organizationId,userId,role}){
  if(!MEMBER_ROLES.has(role))throw commercialError('INVALID_MEMBER_ROLE',400);
  await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER']});
  return store.transaction(async tx=>{
    const memberships=await tx.listMembershipsForUpdate(organizationId);
    const target=memberships.find(x=>x.userId===userId);
    if(!target)throw commercialError('MEMBER_NOT_FOUND',404);
    if(target.role==='OWNER'&&role!=='OWNER'&&memberships.filter(x=>x.role==='OWNER').length<=1)throw commercialError('FINAL_OWNER_REQUIRED',409);
    return tx.updateMembershipRole(organizationId,userId,role);
  });
}

export async function removeMember({store,actor,organizationId,userId}){
  await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER']});
  return store.transaction(async tx=>{
    const memberships=await tx.listMembershipsForUpdate(organizationId);
    const target=memberships.find(x=>x.userId===userId);
    if(!target)throw commercialError('MEMBER_NOT_FOUND',404);
    if(target.role==='OWNER'&&memberships.filter(x=>x.role==='OWNER').length<=1)throw commercialError('FINAL_OWNER_REQUIRED',409);
    await tx.deleteMembership(organizationId,userId);
    return{removed:true};
  });
}
