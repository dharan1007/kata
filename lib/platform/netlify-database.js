import {createPostgresCommercialStore} from './postgres-database.js';

export function createNetlifyDatabaseStore({pool}={}){
  return createPostgresCommercialStore({pool});
}

export {createPostgresCommercialStore};
