import { createHash } from 'node:crypto';
import { validateSemanticProgram } from './semantic-kir.js';

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

function programHash(program) {
  return createHash('sha256').update(JSON.stringify(stable(program))).digest('hex');
}

export const COMPILER_TARGETS = Object.freeze([
  'kata-runtime',
  'mcp-tool',
  'openapi-workflow',
  'agent-skill',
  'scheduled-worker'
]);

export function compileToTarget(semanticProgram, target) {
  validateSemanticProgram(semanticProgram);
  if (!COMPILER_TARGETS.includes(target)) fail('COMPILER_TARGET_UNKNOWN', String(target));
  const hash = programHash(semanticProgram);
  switch (target) {
    case 'kata-runtime':
      return {
        target,
        programHash: `sha256:${hash}`,
        nodes: semanticProgram.nodes.map((node) => ({ id: node.id, kind: node.kind })),
        execution: 'kata-runtime-v1'
      };
    case 'mcp-tool':
      return {
        target,
        programHash: `sha256:${hash}`,
        tool: {
          name: `kata_${(semanticProgram.name || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48)}`,
          description: semanticProgram.description || 'KATA compiled workflow exposed as an MCP tool.',
          inputSchema: { type: 'object' }
        },
        transport: 'streamable-http'
      };
    case 'openapi-workflow':
      return {
        target,
        programHash: `sha256:${hash}`,
        openapi: '3.1.0',
        paths: {
          '/api/workflows/execute': {
            post: {
              operationId: 'executeKataWorkflow',
              summary: semanticProgram.name || 'Execute KATA workflow'
            }
          }
        }
      };
    case 'agent-skill':
      return {
        target,
        programHash: `sha256:${hash}`,
        skill: {
          name: (semanticProgram.name || 'kata-workflow').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64),
          version: '1.0.0',
          steps: semanticProgram.nodes.map((node) => `${node.kind}:${node.id}`)
        }
      };
    case 'scheduled-worker':
      return {
        target,
        programHash: `sha256:${hash}`,
        worker: {
          kind: 'scheduled-event-worker',
          triggers: ['schedule', 'event'],
          nodeCount: semanticProgram.nodes.length
        }
      };
    default:
      fail('COMPILER_TARGET_UNKNOWN', String(target));
  }
}

export function compileAllTargets(semanticProgram) {
  const out = {};
  for (const target of COMPILER_TARGETS) out[target] = compileToTarget(semanticProgram, target);
  return out;
}
