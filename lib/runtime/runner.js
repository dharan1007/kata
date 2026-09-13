import {hashKirProgram} from '../kir/index.js';
import {verifyKirProgram} from '../verifier/index.js';
import {assertSchema,validateSchema} from '../shared/schema.js';

const WRITE_EFFECTS=new Set(['IDEMPOTENT_WRITE','CONDITIONALLY_IDEMPOTENT_WRITE','REVERSIBLE_WRITE','NON_IDEMPOTENT_WRITE','DESTRUCTIVE_WRITE','IRREVERSIBLE_EXTERNAL_EFFECT']);
const MAX_STEP_LIMIT=10000;

function fail(code,detail=''){const error=new Error(detail?`${code}: ${detail}`:code);error.code=code;throw error;}
function now(clock){const value=clock();if(typeof value!=='string'||Number.isNaN(Date.parse(value)))fail('RUNTIME_CLOCK_INVALID');return value;}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function canonicalJson(value){if(Array.isArray(value))return value.map(canonicalJson);if(!plain(value))return value;const out={};for(const key of Object.keys(value).sort())out[key]=canonicalJson(value[key]);return out;}
function jsonEqual(a,b){try{return JSON.stringify(canonicalJson(a))===JSON.stringify(canonicalJson(b));}catch{return false;}}
function containsSecretInput(schema,value){
  if(!plain(schema))return false;
  if(schema['x-kata-secret']===true&&value!==undefined)return true;
  if(Array.isArray(schema.allOf))for(const branch of schema.allOf)if(containsSecretInput(branch,value))return true;
  for(const keyword of ['anyOf','oneOf'])if(Array.isArray(schema[keyword]))for(const branch of schema[keyword]){
    if(validateSchema(branch,value).length===0&&containsSecretInput(branch,value))return true;
  }
  if(plain(value)){
    const declared=plain(schema.properties)?schema.properties:{};
    for(const [key,child] of Object.entries(declared))if(Object.prototype.hasOwnProperty.call(value,key)&&containsSecretInput(child,value[key]))return true;
    if(plain(schema.additionalProperties))for(const [key,item] of Object.entries(value)){
      if(Object.prototype.hasOwnProperty.call(declared,key))continue;
      if(containsSecretInput(schema.additionalProperties,item))return true;
    }
  }
  if(Array.isArray(value)){
    const prefix=Array.isArray(schema.prefixItems)?schema.prefixItems:[];
    for(let i=0;i<Math.min(prefix.length,value.length);i++)if(containsSecretInput(prefix[i],value[i]))return true;
    if(plain(schema.items))for(let i=prefix.length;i<value.length;i++)if(containsSecretInput(schema.items,value[i]))return true;
  }
  return false;
}
function readPath(value,path){let current=value;for(const segment of path){if(Array.isArray(current)){if(!Number.isInteger(segment)||segment<0||segment>=current.length)fail('RUNTIME_DATAFLOW_PATH_MISSING');current=current[segment];continue;}if(!plain(current)||typeof segment!=='string'||!Object.prototype.hasOwnProperty.call(current,segment))fail('RUNTIME_DATAFLOW_PATH_MISSING');current=current[segment];}return current;}
function resolveValue(value,input,completed){
  if(Array.isArray(value))return value.map(item=>resolveValue(item,input,completed));
  if(!plain(value))return value;
  if(typeof value.$param==='string'&&Object.keys(value).length===1){if(!Object.prototype.hasOwnProperty.call(input,value.$param))fail('RUNTIME_PARAMETER_MISSING',value.$param);return structuredClone(input[value.$param]);}
  if(plain(value.$from)&&Object.keys(value).length===1){const source=completed[value.$from.node];if(source===undefined)fail('RUNTIME_DATAFLOW_SOURCE_MISSING',value.$from.node);return structuredClone(readPath(source,value.$from.path??[]));}
  const out={};for(const [key,item] of Object.entries(value))out[key]=resolveValue(item,input,completed);return out;
}
function buildGraph(program){const incoming=new Map(program.graph.nodes.map(node=>[node.id,[]]));for(const edge of program.graph.edges)incoming.get(edge.to).push(edge.from);for(const parents of incoming.values())parents.sort();return {nodes:new Map(program.graph.nodes.map(node=>[node.id,node])),incoming};}
function blankState(programHash,input){return {programHash,input:structuredClone(input),completed:{},status:'RUNNING'};}
function applyEvent(state,event){
  if(event.type==='WorkflowStarted')return blankState(event.payload.programHash,event.payload.input);
  if(!state)return state;
  if(event.type==='StepCompleted')state.completed[event.payload.nodeId]=event.payload.output;
  if(event.type==='WorkflowCompleted')state.status='COMPLETED';
  if(event.type==='WorkflowFailed')state.status='FAILED';
  if(event.type==='WorkflowBlocked')state.status='BLOCKED';
  return state;
}
function reconstruct(store,runId){
  const snapshot=store.loadSnapshot(runId);
  let state=snapshot?structuredClone(snapshot.state):null;
  const history=store.load(runId,{afterRevision:snapshot?.revision??0});
  for(const event of history.events)state=applyEvent(state,event);
  return {state,revision:history.revision};
}
function append(store,runId,revision,type,payload,clock){return store.append(runId,revision,[{type,payload,at:now(clock)}]).revision;}
function readyNodes(program,state,graph){return program.graph.nodes.filter(node=>state.completed[node.id]===undefined&&graph.incoming.get(node.id).every(parent=>state.completed[parent]!==undefined)).sort((a,b)=>a.id.localeCompare(b.id));}
function terminalOutputs(program,state){const outgoing=new Map(program.graph.nodes.map(node=>[node.id,0]));for(const edge of program.graph.edges)outgoing.set(edge.from,outgoing.get(edge.from)+1);const out={};for(const [id,count] of outgoing)if(count===0&&state.completed[id]!==undefined)out[id]=state.completed[id];return out;}
function retryDelay(retry,attempt){if(retry.strategy==='none')return 0;const base=Math.max(0,retry.baseDelayMs??0);const raw=retry.strategy==='exponential'?base*(2**Math.max(0,attempt-1)):base;return Math.min(raw,retry.maxDelayMs??raw,86400000);}
async function wait(ms){if(ms>0)await new Promise(resolve=>setTimeout(resolve,ms));}
async function invokeWithDeadline(invoke,context,timeoutMs){
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error('RUNTIME_STEP_TIMEOUT');error.code='RUNTIME_STEP_TIMEOUT';reject(error);},timeoutMs);});
  try{return await Promise.race([Promise.resolve(invoke({...context,signal:controller.signal})),deadline]);}finally{clearTimeout(timer);}
}

export function createDurableRunner({store,invoke,clock=()=>new Date().toISOString()}){
  if(!store||typeof store.append!=='function'||typeof store.load!=='function'||typeof store.saveSnapshot!=='function')fail('RUNTIME_STORE_INVALID');
  if(typeof invoke!=='function')fail('RUNTIME_INVOKER_REQUIRED');
  return {async execute({runId,program,input,stepLimit=MAX_STEP_LIMIT}){
    if(!Number.isInteger(stepLimit)||stepLimit<1||stepLimit>MAX_STEP_LIMIT)fail('RUNTIME_STEP_LIMIT_INVALID');
    const verification=verifyKirProgram(program);
    if(!verification.ok)return {status:'BLOCKED',reason:'KIR_VERIFICATION_FAILED',errors:verification.errors};
    const programHash=`sha256:${hashKirProgram(program)}`;
    let {state,revision}=reconstruct(store,runId);
    if(!state){
      if(input===undefined)fail('RUNTIME_INPUT_REQUIRED');
      assertSchema(program.inputSchema,input);
      if(containsSecretInput(program.inputSchema,input))return {status:'BLOCKED',reason:'SECRET_INPUT_REQUIRES_CREDENTIAL_BROKER'};
      revision=append(store,runId,revision,'WorkflowStarted',{programHash,input:structuredClone(input)},clock);
      state=blankState(programHash,input);
    }else{
      if(state.programHash!==programHash)return {status:'BLOCKED',reason:'PROGRAM_HASH_MISMATCH'};
      if(input!==undefined&&!jsonEqual(input,state.input))return {status:'BLOCKED',reason:'RUN_INPUT_MISMATCH'};
      if(state.status==='COMPLETED')return {status:'COMPLETED',outputs:terminalOutputs(program,state),revision};
      if(state.status==='FAILED')return {status:'FAILED',revision};
      state.status='RUNNING';
    }
    const graph=buildGraph(program);let executed=0;
    while(executed<stepLimit){
      const ready=readyNodes(program,state,graph);
      if(!ready.length){
        if(Object.keys(state.completed).length===program.graph.nodes.length){revision=append(store,runId,revision,'WorkflowCompleted',{outputs:terminalOutputs(program,state)},clock);state.status='COMPLETED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'COMPLETED',outputs:terminalOutputs(program,state),revision};}
        revision=append(store,runId,revision,'WorkflowBlocked',{reason:'NO_READY_NODE'},clock);state.status='BLOCKED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'BLOCKED',reason:'NO_READY_NODE',revision};
      }
      const node=ready[0];
      if(node.kind!=='invoke'){revision=append(store,runId,revision,'WorkflowBlocked',{reason:'NODE_KIND_NOT_EXECUTABLE',nodeId:node.id,kind:node.kind},clock);state.status='BLOCKED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'BLOCKED',reason:'NODE_KIND_NOT_EXECUTABLE',nodeId:node.id,revision};}
      if(WRITE_EFFECTS.has(node.effect.class)){revision=append(store,runId,revision,'WorkflowBlocked',{reason:'EFFECT_ENGINE_REQUIRED',nodeId:node.id},clock);state.status='BLOCKED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'BLOCKED',reason:'EFFECT_ENGINE_REQUIRED',nodeId:node.id,revision};}
      const args=resolveValue(node.spec.arguments??{},state.input,state.completed);assertSchema(node.inputSchema,args);
      revision=append(store,runId,revision,'StepScheduled',{nodeId:node.id},clock);let output,completed=false,secretOutput=false;
      for(let attempt=1;attempt<=node.retry.maxAttempts;attempt++){
        revision=append(store,runId,revision,'StepStarted',{nodeId:node.id,attempt},clock);
        try{
          output=await invokeWithDeadline(invoke,{runId,node,args,attempt},node.timeoutMs);
          assertSchema(node.outputSchema,output);
          if(containsSecretInput(node.outputSchema,output)){secretOutput=true;break;}
          completed=true;break;
        }
        catch(error){revision=append(store,runId,revision,attempt<node.retry.maxAttempts?'StepAttemptFailed':'StepFailed',{nodeId:node.id,attempt,errorCode:typeof error?.code==='string'?error.code:'INVOKE_FAILED'},clock);if(attempt<node.retry.maxAttempts)await wait(retryDelay(node.retry,attempt));}
      }
      if(secretOutput){revision=append(store,runId,revision,'WorkflowBlocked',{reason:'SECRET_OUTPUT_REQUIRES_CREDENTIAL_BROKER',nodeId:node.id},clock);state.status='BLOCKED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'BLOCKED',reason:'SECRET_OUTPUT_REQUIRES_CREDENTIAL_BROKER',nodeId:node.id,revision};}
      if(!completed){revision=append(store,runId,revision,'WorkflowFailed',{nodeId:node.id},clock);state.status='FAILED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'FAILED',nodeId:node.id,revision};}
      revision=store.append(runId,revision,[{type:'StepCompleted',payload:{nodeId:node.id,output},at:now(clock)},{type:'CheckpointCommitted',payload:{nodeId:node.id},at:now(clock)}]).revision;
      state.completed[node.id]=structuredClone(output);executed++;store.saveSnapshot(runId,revision,state,now(clock));
    }
    if(Object.keys(state.completed).length===program.graph.nodes.length){revision=append(store,runId,revision,'WorkflowCompleted',{outputs:terminalOutputs(program,state)},clock);state.status='COMPLETED';store.saveSnapshot(runId,revision,state,now(clock));return {status:'COMPLETED',outputs:terminalOutputs(program,state),revision};}
    revision=append(store,runId,revision,'WorkflowSuspended',{reason:'STEP_LIMIT',completedSteps:executed},clock);
    return {status:'SUSPENDED',reason:'STEP_LIMIT',revision};
  }};
}
