import test from 'node:test';
import assert from 'node:assert/strict';
import capabilities from '../api/capabilities.js';
import {toolDefinitions} from '../lib/server/tools.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/capabilities publishes canonical WebMCP parity, runtime/API discovery, MCP inspection and bounded active-tab API execution',async()=>{
  const r=res();await capabilities({method:'GET',headers:{}},r);
  const webmcp=r.body.capabilities.webmcp,interop=r.body.capabilities.interop;
  assert.equal(r.statusCode,200);
  assert.equal(webmcp.entryPoint,'document.modelContext');
  assert.equal(webmcp.canonicalToolParity,true);
  assert.equal(webmcp.canonicalExecutionEndpoint,'/api/invoke');
  assert.deepEqual(webmcp.canonicalTools,toolDefinitions.map(t=>t.name));
  assert.equal(webmcp.browserRuntimeProbe,true);
  assert.equal(webmcp.browserRuntimeProbeTool,'kata_browser_inspect_runtime');
  assert.equal(webmcp.browserApiDiscovery,true);
  assert.equal(webmcp.browserApiDiscoveryTool,'kata_browser_discover_api');
  assert.deepEqual(webmcp.apiDescriptionDiscovery,{sources:['document-service-desc','rfc9727-api-catalog'],openapi:['3.0','3.1','3.2'],formats:['json'],catalogEvidence:['service-desc','item','api-catalog'],executesOperations:false,fetchesApiEndpoints:false,followsNestedCatalogs:false,arbitraryUrlInput:false});
  assert.deepEqual(webmcp.apiAgentAdapters,{tool:'kata_browser_compile_api_tools',source:'standards-discovered-openapi',mode:'preview-only',resolvesLocalComponentRefs:true,fetchesExternalRefs:false,acceptsCredentialArguments:false,executesOperations:false,extensionExecutionAvailable:true,maxTools:100});
  assert.equal(webmcp.browserToolPrefix,'kata_browser_');
  assert.deepEqual(webmcp.browserTools,['kata_browser_inspect_runtime','kata_browser_discover_api','kata_browser_compile_api_tools','kata_browser_search_and_load_research','kata_browser_workspace_summary','kata_browser_list_automations','kata_browser_run_saved_automation','kata_browser_list_learned_tools']);
  assert.equal(interop.decisionModel,'evidence-capability-graph');
  assert.equal(interop.unknownIsAuthorization,false);
  assert.ok(interop.paths.includes('mcp'));
  assert.deepEqual(interop.mcpEndpointInspection,{source:'user-authorized-active-tab',transport:'streamable-http',modernDiscoveryMethod:'server/discover',modernProtocol:'2026-07-28',targetPolicy:'same-origin-https-or-loopback-http',credentials:'omit',redirects:'manual',oauthProtectedResourceMetadata:'same-origin-rfc9728-only',startsOAuth:false,callsTools:false,legacyBehavior:'method-not-found is classified as legacy-candidate; no initialize handshake is performed by the inspector'});
  assert.deepEqual(interop.browserExtension,{mode:'manifest-v3-active-tab',repositoryPath:'extension',builtArtifactPath:'dist/extension',minimumChromeVersion:95,permissions:['activeTab','scripting'],hostPermissions:['https://kata-webmcp.vercel.app/*'],userGestureRequired:true,executionWorld:'MAIN',canonicalProbe:'inspectBrowserRuntime',topFrameOnly:true,supportedIntents:['read','act','automate','expose_webmcp','call_api','connect_mcp'],outboundToKata:['intent','environment'],localOnly:['url','origin','frameworkHints','domTopology','declaredApiDescriptions','compiledApiToolContracts','apiExecutionPreviews','apiExecutionReceipts','mcpEndpoint','mcpServerInfo','mcpAuthorizationMetadata','evidence'],persistentThirdPartyHostAccess:false,apiExecution:{source:'standards-discovered-openapi',mode:'user-authorized-preview-bound',sameOriginOnly:true,executionWorld:'MAIN',rediscoversContractBeforeExecution:true,sha256PreviewBinding:true,credentialModes:['omit','same-origin-browser-managed'],extractsCredentials:false,acceptsCredentialArguments:false,redirects:'error',automaticRetries:false,defaultTimeoutMs:15000,maxTimeoutMs:15000,defaultMaxResponseBytes:1048576,maxResponseBytes:1048576,responseMode:'bounded-snapshot',receipts:'local-only',explicitExecutionApproval:true}});
});
