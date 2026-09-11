import {createOidcIdentityAdapter} from './oidc-identity.js';
import {createPostgresCommercialStore} from './postgres-database.js';

export function createVercelCommercialPlatform({userinfoUrl,fetchImpl,pool,getPool}={}){
  const identity=createOidcIdentityAdapter({userinfoUrl,fetchImpl});
  const store=createPostgresCommercialStore({pool,getPool});
  return Object.freeze({
    provider:'vercel',
    identityProvider:'oidc',
    databaseProvider:'postgres',
    identity,
    store
  });
}
