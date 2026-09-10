# KATA Razorpay Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-isolated Razorpay subscription lifecycle whose server-side reconciled state is the only source of paid entitlements.

**Architecture:** KATA billing logic speaks a canonical billing-provider interface and state machine. The Razorpay adapter uses native `fetch`/`node:crypto`; checkout callbacks are informational, while signed raw-body webhooks plus provider reconciliation drive durable subscription state and entitlement snapshots.

**Tech Stack:** Node.js 24 ESM, built-in Fetch/Crypto, PostgreSQL transactions, Razorpay REST API/webhooks, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- The browser never grants paid state.
- Webhook signatures are validated against the exact raw body before JSON parsing.
- Duplicate webhook delivery is idempotent and out-of-order events cannot resurrect a cancelled subscription.
- No card/payment instrument data is stored by KATA.
- Missing live merchant configuration returns `BILLING_NOT_CONFIGURED`; no fake checkout success exists.
- Billing state maps to entitlements only through `lib/commercial/entitlements.js`.
- Existing KATA protocol/security behavior remains unchanged.

---

## File Structure

- `lib/commercial/billing-provider.js` — provider-neutral interface and normalized event shape.
- `lib/commercial/billing-state.js` — canonical state transition/reconciliation rules.
- `lib/commercial/razorpay.js` — signed REST requests, checkout/subscription mapping, raw webhook verification.
- `lib/commercial/billing.js` — organization subscription service and entitlement refresh.
- `netlify/database/migrations/003_billing.sql` — provider account/event/subscription fields and constraints.
- `tests/commercial-billing-state.test.js`
- `tests/commercial-razorpay.test.js`
- `tests/commercial-billing-api.test.js`

### Task 1: Define the canonical billing state machine

**Files:**
- Create: `lib/commercial/billing-provider.js`
- Create: `lib/commercial/billing-state.js`
- Create: `tests/commercial-billing-state.test.js`

**Interfaces:**
- Canonical states: `FREE`, `CHECKOUT_PENDING`, `AUTHENTICATED`, `ACTIVE`, `PAST_DUE`, `HALTED`, `CANCEL_PENDING`, `CANCELLED`, `EXPIRED`, `RECONCILIATION_REQUIRED`.
- `applyBillingEvent(current,event) -> nextStateRecord`.
- `event` shape: `{provider,eventId,eventType,providerCreatedAt,subscriptionId,paymentId?,mappedState,rawDigest}`.

- [ ] **Step 1: Write RED transition tests**

Include tests that `ACTIVE -> CANCELLED` is allowed, a subsequently delivered older `ACTIVE` event cannot reactivate the subscription, ambiguous same-time contradictory events produce `RECONCILIATION_REQUIRED`, and `FREE` cannot become `ACTIVE` from a browser callback object lacking provider evidence.

```js
const cancelled=applyBillingEvent(active,{mappedState:'CANCELLED',providerCreatedAt:200,eventId:'evt-cancel'});
const stale=applyBillingEvent(cancelled,{mappedState:'ACTIVE',providerCreatedAt:100,eventId:'evt-old'});
assert.equal(stale.state,'CANCELLED');
```

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-billing-state.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic transition ordering**

Persist `provider_event_time` and `provider_event_id` on the canonical subscription. Older events are evidence-only. Same-time/state conflicts become reconciliation-required instead of guessing.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-billing-state.test.js
git add lib/commercial/billing-provider.js lib/commercial/billing-state.js tests/commercial-billing-state.test.js
git commit -m "feat: define canonical billing state machine"
```

### Task 2: Add billing persistence and replay constraints

**Files:**
- Create: `netlify/database/migrations/003_billing.sql`
- Create: `tests/commercial-billing-schema.test.js`

**Interfaces:**
- `subscription_accounts` gains provider/customer/subscription identifiers and event ordering fields.
- `billing_events` has unique `(provider,event_id)` and stores event type, timestamps, raw SHA-256 digest, sanitized metadata, processing result.
- Provider identifiers are indexed but never treated as authorization identifiers.

- [ ] **Step 1: Write RED schema assertions**

Assert unique provider event IDs, organization foreign keys, no columns named `card_number`, `cvv`, `payment_secret`, or raw webhook body, and a constrained canonical state enum/check.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-billing-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement migration**

Use immutable provider event rows for ordinary APIs. Store only the SHA-256 digest of the raw payload plus selected non-sensitive provider identifiers/state fields required for reconciliation/audit.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-billing-schema.test.js
git add netlify/database/migrations/003_billing.sql tests/commercial-billing-schema.test.js
git commit -m "feat: add durable billing event schema"
```

### Task 3: Implement the Razorpay provider adapter

**Files:**
- Create: `lib/commercial/razorpay.js`
- Create: `tests/commercial-razorpay.test.js`

**Interfaces:**
- `createRazorpayProvider({keyId,keySecret,webhookSecret,fetchImpl})`.
- `.createSubscription({planExternalId,organizationId,customerNotify})`.
- `.fetchSubscription(subscriptionId)`.
- `.cancelSubscription(subscriptionId,{cancelAtCycleEnd})`.
- `.verifyWebhook({rawBody,signature,eventId}) -> normalizedEvent`.

- [ ] **Step 1: Write RED webhook signature/replay-input tests**

Generate deterministic signatures in the test with:

```js
const signature=createHmac('sha256',secret).update(rawBody).digest('hex');
```

Prove changing one byte of `rawBody` fails verification, missing signature/event ID fails, body over the configured limit fails before parsing, and malformed JSON with a valid HMAC fails without producing a billing event.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-razorpay.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement REST authentication and response limits**

Use Basic auth generated only server-side from `keyId:keySecret`, `redirect:'manual'`, bounded response-body reads, explicit timeout via `AbortSignal.timeout`, and stable provider error mapping. Do not log authorization headers or response bodies containing customer/payment detail.

- [ ] **Step 4: Implement raw webhook verification before parsing**

Accept `Uint8Array`/string raw bytes, compute HMAC-SHA256, validate equal-length hex with `timingSafeEqual`, then parse JSON and normalize only recognized subscription/payment lifecycle event fields.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-razorpay.test.js
git add lib/commercial/razorpay.js tests/commercial-razorpay.test.js
git commit -m "feat: add Razorpay billing adapter"
```

### Task 4: Implement transactional billing service and entitlement refresh

**Files:**
- Create: `lib/commercial/billing.js`
- Create: `tests/commercial-billing-service.test.js`

**Interfaces:**
- `beginCheckout({store,provider,actor,organizationId,planId})`.
- `acceptProviderEvent({store,provider,rawBody,headers})`.
- `reconcileSubscription({store,provider,organizationId})`.
- `cancelSubscription({store,provider,actor,organizationId,cancelAtCycleEnd})`.

- [ ] **Step 1: Write RED transactional tests**

Prove duplicate event ID causes no second entitlement transition/audit event; cancelled state is not resurrected by an older event; ambiguous state invokes reconciliation flag; and a provider `ACTIVE` transition and resulting entitlement snapshot commit in the same KATA database transaction.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-billing-service.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement durable webhook acceptance**

Within one transaction: insert unique provider event evidence, lock the organization's subscription row, apply deterministic transition, create entitlement snapshot, append audit event, commit, then return 2xx. Duplicate unique-key conflict reads prior processing result and returns idempotent success.

- [ ] **Step 4: Implement reconciliation**

`reconcileSubscription` fetches the provider subscription by the already-bound provider ID and replaces ambiguous local state only after validating organization/provider binding. It never accepts a browser-supplied organization/provider mapping.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-billing-service.test.js
git add lib/commercial/billing.js tests/commercial-billing-service.test.js
git commit -m "feat: reconcile subscription state and entitlements"
```

### Task 5: Add billing HTTP contracts

**Files:**
- Modify: `lib/commercial/router.js`
- Modify: `lib/commercial/readiness.js`
- Create: `tests/commercial-billing-api.test.js`

**Interfaces:**
- `POST /api/billing/checkout` OWNER only.
- `GET /api/billing/subscription` OWNER/ADMIN read.
- `POST /api/billing/cancel` OWNER only.
- `POST /api/billing/webhook/razorpay` unauthenticated by user identity but authenticated by provider HMAC.

- [ ] **Step 1: Write RED API tests**

Assert MEMBER cannot initiate/cancel billing; `planId:'team'` does not grant entitlement until provider state is ACTIVE; checkout returns `BILLING_NOT_CONFIGURED` when credentials/plan mapping are absent; webhook route uses `request.arrayBuffer()` exactly once and never uses parsed JSON before signature verification.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-billing-api.test.js`

Expected: FAIL.

- [ ] **Step 3: Wire routes and readiness**

Commercial readiness fields `billingConfigured` and `webhookConfigured` become true only when key ID, secret, webhook secret and required Developer/Team external plan IDs are configured. Test mode and live mode use separate explicit environment settings.

- [ ] **Step 4: Run full plan gate**

```bash
node --test tests/commercial-billing-*.test.js tests/commercial-razorpay.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/router.js lib/commercial/readiness.js tests/commercial-billing-api.test.js
git commit -m "feat: expose guarded subscription billing APIs"
```

## Plan C Completion Gate

Plan C is complete only when paid access cannot be granted by client state, raw-body webhook HMAC verification is mandatory, duplicates/out-of-order delivery are safe, billing transitions and entitlement snapshots are transactional, live checkout fails closed without merchant configuration, no payment instrument data is stored, and the complete KATA release gate remains green.