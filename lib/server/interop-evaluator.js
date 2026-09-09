import {diagnoseWebInterop as legacyDiagnostic} from './interop.js';
import {buildInteropGraph} from './interop-graph.js';

function recommendation(path,status,environment){
  if(path==='mcp'){
    if(status==='possible')return 'Use the positively established remote MCP endpoint with the discovered protocol contract; preserve its authentication, policy, and quota boundaries.';
    if(environment.mcpEndpoint==='protected')return environment.mcpAuthMetadata==='available'
      ?'Complete the service-supported MCP authorization flow using the discovered protected-resource metadata. KATA has not started OAuth or obtained a token.'
      :'Keep the endpoint protected and obtain valid same-origin protected-resource metadata or service documentation before starting authorization.';
    if(environment.mcpEndpoint==='legacy-candidate')return 'Use an MCP client that supports the legacy initialize handshake and negotiate a supported pre-2026 protocol version before invoking any capability.';
    return 'Inspect a documented, user-authorized MCP endpoint first. Do not assume an arbitrary HTTP endpoint is MCP-compatible.';
  }
  if(path==='webmcp')return status==='possible'?'Use the browser WebMCP tool surface within the positively established permission and origin boundaries.':'Resolve the reported WebMCP permission, origin-discovery, authentication, policy, or quota requirements through supported configuration and then retry.';
  if(path==='server_api')return status==='possible'?'Use the documented API from an authorized server-side integration and preserve its service-supported authentication, policy, and rate-limit contract; browser CORS and connect-src do not authorize or block this server-side path.':'Complete the documented server API setup using a service-supported credential or OAuth flow and honor retry/quota guidance before using the authorized server-side integration.';
  if(path==='browser_api')return status==='possible'?'Use the documented API from the browser only while its CORS, connect-src, authentication, service-policy, and quota requirements remain satisfied.':'Resolve the documented browser API setup requirements without weakening site security controls, or choose another independently supported path.';
  if(environment.userAuthorizedBrowserFlow)return 'Continue through the normal user-authorized browser flow and keep human-required authentication or anti-automation steps intact.';
  return 'No supported path is established from the available evidence. Obtain a documented machine interface or proceed only through a legitimate user-authorized browser/extension flow.';
}

function mcpBlockers(path){
  const blockers=[];
  for(const req of path.requirements){
    if(req.state==='possible')continue;
    if(req.code==='MCP_AUTH_REQUIRED')blockers.push({code:'MCP_AUTH_REQUIRED',reason:req.reason,remediation:'Complete the MCP server’s supported authorization flow. Do not inject, extract, reuse, or bypass credentials outside that flow.'});
    else if(req.code==='MCP_AUTH_METADATA')blockers.push({code:'MCP_AUTH_METADATA_UNVERIFIED',reason:req.reason,remediation:'Use same-origin RFC 9728 protected-resource metadata or service documentation before beginning authorization; do not follow untrusted metadata targets.'});
    else if(req.code==='MCP_LEGACY_NEGOTIATION')blockers.push({code:'MCP_LEGACY_NEGOTIATION_REQUIRED',reason:req.reason,remediation:'Use a compatible MCP client to perform the normal initialize handshake and negotiate a supported legacy version.'});
    else if(req.code==='MCP_MODERN_PROTOCOL')blockers.push({code:'MCP_MODERN_PROTOCOL_UNVERIFIED',reason:req.reason,remediation:'Use server/discover to establish modern support or a compatible legacy handshake; do not label the endpoint 2026-07-28 capable without evidence.'});
  }
  return blockers;
}

export function diagnoseWebInterop(args){
  const graph=buildInteropGraph(args.environment,args.intent);
  const {status,primaryPath}=graph.decision;
  const legacy=args.intent==='connect_mcp'?{intent:args.intent,blockers:[],observed:{...args.environment}}:legacyDiagnostic(args);
  const blockers=args.intent==='connect_mcp'?mcpBlockers(graph.paths.mcp):legacy.blockers;
  if(args.intent==='connect_mcp'&&graph.paths.mcp.status==='unknown')blockers.push({code:'MCP_ENDPOINT_UNVERIFIED',reason:'No MCP endpoint compatibility evidence has been established.',remediation:'Use the user-authorized MCP endpoint inspector against an HTTPS same-origin endpoint, or a loopback HTTP development endpoint.'});
  return{...legacy,status,primaryPath,blockers,recommendedAction:recommendation(primaryPath,status,args.environment),paths:graph.paths,evidence:graph.evidence,decisionTrace:graph.decisionTrace};
}
