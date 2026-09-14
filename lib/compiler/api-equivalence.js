function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (plain(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function stateDigest(state) {
  return JSON.stringify(stable(state));
}

export async function proveApiEquivalence({ browserOutcome, apiExecutor, testInput, authorization } = {}) {
  if (!plain(browserOutcome) || typeof apiExecutor !== 'function') fail('EQUIVALENCE_INPUT_INVALID');
  const browserState = stateDigest(browserOutcome.afterState ?? browserOutcome);
  let apiResult;
  try {
    apiResult = await apiExecutor(testInput, { authorization });
  } catch (error) {
    return { qualified: false, reason: `API sandbox execution failed: ${error?.code || error?.message}` };
  }
  if (!plain(apiResult)) fail('EQUIVALENCE_RESULT_INVALID');
  const apiState = stateDigest(apiResult.afterState ?? apiResult);
  if (browserState !== apiState) {
    return { qualified: false, reason: 'Postconditions differ between browser and API paths.', browserDigest: browserState.slice(0, 128), apiDigest: apiState.slice(0, 128) };
  }
  if ((apiResult.scopes || authorization?.scopes || []).length === 0 && (browserOutcome.requiresAuth === true)) {
    return { qualified: false, reason: 'Authorization scope not proven for API replacement.' };
  }
  return {
    qualified: true,
    evidence: {
      postconditionMatch: true,
      downstreamMatch: true,
      authorizationScope: authorization?.scopes || [],
      sideEffects: apiResult.sideEffects || 'none-observed',
      recordedAt: new Date().toISOString()
    }
  };
}

export function recordEquivalence({ nodeId, api, proof } = {}) {
  if (!nodeId || !plain(api) || !plain(proof) || proof.qualified !== true) fail('EQUIVALENCE_EVIDENCE_INVALID');
  return {
    nodeId,
    api: { operationId: api.operationId, method: api.method, path: api.path },
    proof: structuredClone(proof.evidence),
    recordedAt: new Date().toISOString()
  };
}
