function finding(code, detail = {}) {
  return { code, ...detail };
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const INJECTION = /(ignore previous|system prompt|exfiltrate|send .* to http|fetch\(|XMLHttpRequest)/i;

export function adversarialCampaign({ tenantCheck, scopeCheck, workflowFetch, kirVerify, qualificationVerify, urlPolicy } = {}) {
  const findings = [];
  if (typeof tenantCheck === 'function') {
    const probe = tenantCheck({ tenant: 'A', target: 'B' });
    if (probe?.allowed === true) findings.push(finding('TENANT_ESCAPE', { probe }));
  }
  if (typeof scopeCheck === 'function') {
    const probe = scopeCheck({ scope: 'read', operation: 'write' });
    if (probe?.allowed === true) findings.push(finding('SCOPE_VIOLATION', { probe }));
  }
  if (typeof workflowFetch === 'function') {
    const guessed = workflowFetch({ id: 'workflow-guessable-1' });
    if (guessed?.allowed === true) findings.push(finding('WORKFLOW_ID_GUESSING', {}));
  }
  if (typeof kirVerify === 'function') {
    if (kirVerify({ tampered: true })?.ok === true) findings.push(finding('TAMPERED_KIR_ACCEPTED', {}));
  }
  if (typeof qualificationVerify === 'function') {
    if (qualificationVerify({ tampered: true })?.ok === true) findings.push(finding('TAMPERED_QUALIFICATION_ACCEPTED', {}));
  }
  if (typeof urlPolicy === 'function') {
    for (const url of ['http://169.254.169.254/', 'http://localhost-admin/', 'https://evil.example/redirect?to=internal']) {
      if (urlPolicy({ url })?.allowed === true) findings.push(finding('SSRF_OR_OPEN_REDIRECT', { url }));
    }
  }
  return findings;
}

export function inspectUntrustedContent({ text = '', response = null } = {}) {
  const findings = [];
  if (INJECTION.test(text)) findings.push(finding('PROMPT_INJECTION_PATTERN', {}));
  if (plain(response) && typeof response.toolCall === 'string' && INJECTION.test(response.toolCall)) {
    findings.push(finding('TOOL_MANIPULATION_PATTERN', {}));
  }
  return findings;
}

export function replayGuard({ seen = new Set(), requestId, workflowVersion, pinnedVersion } = {}) {
  if (seen.has(requestId)) return { allowed: false, reason: 'replayed-request' };
  if (workflowVersion !== pinnedVersion) return { allowed: false, reason: 'stale-workflow-version' };
  seen.add(requestId);
  return { allowed: true };
}
