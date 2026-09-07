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

function validSha(value){
  const normalized=value?.trim();
  return normalized&&SHA_RE.test(normalized)?normalized.toLowerCase():null;
}

export function resolveSourceIdentity(env=process.env){
  const githubSha=validSha(env.GITHUB_SHA);
  if(githubSha){
    return {
      sha:githubSha,
      provenance:'source-bound',
      authority:'github-actions',
      repository:env.GITHUB_REPOSITORY?.trim()||null,
      ref:env.GITHUB_REF?.trim()||null
    };
  }

  const vercelSha=validSha(env.VERCEL_GIT_COMMIT_SHA);
  if(vercelSha){
    const owner=env.VERCEL_GIT_REPO_OWNER?.trim();
    const slug=env.VERCEL_GIT_REPO_SLUG?.trim();
    return {
      sha:vercelSha,
      provenance:'source-bound',
      authority:'vercel-git',
      repository:owner&&slug?`${owner}/${slug}`:null,
      ref:env.VERCEL_GIT_COMMIT_REF?.trim()||null
    };
  }

  const explicitSha=validSha(env.KATA_SOURCE_SHA);
  if(explicitSha){
    return {
      sha:explicitSha,
      provenance:'asserted',
      authority:'explicit',
      repository:env.GITHUB_REPOSITORY?.trim()||null,
      ref:env.GITHUB_REF?.trim()||env.VERCEL_GIT_COMMIT_REF?.trim()||null
    };
  }

  return {
    sha:null,
    provenance:'unverified',
    authority:'none',
    repository:null,
    ref:null
  };
}

export function resolveSourceSha(env=process.env){
  return resolveSourceIdentity(env).sha;
}

export function createReleaseContract(env=process.env){
  const source=resolveSourceIdentity(env);
  return {
    schemaVersion:1,
    service:'kata-webmcp',
    version:'3.0.0',
    source,
    runtime:{node:'24.x'},
    deployment:{requiredRoutes:REQUIRED_DEPLOYMENT_ROUTES}
  };
}
