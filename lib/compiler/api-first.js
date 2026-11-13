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

const BROWSER_ONLY_HINTS = [
  'captcha',
  'bot-challenge',
  'paywall',
  'canvas-only',
  'webrtc-required',
  'ui-only'
];

export function planExecution(nodes, { discoveredApis = [], authorization = {} } = {}) {
  if (!Array.isArray(nodes)) throw Object.assign(new Error('PLAN_NODES_INVALID'), { code: 'PLAN_NODES_INVALID' });
  const apiIndex = new Map();
  for (const api of discoveredApis) {
    if (plain(api) && typeof api.operationId === 'string') apiIndex.set(api.operationId, api);
  }
  return nodes.map((node) => {
    const candidate = selectApiForNode(node, apiIndex, authorization);
    if (candidate) {
      return {
        nodeId: node.id,
        strategy: 'api-first',
        api: { operationId: candidate.operationId, method: candidate.method, path: candidate.path },
        reason: 'Authorized stable API reproduces the demonstrated browser outcome; API path preferred for speed and reliability.',
        browserPathUsed: false
      };
    }
    return {
      nodeId: node.id,
      strategy: 'browser-path',
      reason: browserPathReason(node),
      browserPathUsed: true
    };
  });
}

function selectApiForNode(node, apiIndex, authorization) {
  const hinted = node?.provenance?.apiOperationId || node?.spec?.apiOperationId;
  if (typeof hinted === 'string' && apiIndex.has(hinted)) {
    const api = apiIndex.get(hinted);
    if (isAuthorized(api, authorization)) return api;
    return null;
  }
  for (const api of apiIndex.values()) {
    if (typeof api.semanticId === 'string' && api.semanticId === node?.spec?.target?.name && isAuthorized(api, authorization)) {
      return api;
    }
  }
  return null;
}

function isAuthorized(api, authorization) {
  if (api.requiresScope && Array.isArray(authorization.scopes)) {
    return authorization.scopes.includes(api.requiresScope);
  }
  if (api.requiresScope) return false;
  return true;
}

function browserPathReason(node) {
  const hints = node?.provenance?.browserOnlyHints || [];
  if (hints.some((hint) => BROWSER_ONLY_HINTS.includes(hint))) {
    return 'No stable API reproduces this UI-only outcome; browser path retained with preview-bound approval.';
  }
  return 'No authorized stable API discovered for this step; browser path retained. Supply an API contract or authorization to prefer the API path.';
}

export function summarizePlan(plan) {
  const apiFirst = plan.filter((entry) => entry.strategy === 'api-first').length;
  return {
    total: plan.length,
    apiFirst,
    browserPath: plan.length - apiFirst,
    apiFirstRatio: plan.length ? apiFirst / plan.length : 0,
    plan: stable(plan)
  };
}
