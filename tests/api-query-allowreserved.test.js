import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOpenApiCandidates,previewOpenApiRequest} from '../src/api-adapter.js';

function discoveryFor(allowReserved){
  return{
    descriptions:[{url:'https://docs.example.test/openapi.json',servers:['https://api.example.test']}],
    operations:[{
      descriptionUrl:'https://docs.example.test/openapi.json',
      method:'GET',path:'/search',operationId:`search_${allowReserved}`,
      servers:['https://api.example.test'],security:[],securityRequirements:[],securitySchemes:[],streamingMedia:[],
      parameters:[{name:'target',in:'query',required:true,style:'form',allowReserved,schema:{type:'string'}}],
      requestBody:null,hasUnresolvedRequiredInputs:false
    }]
  };
}

test('honors OpenAPI allowReserved query serialization without exposing query delimiters',()=>{
  const compiled=compileOpenApiCandidates(discoveryFor(true));
  assert.equal(compiled.rejected.length,0);
  assert.equal(compiled.tools.length,1);
  const preview=previewOpenApiRequest(compiled.tools[0],{query:{target:'https://example.test/a/b?x=1&y=2+3#frag'}});
  assert.equal(preview.url,'https://api.example.test/search?target=https://example.test/a/b?x%3D1%26y%3D2%2B3%23frag');
});

test('preserves existing percent-encoded triples when allowReserved is true',()=>{
  const compiled=compileOpenApiCandidates(discoveryFor(true));
  const preview=previewOpenApiRequest(compiled.tools[0],{query:{target:'a%2Fb/c'}});
  assert.equal(preview.url,'https://api.example.test/search?target=a%2Fb/c');
});

test('retains normal percent encoding when allowReserved is false',()=>{
  const compiled=compileOpenApiCandidates(discoveryFor(false));
  const preview=previewOpenApiRequest(compiled.tools[0],{query:{target:'https://example.test/a/b?x=1'}});
  assert.equal(preview.url,'https://api.example.test/search?target=https%3A%2F%2Fexample.test%2Fa%2Fb%3Fx%3D1');
});