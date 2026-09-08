import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/publish-mcp-registry.yml','utf8');

test('MCP Registry publication is downstream of verified production deployment',()=>{
  assert.match(workflow,/workflows:\s*\["KATA Production Deploy"\]/);
  assert.doesNotMatch(workflow,/workflows:\s*\["KATA Release Gate"\]/);
  assert.match(workflow,/release\.json/);
  assert.match(workflow,/source\?\.sha/);
  assert.match(workflow,/source\?\.provenance/);
});

test('existing immutable Registry versions are metadata-verified instead of blindly skipped',()=>{
  assert.match(workflow,/Registry entry exists but immutable metadata differs/);
  assert.match(workflow,/description/);
  assert.match(workflow,/repository/);
  assert.match(workflow,/remotes/);
});
