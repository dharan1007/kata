import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview,executePageApiRequest} from '../src/api-execution.js';

const REMOTE_HTTP='http://api.example.test';
const bearer={credentialId:'cred-bearer-http',revision:1,origin:REMOTE_HTTP,kind:'bearer-token',schemeName:'BearerAuth',location:null,parameterName:null,scopes:[]};

function bearerCandidate(origin=REMOTE_HTTP){
  return{
    kind:'openapi-candidate',
    name:'secureOperation',
    description:'secure operation',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    execution:{
      mode:'preview-only',
      method:'GET',
      urlTemplate:`${origin}/api/secure`,
      descriptionUrl:`${origin}/openapi.json`,
      security:['BearerAuth'],
      securityRequirements:[[{name:'BearerAuth',scopes:[]}]],
      securitySchemes:[{name:'BearerAuth',type:'http',scheme:'bearer'}],
      requiresAuthorization:true,
      streamingMedia:[]
    }
  };
}

test('brokered API credentials are not preview-executable over remote cleartext HTTP',()=>{
  const preview=buildAuthorizedExecutionPreview(bearerCandidate(),{},REMOTE_HTTP,{credentialInventory:[bearer]});
  assert.equal(preview.authorizationStrategy,'brokered');
  assert.equal(preview.readyToExecute,false);
  assert.equal(preview.blockedReason,'secure_transport_required');
});

test('brokered API credentials fail before secret resolution or fetch on remote cleartext HTTP',async()=>{
  let resolved=false;
  let fetched=false;
  const request={
    method:'GET',
    url:`${REMOTE_HTTP}/api/secure`,
    headers:{},
    body:null,
    credentials:'omit',
    credentialBindings:[{...bearer,transport:'bearer'}],
    redirect:'error',
    cache:'no-store',
    timeoutMs:1000,
    maxResponseBytes:1024
  };
  await assert.rejects(()=>executePageApiRequest(request,{
    location:{origin:REMOTE_HTTP},
    resolveCredential:async binding=>{resolved=true;return{...binding,secret:'must-not-be-resolved'};},
    fetch:async()=>{fetched=true;throw new Error('must not fetch');},
    AbortController,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,performance:{now:()=>1}
  }),/secure transport|https|cleartext/i);
  assert.equal(resolved,false);
  assert.equal(fetched,false);
});
