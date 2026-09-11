import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/publish-mcp-registry.yml', 'utf8');

function section(name, nextName) {
  const start = workflow.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = nextName ? workflow.indexOf(`- name: ${nextName}`, start + 1) : workflow.length;
  assert.notEqual(end, -1, `missing following workflow step: ${nextName}`);
  return workflow.slice(start, end);
}

test('registry preflight lookup has a bounded all-error retry budget', () => {
  const text = section(
    'Check whether this exact Registry version already exists',
    'Install pinned MCP Registry publisher'
  );
  assert.match(text, /--retry\s+4/);
  assert.match(text, /--retry-all-errors/);
  assert.match(text, /--retry-delay\s+3/);
  assert.match(text, /--connect-timeout\s+10/);
  assert.match(text, /--max-time\s+20/);
});

test('publisher archive download is resilient to transient transport failures', () => {
  const text = section(
    'Install pinned MCP Registry publisher',
    'Authenticate with MCP Registry using GitHub OIDC'
  );
  assert.match(text, /--retry\s+4/);
  assert.match(text, /--retry-all-errors/);
  assert.match(text, /--retry-delay\s+3/);
  assert.match(text, /--connect-timeout\s+10/);
  assert.match(text, /--max-time\s+60/);
  assert.match(text, /sha256sum --check --strict/);
});

test('post-publication verification handles curl transport failure inside its loop', () => {
  const text = section('Verify Registry publication');
  assert.match(text, /if response="\$\(curl[\s\S]*?\)"; then/);
  assert.match(text, /transport failure on attempt \$attempt/);
  assert.match(text, /status=\$\?/);
  assert.match(text, /if \[\[ "\$status" -eq 2 \]\]; then[\s\S]*?exit 2/);
  assert.match(text, /sleep 5/);
});
