import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReleaseTargets } from '../../lib/compiler/qualify-runner.js';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const suite = process.argv[2] || 'kata-qualification';
const manifestPath = join(rootDir, 'benchmarks', 'manifests', `${suite}.json`);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  if (!/^[0-9a-f]{40}$/.test(manifest.benchmarkCommit || '')) {
    console.error(`BENCHMARK_PIN_MISSING: ${suite} benchmarkCommit is not a 40-char SHA. Pin the upstream commit before claiming results (Rule B).`);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = join(rootDir, 'benchmarks', 'results', suite, timestamp);
  await mkdir(join(runDir, 'raw'), { recursive: true });
  const environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    sourceCommit: process.env.GITHUB_SHA || 'local',
    benchmarkCommit: manifest.benchmarkCommit,
    date: new Date().toISOString()
  };
  const metrics = {
    stableApiReplaySuccess: 0,
    browserApiQualificationSuccess: 0,
    humanCorrectionHours: null,
    authoringLaborReduction: 0,
    apiOverheadRatio: null,
    driftAutoRecovery: 0,
    embeddedCredentials: 0,
    unlabeledBranches: 0,
    note: 'No held-out eval has been recorded for this run. Fill metrics from a real sandbox replay; synthetic-only numbers must not support commercial claims (Rule A).'
  };
  const gate = checkReleaseTargets({
    stableApiReplaySuccess: metrics.stableApiReplaySuccess,
    browserApiQualificationSuccess: metrics.browserApiQualificationSuccess,
    humanCorrectionHours: Number.POSITIVE_INFINITY,
    authoringLaborReduction: 0,
    apiOverheadRatio: Number.POSITIVE_INFINITY,
    driftAutoRecovery: 0,
    embeddedCredentials: 0,
    unlabeledBranches: 0
  });
  const comparison = {
    suite,
    baseline: null,
    result: metrics,
    gate: gate.ok ? 'PASS' : 'FAIL',
    failures: gate.failures
  };
  const report = `# ${suite} run ${timestamp}\n\nStatus: ${comparison.gate}\n\n${gate.failures.map((failure) => `- ${failure}`).join('\n') || '- No failures recorded.'}\n\nMethod: ${manifest.method || 'see manifest'}. Held-out discipline required for WebArena/WorkArena claims.\n`;
  const files = {
    'manifest.json': JSON.stringify({ ...manifest, runAt: timestamp, environment }, null, 2),
    'environment.json': JSON.stringify(environment, null, 2),
    'metrics.json': JSON.stringify(metrics, null, 2),
    'failures.json': JSON.stringify(gate.failures, null, 2),
    'comparison.json': JSON.stringify(comparison, null, 2),
    'report.md': report
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(runDir, name), content);
  }
  await writeFile(join(runDir, 'raw', 'README.md'), 'Place raw tool outputs for this run here. Raw outputs are required evidence (Rule C).\n');
  const sums = [];
  for (const name of [...Object.keys(files), 'raw/README.md']) {
    const buffer = await readFile(join(runDir, name));
    sums.push(`${sha256(buffer)}  ${name}`);
  }
  await writeFile(join(runDir, 'sha256sums.txt'), `${sums.join('\n')}\n`);
  console.log(`Benchmark run scaffold written to benchmarks/results/${suite}/${timestamp} gate=${comparison.gate}`);
  if (comparison.gate !== 'PASS') process.exitCode = 1;
}

await main();
