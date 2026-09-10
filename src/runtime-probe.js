export function inspectBrowserRuntime(runtime={}){
  function frameRelationship(win){
    if(!win)return'unknown';
    try{if(win.top===win)return'top';}catch{return'cross-origin';}
    try{return win.top?.location?.origin===win.location?.origin?'same-origin':'cross-origin';}catch{return'cross-origin';}
  }
  function toolsPermission(doc){
    const policy=doc?.permissionsPolicy??doc?.featurePolicy;
    if(!policy||typeof policy.allowsFeature!=='function')return'unknown';
    try{return policy.allowsFeature('tools')?'allowed':'blocked';}catch{return'unknown';}
  }
  function frameworkHints(win,doc){
    const hints=[];
    const push=(name,evidence)=>{if(!hints.some(x=>x.name===name))hints.push({name,evidence});};
    try{if(win?.__NEXT_DATA__||doc?.querySelector?.('#__next'))push('Next.js','__NEXT_DATA__ or #__next marker');}catch{}
    try{if(win?.__NUXT__||doc?.querySelector?.('#__nuxt'))push('Nuxt','__NUXT__ or #__nuxt marker');}catch{}
    try{if(doc?.querySelector?.('[ng-version]'))push('Angular','ng-version marker');}catch{}
    try{if(win?.__VUE__||doc?.querySelector?.('[data-v-app]'))push('Vue','Vue runtime or data-v-app marker');}catch{}
    try{if(win?.__REACT_DEVTOOLS_GLOBAL_HOOK__||doc?.querySelector?.('[data-reactroot]'))push('React','React runtime/devtools marker');}catch{}
    try{if(doc?.querySelector?.('[data-sveltekit-preload-data],[data-sveltekit-preload-code]'))push('SvelteKit','SvelteKit preload marker');}catch{}
    return hints;
  }
  function boundedInt(value,fallback,min,max){
    const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;
  }
  function isIframe(node){
    try{return String(node?.localName??node?.tagName??'').toLowerCase()==='iframe';}catch{return false;}
  }
  function domTopology(doc,maxInspectedNodes){
    let openShadowRoots=0,iframes=0,accessibleFrames=0,inaccessibleFrames=0,inspectedNodes=0,truncated=false;
    const queue=[];
    try{if(doc?.documentElement)queue.push(doc.documentElement);}catch{}
    for(let cursor=0;cursor<queue.length&&inspectedNodes<maxInspectedNodes;cursor++){
      const node=queue[cursor];inspectedNodes++;
      if(isIframe(node)){
        iframes++;
        try{
          const root=node.contentDocument?.documentElement;
          if(root){
            accessibleFrames++;
            if(queue.length<maxInspectedNodes)queue.push(root);else truncated=true;
          }else inaccessibleFrames++;
        }catch{inaccessibleFrames++;}
      }
      try{
        if(node.shadowRoot){
          openShadowRoots++;
          if(queue.length<maxInspectedNodes)queue.push(node.shadowRoot);else truncated=true;
        }
      }catch{}
      try{
        for(const child of node.children??[]){
          if(queue.length>=maxInspectedNodes){truncated=true;break;}
          queue.push(child);
        }
      }catch{}
    }
    if(queue.length>inspectedNodes)truncated=true;
    return{openShadowRoots,iframes,accessibleFrames,inaccessibleFrames,inspectedNodes,maxInspectedNodes,truncated};
  }
  function declaredApis(doc){
    const out=[];
    try{
      for(const link of doc?.querySelectorAll?.('link[rel="service-desc"],link[type="application/openapi+json"],link[type="application/vnd.oai.openapi+json"]')??[]){
        const href=link.href||link.getAttribute?.('href');if(href&&!out.includes(href))out.push(href);
      }
    }catch{}
    return out;
  }
  function metaCsp(doc){
    try{return doc?.querySelector?.('meta[http-equiv="Content-Security-Policy" i]')?.content??null;}catch{return null;}
  }
  function baseEnvironment({doc,win,nav}){
    const frame=frameRelationship(win),webMcpApi=(doc?.modelContext?.registerTool||nav?.modelContext?.registerTool)?'available':'unavailable';
    return{
      webMcpApi,
      frame,
      toolsPermission:toolsPermission(doc),
      originExposure:frame==='cross-origin'?'unknown':'not-required',
      crossOriginRequest:frame==='cross-origin'?'unknown':'not-required',
      api:'unknown',auth:'unknown',authScope:'unknown',cors:'unknown',cspConnect:'unknown',rateLimit:'unknown',rateLimitScope:'unknown',botProtection:'unknown',botProtectionScope:'unknown',terms:'unknown',termsScope:'unknown',userAuthorizedBrowserFlow:false,serverSideApiAvailable:false
    };
  }

  const doc=runtime.document??globalThis.document,win=runtime.window??globalThis.window,nav=runtime.navigator??globalThis.navigator;
  const environment=baseEnvironment({doc,win,nav});
  const maxDomNodes=boundedInt(runtime.maxDomNodes,5000,32,20000);
  const topology=domTopology(doc,maxDomNodes),apis=declaredApis(doc),cspMeta=metaCsp(doc);
  if(apis.length)environment.api='documented';
  const observedRuntime={
    url:win?.location?.href??doc?.URL??null,
    origin:win?.location?.origin??null,
    secureContext:typeof runtime.isSecureContext==='boolean'?runtime.isSecureContext:Boolean(globalThis.isSecureContext),
    frameworkHints:frameworkHints(win,doc),
    dom:topology,
    declaredApiDescriptions:apis,
    cspMetaPresent:Boolean(cspMeta),
    cspMeta,
    notes:['A service-desc/OpenAPI link establishes that a machine-readable service description is declared; it does not establish CORS, authentication, policy, quota, reachability, or permission to call that API.','CORS, response-header CSP, authentication, bot protection, rate limits and service terms are intentionally not inferred by this probe.',topology.truncated?`DOM topology inspection stopped after ${topology.inspectedNodes} nodes at the configured safety bound; topology counts are partial evidence.`:'DOM topology inspection completed within the configured safety bound.']
  };
  const evidence=[
    {key:'frame',value:environment.frame,source:'browser-runtime',confidence:1},
    {key:'webMcpApi',value:environment.webMcpApi,source:'browser-runtime',confidence:1},
    {key:'toolsPermission',value:environment.toolsPermission,source:'browser-policy-introspection',confidence:environment.toolsPermission==='unknown'?0.25:1},
    {key:'api',value:environment.api,source:apis.length?'service-description-declaration':'browser-runtime',confidence:apis.length?1:0.25},
    {key:'secureContext',value:observedRuntime.secureContext,source:'browser-runtime',confidence:1},
    {key:'declaredApiDescriptions',value:apis,source:'document-link-declarations',confidence:1},
    {key:'domTopologyCoverage',value:topology.truncated?'partial':'complete',source:'browser-runtime',confidence:1}
  ];
  return{environment,runtime:observedRuntime,evidence};
}
