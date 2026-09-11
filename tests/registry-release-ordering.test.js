import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/publish-mcp-registry.yml','utf8');

function workflowStep(name,nextName){
  const start=workflow.indexOf(`      - name: ${name}`);
  assert.notEqual(start,-1,`missing workflow step: ${name}`);
  const end=nextName ? workflow.indexOf(`      - name: ${nextName}`,start+1) : workflow.length;
  assert.notEqual(end,-1,`missing workflow step after ${name}: ${nextName}`);
  return workflow.slice(start,end);
}

test('MCP Registry publication is downstream of verified production deployment',()=>{
  assert.match(workflow,/workflows:\s*\["KATA Production Deploy"\]/);
  assert.doesNotMatch(workflow,/workflows:\s*\["KATA Release Gate"\]/);
  assert.match(workflow,/release\.json/);
  assert.match(workflow,/release\.get\('source', \{\}\)\.get\('sha'\)/);
  assert.match(workflow,/release\.get\('source', \{\}\)\.get\('provenance'\)/);
  assert.match(workflow,/health\.get\('version'\) == server\['version'\]/);
});

test('existing immutable Registry versions are metadata-verified instead of blindly skipped',()=>{
  assert.match(workflow,/Registry entry exists but immutable metadata differs/);
  assert.match(workflow,/immutable_fields = \('name', 'title', 'description', 'version', 'repository', 'remotes'\)/);
  assert.match(workflow,/raise SystemExit\(2\)/);
});

test('Registry network boundaries use bounded all-error retries and remain fail closed',()=>{
  const lookup=workflowStep('Check whether this exact Registry version already exists','Install pinned MCP Registry publisher');
  const download=workflowStep('Install pinned MCP Registry publisher','Authenticate with MCP Registry using GitHub OIDC');

  for(const [label,step] of [['lookup',lookup],['publisher download',download]]){
    assert.match(step,/--retry\s+[1-9][0-9]*/u,`${label} must retry transient transport failures`);
    assert.match(step,/--retry-all-errors/u,`${label} must retry transport errors, not only selected HTTP statuses`);
    assert.match(step,/--retry-max-time\s+[1-9][0-9]*/u,`${label} retry budget must be time bounded`);
  }

  assert.match(lookup,/if\s+!\s+response="\$\(curl[\s\S]*?then/u,'lookup transport exhaustion must be handled explicitly');
  assert.match(lookup,/Registry lookup failed after bounded retry budget/u,'lookup transport exhaustion must fail closed');
});

test('post-publication verification retries transport failures but fails immutable conflicts immediately',()=>{
  const verify=workflowStep('Verify Registry publication');

  assert.match(verify,/for attempt in 1 2 3 4 5 6/u);
  assert.match(verify,/if\s+!\s+response="\$\(curl[\s\S]*?then/u,'transport failure must stay inside the verification retry loop');
  assert.match(verify,/continue/u,'transport failure must consume another bounded attempt instead of terminating under set -e');
  assert.match(verify,/status=\$\?/u,'metadata verification status must be captured explicitly');
  assert.match(verify,/2\)\s+exit\s+"\$status"/u,'immutable metadata conflict must be a hard failure, not an eventual-consistency retry');
});
