import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/publish-mcp-registry.yml',import.meta.url),'utf8');

function stepBody(name){
  const marker=`      - name: ${name}\n`;
  const start=workflow.indexOf(marker);
  assert.notEqual(start,-1,`missing workflow step: ${name}`);
  const next=workflow.indexOf('\n      - name: ',start+marker.length);
  return workflow.slice(start,next===-1?workflow.length:next);
}

test('Registry pre-publication lookup retries transient transport failures without guessing absence',()=>{
  const step=stepBody('Check whether this exact Registry version already exists');
  assert.match(step,/--retry\s+5\b/);
  assert.match(step,/--retry-all-errors\b/);
  assert.match(step,/--retry-delay\s+2\b/);
  assert.match(step,/--retry-max-time\s+120\b/);
  assert.match(step,/--connect-timeout\s+10\b/);
  assert.match(step,/--max-time\s+20\b/);
});

test('Pinned MCP Registry publisher download has bounded transient-failure retries',()=>{
  const step=stepBody('Install pinned MCP Registry publisher');
  assert.match(step,/--retry\s+5\b/);
  assert.match(step,/--retry-all-errors\b/);
  assert.match(step,/--retry-delay\s+2\b/);
  assert.match(step,/--retry-max-time\s+120\b/);
  assert.match(step,/--connect-timeout\s+10\b/);
  assert.match(step,/--max-time\s+60\b/);
  assert.match(step,/sha256sum --check --strict/);
});

test('Registry verification retries transport/not-found states but fails metadata conflicts immediately',()=>{
  const step=stepBody('Verify Registry publication');
  assert.match(step,/if ! response="\$\(curl[\s\S]*?\)"; then[\s\S]*?sleep 5[\s\S]*?continue[\s\S]*?fi/);
  assert.match(step,/case "\$status" in[\s\S]*?0\) exit 0[\s\S]*?1\) sleep 5[\s\S]*?continue[\s\S]*?2\) exit 2/);
});
