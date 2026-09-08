const add=(list,code,reason,remediation)=>list.push({code,reason,remediation});

export function diagnoseWebInterop({intent,environment:e}){
  const blockers=[];
  const hasDocumentedApi=e.api==='documented';
  const canUseServerApi=hasDocumentedApi&&e.serverSideApiAvailable===true;
  const crossOriginFrame=e.frame==='cross-origin';
  const browserAuthRequired=e.auth==='required'&&e.authScope==='browser';
  const browserBotScoped=(e.botProtection==='challenge'||e.botProtection==='blocked')&&e.botProtectionScope==='browser';
  const browserRateLimited=e.rateLimit==='limited'&&e.rateLimitScope==='browser';
  const browserTermsRestricted=e.terms==='restricted'&&e.termsScope==='browser';
  const browserPathConstrained=(browserAuthRequired||browserBotScoped||browserRateLimited||browserTermsRestricted)&&canUseServerApi;
  let primaryPath=e.webMcpApi==='available'?'webmcp':hasDocumentedApi?(canUseServerApi?'server_api':'browser_api'):'user_authorized_browser';
  let status='possible';
  let webMcpBlocked=false;

  if(e.terms==='restricted'){
    add(blockers,'TERMS_RESTRICTED','The observed site or service policy does not permit the requested integration path.',browserTermsRestricted&&canUseServerApi?'Keep the restricted browser path unused and use only the service-supported documented server API when that API is explicitly permitted by the service policy.':'Use a permitted documented API or integration mechanism, or obtain explicit authorization from the service owner.');
    if(browserTermsRestricted&&canUseServerApi){
      primaryPath='server_api';
    }else{
      status='blocked';
    }
  }

  if(e.auth==='required'){
    add(blockers,'AUTH_REQUIRED','The observed path requires authentication before the requested operation can proceed.',browserAuthRequired&&canUseServerApi?'Complete authentication for the browser path when you need that path. For approved automation, use the independently supported documented server API with its own service-supported authentication requirements.':'Complete the service-supported authentication flow. For documented APIs, use an approved API credential or OAuth flow; for browser-only access, use the normal user-authorized sign-in flow.');
    if(browserAuthRequired&&canUseServerApi){
      primaryPath='server_api';
    }else if(status!=='blocked'){
      status=(hasDocumentedApi||e.userAuthorizedBrowserFlow)?'setup_required':'blocked';
    }
  }

  if(e.botProtection==='challenge'||e.botProtection==='blocked'){
    add(blockers,'BOT_CHALLENGE','The observed path is requiring an anti-automation or bot-protection step.',browserBotScoped&&canUseServerApi?'Keep the browser challenge in place and use only the service-supported documented server API for approved automation; do not automate or defeat the challenge.':'Use the normal user-authorized browser flow or a documented API/integration path supported by the service.');
    if(browserBotScoped&&canUseServerApi){
      primaryPath='server_api';
    }else if(status!=='blocked'){
      status=e.userAuthorizedBrowserFlow?'setup_required':'blocked';
    }
  }

  if(e.rateLimit==='limited'){
    add(blockers,'RATE_LIMITED','The observed integration path is currently rate limited.',browserRateLimited&&canUseServerApi?'Honor Retry-After and the browser-path quota. If the documented server API has a separate supported quota, use that authorized server-side integration without evading either limit.':'Honor the service retry guidance and rate limits, reduce request volume, or use an approved higher-quota API plan when available.');
    if(browserRateLimited&&canUseServerApi){
      primaryPath='server_api';
    }else if(status==='possible')status='setup_required';
  }

  if(e.webMcpApi==='available'){
    if(!browserPathConstrained)primaryPath='webmcp';
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
    const documentedApiIsPrimary=primaryPath==='browser_api'||primaryPath==='server_api';
    if(e.cors==='blocked'){
      add(blockers,'CORS_BLOCKED','The documented API is not callable from the observed browser origin because CORS does not permit it.',canUseServerApi?'Call the documented API from an authorized server-side integration that is not subject to browser CORS, preserving the service authentication and rate-limit contract.':'Ask the API operator to allow the intended origin or use an approved server-side integration path.');
      if(documentedApiIsPrimary){
        if(canUseServerApi)primaryPath='server_api';
        else if(status!=='blocked')status='blocked';
      }
    }
    if(e.cspConnect==='blocked'){
      add(blockers,'CSP_CONNECT_BLOCKED','The page Content Security Policy does not allow the observed browser connection target.',canUseServerApi?'Use the documented API from the authorized server-side integration, or update the application CSP only when you control the deployment and the target is intentionally trusted.':'When you control the application, add the intended trusted endpoint to connect-src; otherwise use a supported service integration path.');
      if(documentedApiIsPrimary){
        if(canUseServerApi)primaryPath='server_api';
        else if(status!=='blocked')status='blocked';
      }
    }
  }

  if(status==='possible'&&['unknown'].includes(e.webMcpApi)&&e.api==='unknown')status='unknown';

  const recommendedAction=primaryPath==='webmcp'
    ?(status==='possible'?'Use the browser WebMCP tool surface with the observed origin and permission boundaries.':'Resolve the reported WebMCP setup requirements through the embedding/producer configuration, then retry.')
    :primaryPath==='server_api'
      ?(e.auth==='required'&&!browserAuthRequired?'Complete the documented API authentication setup using the service-supported credential or OAuth flow, then use the authorized server-side integration while preserving policy and rate-limit requirements.':'Use the documented API from an authorized server-side integration and preserve its authentication, policy, and rate-limit requirements.')
      :primaryPath==='browser_api'
        ?'Use the documented API from the browser only when its CORS, CSP, authentication, and service policy permit the request.'
        :'Continue through a normal user-authorized browser or documented extension flow; do not automate controls the service requires a person to complete.';

  return{status,intent,primaryPath,blockers,recommendedAction,observed:{...e}};
}
