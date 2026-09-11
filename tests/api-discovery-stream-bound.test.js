import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';

test('bounds chunked OpenAPI responses while streaming instead of buffering the whole body',async()=>{
  const encoder=new TextEncoder();
  const chunk=encoder.encode('x'.repeat(1100*1024));
  let pulls=0;
  let cancelled=false;
  const body=new ReadableStream({
    pull(controller){
      pulls+=1;
      controller.enqueue(chunk);
      if(pulls>=3)controller.close();
    },
    cancel(){cancelled=true;}
  });
  const fetch=async()=>({
    ok:true,
    status:200,
    url:'https://app.test/openapi.json',
    headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},
    body,
    async text(){throw new Error('response.text() would buffer the complete unbounded body');}
  });

  const result=await discoverBrowserApis({
    declaredApiDescriptions:['https://app.test/openapi.json'],
    includeWellKnownCatalog:false
  },{origin:'https://app.test',fetch});

  assert.equal(result.descriptions.length,0);
  assert.equal(result.resources[0].status,'too_large');
  assert.ok(pulls<=2,'reader should stop once the byte limit is crossed');
  assert.equal(cancelled,true,'reader should cancel the remaining response body');
});
