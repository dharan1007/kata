import {commercialError} from './errors.js';

export function requireUserPrincipal(principal){
  if(!principal||principal.type!=='user'||typeof principal.subject!=='string'||!principal.subject.trim())throw commercialError('AUTH_REQUIRED',401);
  return principal;
}

function personalSlug(user){
  const safe=String(user.id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'user';
  return `personal-${safe}`;
}

function personalName(principal){
  const local=String(principal.email||'').split('@')[0].trim();
  return local?`${local}'s workspace`:'Personal workspace';
}

export async function provisionAccount({store,principal}){
  requireUserPrincipal(principal);
  if(!store||typeof store.transaction!=='function')throw commercialError('DATABASE_NOT_CONFIGURED',503);
  return store.transaction(async tx=>{
    let user=await tx.getUserBySubject(principal.subject);
    if(!user)user=await tx.insertUser({subject:principal.subject,email:String(principal.email||'').trim().toLowerCase()});
    let personalOrganization=await tx.findPersonalOrganizationForUser(user.id);
    if(!personalOrganization){
      personalOrganization=await tx.insertOrganization({name:personalName(principal),slug:personalSlug(user),kind:'PERSONAL',createdBy:user.id});
      await tx.insertMembership({organizationId:personalOrganization.id,userId:user.id,role:'OWNER'});
    }
    return{user,personalOrganization};
  });
}
