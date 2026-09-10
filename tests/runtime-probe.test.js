import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBrowserRuntime} from '../src/runtime-probe.js';

function makeDocument({permission=true,crossFrame=false,api=true}={}){
  const apiLink={href:'https://example.test/openapi.json',getAttribute:()=>'/openapi.json'};
  const meta={content:"default-src 'self'"};
  const shadowHost={localName:'app-shell',children:[],shadowRoot:{children:[]}};
  const frame=crossFrame?{localName:'iframe',children:[],shadowRoot:null,get contentDocument(){throw new Error('cross origin')}}:{localName:'iframe',children:[],shadowRoot:null,contentDocument:{documentElement:{}}};
  return{
    URL:'https://example.test/app',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(name){return name==='tools'?permission:false;}},
    documentElement:{localName:'html',children:[shadowHost,frame],shadowRoot:null},
    querySelector(selector){
      if(selector==='#__next')return{};
      if(selector.includes('Content-Security-Policy'))return meta;
      return null;
    },
    querySelectorAll(selector){
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
  assert.equal(result.runtime.dom.iframes,1);
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

test('runtime probe discovers iframe boundaries inside observable open shadow roots',()=>{
  const shadowFrame={localName:'iframe',children:[],shadowRoot:null,contentDocument:{documentElement:{}}};
  const shadowRoot={children:[shadowFrame]};
  const shadowHost={localName:'app-shell',children:[],shadowRoot};
  const document={
    URL:'https://components.example.test/app',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(){return true;}},
    documentElement:{localName:'html',children:[shadowHost],shadowRoot:null},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://components.example.test/app',origin:'https://components.example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.runtime.dom.openShadowRoots,1);
  assert.equal(result.runtime.dom.iframes,1);
  assert.equal(result.runtime.dom.accessibleFrames,1);
  assert.equal(result.runtime.dom.inaccessibleFrames,0);
  assert.equal(result.runtime.dom.truncated,false);
});

test('runtime probe traverses accessible iframe documents under the same bounded topology budget',()=>{
  const nestedShadowHost={localName:'nested-shell',children:[],shadowRoot:{children:[]}};
  const nestedFrame={localName:'iframe',children:[],shadowRoot:null,get contentDocument(){throw new Error('cross origin')}};
  const frameDocument={documentElement:{localName:'html',children:[nestedShadowHost,nestedFrame],shadowRoot:null}};
  const frame={localName:'iframe',children:[],shadowRoot:null,contentDocument:frameDocument};
  const document={
    URL:'https://app.example.test/',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(){return true;}},
    documentElement:{localName:'html',children:[frame],shadowRoot:null},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://app.example.test/',origin:'https://app.example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.runtime.dom.iframes,2);
  assert.equal(result.runtime.dom.accessibleFrames,1);
  assert.equal(result.runtime.dom.inaccessibleFrames,1);
  assert.equal(result.runtime.dom.openShadowRoots,1);
  assert.equal(result.runtime.dom.truncated,false);
  assert.equal(result.evidence.find(x=>x.key==='domTopologyCoverage').value,'complete');
});

test('runtime probe reports WebMCP and permissions evidence for accessible iframe documents',()=>{
  const frameApiLink={href:'https://app.example.test/frame-openapi.json',getAttribute:()=>'/frame-openapi.json'};
  const frameDocument={
    URL:'https://app.example.test/microfrontend',
    modelContext:{registerTool(){}},
    permissionsPolicy:{allowsFeature(name){return name==='tools'?false:true;}},
    documentElement:{localName:'html',children:[],shadowRoot:null},
    querySelectorAll(selector){return selector.includes('service-desc')?[frameApiLink]:[];}
  };
  const frame={localName:'iframe',children:[],shadowRoot:null,contentDocument:frameDocument};
  const document={
    URL:'https://app.example.test/',
    permissionsPolicy:{allowsFeature(){return true;}},
    documentElement:{localName:'html',children:[frame],shadowRoot:null},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://app.example.test/',origin:'https://app.example.test'}};window.top=window;
  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});
  assert.equal(result.environment.webMcpApi,'unavailable');
  assert.equal(result.runtime.frameContexts.length,1);
  assert.deepEqual(result.runtime.frameContexts[0],{
    index:1,
    url:'https://app.example.test/microfrontend',
    webMcpApi:'available',
    toolsPermission:'blocked',
    declaredApiDescriptions:['https://app.example.test/frame-openapi.json']
  });
  assert.deepEqual(result.evidence.find(x=>x.key==='accessibleFrameContexts').value,result.runtime.frameContexts);
});
