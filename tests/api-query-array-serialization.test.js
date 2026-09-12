import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOpenApiCandidates,previewOpenApiRequest} from '../src/api-adapter.js';

function discoveryFor(style,explode){
  return{
    descriptions:[{url:'https://docs.example.test/openapi.json',servers:['https://api.example.test']}],
    operations:[{
      descriptionUrl:'https://docs.example.test/openapi.json',
      method:'GET',path:'/items',operationId:`items_${style}_${explode}`,
      servers:['https://api.example.test'],security:[],securityRequirements:[],securitySchemes:[],streamingMedia:[],
      parameters:[{name:'color',in:'query',required:true,style,explode,schema:{type:'array',items:{type:'string'}}}],
      requestBody:null,hasUnresolvedRequiredInputs:false
    }]
  };
}

test('serializes supported OpenAPI query arrays instead of rejecting executable operations',()=>{
  const cases=[
    ['form',true,'https://api.example.test/items?color=blue&color=black&color=brown'],
    ['form',false,'https://api.example.test/items?color=blue%2Cblack%2Cbrown'],
    ['spaceDelimited',false,'https://api.example.test/items?color=blue%20black%20brown'],
    ['pipeDelimited',false,'https://api.example.test/items?color=blue%7Cblack%7Cbrown']
  ];
  for(const [style,explode,expected] of cases){
    const compiled=compileOpenApiCandidates(discoveryFor(style,explode));
    assert.equal(compiled.rejected.length,0,`${style}/${explode} should compile`);
    assert.equal(compiled.tools.length,1);
    const preview=previewOpenApiRequest(compiled.tools[0],{query:{color:['blue','black','brown']}});
    assert.equal(preview.url,expected);
  }
});

test('keeps undefined query array style combinations fail-closed',()=>{
  const compiled=compileOpenApiCandidates(discoveryFor('spaceDelimited',true));
  assert.equal(compiled.tools.length,0);
  assert.equal(compiled.rejected[0]?.reason,'unsupported_required_input');
});
