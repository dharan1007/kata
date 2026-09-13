import {createHash} from 'node:crypto';
import {validateKirProgram} from './model.js';

function plain(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!plain(value))return value;
  const out={};
  for(const key of Object.keys(value).sort())out[key]=stable(value[key]);
  return out;
}

function stableString(value){return JSON.stringify(stable(value));}

function canonicalGraph(graph){
  const nodes=graph.nodes.map(node=>{
    const copy=structuredClone(node);
    copy.capabilities=[...copy.capabilities].sort();
    copy.authorization={...copy.authorization,scopes:[...copy.authorization.scopes].sort()};
    if(copy.kind==='loop'||copy.kind==='map')copy.spec={...copy.spec,body:canonicalGraph(copy.spec.body)};
    if(copy.kind==='parallel')copy.spec={...copy.spec,branches:copy.spec.branches.map(canonicalGraph).sort((a,b)=>stableString(a).localeCompare(stableString(b)))};
    return stable(copy);
  }).sort((a,b)=>a.id.localeCompare(b.id));

  const edges=graph.edges.map(edge=>stable(structuredClone(edge))).sort((a,b)=>{
    const ak=`${a.from}\u0000${a.to}\u0000${stableString(a.condition??null)}\u0000${a.label??''}`;
    const bk=`${b.from}\u0000${b.to}\u0000${stableString(b.condition??null)}\u0000${b.label??''}`;
    return ak.localeCompare(bk);
  });

  return stable({entry:[...graph.entry].sort(),nodes,edges});
}

export function canonicalizeKirProgram(program){
  validateKirProgram(program);
  const copy=structuredClone(program);
  copy.graph=canonicalGraph(copy.graph);
  copy.invariants=[...copy.invariants].map(stable).sort((a,b)=>stableString(a).localeCompare(stableString(b)));
  return stable(copy);
}

export function serializeKirProgram(program){
  return JSON.stringify(canonicalizeKirProgram(program));
}

export function semanticKirProgram(program){
  const canonical=canonicalizeKirProgram(program);
  return stable({
    irVersion:canonical.irVersion,
    inputSchema:canonical.inputSchema,
    outputSchema:canonical.outputSchema,
    graph:canonical.graph,
    invariants:canonical.invariants,
    policies:canonical.policies,
  });
}

export function hashKirProgram(program){
  const bytes=JSON.stringify(semanticKirProgram(program));
  return createHash('sha256').update(bytes).digest('hex');
}
