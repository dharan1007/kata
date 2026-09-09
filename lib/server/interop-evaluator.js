import {diagnoseWebInterop as legacyDiagnostic} from './interop.js';
import {buildInteropGraph} from './interop-graph.js';

function recommendation(path,status,environment){
  if(path==='webmcp')return status==='possible'
    ?'Use the browser WebMCP tool surface within the positively established permission and origin boundaries.'
    :'Resolve the reported WebMCP permission, origin-discovery, authentication, policy, or quota requirements through supported configuration and then retry.';
  if(path==='server_api')return status==='possible'
    ?'Use the documented API from an authorized server-side integration and preserve its service-supported authentication, policy, and rate-limit contract; browser CORS and connect-src do not authorize or block this server-side path.'
    :'Complete the documented server API setup using a service-supported credential or OAuth flow and honor retry/quota guidance before using the authorized server-side integration.';
  if(path==='browser_api')return status==='possible'
    ?'Use the documented API from the browser only while its CORS, connect-src, authentication, service-policy, and quota requirements remain satisfied.'
    :'Resolve the documented browser API setup requirements without weakening site security controls, or choose another independently supported path.';
  if(environment.userAuthorizedBrowserFlow)return 'Continue through the normal user-authorized browser flow and keep human-required authentication or anti-automation steps intact.';
  return 'No supported path is established from the available evidence. Obtain a documented machine interface or proceed only through a legitimate user-authorized browser/extension flow.';
}

export function diagnoseWebInterop(args){
  const legacy=legacyDiagnostic(args);
  const graph=buildInteropGraph(args.environment);
  const {status,primaryPath}=graph.decision;
  return{
    ...legacy,
    status,
    primaryPath,
    recommendedAction:recommendation(primaryPath,status,args.environment),
    paths:graph.paths,
    evidence:graph.evidence,
    decisionTrace:graph.decisionTrace
  };
}
