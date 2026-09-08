const add=(list,code,reason,remediation)=>list.push({code,reason,remediation});

export function diagnoseWebInterop({intent,environment:e}){
  const blockers=[];
  const hasDocumentedApi=e.api==='documented';
  const canUseServerApi=hasDocumentedApi&&e.serverSideApiAvailable===true;
  const crossOriginFrame=e.frame==='cross-origin';
  let primaryPath=e.webMcpApi==='available'?'webmcp':hasDocumentedApi?(canUseServerApi?'server_api':'browser_api'):'user_authorized_browser';
  let status='possible';
  let webMcpBlocked=false;

  if(e.terms==='restricted'){
    add(blockers,'TERMS_RESTRICTED','The observed site or service policy does not permit the requested integration path.','Use a permitted documented API or integration mechanism, or obtain explicit authorization from the service owner.');
    status='blocked';
  }

  if(e.auth==='required'){
    add(blockers,'AUTH_REQUIRED','The target requires authentication before the requested operation can proceed.','Complete the supported user-authorized authentication flow and retry with the resulting authorized session or documented API credential.');
    if(status!=='blocked')status=e.userAuthorizedBrowserFlow?'setup_required':'blocked';
  }

  if(e.botProtection==='challenge'||e.botProtection==='blocked'){
    add(blockers,'BOT_CHALLENGE','The target is requiring an anti-automation or bot-protection step.','Use the normal user-authorized browser flow or a documented API/integration path supported by the service.');
    if(status!=='blocked')status=e.userAuthorizedBrowserFlow?'setup_required':'blocked';
  }

  if(e.rateLimit==='limited'){
    add(blockers,'RATE_LIMITED','The observed integration path is currently rate limited.','Honor the service retry guidance and rate limits, reduce request volume, or use an approved higher-quota API plan when available.');
    if(status==='possible')status='setup_required';
  }

  if(e.webMcpApi==='available'){
    primaryPath='webmcp';
    if(crossOriginFrame&&e.toolsPermission==='blocked'){
      webMcpBlocked=true;
      add(blockers,'WEBMCP_PERMISSION_POLICY','WebMCP tool registration is disabled in the observed cross-origin frame by the tools Permissions Policy.','Have the embedding origin explicitly delegate the tools capability, for example with iframe allow="tools" or an equivalent Permissions-Policy configuration.');
      if(!hasDocumentedApi&&status!=='blocked')status='blocked';
    }
    if(crossOriginFrame&&e.originExposure==='blocked'){
      webMcpBlocked=true;
      add(blockers,'WEBMCP_ORIGIN_EXPOSURE','The WebMCP producer has not exposed its tools to the requesting cross-origin document.','Configure an explicit secure exposedTo origin on the producer and request cross-origin tools through the browser-supported origin mechanism.');
      if(!hasDocumentedApi&&status!=='blocked')status='blocked';
    }
    if(webMcpBlocked&&hasDocumentedApi)primaryPath=canUseServerApi?'server_api':'browser_api';
  } else if(e.webMcpApi==='unavailable'&&!hasDocumentedApi){
    add(blockers,'NO_SUPPORTED_MACHINE_INTERFACE','No WebMCP producer API or documented service API was observed.','Use a normal user-authorized browser flow, a documented extension integration, or ask the site owner for a supported machine interface.');
    if(status!=='blocked')status=e.userAuthorizedBrowserFlow?'setup_required':'unknown';
  }

  if(hasDocumentedApi){
    if(e.cors==='blocked'){
      add(blockers,'CORS_BLOCKED','The documented API is not callable from the observed browser origin because CORS does not permit it.',canUseServerApi?'Call the documented API from an authorized server-side integration that is not subject to browser CORS, preserving the service authentication and rate-limit contract.':'Ask the API operator to allow the intended origin or use an approved server-side integration path.');
      if(canUseServerApi){primaryPath='server_api';if(status==='possible')status='setup_required';}
      else if(status!=='blocked')status='blocked';
    }
    if(e.cspConnect==='blocked'){
      add(blockers,'CSP_CONNECT_BLOCKED','The page Content Security Policy does not allow the observed browser connection target.',canUseServerApi?'Use the documented API from the authorized server-side integration, or update the application CSP only when you control the deployment and the target is intentionally trusted.':'When you control the application, add the intended trusted endpoint to connect-src; otherwise use a supported service integration path.');
      if(canUseServerApi){primaryPath='server_api';if(status==='possible')status='setup_required';}
      else if(status!=='blocked')status='blocked';
    }
  }

  if(status==='possible'&&['unknown'].includes(e.webMcpApi)&&e.api==='unknown')status='unknown';

  const recommendedAction=primaryPath==='webmcp'
    ?(status==='possible'?'Use the browser WebMCP tool surface with the observed origin and permission boundaries.':'Resolve the reported WebMCP setup requirements through the embedding/producer configuration, then retry.')
    :primaryPath==='server_api'
      ?'Use the documented API from an authorized server-side integration and preserve its authentication, policy, and rate-limit requirements.'
      :primaryPath==='browser_api'
        ?'Use the documented API from the browser only when its CORS, CSP, authentication, and service policy permit the request.'
        :'Continue through a normal user-authorized browser or documented extension flow; do not automate controls the service requires a person to complete.';

  return{status,intent,primaryPath,blockers,recommendedAction,observed:{...e}};
}
