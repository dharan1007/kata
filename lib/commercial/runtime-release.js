const SHA_RE=/^[0-9a-f]{40}$/i;
export function runtimeReleaseEvidence(env=process.env){
  const sha=typeof env.VERCEL_GIT_COMMIT_SHA==='string'&&SHA_RE.test(env.VERCEL_GIT_COMMIT_SHA.trim())?env.VERCEL_GIT_COMMIT_SHA.trim().toLowerCase():null;
  const owner=String(env.VERCEL_GIT_REPO_OWNER||'').trim();
  const slug=String(env.VERCEL_GIT_REPO_SLUG||'').trim();
  const ref=String(env.VERCEL_GIT_COMMIT_REF||'').trim();
  const sourceBound=env.VERCEL==='1'&&Boolean(sha)&&owner==='dharan1007'&&slug==='kata'&&ref==='main';
  return Object.freeze({releaseSha:sha,sourceBound,authority:sourceBound?'vercel-git':'unverified',repository:owner&&slug?`${owner}/${slug}`:null,ref:ref||null});
}
