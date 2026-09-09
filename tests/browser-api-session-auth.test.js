import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview,fingerprintExecutionPreview,executionRequestFromPreview,executePageApiRequest} from '../src/api-execution.js';

const ORIGIN='https://app.test';
function candidate(requirement,schemes,{method='GET',path='/api/secure'}={}){
  return{
    kind:'openapi-candidate',name:'secureOperation',description:'secure operation',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    execution:{mode:'preview-only',method,urlTemplate:`${ORIGIN}${path}`,descriptionUrl:`${ORIGIN}/openapi.json`,security:requirement.flat().map(item=>item.name),securityRequirements:requirement,securitySchemes:schemes,requiresAuthorization:true,streamingMedia:[]}
  };
}
const apiKey={credentialId:'cred-api',revision:3,origin:ORIGIN,kind:'api-key',schemeName:'ApiKey',location:'header',parameterName:'X-API-Key',scopes:[]};
const queryKey={credentialId:'cred-query',revision:2,origin:ORIGIN,kind:'api-key',schemeName:'QueryKey',location:'query',parameterName:'access_key',scopes:[]};
const bearer={credentialId:'cred-bearer',revision:7,origin:ORIGIN,kind:'bearer-token',schemeName:'BearerAuth',location:null,parameterName:null,scopes:['read','write']};

function response(url){return{ok:true,status:200,statusText:'OK',url,headers:{get(name){if(String(name).toLowerCase()==='content-type')return'application/json';if(String(name).toLowerCase()==='content-length')return'2';return null;}},body:null,async text(){return'{}';}};}

test('header and query API keys become preview-bound executable bindings without exposing secret values',async()=>{
  const headerCandidate=candidate([[{name:'ApiKey',scopes:[]}]], [{name:'ApiKey',type:'apiKey',in:'header',parameterName:'X-API-Key'}]);
  const headerPreview=buildAuthorizedExecutionPreview(headerCandidate,{},ORIGIN,{credentialInventory:[apiKey]});
  assert.equal(headerPreview.readyToExecute,true);
  assert.equal(headerPreview.authorizationStrategy,'brokered');
  assert.equal(headerPreview.credentialMode,'omit');
  assert.deepEqual(headerPreview.credentialBindings,[{...apiKey,transport:'header'}]);
  const queryCandidate=candidate([[{name:'QueryKey',scopes:[]}]], [{name:'QueryKey',type:'apiKey',in:'query',parameterName:'access_key'}]);
  const queryPreview=buildAuthorizedExecutionPreview(queryCandidate,{},ORIGIN,{credentialInventory:[queryKey]});
  assert.equal(queryPreview.readyToExecute,true);
  assert.deepEqual(queryPreview.credentialBindings,[{...queryKey,transport:'query'}]);
  const serialized=JSON.stringify({headerPreview,queryPreview});
  assert.equal(serialized.includes('header-secret-value'),false);
  assert.equal(serialized.includes('query-secret-value'),false);
  assert.match(await fingerprintExecutionPreview(headerPreview),/^[a-f0-9]{64}$/);
});

test('Bearer, OAuth2 and OpenID Connect use explicit bearer-token descriptors and never borrow ambient cookies',()=>{
  for(const scheme of [
    {name:'BearerAuth',type:'http',scheme:'bearer'},
    {name:'BearerAuth',type:'oauth2'},
    {name:'BearerAuth',type:'openIdConnect'}
  ]){
    const c=candidate([[{name:'BearerAuth',scopes:['read']}]], [scheme]);
    const preview=buildAuthorizedExecutionPreview(c,{},ORIGIN,{credentialInventory:[bearer]});
    assert.equal(preview.readyToExecute,true);
    assert.equal(preview.authorizationStrategy,'brokered');
    assert.equal(preview.credentialMode,'omit');
    assert.deepEqual(preview.credentialBindings,[{...bearer,transport:'bearer'}]);
  }
});

test('AND/OR OpenAPI security alternatives require a completely satisfiable requirement and can combine cookie plus brokered auth',()=>{
  const schemes=[
    {name:'SessionCookie',type:'apiKey',in:'cookie',parameterName:'session'},
    {name:'ApiKey',type:'apiKey',in:'header',parameterName:'X-API-Key'},
    {name:'BearerAuth',type:'http',scheme:'bearer'}
  ];
  const c=candidate([
    [{name:'SessionCookie',scopes:[]},{name:'ApiKey',scopes:[]}],
    [{name:'BearerAuth',scopes:['admin']}]
  ],schemes);
  const mixed=buildAuthorizedExecutionPreview(c,{},ORIGIN,{credentialInventory:[apiKey]});
  assert.equal(mixed.readyToExecute,true);
  assert.equal(mixed.authorizationStrategy,'browser-cookie+brokered');
  assert.equal(mixed.credentialMode,'same-origin');
  assert.deepEqual(mixed.selectedSecurityRequirement,[{name:'SessionCookie',scopes:[]},{name:'ApiKey',scopes:[]}]);
  const missing=buildAuthorizedExecutionPreview(c,{},ORIGIN,{credentialInventory:[]});
  assert.equal(missing.readyToExecute,false);
  assert.equal(missing.blockedReason,'authorization_setup_required');
});

test('execution request carries only redacted credential bindings and final dispatch injects secrets through the trusted resolver',async()=>{
  const c=candidate([[{name:'BearerAuth',scopes:['read']}]], [{name:'BearerAuth',type:'http',scheme:'bearer'}]);
  const preview=buildAuthorizedExecutionPreview(c,{},ORIGIN,{credentialInventory:[bearer]});
  const request=executionRequestFromPreview(preview);
  assert.deepEqual(request.credentialBindings,[{...bearer,transport:'bearer'}]);
  assert.equal(JSON.stringify(request).includes('bearer-secret-value'),false);
  let seen=null;
  const runtime={
    location:{origin:ORIGIN},
    resolveCredential:async binding=>({...binding,secret:'bearer-secret-value'}),
    fetch:async(url,init)=>{seen={url,init};return response(url);},
    AbortController,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,performance:{now:()=>1}
  };
  const result=await executePageApiRequest(request,runtime);
  assert.equal(result.ok,true);
  assert.equal(seen.init.headers.Authorization,'Bearer bearer-secret-value');
  assert.equal(seen.init.credentials,'omit');
  assert.equal(JSON.stringify(result).includes('bearer-secret-value'),false);
});

test('query-key injection never leaks the secret in returned URL and stale credential resolution stops before fetch',async()=>{
  const c=candidate([[{name:'QueryKey',scopes:[]}]], [{name:'QueryKey',type:'apiKey',in:'query',parameterName:'access_key'}]);
  const preview=buildAuthorizedExecutionPreview(c,{},ORIGIN,{credentialInventory:[queryKey]});
  const request=executionRequestFromPreview(preview);
  let seenUrl=null;
  const runtime={location:{origin:ORIGIN},resolveCredential:async binding=>({...binding,secret:'query-secret-value'}),fetch:async(url)=>{seenUrl=url;return response(url);},AbortController,TextEncoder,TextDecoder,Uint8Array,setTimeout,clearTimeout,performance:{now:()=>1}};
  const result=await executePageApiRequest(request,runtime);
  assert.match(seenUrl,/access_key=query-secret-value/);
  assert.equal(result.url.includes('query-secret-value'),false);
  let fetched=false;
  await assert.rejects(()=>executePageApiRequest(request,{...runtime,resolveCredential:async()=>{throw new Error('Credential revision is stale.');},fetch:async()=>{fetched=true;throw new Error('must not run');}}),/revision.*stale/i);
  assert.equal(fetched,false);
});