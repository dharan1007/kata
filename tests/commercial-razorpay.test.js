import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRazorpayProvider} from '../lib/commercial/razorpay.js';

const secret='webhook-secret-for-tests';
const provider=createRazorpayProvider({keyId:'rzp_test_key',keySecret:'server-secret',webhookSecret:secret,fetchImpl:async()=>{throw new Error('network should not be used')}});
const payload={entity:'event',event:'subscription.activated',created_at:1700000000,payload:{subscription:{entity:{id:'sub_1',status:'active',plan_id:'plan_dev'}}}};
const raw=Buffer.from(JSON.stringify(payload));
const signature=createHmac('sha256',secret).update(raw).digest('hex');

test('Razorpay webhook validates raw bytes before parsing and normalizes bounded evidence',()=>{
  const event=provider.verifyWebhook({rawBody:raw,signature,eventId:'evt-1'});
  assert.equal(event.provider,'razorpay');
  assert.equal(event.eventId,'evt-1');
  assert.equal(event.subscriptionId,'sub_1');
  assert.equal(event.mappedState,'ACTIVE');
  assert.match(event.rawDigest,/^[0-9a-f]{64}$/);
  assert.throws(()=>provider.verifyWebhook({rawBody:Buffer.concat([raw,Buffer.from(' ')]),signature,eventId:'evt-2'}),error=>error?.code==='INVALID_WEBHOOK_SIGNATURE');
  assert.throws(()=>provider.verifyWebhook({rawBody:raw,signature:'',eventId:'evt-3'}),error=>error?.code==='INVALID_WEBHOOK_SIGNATURE');
  assert.throws(()=>provider.verifyWebhook({rawBody:raw,signature,eventId:''}),error=>error?.code==='WEBHOOK_EVENT_ID_REQUIRED');
});

test('Razorpay webhook fails closed on validly signed malformed or oversized bodies',()=>{
  const malformed=Buffer.from('{');
  const malformedSig=createHmac('sha256',secret).update(malformed).digest('hex');
  assert.throws(()=>provider.verifyWebhook({rawBody:malformed,signature:malformedSig,eventId:'evt-malformed'}),error=>error?.code==='INVALID_WEBHOOK_JSON');
  const huge=Buffer.alloc(262145,0x61);
  const hugeSig=createHmac('sha256',secret).update(huge).digest('hex');
  assert.throws(()=>provider.verifyWebhook({rawBody:huge,signature:hugeSig,eventId:'evt-huge'}),error=>error?.code==='WEBHOOK_PAYLOAD_TOO_LARGE');
});

test('Razorpay REST adapter keeps credentials server-side and bounds provider transport',async()=>{
  const calls=[];
  const p=createRazorpayProvider({keyId:'kid',keySecret:'ksecret',webhookSecret:secret,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({id:'sub_new',status:'created',short_url:'https://rzp.io/i/test'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  const result=await p.createSubscription({planExternalId:'plan_123',organizationId:'org-1',customerNotify:true});
  assert.equal(result.subscriptionId,'sub_new');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.razorpay.com/v1/subscriptions');
  assert.match(calls[0].options.headers.authorization,/^Basic /);
  assert.equal(calls[0].options.redirect,'manual');
  assert.doesNotMatch(JSON.stringify(result),/ksecret|Basic /);
});
