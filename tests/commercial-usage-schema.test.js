import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('usage migration has durable entitlement quota idempotency and CI token constraints',async()=>{
  const sql=await readFile(new URL('../netlify/database/migrations/002_entitlements_usage.sql',import.meta.url),'utf8');
  for(const table of ['subscription_accounts','entitlement_snapshots','usage_buckets','usage_reservations','usage_events','ci_tokens'])assert.match(sql,new RegExp(`create\\s+table\\s+${table}`,'i'));
  assert.match(sql,/unique\s*\(organization_id,\s*metric,\s*window_start\)/i);
  assert.match(sql,/unique\s*\(organization_id,\s*metric,\s*idempotency_key\)/i);
  assert.match(sql,/check\s*\(status\s+in\s*\('RESERVED','COMMITTED','RELEASED'\)\)/i);
  assert.match(sql,/check\s*\(used_units\s*>=\s*0\)/i);
  assert.match(sql,/check\s*\(reserved_units\s*>=\s*0\)/i);
  assert.match(sql,/secret_hash/i);
  assert.doesNotMatch(sql,/\braw_secret\b|\braw_token\b/i);
});
