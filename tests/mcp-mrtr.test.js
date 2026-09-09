import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcpToolCallPreview,
  buildMcpInputRequiredResumePreview,
  fingerprintMcpToolCallPreview,
  executeModernMcpToolCall,
  executeModernMcpToolResume,
} from '../src/mcp-adapter.js';

const candidate={
  name:'delete.files',
  description:'Delete files after confirmation',
  inputSchema:{
    type:'object',
    properties:{paths:{type:'array',items:{type:'string'},minItems:1,maxItems:10}},
    required:['paths'],
    additionalProperties:false,
  },
  outputSchema:null,
  outputSchemaValidation:'not-declared',
  taskSupport:'forbidden',
  headerMappings:[],
};

const endpoint='https://example.com/mcp';

function response(payload){
  return {
    ok:true,
    status:200,
    headers:{get:()=> 'application/json'},
    body:null,
    text:async()=>JSON.stringify(payload),
  };
}

function inputRequired(id='kata-mcp-call'){
  return response({
    jsonrpc:'2.0',
    id,
    result:{
      resultType:'input_required',
      inputRequests:{
        confirm:{
          method:'elicitation/create',
          params:{
            message:'Delete these files?',
            requestedSchema:{
              type:'object',
              properties:{approved:{type:'boolean'}},
              required:['approved'],
              additionalProperties:false,
            },
          },
        },
      },
      requestState:'opaque.v1.server-state',
    },
  });
}

test('MCP tools/call surfaces input_required without automatically retrying or answering it',async()=>{
  const calls=[];
  const preview=buildMcpToolCallPreview(candidate,{paths:['a.txt']},endpoint,{timeoutMs:5000});
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const result=await executeModernMcpToolCall(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return inputRequired();},
  });
  assert.equal(calls.length,1);
  assert.equal(result.ok,false);
  assert.equal(result.receipt.inputRequired,true);
  assert.equal(result.continuation.round,1);
  assert.equal(result.continuation.requestState,'opaque.v1.server-state');
  assert.deepEqual(Object.keys(result.continuation.inputRequests),['confirm']);
});

test('resume preview validates elicitation responses and rejects unsupported server input request methods',()=>{
  const preview=buildMcpToolCallPreview(candidate,{paths:['a.txt']},endpoint);
  const pending={
    resultType:'input_required',
    inputRequests:{
      confirm:{method:'elicitation/create',params:{message:'Delete?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}},
    },
    requestState:'opaque-state',
  };
  const resumed=buildMcpInputRequiredResumePreview(preview,pending,{confirm:{action:'accept',content:{approved:true}}},{round:1});
  assert.equal(resumed.round,2);
  assert.equal(resumed.requestState,'opaque-state');
  assert.deepEqual(resumed.inputResponses,{confirm:{action:'accept',content:{approved:true}}});
  assert.throws(()=>buildMcpInputRequiredResumePreview(preview,pending,{confirm:{action:'accept',content:{approved:'yes'}}},{round:1}),/Invalid MCP elicitation response/i);
  assert.throws(()=>buildMcpInputRequiredResumePreview(preview,{...pending,inputRequests:{model:{method:'sampling/createMessage',params:{}}}},{model:{result:{}}},{round:1}),/unsupported MCP input request method/i);
});

test('resume execution echoes requestState byte-for-byte and sends only the current round inputResponses',async()=>{
  const initial=buildMcpToolCallPreview(candidate,{paths:['a.txt']},endpoint,{timeoutMs:5000});
  const pending={
    resultType:'input_required',
    inputRequests:{confirm:{method:'elicitation/create',params:{message:'Delete?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}},
    requestState:'opaque-state==with-bytes',
  };
  const resume=buildMcpInputRequiredResumePreview(initial,pending,{confirm:{action:'accept',content:{approved:true}}},{round:1});
  const fingerprint=await fingerprintMcpToolCallPreview(resume);
  const calls=[];
  const result=await executeModernMcpToolResume(resume,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);calls.push(body);
      return response({jsonrpc:'2.0',id:body.id,result:{resultType:'complete',content:[{type:'text',text:'deleted'}],isError:false}});
    },
  });
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'tools/call');
  assert.equal(calls[0].params.name,'delete.files');
  assert.deepEqual(calls[0].params.arguments,{paths:['a.txt']});
  assert.equal(calls[0].params.requestState,'opaque-state==with-bytes');
  assert.deepEqual(calls[0].params.inputResponses,{confirm:{action:'accept',content:{approved:true}}});
});

test('multi-round-trip continuation is bounded and cannot exceed ten resumed rounds',()=>{
  const initial=buildMcpToolCallPreview(candidate,{paths:['a.txt']},endpoint);
  const pending={resultType:'input_required',inputRequests:{confirm:{method:'elicitation/create',params:{message:'Delete?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved']}}}},requestState:'state'};
  assert.throws(()=>buildMcpInputRequiredResumePreview(initial,pending,{confirm:{action:'decline'}},{round:10}),/round limit/i);
});
