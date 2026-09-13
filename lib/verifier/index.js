import {createHash} from 'node:crypto';
import {hashKirProgram,validateKirProgram} from '../kir/index.js';

const WRITE_EFFECTS=new Set(['IDEMPOTENT_WRITE','CONDITIONALLY_IDEMPOTENT_WRITE','REVERSIBLE_WRITE','NON_IDEMPOTENT_WRITE','DESTRUCTIVE_WRITE','IRREVERSIBLE_EXTERNAL_EFFECT']);
const DESTRUCTIVE_EFFECTS=new Set(['DESTRUCTIVE_WRITE','IRREVERSIBLE_EXTERNAL_EFFECT']);

function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function digest(value){return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;}
function diagnostic(code,nodeId,detail={}){return {code,nodeId,...detail};}
function scopeCovers(scope,capability){if(scope==='*'||scope===capability)return true;if(scope.endsWith(':*'))return capability.startsWith(scope.slice(0,-1));return false;}
function concreteEffectEvidence(value){return plain(value)&&Object.keys(value).length>0;}
function unsafeRetry(node){
  if((node.retry?.maxAttempts??1)<=1||!WRITE_EFFECTS.has(node.effect.class))return false;
  if(node.effect.idempotency==='intrinsic')return false;
  if(node.effect.idempotency==='keyed')return !concreteEffectEvidence(node.effect.keyBinding);
  if(node.effect.idempotency==='reconcile')return !concreteEffectEvidence(node.effect.reconciliation);
  if(node.effect.idempotency==='compensated')return !concreteEffectEvidence(node.effect.compensation);
  return true;
}
function graphMaps(graph){
  const nodes=new Map(graph.nodes.map(node=>[node.id,node]));
  const incoming=new Map(graph.nodes.map(node=>[node.id,[]]));
  const outgoing=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges){incoming.get(edge.to).push(edge.from);outgoing.get(edge.from).push(edge.to);}
  return {nodes,incoming,outgoing};
}
function topological(graph,maps){
  const indegree=new Map([...maps.incoming].map(([id,parents])=>[id,parents.length]));
  const queue=[...indegree].filter(([,count])=>count===0).map(([id])=>id).sort();
  const order=[];
  for(let index=0;index<queue.length;index++){
    const id=queue[index];order.push(id);
    for(const child of maps.outgoing.get(id)){const next=indegree.get(child)-1;indegree.set(child,next);if(next===0){queue.push(child);queue.sort();}}
  }
  return order;
}
function ancestors(graph,maps,order){
  const result=new Map(graph.nodes.map(node=>[node.id,new Set()]));
  for(const id of order){for(const parent of maps.incoming.get(id)){result.get(id).add(parent);for(const ancestor of result.get(parent))result.get(id).add(ancestor);}}
  return result;
}
function dominators(graph,maps,order){
  const all=new Set(graph.nodes.map(node=>node.id));
  const entries=new Set(graph.entry);
  const dom=new Map();
  for(const id of order){
    if(entries.has(id)){dom.set(id,new Set([id]));continue;}
    const parents=maps.incoming.get(id);
    if(!parents.length){dom.set(id,new Set([id]));continue;}
    let intersection=null;
    for(const parent of parents){const parentDom=dom.get(parent)??all;intersection=intersection===null?new Set(parentDom):new Set([...intersection].filter(value=>parentDom.has(value)));}
    intersection.add(id);dom.set(id,intersection);
  }
  return dom;
}
function collectRefs(value,out=[]){
  if(Array.isArray(value)){for(const item of value)collectRefs(item,out);return out;}
  if(!plain(value))return out;
  if(plain(value.$from)&&typeof value.$from.node==='string'&&Array.isArray(value.$from.path))out.push({kind:'from',node:value.$from.node,path:value.$from.path});
  if(typeof value.$param==='string')out.push({kind:'param',name:value.$param});
  for(const [key,item] of Object.entries(value))if(key!=='$from'&&key!=='$param')collectRefs(item,out);
  return out;
}
function secretParams(schema){
  const result=new Set();
  if(!plain(schema)||!plain(schema.properties))return result;
  for(const [name,child] of Object.entries(schema.properties))if(plain(child)&&child['x-kata-secret']===true)result.add(name);
  return result;
}
function resourceKeys(graph){
  const keys=new Set();
  for(const node of graph.nodes){
    if(WRITE_EFFECTS.has(node.effect.class))keys.add(String(node.spec?.resourceKey??node.spec?.target?.name??`node:${node.id}`));
    if(node.kind==='parallel')for(const branch of node.spec.branches??[])for(const key of resourceKeys(branch))keys.add(key);
  }
  return keys;
}
function analyzeGraph(graph,errors,{rootInputSchema,isRoot=false}={}){
  const maps=graphMaps(graph),order=topological(graph,maps),ancestorMap=ancestors(graph,maps,order),dom=dominators(graph,maps,order);
  const secret=secretParams(rootInputSchema);
  for(const node of graph.nodes){
    if(unsafeRetry(node))errors.push(diagnostic('UNSAFE_RETRY_EFFECT',node.id,{effectClass:node.effect.class,idempotency:node.effect.idempotency}));
    for(const capability of node.capabilities){if(!node.authorization.scopes.some(scope=>scopeCovers(scope,capability)))errors.push(diagnostic('CAPABILITY_SCOPE_MISMATCH',node.id,{capability}));}
    if(node.budget?.maxDurationMs!==undefined&&node.timeoutMs>node.budget.maxDurationMs)errors.push(diagnostic('TIMEOUT_EXCEEDS_NODE_BUDGET',node.id));
    const refs=collectRefs(node.spec?.arguments??{});
    for(const ref of refs){
      if(ref.kind==='from'&&(!maps.nodes.has(ref.node)||ref.node===node.id||!ancestorMap.get(node.id).has(ref.node)))errors.push(diagnostic('INVALID_DATAFLOW_DEPENDENCY',node.id,{producerNode:ref.node}));
      if(ref.kind==='param'&&secret.has(ref.name))errors.push(diagnostic('SECRET_FLOW_TO_MODEL_ARGUMENT',node.id,{parameter:ref.name}));
    }
    if(DESTRUCTIVE_EFFECTS.has(node.effect.class)){
      const qualified=graph.nodes.filter(candidate=>candidate.kind==='approval'&&candidate.spec?.approvalClass==='destructive'&&candidate.spec?.binding?.targetNode===node.id).map(candidate=>candidate.id);
      if(!qualified.some(id=>dom.get(node.id)?.has(id)))errors.push(diagnostic('DESTRUCTIVE_EFFECT_WITHOUT_APPROVAL',node.id));
    }
    if(node.kind==='parallel'){
      const branches=node.spec.branches??[];
      const branchKeys=branches.map(resourceKeys);
      let conflict=null;
      for(let i=0;i<branchKeys.length&&!conflict;i++)for(let j=i+1;j<branchKeys.length&&!conflict;j++)for(const key of branchKeys[i])if(branchKeys[j].has(key)){conflict=key;break;}
      if(conflict&&node.spec.serializationPolicy===undefined)errors.push(diagnostic('PARALLEL_WRITE_CONFLICT',node.id,{resourceKey:conflict}));
      for(const branch of branches)analyzeGraph(branch,errors,{rootInputSchema,isRoot:false});
    }
    if(node.kind==='loop'||node.kind==='map')analyzeGraph(node.spec.body,errors,{rootInputSchema,isRoot:false});
  }
}

export function verifyKirProgram(program){
  validateKirProgram(program);
  const errors=[];
  analyzeGraph(program.graph,errors,{rootInputSchema:program.inputSchema,isRoot:true});
  errors.sort((a,b)=>a.nodeId.localeCompare(b.nodeId)||a.code.localeCompare(b.code)||JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const summary={nodeCount:program.graph.nodes.length,errorCount:errors.length,programHash:`sha256:${hashKirProgram(program)}`};
  const evidence={verifier:'kata-static-v1',programHash:summary.programHash,errors,summary};
  return {ok:errors.length===0,errors,summary,evidenceHash:digest(evidence)};
}
