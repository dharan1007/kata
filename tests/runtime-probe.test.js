import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBrowserRuntime} from '../src/runtime-probe.js';

function makeDocument({permission=true,crossFrame=false,api=true}={}){
  const apiLink={href:'https://example.test/openapi.json',getAttribute:()=>'/openapi.json'};
  const meta={content:"default-src 'self'"};
  const shadowHost={children:[],shadowRoot:{children:[]}};
  const frame=crossFrame?{get contentDocument(){throw new Error('cross origin')}}:{contentDocument:{documentElement:{}}};
  return{
    URL:'https://example.test/app',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(name){return name==='tools'?permission:false;}},
    documentElement:{children:[shadowHost]},
    querySelector(selector){
      if(selector==='#__next')return{};
      if(selector.includes('Content-Security-Policy'))return meta;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='iframe')return[frame];
      if(selector.includes('service-desc'))return api?[apiLink]:[];
      return[];
    }
  };
}

test('runtime probe derives directly observable browser evidence and leaves service controls unknown',()=>{
  const document=makeDocument();
  const window={location:{href:'https://example.test/app',origin:'https://example.test'}};window.top=window;window.__NEXT_DATA__={};
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.frame,'top');
  assert.equal(result.environment.webMcpApi,'available');
  assert.equal(result.environment.toolsPermission,'allowed');
  assert.equal(result.environment.api,'documented');
  assert.equal(result.environment.auth,'unknown');
  assert.equal(result.environment.cors,'unknown');
  assert.equal(result.environment.botProtection,'unknown');
  assert.equal(result.runtime.secureContext,true);
  assert.equal(result.runtime.dom.openShadowRoots,1);
  assert.equal(result.runtime.dom.accessibleFrames,1);
  assert.equal(result.runtime.dom.truncated,false);
  assert.ok(result.runtime.frameworkHints.some(x=>x.name==='Next.js'));
  assert.deepEqual(result.runtime.declaredApiDescriptions,['https://example.test/openapi.json']);
  assert.equal(result.evidence.find(x=>x.key==='api').source,'service-description-declaration');
  assert.equal(result.runtime.cspMetaPresent,true);
});

test('runtime probe does not claim an API when no machine-readable service declaration is observed',()=>{
  const document=makeDocument({api:false});
  const window={location:{href:'https://example.test/app',origin:'https://example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.api,'unknown');
  assert.deepEqual(result.runtime.declaredApiDescriptions,[]);
});

test('runtime probe reports blocked tools policy only when policy introspection establishes denial',()=>{
  const document=makeDocument({permission:false});
  const window={location:{href:'https://example.test/app',origin:'https://example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.toolsPermission,'blocked');
  assert.equal(result.evidence.find(x=>x.key==='toolsPermission').confidence,1);
});

test('runtime probe treats inaccessible parent/frame content as cross-origin evidence without reading it',()=>{
  const document=makeDocument({crossFrame:true});
  const foreignTop={};Object.defineProperty(foreignTop,'location',{get(){throw new Error('denied')}});
  const window={location:{href:'https://embed.test/app',origin:'https://embed.test'},top:foreignTop};
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.frame,'cross-origin');
  assert.equal(result.environment.originExposure,'unknown');
  assert.equal(result.environment.crossOriginRequest,'unknown');
  assert.equal(result.runtime.dom.inaccessibleFrames,1);
});

test('runtime probe does not convert unavailable policy introspection into permission',()=>{
  const document=makeDocument();delete document.permissionsPolicy;
  const window={location:{href:'https://example.test/app',origin:'https://example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.toolsPermission,'unknown');
  assert.equal(result.evidence.find(x=>x.key==='toolsPermission').confidence,0.25);
});

test('runtime probe caps DOM traversal on very large applications and reports truncation',()=>{
  let childReads=0;
  const leaves=Array.from({length:256},()=>({shadowRoot:null,get children(){childReads++;return[];}}));
  const root={shadowRoot:null,get children(){childReads++;return leaves;}};
  const document={
    URL:'https://large.example.test/app',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(){return true;}},
    documentElement:root,
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://large.example.test/app',origin:'https://large.example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true,maxDomNodes:128});
  assert.equal(result.runtime.dom.truncated,true);
  assert.equal(result.runtime.dom.inspectedNodes,128);
  assert.equal(result.runtime.dom.maxInspectedNodes,128);
  assert.ok(childReads<=128);
});
