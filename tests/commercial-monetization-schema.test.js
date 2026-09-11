import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const usage=await readFile(new URL('../netlify/database/migrations/002_entitlements_usage.sql',import.meta.url),'utf8');
const billing=await readFile(new URL('../netlify/database/migrations/003_billing.sql',import.meta.url),'utf8');

test('usage schema enforces tenant quota idempotency and hash-only CI credentials',()=>{
  assert.match(usage,/create table if not exists subscription_accounts/i);
  assert.match(usage,/unique\s*\(organization_id,\s*metric,\s*window_start\)/i);
  assert.match(usage,/unique\s*\(organization_id,\s*metric,\s*idempotency_key\)/i);
  assert.match(usage,/check\s*\(state in \('RESERVED','COMMITTED','RELEASED'\)\)/i);
  assert.match(usage,/token_hash/i);
  assert.doesNotMatch(usage,/raw_token|token_secret/i);
});

test('billing schema deduplicates provider events and stores no payment instrument data',()=>{
  assert.match(billing,/create table if not exists billing_events/i);
  assert.match(billing,/unique\s*\(provider,\s*event_id\)/i);
  assert.match(billing,/raw_digest/i);
  assert.match(billing,/RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(billing,/card_number|\bcvv\b|payment_secret|raw_webhook/i);
});
