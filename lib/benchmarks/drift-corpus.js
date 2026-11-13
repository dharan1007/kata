import { detectDrift, dispositionForDrift } from '../compiler/drift.js';

export function driftBenchmark(pairs) {
  if (!Array.isArray(pairs)) {
    const error = new Error('DRIFT_CORPUS_INVALID');
    error.code = 'DRIFT_CORPUS_INVALID';
    throw error;
  }
  let detected = 0;
  let falseAlarms = 0;
  let repaired = 0;
  let badRepairs = 0;
  let requalified = 0;
  const details = [];
  for (const pair of pairs) {
    const findings = detectDrift({ baseline: pair.baseline || {}, observed: pair.observed || {} });
    const disposition = dispositionForDrift(findings);
    const hadDrift = pair.hadDrift === true;
    if (hadDrift && findings.length > 0) detected++;
    if (!hadDrift && findings.length > 0) falseAlarms++;
    if (disposition.action === 'repair-and-requalify' && pair.repairSucceeds === true) repaired++;
    if (disposition.action === 'repair-and-requalify' && pair.repairSucceeds === false && findings.length > 0) badRepairs++;
    if (pair.requalified === true) requalified++;
    details.push({ id: pair.id, findings: findings.length, disposition: disposition.action });
  }
  const recall = pairs.filter((pair) => pair.hadDrift).length
    ? detected / pairs.filter((pair) => pair.hadDrift).length
    : 1;
  return { total: pairs.length, detected, falseAlarms, repaired, badRepairs, requalified, recall, details };
}
