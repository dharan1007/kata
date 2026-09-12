import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBrowserRuntime} from '../src/runtime-probe.js';

test('runtime probe preserves transitional navigator.modelContext detection inside accessible same-origin iframes',()=>{
  const legacyFrameNavigator={modelContext:{registerTool(){}}};
  const frameDocument={
    URL:'https://app.example.test/legacy-frame',
    documentElement:{localName:'html',children:[],shadowRoot:null},
    querySelectorAll(){return[];}
  };
  const frame={
    localName:'iframe',
    children:[],
    shadowRoot:null,
    contentDocument:frameDocument,
    contentWindow:{navigator:legacyFrameNavigator}
  };
  const document={
    URL:'https://app.example.test/',
    documentElement:{localName:'html',children:[frame],shadowRoot:null},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://app.example.test/',origin:'https://app.example.test'}};
  window.top=window;

  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});

  assert.equal(result.environment.webMcpApi,'unavailable');
  assert.equal(result.runtime.frameContexts.length,1);
  assert.equal(result.runtime.frameContexts[0].url,'https://app.example.test/legacy-frame');
  assert.equal(result.runtime.frameContexts[0].webMcpApi,'available');
});

test('runtime probe keeps inaccessible iframe navigator state opaque',()=>{
  const frame={
    localName:'iframe',
    children:[],
    shadowRoot:null,
    get contentDocument(){throw new Error('cross origin');},
    get contentWindow(){throw new Error('cross origin');}
  };
  const document={
    URL:'https://app.example.test/',
    documentElement:{localName:'html',children:[frame],shadowRoot:null},
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
  const window={location:{href:'https://app.example.test/',origin:'https://app.example.test'}};
  window.top=window;

  const result=inspectBrowserRuntime({document,window,navigator:{},isSecureContext:true});

  assert.equal(result.runtime.dom.iframes,1);
  assert.equal(result.runtime.dom.accessibleFrames,0);
  assert.equal(result.runtime.dom.inaccessibleFrames,1);
  assert.deepEqual(result.runtime.frameContexts,[]);
});
