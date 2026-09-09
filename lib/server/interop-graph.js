const STATUS_RANK={possible:0,setup_required:1,blocked:2,unknown:3,unavailable:4};
const PATH_PRIORITY=['webmcp','server_api','browser_api','user_authorized_browser'];
const PATH_LABELS={webmcp:'Browser WebMCP',server_api:'Documented server API',browser_api:'Documented browser API',user_authorized_browser:'User-authorized browser flow'};

function known(value){return value!=null&&value!=='unknown';}
function evidenceFor(environment){
  return Object.entries(environment).map(([key,value])=>({key,value,known:known(value),confidence:known(value)?1:0.25,source:'reported'}));
}
function makePath(id,status,availability){return{id,label:PATH_LABELS[id],status,availability,requirements:[],constraints:[],evidence:[]};}
function addRequirement(path,code,state,reason){path.requirements.push({code,state,reason});path.evidence.push(code);}
function addConstraint(path,code,state,reason){path.constraints.push({code,state,reason});path.evidence.push(code);}
function worsen(path,status){if(STATUS_RANK[status]>STATUS_RANK[path.status])path.status=status;}
function constrainAvailable(path,status,code,reason){if(path.status==='unavailable')return;worsen(path,status);addConstraint(path,code,status,reason);}
function requireState(path,condition,{pass='possible',fail='blocked',unknown='setup_required',code,reason}){
  if(path.status==='unavailable')return;
  if(condition===true){addRequirement(path,code,pass,reason);return;}
  if(condition===false){worsen(path,fail);addRequirement(path,code,fail,reason);return;}
  worsen(path,unknown);addRequirement(path,code,unknown,reason);
}
function availabilityPath(id,value){
  if(value===true)return makePath(id,'possible','available');
  if(value===false)return makePath(id,'unavailable','unavailable');
  return makePath(id,'unknown','unknown');
}
function applyScopedRestriction(paths,scope,code,{browserStatus='setup_required',serverStatus='setup_required',reason}){
  const browserPaths=['webmcp','browser_api','user_authorized_browser'];
  if(scope==='browser'){
    for(const id of browserPaths)constrainAvailable(paths[id],browserStatus,code,reason);
    return;
  }
  for(const id of browserPaths)constrainAvailable(paths[id],browserStatus,code,reason);
  constrainAvailable(paths.server_api,serverStatus,code,reason);
}
function decision(paths){
  for(const desired of ['possible','setup_required','blocked','unknown']){
    const candidates=PATH_PRIORITY.map(id=>paths[id]).filter(p=>p.status===desired);
    if(candidates.length)return{status:desired==='unknown'?'unknown':desired,primaryPath:candidates[0].id};
  }
  return{status:'unknown',primaryPath:'user_authorized_browser'};
}

export function buildInteropGraph(environment={}){
  const e=environment;
  const paths={
    webmcp:availabilityPath('webmcp',e.webMcpApi==='available'?true:e.webMcpApi==='unavailable'?false:null),
    server_api:availabilityPath('server_api',e.api==='documented'?(e.serverSideApiAvailable===true?true:false):e.api==='unknown'?null:false),
    browser_api:availabilityPath('browser_api',e.api==='documented'?true:e.api==='unknown'?null:false),
    user_authorized_browser:availabilityPath('user_authorized_browser',e.userAuthorizedBrowserFlow===true?true:false)
  };

  if(paths.user_authorized_browser.status==='possible')paths.user_authorized_browser.status='setup_required';

  if(paths.webmcp.status!=='unavailable'){
    requireState(paths.webmcp,e.toolsPermission==='allowed'?true:e.toolsPermission==='blocked'?false:null,{code:'WEBMCP_TOOLS_PERMISSION',reason:'The document must allow the WebMCP tools capability.'});
    if(e.frame==='cross-origin'){
      requireState(paths.webmcp,e.originExposure==='allowed'?true:e.originExposure==='blocked'?false:null,{code:'WEBMCP_ORIGIN_EXPOSURE',reason:'Cross-origin tools require explicit producer exposure to the consuming origin.'});
      requireState(paths.webmcp,e.crossOriginRequest==='requested'?true:e.crossOriginRequest==='not-requested'?false:null,{fail:'setup_required',code:'WEBMCP_FROM_ORIGINS',reason:'Cross-origin discovery requires an explicit consumer fromOrigins request.'});
    }
  }

  if(paths.browser_api.status!=='unavailable'){
    requireState(paths.browser_api,e.cors==='allowed'||e.cors==='not-applicable'?true:e.cors==='blocked'?false:null,{code:'BROWSER_API_CORS',reason:'Browser API calls require a CORS-permitted origin or a same-origin/not-applicable route.'});
    requireState(paths.browser_api,e.cspConnect==='allowed'||e.cspConnect==='not-applicable'?true:e.cspConnect==='blocked'?false:null,{code:'BROWSER_API_CSP_CONNECT',reason:'Browser API calls require connect-src to permit the target.'});
  }

  if(e.terms==='restricted')applyScopedRestriction(paths,e.termsScope,'TERMS_RESTRICTED',{browserStatus:'blocked',serverStatus:'blocked',reason:'The observed service policy restricts this integration path.'});
  if(e.auth==='required')applyScopedRestriction(paths,e.authScope,'AUTH_REQUIRED',{browserStatus:'setup_required',serverStatus:'setup_required',reason:'Authentication must be completed through a supported service flow.'});
  if(e.botProtection==='challenge'||e.botProtection==='blocked'){
    const status=e.userAuthorizedBrowserFlow?'setup_required':'blocked';
    applyScopedRestriction(paths,e.botProtectionScope,'BOT_CHALLENGE',{browserStatus:status,serverStatus:status,reason:'An anti-automation control is active and requires a supported user-authorized browser step or documented integration path.'});
  }
  if(e.rateLimit==='limited')applyScopedRestriction(paths,e.rateLimitScope,'RATE_LIMITED',{browserStatus:'setup_required',serverStatus:'setup_required',reason:'The observed path is rate limited and retry/quota guidance must be honored.'});

  const picked=decision(paths);
  const decisionTrace=PATH_PRIORITY.map(id=>({path:id,status:paths[id].status,availability:paths[id].availability,requirements:paths[id].requirements.map(x=>({code:x.code,state:x.state})),constraints:paths[id].constraints.map(x=>({code:x.code,state:x.state}))}));
  return{paths,evidence:evidenceFor(e),decision:picked,decisionTrace};
}
