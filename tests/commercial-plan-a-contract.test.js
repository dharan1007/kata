import test from 'node:test';
import assert from 'node:assert/strict';

test('Plan A test contract participates in the repository test glob',()=>assert.equal('commercial-foundation'.startsWith('commercial'),true));
