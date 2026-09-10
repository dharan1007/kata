import {commercialError} from '../commercial/errors.js';

function normalizeEmail(value){
  return typeof value==='string'?value.trim().toLowerCase():'';
}

export function createNetlifyIdentityAdapter({getUser}={}){
  if(typeof getUser!=='function')throw commercialError('IDENTITY_PROVIDER_NOT_CONFIGURED',503);
  return Object.freeze({
    async getPrincipal(request){
      const user=await getUser(request);
      if(user==null)return null;
      const subject=typeof user.id==='string'?user.id.trim():'';
      if(!subject)throw commercialError('IDENTITY_INVALID',401);
      return Object.freeze({type:'user',subject,email:normalizeEmail(user.email),authn:'identity-session'});
    }
  });
}
