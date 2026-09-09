import test from 'node:test';
import assert from 'node:assert/strict';
import {listModernMcpTools,buildMcpToolCallPreview} from '../src/mcp-adapter.js';

function hangingResponse(signal){
  return{
    ok:true,
    status:200,
    headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},
    body:{
      getReader(){return{
        read(){
          assert.ok(signal,'MCP transport must create an internal abort signal even when the caller provides none');
          return new Promise((resolve,reject)=>{
            if(signal.aborted){reject(signal.reason??new Error('aborted'));return;}
            signal.addEventListener('abort',()=>reject(signal.reason??new Error('aborted')),{once:true});
          });
        },
        async cancel(){},
        releaseLock(){}
      };}
    }
  };
}

test('MCP tools/list has an internal deadline that remains active through response-body consumption',async()=>{
  let transportSignal=null;
  const fetchImpl=async(_url,init)=>{
    transportSignal=init.signal;
    return hangingResponse(init.signal);
  };
  await assert.rejects(
    ()=>listModernMcpTools('https://mcp.test/mcp',{fetchImpl,timeoutMs:250,maxPages:1,maxTools:10}),
    /timed out/i
  );
  assert.equal(transportSignal?.aborted,true);
});

test('MCP execution previews bind the transport deadline into the approved request contract',()=>{
  const candidate={
    name:'lookup',
    description:'Lookup',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    outputSchema:null,
    outputSchemaValidation:'not-declared',
    taskSupport:'forbidden',
    headerMappings:[]
  };
  const preview=buildMcpToolCallPreview(candidate,{},'https://mcp.test/mcp',{timeoutMs:4321});
  assert.equal(preview.timeoutMs,4321);
});
