import { planExecution } from './api-first.js';
import { proveApiEquivalence, recordEquivalence } from './api-equivalence.js';
import { buildLocator, resolveLocator, LOCATOR_PRIORITY } from './locators.js';
import { collectPositionedValues, inferVariableRecords } from './variables.js';
import { inferBranchesFromDemonstrations, inferBranch } from './branches.js';
import { inferLoops } from './loops.js';

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
  let equivalence = {};
  for (const entry of plan) {
    if (entry.strategy === 'api-first' && entry.api) {
      const proof = await proveApiEquivalence({
        browserOutcome: entry.browserEvidence || { afterState: {} },
        apiExecutor: entry.api.executor || (async () => ({})),
        testInput: entry.testInput || {},
        authorization
      });
      if (proof.qualified) {
        equivalence[entry.nodeId] = recordEquivalence({ nodeId: entry.nodeId, api: entry.api, proof });
      } else {
        equivalence[entry.nodeId] = { qualified: false, fallback: 'browser-path', reason: proof.reason };
      }
    }
  }

  const locators = first.map((step) => {
    if (step.locator) return buildLocator(step.locator);
    return { priority: LOCATOR_PRIORITY, structural: step.structural || null };
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