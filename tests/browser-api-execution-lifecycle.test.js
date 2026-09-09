import test from 'node:test';
import assert from 'node:assert/strict';
import {executePageApiRequest} from '../extension/service-worker.js';

const REQUEST={
  method:'POST',
  url:'https://app.test/api/items',
  headers:{'Content-Type':'application/json'},
  body:'{"name":"updated"}',
  credentials:'omit',
  redirect:'error',
  cache:'no-store',
  timeoutMs:250,
  maxResponseBytes:1024
};

test('API execution deadline remains active while a response body is being consumed',async()=>{
  let timeoutCallback=null;
  let signal=null;
  const runtime={
    location:{origin:'https://app.test'},
    AbortController,
    TextEncoder,
    TextDecoder,
    performance:{now:()=>0},
    setTimeout(callback){timeoutCallback=callback;return 1;},
    clearTimeout(){timeoutCallback=null;},
    async fetch(_url,init){
      signal=init.signal;
      return{
        ok:true,
        status:200,
        statusText:'OK',
        url:'https://app.test/api/items',
        headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},
        body:{
          getReader(){return{
            async read(){
              assert.equal(typeof timeoutCallback,'function','deadline was cleared before body consumption finished');
              timeoutCallback();
              throw signal.reason??new Error('aborted');
            },
            async cancel(){},
            releaseLock(){}
          };}
        }
      };
    }
  };

  const result=await executePageApiRequest(REQUEST,runtime);
  assert.equal(result.ok,false);
  assert.equal(result.outcome,'unknown');
  assert.equal(result.networkError,'timeout');
  assert.equal(result.status,200);
});

test('oversized declared responses are cancelled instead of being left to download in the page',async()=>{
  let cancelled=false;
  let aborted=false;
  class TrackingAbortController extends AbortController{
    abort(reason){aborted=true;super.abort(reason);}
  }
  const runtime={
    location:{origin:'https://app.test'},
    AbortController:TrackingAbortController,
    TextEncoder,
    TextDecoder,
    performance:{now:()=>0},
    setTimeout(){return 1;},
    clearTimeout(){},
    async fetch(){return{
      ok:true,
      status:200,
      statusText:'OK',
      url:'https://app.test/api/items',
      headers:{get(name){const key=name.toLowerCase();if(key==='content-type')return'application/json';if(key==='content-length')return'4096';return null;}},
      body:{async cancel(){cancelled=true;}}
    };}
  };

  const result=await executePageApiRequest({...REQUEST,maxResponseBytes:1024},runtime);
  assert.equal(result.ok,true);
  assert.equal(result.outcome,'completed');
  assert.equal(result.truncated,true);
  assert.equal(cancelled,true);
  assert.equal(aborted,true);
});
