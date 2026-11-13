const LOCATOR_PRIORITY = Object.freeze([
  'stable-id',
  'role-name',
  'form-label',
  'stable-attributes',
  'relative-selector',
  'text',
  'structural'
]);

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

export function buildLocator(captured) {
  if (!plain(captured)) fail('LOCATOR_CAPTURE_INVALID');
  const locator = { priority: [...LOCATOR_PRIORITY] };
  if (captured.stableId) locator['stable-id'] = captured.stableId;
  if (captured.role) locator['role-name'] = { role: captured.role, name: captured.accessibleName || '' };
  if (captured.formLabel) locator['form-label'] = captured.formLabel;
  if (captured.attributes) locator['stable-attributes'] = { ...captured.attributes };
  if (captured.relativeSelector) locator['relative-selector'] = captured.relativeSelector;
  if (captured.visibleText) locator.text = captured.visibleText.slice(0, 256);
  if (captured.structural) locator.structural = captured.structural;
  return locator;
}

export function resolveLocator(locator, candidates) {
  if (!plain(locator) || !Array.isArray(candidates)) fail('LOCATOR_RESOLVE_INVALID');
  for (const level of LOCATOR_PRIORITY) {
    const expected = locator[level];
    if (expected === undefined) continue;
    const matches = candidates.filter((candidate) => matchesLevel(level, expected, candidate));
    if (matches.length === 1) return { element: matches[0], level, healed: level !== 'stable-id' };
    if (matches.length > 1) {
      return { element: null, level, blocked: true, reason: `Ambiguous locator at ${level}: ${matches.length} elements match; workflow BLOCKED rather than guessing.` };
    }
  }
  return { element: null, level: null, blocked: true, reason: 'No semantic locator level matched; workflow BLOCKED.' };
}

function matchesLevel(level, expected, candidate) {
  if (!plain(candidate)) return false;
  switch (level) {
    case 'stable-id':
      return candidate.stableId !== undefined && candidate.stableId === expected;
    case 'role-name':
      return candidate.role === expected.role && (candidate.accessibleName || '') === (expected.name || '');
    case 'form-label':
      return candidate.formLabel === expected;
    case 'stable-attributes':
      return Object.entries(expected).every(([key, value]) => candidate.attributes?.[key] === value);
    case 'relative-selector':
      return candidate.relativeSelector === expected;
    case 'text':
      return (candidate.visibleText || '').slice(0, 256) === expected;
    case 'structural':
      return candidate.structural === expected;
    default:
      return false;
  }
}

export function healingPolicy() {
  return {
    coordinatesAsExecution: 'never',
    coordinatesAsEvidence: 'debug-only',
    healingRequires: 'semantic-equivalence-proof',
    ambiguous: 'BLOCKED'
  };
}

export const LOCATOR_ORDER = LOCATOR_PRIORITY;
