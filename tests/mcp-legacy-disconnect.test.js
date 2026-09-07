import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import mcp from '../api/mcp.js';

const MCP_ACCEPT='application/json, text/event-stream';
function res(){return{statusCode:200,headers:{},body:null,writableEnded:false,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;this.writableEnded=true;return this;},end(v){this.body=v;this.writableEnded=true;return this;}};}

test('/api/mcp does not treat a legacy Streamable HTTP disconnect as request cancellation',async()=>{
  const previousFetch=globalThis.fetch;
  let observedSignal;
  globalThis.fetch=async(_url,{signal})=>new Promise(resolve=>{
    observedSignal=signal;
    setTimeout(()=>resolve({ok:true,status:200,headers:new Headers(),json:async()=>({results:[]})}),30);
  });
  const r=Object.assign(new EventEmitter(),res());
  const request={method:'POST',headers:{accept:MCP_ACCEPT,'content-type':'application/json','mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:17,method:'tools/call',params:{name:'kata_search_research',arguments:{query:'legacy disconnect semantics'}}}};
  try{
    setTimeout(()=>r.emit('close'),5);
    await mcp(request,r);
    assert.equal(observedSignal?.aborted,false);
    assert.equal(r.statusCode,200);
  }finally{globalThis.fetch=previousFetch;}
});
