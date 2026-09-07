import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readJsonBody} from '../lib/server/http.js';

test('readJsonBody preserves UTF-8 characters split across stream chunks', async()=>{
  const payload={query:'研究 😀 café',workId:'__proto__😀'};
  const encoded=Buffer.from(JSON.stringify(payload),'utf8');
  const emoji=Buffer.from('😀','utf8');
  const emojiOffset=encoded.indexOf(emoji);
  assert.ok(emojiOffset>=0);

  // Split inside the four-byte UTF-8 sequence to reproduce arbitrary TCP chunking.
  const req=Readable.from([
    encoded.subarray(0,emojiOffset+2),
    encoded.subarray(emojiOffset+2)
  ]);
  req.headers={};

  const parsed=await readJsonBody(req,131072);
  assert.deepEqual(parsed,payload);
});
