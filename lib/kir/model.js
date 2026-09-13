export const KIR_VERSION=2;
export const NODE_KINDS=new Set(['invoke','transform','assert','branch','switch','map','loop','parallel','join','wait','event','approval','checkpoint','subworkflow','compensate','emit','fail']);
export const EFFECT_CLASSES=new Set(['PURE','READ_ONLY','IDEMPOTENT_WRITE','CONDITIONALLY_IDEMPOTENT_WRITE','REVERSIBLE_WRITE','NON_IDEMPOTENT_WRITE','DESTRUCTIVE_WRITE','IRREVERSIBLE_EXTERNAL_EFFECT']);
export const IDEMPOTENCY_MODES=new Set(['none','intrinsic','keyed','reconcile','compensated']);

const NODE_ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const TARGET_NAME=/^[A-Za-z0-9_.:/-]{1,192}$/;
const TRANSPORTS=new Set(['semantic','http','mcp','webmcp','browser','kata-command']);
const RETRY_STRATEGIES=new Set(['none','fixed','exponential']);
const LOOP_MODES=new Set(['forEach','while','until']);
const MAX_GRAPH_DEPTH=16;
const MAX_NODES=10_000;
const MAX_EDGES=50_000;
const MAX_JSON_DEPTH=64;
const MAX_ARRAY_ITEMS=100_000;
const MAX_STRING_BYTES=4_000_000;
const MAX_TIMEOUT_MS=31_536_000_000;
const BUDGET_KEYS=new Set(['maxInputBytes','maxOutputBytes','maxDurationMs','maxCostMicros','maxItems','maxTokens']);
const PROGRAM_KEYS=new Set(['irVersion','id','name','description','inputSchema','outputSchema','graph','invariants','policies','metadata']);
const NODE_KEYS=new Set(['id','kind','inputSchema','outputSchema','effect','capabilities','authorization','timeoutMs','retry','budget','spec']);

function fail(code,detail=''){
  const error=new Error(detail?`${code}: ${detail}`:code);
  error.code=code;
  throw error;
}

function plain(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function boundedString(value,max,code){
  if(typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>max)fail(code);
  return value;
}

function ownKeysOnly(value,allowed,code){
  for(const key of Object.keys(value))if(!allowed.has(key))fail(code,key);
}

function assertJson(value,depth=0,seen=new Set()){
  if(depth>MAX_JSON_DEPTH)fail('KIR_JSON_DEPTH_EXCEEDED');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){
    if(Buffer.byteLength(value,'utf8')>MAX_STRING_BYTES)fail('KIR_JSON_STRING_TOO_LARGE');
    return;
  }
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('KIR_NON_FINITE_NUMBER');
    return;
  }
  if(typeof value!=='object')fail('KIR_NON_JSON_VALUE');
  if(seen.has(value))fail('KIR_CYCLIC_VALUE');
  seen.add(value);
  if(Array.isArray(value)){
    if(value.length>MAX_ARRAY_ITEMS)fail('KIR_JSON_ARRAY_TOO_LARGE');
    for(const item of value)assertJson(item,depth+1,seen);
  }else{
    if(!plain(value))fail('KIR_NON_PLAIN_OBJECT');
    for(const [key,item] of Object.entries(value)){
      boundedString(key,1024,'KIR_OBJECT_KEY_INVALID');
      assertJson(item,depth+1,seen);
    }
  }
  seen.delete(value);
}

function assertSchema(value,code){
  if(typeof value==='boolean')return;
  if(!plain(value))fail(code);
  assertJson(value);
}

function stringSet(value,code){
  if(!Array.isArray(value)||value.length>1024)fail(code);
  const seen=new Set();
  for(const item of value){
    boundedString(item,256,code);
    if(seen.has(item))fail(`${code}_DUPLICATE`,item);
    seen.add(item);
  }
}

function validateEffect(effect){
  if(!plain(effect))fail('KIR_EFFECT_REQUIRED');
  ownKeysOnly(effect,new Set(['class','idempotency','keyBinding','reconciliation','compensation']),'KIR_UNKNOWN_EFFECT_FIELD');
  if(!EFFECT_CLASSES.has(effect.class))fail('KIR_UNKNOWN_EFFECT_CLASS');
  if(!IDEMPOTENCY_MODES.has(effect.idempotency))fail('KIR_UNKNOWN_IDEMPOTENCY_MODE');
  if(effect.keyBinding!==undefined)assertJson(effect.keyBinding);
  if(effect.reconciliation!==undefined)assertJson(effect.reconciliation);
  if(effect.compensation!==undefined)assertJson(effect.compensation);
}

function validateRetry(retry){
  if(!plain(retry))fail('KIR_RETRY_REQUIRED');
  ownKeysOnly(retry,new Set(['maxAttempts','strategy','baseDelayMs','maxDelayMs','jitter']),'KIR_UNKNOWN_RETRY_FIELD');
  if(!Number.isInteger(retry.maxAttempts)||retry.maxAttempts<1||retry.maxAttempts>100)fail('KIR_RETRY_ATTEMPTS_INVALID');
  if(!RETRY_STRATEGIES.has(retry.strategy))fail('KIR_RETRY_STRATEGY_INVALID');
  if(retry.strategy==='none'&&retry.maxAttempts!==1)fail('KIR_RETRY_STRATEGY_CONFLICT');
  for(const key of ['baseDelayMs','maxDelayMs'])if(retry[key]!==undefined&&(!Number.isInteger(retry[key])||retry[key]<0||retry[key]>86_400_000))fail('KIR_RETRY_DELAY_INVALID',key);
  if(retry.jitter!==undefined&&typeof retry.jitter!=='boolean')fail('KIR_RETRY_JITTER_INVALID');
  if(retry.baseDelayMs!==undefined&&retry.maxDelayMs!==undefined&&retry.maxDelayMs<retry.baseDelayMs)fail('KIR_RETRY_DELAY_ORDER_INVALID');
}

function validateBudget(budget){
  if(!plain(budget))fail('KIR_BUDGET_REQUIRED');
  for(const [key,value] of Object.entries(budget)){
    if(!BUDGET_KEYS.has(key))fail('KIR_UNKNOWN_BUDGET_FIELD',key);
    if(!Number.isSafeInteger(value)||value<0)fail('KIR_BUDGET_VALUE_INVALID',key);
  }
}

function validateInvoke(node){
  const target=node.spec?.target;
  if(!plain(target))fail('KIR_INVOKE_TARGET_REQUIRED',node.id);
  ownKeysOnly(target,new Set(['transport','name']),'KIR_UNKNOWN_TARGET_FIELD');
  if(!TRANSPORTS.has(target.transport))fail('KIR_TARGET_TRANSPORT_INVALID',node.id);
  if(typeof target.name!=='string'||!TARGET_NAME.test(target.name))fail('KIR_TARGET_NAME_INVALID',node.id);
  if(node.spec.arguments!==undefined)assertJson(node.spec.arguments);
}

function validateLoop(node,depth){
  if(!LOOP_MODES.has(node.spec?.mode))fail('KIR_LOOP_MODE_INVALID',node.id);
  if(!Number.isInteger(node.spec?.maxIterations)||node.spec.maxIterations<1||node.spec.maxIterations>1_000_000)fail('KIR_LOOP_BOUND_REQUIRED',node.id);
  validateGraph(node.spec.body,depth+1);
}

function validateMap(node,depth){
  if(!Number.isInteger(node.spec?.maxItems)||node.spec.maxItems<1||node.spec.maxItems>1_000_000)fail('KIR_MAP_BOUND_REQUIRED',node.id);
  if(node.spec.concurrency!==undefined&&(!Number.isInteger(node.spec.concurrency)||node.spec.concurrency<1||node.spec.concurrency>1024))fail('KIR_MAP_CONCURRENCY_INVALID',node.id);
  validateGraph(node.spec.body,depth+1);
}

function validateParallel(node,depth){
  const branches=node.spec?.branches;
  if(!Array.isArray(branches)||branches.length<2||branches.length>64)fail('KIR_PARALLEL_BRANCHES_INVALID',node.id);
  for(const branch of branches)validateGraph(branch,depth+1);
}

function validateNode(node,depth){
  if(!plain(node))fail('KIR_NODE_INVALID');
  ownKeysOnly(node,NODE_KEYS,'KIR_UNKNOWN_NODE_FIELD');
  if(typeof node.id!=='string'||!NODE_ID.test(node.id))fail('KIR_NODE_ID_INVALID');
  if(!NODE_KINDS.has(node.kind))fail('KIR_UNKNOWN_NODE_KIND',node.kind);
  assertSchema(node.inputSchema,'KIR_INPUT_SCHEMA_INVALID');
  assertSchema(node.outputSchema,'KIR_OUTPUT_SCHEMA_INVALID');
  validateEffect(node.effect);
  stringSet(node.capabilities,'KIR_CAPABILITIES_INVALID');
  if(!plain(node.authorization))fail('KIR_AUTHORIZATION_REQUIRED');
  ownKeysOnly(node.authorization,new Set(['scopes','principal','resource']),'KIR_UNKNOWN_AUTHORIZATION_FIELD');
  stringSet(node.authorization.scopes,'KIR_SCOPES_INVALID');
  if(node.authorization.principal!==undefined)assertJson(node.authorization.principal);
  if(node.authorization.resource!==undefined)assertJson(node.authorization.resource);
  if(!Number.isInteger(node.timeoutMs)||node.timeoutMs<1||node.timeoutMs>MAX_TIMEOUT_MS)fail('KIR_TIMEOUT_INVALID',node.id);
  validateRetry(node.retry);
  validateBudget(node.budget);
  if(!plain(node.spec))fail('KIR_SPEC_REQUIRED',node.id);
  assertJson(node.spec);
  if(node.kind==='invoke')validateInvoke(node);
  if(node.kind==='loop')validateLoop(node,depth);
  if(node.kind==='map')validateMap(node,depth);
  if(node.kind==='parallel')validateParallel(node,depth);
  if(node.kind==='subworkflow'&&(typeof node.spec.workflowHash!=='string'||!/^sha256:[a-f0-9]{64}$/.test(node.spec.workflowHash)))fail('KIR_SUBWORKFLOW_HASH_REQUIRED',node.id);
  if(node.kind==='compensate'&&(typeof node.spec.forNode!=='string'||!NODE_ID.test(node.spec.forNode)))fail('KIR_COMPENSATION_TARGET_REQUIRED',node.id);
  if(node.kind==='fail')boundedString(node.spec.code,128,'KIR_FAILURE_CODE_REQUIRED');
}

function edgeKey(edge){return `${edge.from}\u0000${edge.to}\u0000${JSON.stringify(edge.condition??null)}`;}

export function validateGraph(graph,depth=0){
  if(depth>MAX_GRAPH_DEPTH)fail('KIR_GRAPH_DEPTH_EXCEEDED');
  if(!plain(graph))fail('KIR_GRAPH_REQUIRED');
  ownKeysOnly(graph,new Set(['entry','nodes','edges']),'KIR_UNKNOWN_GRAPH_FIELD');
  if(!Array.isArray(graph.nodes)||graph.nodes.length<1||graph.nodes.length>MAX_NODES)fail('KIR_NODE_COUNT_INVALID');
  if(!Array.isArray(graph.edges)||graph.edges.length>MAX_EDGES)fail('KIR_EDGE_COUNT_INVALID');
  if(!Array.isArray(graph.entry)||graph.entry.length<1||graph.entry.length>graph.nodes.length)fail('KIR_ENTRY_INVALID');

  const nodes=new Map();
  for(const node of graph.nodes){
    validateNode(node,depth);
    if(nodes.has(node.id))fail('KIR_DUPLICATE_NODE_ID',node.id);
    nodes.set(node.id,node);
  }
  const entry=new Set();
  for(const id of graph.entry){
    if(typeof id!=='string'||!nodes.has(id))fail('KIR_ENTRY_INVALID',String(id));
    if(entry.has(id))fail('KIR_DUPLICATE_ENTRY',id);
    entry.add(id);
  }

  const outgoing=new Map([...nodes.keys()].map(id=>[id,[]]));
  const incoming=new Map([...nodes.keys()].map(id=>[id,0]));
  const edgeSeen=new Set();
  for(const edge of graph.edges){
    if(!plain(edge))fail('KIR_EDGE_INVALID');
    ownKeysOnly(edge,new Set(['from','to','condition','label']),'KIR_UNKNOWN_EDGE_FIELD');
    if(!nodes.has(edge.from)||!nodes.has(edge.to))fail('KIR_DANGLING_EDGE');
    if(edge.from===edge.to)fail('KIR_IMPLICIT_CYCLE');
    if(edge.condition!==undefined)assertJson(edge.condition);
    if(edge.label!==undefined)boundedString(edge.label,256,'KIR_EDGE_LABEL_INVALID');
    const key=edgeKey(edge);
    if(edgeSeen.has(key))fail('KIR_DUPLICATE_EDGE');
    edgeSeen.add(key);
    outgoing.get(edge.from).push(edge.to);
    incoming.set(edge.to,incoming.get(edge.to)+1);
  }

  const indegree=new Map(incoming);
  const queue=[];
  for(const [id,count] of indegree)if(count===0)queue.push(id);
  let visited=0;
  for(let i=0;i<queue.length;i++){
    const id=queue[i]; visited++;
    for(const next of outgoing.get(id)){
      const n=indegree.get(next)-1; indegree.set(next,n); if(n===0)queue.push(next);
    }
  }
  if(visited!==nodes.size)fail('KIR_IMPLICIT_CYCLE');

  for(const id of entry)if(incoming.get(id)!==0)fail('KIR_ENTRY_HAS_INCOMING_EDGE',id);

  const reachable=new Set(graph.entry),walk=[...graph.entry];
  for(let i=0;i<walk.length;i++)for(const next of outgoing.get(walk[i]))if(!reachable.has(next)){reachable.add(next);walk.push(next);}
  if(reachable.size!==nodes.size)fail('KIR_UNREACHABLE_NODE');

  for(const node of graph.nodes){
    const out=outgoing.get(node.id).length;
    if((node.kind==='branch'||node.kind==='switch')&&out<2)fail('KIR_BRANCH_ARITY_INVALID',node.id);
    if(node.kind==='join'&&incoming.get(node.id)<2)fail('KIR_JOIN_ARITY_INVALID',node.id);
  }
  return true;
}

export function validateKirProgram(program){
  if(!plain(program))fail('KIR_PROGRAM_INVALID');
  ownKeysOnly(program,PROGRAM_KEYS,'KIR_UNKNOWN_PROGRAM_FIELD');
  if(program.irVersion!==KIR_VERSION)fail('KIR_VERSION_UNSUPPORTED');
  if(typeof program.id!=='string'||!NODE_ID.test(program.id))fail('KIR_PROGRAM_ID_INVALID');
  boundedString(program.name,256,'KIR_PROGRAM_NAME_INVALID');
  if(typeof program.description!=='string'||Buffer.byteLength(program.description,'utf8')>16_384)fail('KIR_PROGRAM_DESCRIPTION_INVALID');
  assertSchema(program.inputSchema,'KIR_INPUT_SCHEMA_INVALID');
  assertSchema(program.outputSchema,'KIR_OUTPUT_SCHEMA_INVALID');
  validateGraph(program.graph,0);
  if(!Array.isArray(program.invariants)||program.invariants.length>256)fail('KIR_INVARIANTS_INVALID');
  for(const invariant of program.invariants)assertJson(invariant);
  if(!plain(program.policies)||program.policies.failClosed!==true)fail('KIR_FAIL_CLOSED_POLICY_REQUIRED');
  assertJson(program.policies);
  if(program.metadata!==undefined)assertJson(program.metadata);
  return true;
}
