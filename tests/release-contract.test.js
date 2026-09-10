import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseContract,resolveSourceSha,REQUIRED_DEPLOYMENT_ROUTES} from '../scripts/release-contract.mjs';

const SHA_A='A'.repeat(40);
const SHA_B='B'.repeat(40);

function cleanEvidence(sha){
  return {sourceClean:true,sourceHeadSha:sha};
}

test('release contract binds to GitHub Actions source identity only when the checkout is clean and exact',()=>{
  const contract=createReleaseContract({GITHUB_SHA:SHA_A,GITHUB_REPOSITORY:'dharan1007/kata',GITHUB_REF:'refs/heads/main'},cleanEvidence(SHA_A));
  assert.equal(contract.source.sha,SHA_A.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'github-actions');
  assert.equal(contract.source.repository,'dharan1007/kata');
  assert.equal(contract.source.ref,'refs/heads/main');
  assert.equal(contract.source.verification.clean,true);
  assert.equal(contract.source.verification.headMatches,true);
});

test('release contract binds to Vercel Git identity only when the checkout is clean and exact',()=>{
  const contract=createReleaseContract({VERCEL_GIT_COMMIT_SHA:SHA_B,VERCEL_GIT_REPO_SLUG:'kata',VERCEL_GIT_REPO_OWNER:'dharan1007',VERCEL_GIT_COMMIT_REF:'main'},cleanEvidence(SHA_B));
  assert.equal(contract.source.sha,SHA_B.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'vercel-git');
  assert.equal(contract.source.ref,'main');
  assert.equal(contract.source.verification.clean,true);
  assert.equal(contract.source.verification.headMatches,true);
});

test('dirty GitHub Actions source is never described as source-bound',()=>{
  const contract=createReleaseContract({GITHUB_SHA:SHA_A},{sourceClean:false,sourceHeadSha:SHA_A});
  assert.equal(contract.source.sha,SHA_A.toLowerCase());
  assert.equal(contract.source.provenance,'dirty');
  assert.equal(contract.source.verification.clean,false);
  assert.equal(contract.source.verification.headMatches,true);
});

test('dirty Vercel Git source is never described as source-bound',()=>{
  const contract=createReleaseContract({VERCEL_GIT_COMMIT_SHA:SHA_A},{sourceClean:false,sourceHeadSha:SHA_A});
  assert.equal(contract.source.sha,SHA_A.toLowerCase());
  assert.equal(contract.source.provenance,'dirty');
  assert.equal(contract.source.verification.clean,false);
});

test('provider source identity is unverified when Git cleanliness cannot be determined',()=>{
  const contract=createReleaseContract({GITHUB_SHA:SHA_A},{sourceClean:null,sourceHeadSha:null});
  assert.equal(contract.source.sha,SHA_A.toLowerCase());
  assert.equal(contract.source.provenance,'unverified');
  assert.equal(contract.source.authority,'github-actions');
  assert.equal(contract.source.verification.clean,null);
  assert.equal(contract.source.verification.headMatches,null);
});

test('provider source identity is unverified when advertised SHA does not match checked out HEAD',()=>{
  const contract=createReleaseContract({GITHUB_SHA:SHA_A},cleanEvidence(SHA_B));
  assert.equal(contract.source.sha,SHA_A.toLowerCase());
  assert.equal(contract.source.provenance,'unverified');
  assert.equal(contract.source.verification.clean,true);
  assert.equal(contract.source.verification.headMatches,false);
});

test('manual KATA_SOURCE_SHA is explicit provenance, not provider-bound provenance',()=>{
  const sha='C'.repeat(40);
  const contract=createReleaseContract({KATA_SOURCE_SHA:sha});
  assert.equal(contract.source.sha,sha.toLowerCase());
  assert.equal(contract.source.provenance,'asserted');
  assert.equal(contract.source.authority,'explicit');
});

test('provider source identity outranks a conflicting manual source assertion without overstating proof',()=>{
  const githubSha='D'.repeat(40);
  const assertedSha='E'.repeat(40);
  const contract=createReleaseContract({GITHUB_SHA:githubSha,KATA_SOURCE_SHA:assertedSha},cleanEvidence(githubSha));
  assert.equal(contract.source.sha,githubSha.toLowerCase());
  assert.equal(contract.source.provenance,'source-bound');
  assert.equal(contract.source.authority,'github-actions');
});

test('release contract refuses malformed source identity instead of inventing provenance',()=>{
  assert.equal(resolveSourceSha({GITHUB_SHA:'not-a-sha'}),null);
  const contract=createReleaseContract({GITHUB_SHA:'not-a-sha'});
  assert.equal(contract.source.sha,null);
  assert.equal(contract.source.provenance,'unverified');
  assert.equal(contract.source.authority,'none');
});

test('release contract carries the minimum production interoperability route surface',()=>{
  const routes=new Set(REQUIRED_DEPLOYMENT_ROUTES.map(({method,path})=>`${method} ${path}`));
  for(const route of ['GET /','GET /api/health','GET /api/capabilities','GET /api/agents','GET /api/openapi','POST /api/invoke','POST /api/mcp']){
    assert.ok(routes.has(route),`missing ${route}`);
  }
});

test('release contract requires the deployed provenance and integrity evidence endpoints',()=>{
  const routes=new Set(REQUIRED_DEPLOYMENT_ROUTES.map(({method,path})=>`${method} ${path}`));
  for(const route of ['GET /release.json','GET /integrity.json']){
    assert.ok(routes.has(route),`missing ${route}`);
  }
});

test('release contract cryptographically binds the integrity manifest evidence',()=>{
  const sha256='F'.repeat(64);
  const contract=createReleaseContract({GITHUB_SHA:SHA_A},{...cleanEvidence(SHA_A),integritySha256:sha256,integrityBytes:4096});
  assert.equal(contract.schemaVersion,2);
  assert.deepEqual(contract.evidence.integrity,{
    path:'/integrity.json',
    sha256:sha256.toLowerCase(),
    bytes:4096
  });
});

test('release contract refuses malformed integrity evidence',()=>{
  const contract=createReleaseContract({}, {integritySha256:'not-a-digest',integrityBytes:-1});
  assert.deepEqual(contract.evidence.integrity,{
    path:'/integrity.json',
    sha256:null,
    bytes:null
  });
});
