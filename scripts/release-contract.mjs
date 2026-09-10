export const REQUIRED_DEPLOYMENT_ROUTES=Object.freeze([
  Object.freeze({method:'GET',path:'/',purpose:'application shell'}),
  Object.freeze({method:'GET',path:'/release.json',purpose:'deployed source provenance and promotion contract'}),
  Object.freeze({method:'GET',path:'/integrity.json',purpose:'deployed static asset integrity manifest'}),
  Object.freeze({method:'GET',path:'/api/health',purpose:'service health'}),
  Object.freeze({method:'GET',path:'/api/capabilities',purpose:'canonical interoperability capabilities'}),
  Object.freeze({method:'GET',path:'/api/agents',purpose:'agent bridge schemas'}),
  Object.freeze({method:'GET',path:'/api/openapi',purpose:'HTTP API contract'}),
  Object.freeze({method:'POST',path:'/api/invoke',purpose:'canonical tool invocation'}),
  Object.freeze({method:'POST',path:'/api/mcp',purpose:'MCP Streamable HTTP transport'})
]);

const SHA_RE=/^[0-9a-f]{40}$/i;
const SHA256_RE=/^[0-9a-f]{64}$/i;

function validSha(value){
  const normalized=value?.trim();
  return normalized&&SHA_RE.test(normalized)?normalized.toLowerCase():null;
}

function validSha256(value){
  const normalized=value?.trim();
  return normalized&&SHA256_RE.test(normalized)?normalized.toLowerCase():null;
}

function verificationFor(advertisedSha,evidence={}){
  const clean=evidence.sourceClean===true?true:evidence.sourceClean===false?false:null;
  const headSha=validSha(evidence.sourceHeadSha);
  const headMatches=headSha?headSha===advertisedSha:null;
  return {clean,headSha,headMatches};
}

function providerProvenance(verification){
  if(verification.clean===false)return 'dirty';
  if(verification.clean===true&&verification.headMatches===true)return 'source-bound';
  return 'unverified';
}

export function resolveSourceIdentity(env=process.env,evidence={}){
  const githubSha=validSha(env.GITHUB_SHA);
  if(githubSha){
    const verification=verificationFor(githubSha,evidence);
    return {
      sha:githubSha,
      provenance:providerProvenance(verification),
      authority:'github-actions',
      repository:env.GITHUB_REPOSITORY?.trim()||null,
      ref:env.GITHUB_REF?.trim()||null,
      verification
    };
  }

  const vercelSha=validSha(env.VERCEL_GIT_COMMIT_SHA);
  if(vercelSha){
    const owner=env.VERCEL_GIT_REPO_OWNER?.trim();
    const slug=env.VERCEL_GIT_REPO_SLUG?.trim();
    const verification=verificationFor(vercelSha,evidence);
    return {
      sha:vercelSha,
      provenance:providerProvenance(verification),
      authority:'vercel-git',
      repository:owner&&slug?`${owner}/${slug}`:null,
      ref:env.VERCEL_GIT_COMMIT_REF?.trim()||null,
      verification
    };
  }

  const explicitSha=validSha(env.KATA_SOURCE_SHA);
  if(explicitSha){
    return {
      sha:explicitSha,
      provenance:'asserted',
      authority:'explicit',
      repository:env.GITHUB_REPOSITORY?.trim()||null,
      ref:env.GITHUB_REF?.trim()||env.VERCEL_GIT_COMMIT_REF?.trim()||null,
      verification:verificationFor(explicitSha,evidence)
    };
  }

  return {
    sha:null,
    provenance:'unverified',
    authority:'none',
    repository:null,
    ref:null,
    verification:{clean:null,headSha:null,headMatches:null}
  };
}

export function resolveSourceSha(env=process.env){
  return resolveSourceIdentity(env).sha;
}

export function createReleaseContract(env=process.env,evidence={}){
  const source=resolveSourceIdentity(env,evidence);
  const integritySha256=validSha256(evidence.integritySha256);
  const integrityBytes=Number.isSafeInteger(evidence.integrityBytes)&&evidence.integrityBytes>0?evidence.integrityBytes:null;
  return {
    schemaVersion:2,
    service:'kata-webmcp',
    version:'3.0.0',
    source,
    runtime:{node:'24.x'},
    evidence:{
      integrity:{
        path:'/integrity.json',
        sha256:integritySha256,
        bytes:integrityBytes
      }
    },
    deployment:{requiredRoutes:REQUIRED_DEPLOYMENT_ROUTES}
  };
}
