export const REQUIRED_DEPLOYMENT_ROUTES=Object.freeze([
  Object.freeze({method:'GET',path:'/',purpose:'application shell'}),
  Object.freeze({method:'GET',path:'/api/health',purpose:'service health'}),
  Object.freeze({method:'GET',path:'/api/capabilities',purpose:'canonical interoperability capabilities'}),
  Object.freeze({method:'GET',path:'/api/agents',purpose:'agent bridge schemas'}),
  Object.freeze({method:'GET',path:'/api/openapi',purpose:'HTTP API contract'}),
  Object.freeze({method:'POST',path:'/api/invoke',purpose:'canonical tool invocation'}),
  Object.freeze({method:'POST',path:'/api/mcp',purpose:'MCP Streamable HTTP transport'})
]);

const SHA_RE=/^[0-9a-f]{40}$/i;

export function resolveSourceSha(env=process.env){
  for(const key of ['KATA_SOURCE_SHA','GITHUB_SHA','VERCEL_GIT_COMMIT_SHA']){
    const value=env[key]?.trim();
    if(value&&SHA_RE.test(value))return value.toLowerCase();
  }
  return null;
}

export function createReleaseContract(env=process.env){
  const sha=resolveSourceSha(env);
  return {
    schemaVersion:1,
    service:'kata-webmcp',
    version:'3.0.0',
    source:{
      sha,
      repository:env.GITHUB_REPOSITORY?.trim()||null,
      ref:env.GITHUB_REF?.trim()||env.VERCEL_GIT_COMMIT_REF?.trim()||null,
      provenance:sha?'source-bound':'unverified'
    },
    runtime:{node:'24.x'},
    deployment:{requiredRoutes:REQUIRED_DEPLOYMENT_ROUTES}
  };
}
