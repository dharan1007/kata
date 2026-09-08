import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');

test('developer console discovers selectable tools from canonical capabilities instead of a fixed list',()=>{
  assert.match(appSource,/request\('\/api\/capabilities'\)/);
  assert.match(appSource,/developerTools\s*=\s*data\.capabilities\.tools/);
  assert.match(appSource,/developerTools\.map/);
  assert.doesNotMatch(appSource,/<option>kata_search_research<\/option><option>kata_plan_triage<\/option><option>kata_compile_workflow<\/option>/);
});
