import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('commercial foundation migration enforces tenant and secret-at-rest invariants',async()=>{
  const sql=await readFile(new URL('../database/migrations/001_commercial_foundation.sql',import.meta.url),'utf8');
  for(const table of ['users','organizations','organization_members','organization_invitations','projects','project_environments','api_keys','audit_events'])assert.match(sql,new RegExp(`create\\s+table\\s+${table}`,'i'));
  assert.match(sql,/unique\s*\(organization_id,\s*user_id\)/i);
  assert.match(sql,/unique\s*\(organization_id,\s*slug\)/i);
  assert.match(sql,/unique\s*\(project_id,\s*name\)/i);
  assert.match(sql,/token_hash/i);
  assert.match(sql,/secret_hash/i);
  assert.match(sql,/check\s*\(role\s+in\s*\('OWNER','ADMIN','MEMBER'\)\)/i);
  assert.doesNotMatch(sql,/\braw_secret\b|\braw_token\b|\bpassword\b/i);
});
