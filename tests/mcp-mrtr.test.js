import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMcpToolInventory,
  buildMcpToolCallPreview,
  fingerprintMcpToolCallPreview,
  executeModernMcpToolCall,
  buildMcpInputContinuationPreview,
  fingerprintMcpInputContinuationPreview,
  executeModernMcpToolContinuation
} from '../src/mcp-adapter.js';

const tool={
  name:'account.delete',
  description:'Delete an account after explicit confirmation',
  inputSchema:{type:'object',properties:{accountId:{type:'string'}},required:['accountId'],additionalProperties:false}
};

const formRequest={
  method:'elicitation/create',
  params:{
    mode:'form',
    message:'Confirm account deletion',
    requestedSchema:{
      type:'object',
      properties:{confirm:{type:'boolean'}},
      required:['confirm']
    }
  }
};

function candidate(){return compileMcpToolInventory([tool]).tools[0];}
function jsonResponse(id,result){return{ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({jsonrpc:'2.0',id,result})};}

test('surfaces a bounded user-mediated continuation when tools/call returns input_required',async()=>{
  const preview=buildMcpToolCallPreview(candidate(),{accountId:'acct-7'},'https://example.com/mcp');
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const fetchImpl=async()=>jsonResponse('kata-mcp-call',{
    resultType:'input_required',
    inputRequests:{confirm:formRequest},
    requestState:'opaque-state-1'
  });
  const result=await executeModernMcpToolCall(preview,fingerprint,{approved:true,expectedFingerprint:fingerprint,fetchImpl});
  assert.equal(result.ok,false);
  assert.equal(result.receipt.inputRequired,true);
  assert.equal(result.receipt.continuationSupported,true);
  assert.equal(result.receipt.automaticRetry,false);
  assert.deepEqual(result.continuation.inputRequestKeys,['confirm']);
  assert.equal(result.continuation.requestState,'opaque-state-1');
  assert.equal(result.continuation.maxRounds,10);
});

test('builds and fingerprints an exact per-round elicitation continuation without accumulating prior answers',async()=>{
  const original=buildMcpToolCallPreview(candidate(),{accountId:'acct-7'},'https://example.com/mcp');
  const originalFingerprint=await fingerprintMcpToolCallPreview(original);
  const required={resultType:'input_required',inputRequests:{confirm:formRequest},requestState:'opaque-state-1'};
  const continuation=buildMcpInputContinuationPreview(original,originalFingerprint,required,{
    confirm:{action:'accept',content:{confirm:true}}
  },{round:1,maxRounds:10});
  assert.equal(continuation.round,1);
  assert.equal(continuation.maxRounds,10);
  assert.equal(continuation.previousPreviewFingerprint,originalFingerprint);
  assert.equal(continuation.requestState,'opaque-state-1');
  assert.deepEqual(continuation.inputResponses,{confirm:{action:'accept',content:{confirm:true}}});
  assert.deepEqual(continuation.inputRequestKeys,['confirm']);
  assert.equal(continuation.automaticRetry,false);
  assert.match(await fingerprintMcpInputContinuationPreview(continuation),/^[a-f0-9]{64}$/);
});

test('reissues the same tools/call with a fresh JSON-RPC id, current-round inputResponses, and byte-exact requestState',async()=>{
  const original=buildMcpToolCallPreview(candidate(),{accountId:'acct-7'},'https://example.com/mcp');
  const originalFingerprint=await fingerprintMcpToolCallPreview(original);
  const required={resultType:'input_required',inputRequests:{confirm:formRequest},requestState:'opaque+/= state'};
  const continuation=buildMcpInputContinuationPreview(original,originalFingerprint,required,{confirm:{action:'accept',content:{confirm:true}}},{round:1});
  const continuationFingerprint=await fingerprintMcpInputContinuationPreview(continuation);
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    return jsonResponse(body.id,{resultType:'complete',content:[{type:'text',text:'deleted'}],isError:false});
  };
  const result=await executeModernMcpToolContinuation(original,continuation,continuationFingerprint,{approved:true,expectedFingerprint:continuationFingerprint,fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.notEqual(calls[0].id,'kata-mcp-call');
  assert.equal(calls[0].method,'tools/call');
  assert.equal(calls[0].params.name,'account.delete');
  assert.deepEqual(calls[0].params.arguments,{accountId:'acct-7'});
  assert.deepEqual(calls[0].params.inputResponses,{confirm:{action:'accept',content:{confirm:true}}});
  assert.equal(calls[0].params.requestState,'opaque+/= state');
  assert.equal(result.receipt.round,1);
  assert.equal(result.receipt.automaticRetry,false);
});

test('fails closed for unsupported MRTR sampling/roots requests instead of fabricating client capabilities',async()=>{
  const original=buildMcpToolCallPreview(candidate(),{accountId:'acct-7'},'https://example.com/mcp');
  const originalFingerprint=await fingerprintMcpToolCallPreview(original);
  for(const request of [
    {method:'sampling/createMessage',params:{messages:[]}},
    {method:'roots/list',params:{}}
  ]){
    const required={resultType:'input_required',inputRequests:{need:request},requestState:'opaque'};
    assert.throws(()=>buildMcpInputContinuationPreview(original,originalFingerprint,required,{need:{}},{round:1}),/unsupported.*input request/i);
  }
});

test('validates form responses, requires exact response keys, and enforces the ten-round cap',async()=>{
  const original=buildMcpToolCallPreview(candidate(),{accountId:'acct-7'},'https://example.com/mcp');
  const originalFingerprint=await fingerprintMcpToolCallPreview(original);
  const required={resultType:'input_required',inputRequests:{confirm:formRequest},requestState:'opaque'};
  assert.throws(()=>buildMcpInputContinuationPreview(original,originalFingerprint,required,{},{}),/missing.*confirm/i);
  assert.throws(()=>buildMcpInputContinuationPreview(original,originalFingerprint,required,{confirm:{action:'accept',content:{confirm:'yes'}}},{}),/elicitation.*schema/i);
  assert.throws(()=>buildMcpInputContinuationPreview(original,originalFingerprint,required,{confirm:{action:'accept',content:{confirm:true}},extra:{action:'accept'}},{}),/unexpected.*extra/i);
  assert.throws(()=>buildMcpInputContinuationPreview(original,originalFingerprint,required,{confirm:{action:'accept',content:{confirm:true}}},{round:11,maxRounds:10}),/round.*limit/i);
  const declined=buildMcpInputContinuationPreview(original,originalFingerprint,required,{confirm:{action:'decline'}},{round:1});
  assert.deepEqual(declined.inputResponses,{confirm:{action:'decline'}});
});
