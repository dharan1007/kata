import {validateKirProgram} from '../kir/index.js';
import {hashTrace,validateTrace} from '../trace/index.js';
import {alignSemanticSequences} from './alignment.js';
import {inferStep} from './inference.js';

const MIN_DEMOS=2;
const MAX_DEMOS=64;
const MAX_ACTIONS_PER_DEMO=2_000;
const TRUSTED_DEMONSTRATION_AUTHORITIES=new Set(['user-authorized','caller-authorized','contract-derived']);
const EVIDENCE_ERRORS=new Set(['COMPILER_VALUE_TYPE_CONFLICT','COMPILER_VALUE_SHAPE_CONFLICT','COMPILER_OPERATION_CONTRACT_MISSING','COMPILER_OPERATION_CONTRACT_VARIATION']);

function fail(code,detail=''){
  const error=new Error(detail?`${code}: ${detail}`:code);
  error.code=code;
  throw error;
}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function normalizeName(value){const name=String(value??'').trim();if(!name||name.length>256)fail('COMPILER_NAME_INVALID');return name;}
function programId(name){const base=name.toLowerCase().replace(/[^a-z0-9_.:-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,110)||'workflow';return `compiled_${base}`;}
function abstain(reason,extra={}){return {status:'NEED_MORE_EVIDENCE',reason,...extra};}

function actionEvents(trace){
  validateTrace(trace);
  if(!TRUSTED_DEMONSTRATION_AUTHORITIES.has(trace.source.authority))fail('COMPILER_DEMONSTRATION_AUTHORITY_INSUFFICIENT');
  const terminal=trace.events.at(-1);
  if(!terminal||terminal.kind!=='TRACE_COMPLETED')fail('COMPILER_DEMONSTRATION_INCOMPLETE');
  if(terminal.payload.status!=='success')fail('COMPILER_DEMONSTRATION_NOT_SUCCESSFUL');
  const actions=trace.events.filter(event=>event.kind==='ACTION_COMPLETED').map(event=>event.payload?.operation);
  if(!actions.length||actions.length>MAX_ACTIONS_PER_DEMO)fail('COMPILER_ACTION_COUNT_INVALID');
  return actions;
}

function descriptor(trace){
  const actions=actionEvents(trace);
  const sequence=actions.map(operation=>operation?.semanticId);
  if(sequence.some(id=>typeof id!=='string'||!id))fail('COMPILER_OPERATION_CONTRACT_MISSING');
  return {trace,actions,sequence,signature:sequence.join('\u0000'),evidenceSignature:JSON.stringify(stable(actions)),traceHash:hashTrace(trace)};
}

function classifyVariation(columns){
  const changed=columns.filter(column=>column.kind!=='MATCH');
  if(changed.length===1&&(changed[0].kind==='LEFT_ONLY'||changed[0].kind==='RIGHT_ONLY')){
    const column=changed[0];
    return {kind:'OPTIONAL_ACTION',semanticId:column.leftValue??column.rightValue};
  }
  if(changed.length===1&&changed[0].kind==='SUBSTITUTION')return {kind:'ALTERNATIVE_ACTION',left:changed[0].leftValue,right:changed[0].rightValue};
  return {kind:'STRUCTURAL_DIFFERENCE',columns:changed.map(column=>({kind:column.kind,left:column.leftValue,right:column.rightValue}))};
}

function verifyStructure(descriptors){
  const ordered=[...descriptors].sort((a,b)=>a.signature.localeCompare(b.signature)||a.trace.id.localeCompare(b.trace.id));
  const anchor=ordered[0];
  for(let index=1;index<ordered.length;index++){
    const candidate=ordered[index];
    const alignment=alignSemanticSequences(anchor.sequence,candidate.sequence);
    if(alignment.ambiguous)return {ok:false,result:abstain('ALIGNMENT_AMBIGUOUS',{alignment:{left:anchor.sequence,right:candidate.sequence,score:alignment.score}})};
    if(alignment.columns.some(column=>column.kind!=='MATCH'))return {ok:false,result:abstain('STRUCTURAL_VARIATION',{variation:classifyVariation(alignment.columns),alignment:{left:anchor.sequence,right:candidate.sequence,score:alignment.score,columns:alignment.columns}})};
  }
  return {ok:true,ordered};
}

export function compileTraces(name,traces){
  const workflowName=normalizeName(name);
  if(!Array.isArray(traces)||traces.length<MIN_DEMOS||traces.length>MAX_DEMOS)fail('COMPILER_DEMO_COUNT_INVALID');

  let descriptors;
  try{
    descriptors=traces.map(descriptor);
  }catch(error){
    if(error?.code?.startsWith('COMPILER_DEMONSTRATION_'))return abstain(error.code.replace(/^COMPILER_/,''),{detail:error.message});
    throw error;
  }
  const evidenceSignatures=new Set(descriptors.map(item=>item.evidenceSignature));
  if(evidenceSignatures.size!==descriptors.length)return abstain('DUPLICATE_DEMONSTRATION');

  const structure=verifyStructure(descriptors);
  if(!structure.ok)return structure.result;

  const parameters=new Map();
  const nodes=[];
  try{
    for(let index=0;index<structure.ordered[0].actions.length;index++){
      const stepId=`step_${String(index+1).padStart(4,'0')}`;
      nodes.push(inferStep(stepId,structure.ordered.map(item=>item.actions[index]),parameters));
    }
  }catch(error){
    if(EVIDENCE_ERRORS.has(error?.code))return abstain(error.code.replace(/^COMPILER_/,''),{detail:error.message});
    throw error;
  }

  const properties={};
  for(const key of [...parameters.keys()].sort())properties[key]=parameters.get(key);
  const required=Object.keys(properties).sort();
  const edges=nodes.slice(0,-1).map((node,index)=>({from:node.id,to:nodes[index+1].id}));
  const demonstrationHashes=descriptors.map(item=>`sha256:${item.traceHash}`).sort();
  const program={
    irVersion:2,
    id:programId(workflowName),
    name:workflowName,
    description:`KATA compiler v2 consensus program induced from ${traces.length} demonstrations.`,
    inputSchema:{type:'object',properties,required,additionalProperties:false},
    outputSchema:true,
    graph:{entry:[nodes[0].id],nodes,edges},
    invariants:[{kind:'compiler',value:'n-demonstration-consensus'},{kind:'transport',value:'semantic-binding-required'}],
    policies:{failClosed:true},
    metadata:{compiler:'kata-compiler-v2',compilerStage:'n-demo-induction',demonstrationCount:traces.length,demonstrationHashes},
  };
  validateKirProgram(program);
  return {status:'COMPILED',program,evidence:{demonstrationCount:traces.length,actionCount:nodes.length,parameterCount:required.length,transportIndependent:true,demonstrationHashes}};
}

export function compileTracesWithLabels(name, traces) {
  const result = compileTraces(name, traces);
  if (result.status === 'COMPILED' || result.reason !== 'STRUCTURAL_VARIATION') return result;
  const variation = result.variation;
  if (variation?.kind === 'OPTIONAL_ACTION') {
    return {
      status: 'NEEDS_LABEL',
      reason: 'OPTIONAL_STEP_AMBIGUITY',
      hypotheses: [
        { id: 'optional-step', label: 'optional-step', description: `Step ${variation.semanticId} is optional.` },
        { id: 'conditional-branch', label: 'conditional-branch', description: 'Step presence depends on an observable business condition; owner must name it.' },
        { id: 'operator-variance', label: 'operator-variance', description: 'Step is accidental demonstration noise.' }
      ],
      variation,
      detail: 'Owner labeling required before production; refusal preferred over hallucinated logic.'
    };
  }
  if (variation?.kind === 'ALTERNATIVE_ACTION') {
    return {
      status: 'NEEDS_LABEL',
      reason: 'ALTERNATIVE_ACTION_AMBIGUITY',
      hypotheses: [
        { id: 'conditional-branch', label: 'conditional-branch', description: 'Alternative actions depend on an observable condition; owner must name it.' },
        { id: 'operator-variance', label: 'operator-variance', description: 'One alternative is accidental; canonical path keeps the other.' },
        { id: 'version-drift', label: 'version-drift', description: 'Alternatives reflect application versions; pin the supported version.' }
      ],
      variation,
      detail: 'Owner labeling required before production.'
    };
  }
  return result;
}

export {alignSemanticSequences} from './alignment.js';
