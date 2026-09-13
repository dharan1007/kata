import {compileTraces as compileBase} from './index.js';

function rows(trace){
  const completed=trace.events.filter(event=>event.kind==='ACTION_COMPLETED');
  const actions=completed.map(event=>event.payload.operation);
  const outputs=completed.map(event=>event.payload.output);
  return {trace,actions,outputs,signature:actions.map(operation=>operation.semanticId).join('\u0000')};
}

export function compileWithLineage(name,traces){
  const base=compileBase(name,traces);
  if(base.status!=='COMPILED')return base;
  const descriptors=traces.map(rows).sort((a,b)=>a.signature.localeCompare(b.signature)||a.trace.id.localeCompare(b.trace.id));
  return {...base,evidence:{...base.evidence,lineageDemonstrations:descriptors.length}};
}
