import { createHash } from 'node:crypto';
import { planExecution } from './api-first.js';
import { proveApiEquivalence, recordEquivalence } from './api-equivalence.js';
import { buildLocator, resolveLocator, LOCATOR_ORDER } from './locators.js';
import { collectPositionedValues, inferVariableRecords } from './variables.js';
import { inferBranchesFromDemonstrations, inferBranch } from './branches.js';
import { inferLoops } from './loops.js';

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function capturedBrowserOutcome(evidence) {
  if (!plain(evidence) || evidence.captureVersion !== 1 || evidence.status !== 'captured' ||
      !plain(evidence.source) || evidence.source.kind !== 'BROWSER' || evidence.source.authority !== 'user-authorized' ||
      !Array.isArray(evidence.events) || evidence.events.length === 0 || evidence.eventCount !== evidence.events.length) return null;
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(evidence.events)).digest('hex')}`;
  if (digest !== evidence.digest) return null;
  if (evidence.events.findLast((entry) => entry?.kind === 'outcome-verification')?.outcome?.status !== 'success') return null;
  const event = evidence.events.findLast((entry) => plain(entry?.afterState) && Object.keys(entry.afterState).length > 0);
  return event ? {
    afterState: structuredClone(event.afterState),
    requiresAuth: evidence.events.some((entry) => entry?.kind === 'auth-boundary')
  } : null;
}

export async function compilePipeline({ demonstrations, discoveredApis = [], authorization = {}, sandboxReplay } = {}) {
  if (!Array.isArray(demonstrations) || demonstrations.length < 2) {
    const error = new Error('PIPELINE_DEMO_COUNT_INVALID');
    error.code = 'PIPELINE_DEMO_COUNT_INVALID';
    throw error;
  }

  const stepSequences = demonstrations.map((demo) => demo.steps || demo.actions || []);
  const first = stepSequences[0];

  const positioned = collectPositionedValues(demonstrations);
  const variables = inferVariableRecords(positioned);

  const branchPositions = findDivergentPositions(stepSequences);
  const branches = inferBranchesFromDemonstrations(demonstrations, branchPositions);
  const loops = inferLoops(demonstrations);

  let needsLabel = false;
  for (const branch of branches) {
    if (branch.status === 'NEEDS_LABEL') needsLabel = true;
  }

  const plan = planExecution(first, { discoveredApis, authorization });
  const apiIndex = new Map(discoveredApis.filter((api) => plain(api) && typeof api.operationId === 'string').map((api) => [api.operationId, api]));
  let equivalence = {};
  for (const entry of plan) {
    if (entry.strategy === 'api-first' && entry.api) {
      const api = apiIndex.get(entry.api.operationId);
      const browserOutcome = capturedBrowserOutcome(api?.browserEvidence);
      let proof;
      if (!browserOutcome || typeof api?.executor !== 'function' || !Object.hasOwn(api, 'testInput') || !plain(api.testInput)) {
        proof = { qualified: false, reason: 'Captured browser postconditions, explicit test input, or API executor unavailable.' };
      } else {
        try {
          proof = await proveApiEquivalence({ browserOutcome, apiExecutor: api.executor, testInput: structuredClone(api.testInput), authorization });
        } catch (error) {
          proof = { qualified: false, reason: error?.code || error?.message || 'API equivalence proof failed.' };
        }
      }
      if (proof.qualified) {
        equivalence[entry.nodeId] = recordEquivalence({ nodeId: entry.nodeId, api, proof });
      } else {
        equivalence[entry.nodeId] = { qualified: false, fallback: 'browser-path', reason: proof.reason };
        entry.strategy = 'browser-path';
        delete entry.api;
        entry.browserPathUsed = true;
        entry.reason = proof.reason;
      }
    }
  }

  const locators = first.map((step) => {
    if (step.locator) return buildLocator(step.locator);
    return { priority: [...LOCATOR_ORDER], structural: step.structural || null };
  });

  return {
    variables,
    branches,
    loops,
    needsLabel,
    plan,
    equivalence,
    locators,
    status: needsLabel ? 'NEEDS_LABEL' : 'COMPILED'
  };
}

function findDivergentPositions(sequences) {
  const positions = new Set();
  if (sequences.length < 2) return [];
  const maxLen = Math.max(...sequences.map((s) => s.length));
  for (let pos = 0; pos < maxLen; pos++) {
    const variants = sequences.map((seq) => seq[pos] || null);
    const unique = new Set(variants.map((v) => JSON.stringify(v)));
    if (unique.size > 1) positions.add(pos);
  }
  return [...positions];
}
