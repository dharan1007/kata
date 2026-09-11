import {pathToFileURL} from 'node:url';

const REPOSITORY='dharan1007/kata';
const EXPECTED_OWNER='dharan1007';
const EXPECTED_SLUG='kata';
const REQUIRED_WORKFLOWS=Object.freeze(['KATA Release Gate','CodeQL']);
const SHA_RE=/^[0-9a-f]{40}$/i;
const API_ROOT=`https://api.github.com/repos/${REPOSITORY}`;

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function decision(proceed,reason,details={}){return Object.freeze({proceed,reason,...details});}

function apiHeaders(){
  return Object.freeze({
    accept:'application/vnd.github+json',
    'user-agent':'kata-vercel-prebuild-gate',
    'x-github-api-version':'2022-11-28'
  });
}

async function fetchJson(fetchImpl,url){
  let response;
  try{
    response=await fetchImpl(url,{method:'GET',headers:apiHeaders(),redirect:'error',signal:AbortSignal.timeout(10_000)});
  }catch(error){
    const wrapped=new Error('GitHub API request failed');
    wrapped.cause=error;
    throw wrapped;
  }
  if(!response?.ok){
    const error=new Error(`GitHub API returned HTTP ${response?.status??'unknown'}`);
    error.status=response?.status??0;
    throw error;
  }
  try{return await response.json();}catch(error){
    const wrapped=new Error('GitHub API returned invalid JSON');
    wrapped.cause=error;
    throw wrapped;
  }
}

function productionIdentity(env){
  const ref=String(env.VERCEL_GIT_COMMIT_REF||'').trim();
  if(ref!=='main')return{scope:'other'};

  const target=String(env.VERCEL_TARGET_ENV||env.VERCEL_ENV||'').trim();
  const sha=String(env.VERCEL_GIT_COMMIT_SHA||'').trim().toLowerCase();
  const owner=String(env.VERCEL_GIT_REPO_OWNER||'').trim();
  const slug=String(env.VERCEL_GIT_REPO_SLUG||'').trim();

  if(target!=='production'||!SHA_RE.test(sha)||owner!==EXPECTED_OWNER||slug!==EXPECTED_SLUG)return{scope:'invalid'};
  return{scope:'production-main',sha};
}

async function currentMainSha(fetchImpl){
  const payload=await fetchJson(fetchImpl,`${API_ROOT}/branches/main`);
  const sha=payload?.commit?.sha;
  return typeof sha==='string'&&SHA_RE.test(sha)?sha.toLowerCase():null;
}

function requiredRunState(payload,sha){
  const runs=Array.isArray(payload?.workflow_runs)?payload.workflow_runs:[];
  const exact=runs.filter(run=>
    run?.event==='push'&&
    run?.head_branch==='main'&&
    String(run?.head_sha||'').toLowerCase()===sha
  );

  const states={};
  for(const name of REQUIRED_WORKFLOWS){
    const matching=exact.filter(run=>run?.name===name).sort((a,b)=>(b?.run_number??0)-(a?.run_number??0));
    const run=matching[0]??null;
    states[name]=run?{status:run.status??null,conclusion:run.conclusion??null}:null;
  }
  return states;
}

function classify(states){
  let allSuccessful=true;
  for(const name of REQUIRED_WORKFLOWS){
    const run=states[name];
    if(!run){allSuccessful=false;continue;}
    if(run.status==='completed'&&run.conclusion!=='success')return'failed';
    if(run.status!=='completed'||run.conclusion!=='success')allSuccessful=false;
  }
  return allSuccessful?'success':'pending';
}

function terminalApiFailure(error){return error?.status===403||error?.status===429;}

export async function decideVercelBuild({
  env=process.env,
  fetchImpl=globalThis.fetch,
  sleepImpl=sleep,
  maxAttempts=20,
  pollMs=30_000
}={}){
  const identity=productionIdentity(env);
  if(identity.scope==='other')return decision(true,'not_production_main');
  if(identity.scope!=='production-main'||typeof fetchImpl!=='function')return decision(false,'invalid_deployment_identity');

  const sha=identity.sha;
  try{
    if(await currentMainSha(fetchImpl)!==sha)return decision(false,'stale_main');
  }catch{return decision(false,'github_unavailable');}

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    let payload;
    try{
      const url=`${API_ROOT}/actions/runs?event=push&head_sha=${encodeURIComponent(sha)}&per_page=100`;
      payload=await fetchJson(fetchImpl,url);
    }catch(error){
      if(terminalApiFailure(error)||attempt===maxAttempts)return decision(false,'github_unavailable',{attempt});
      await sleepImpl(pollMs);
      continue;
    }

    const state=classify(requiredRunState(payload,sha));
    if(state==='failed')return decision(false,'required_check_failed',{attempt});
    if(state==='success'){
      try{
        if(await currentMainSha(fetchImpl)!==sha)return decision(false,'stale_main',{attempt});
      }catch{return decision(false,'github_unavailable',{attempt});}
      return decision(true,'verified',{attempt});
    }

    if(attempt<maxAttempts)await sleepImpl(pollMs);
  }
  return decision(false,'required_checks_timeout',{attempt:maxAttempts});
}

async function main(){
  let result;
  try{result=await decideVercelBuild();}
  catch{result=decision(false,'gate_internal_error');}
  console.log(`[KATA Vercel gate] ${result.proceed?'PROCEED':'SKIP'}: ${result.reason}${result.attempt?` (attempt ${result.attempt})`:''}`);
  // Vercel Ignored Build Step semantics are intentionally inverted:
  // exit 0 skips/cancels the deployment; exit 1 proceeds with the build.
  process.exit(result.proceed?1:0);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
