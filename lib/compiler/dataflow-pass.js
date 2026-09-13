import {resolveDataflowBinding} from './dataflow.js';

function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function equal(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function varying(values){return !values.every(value=>equal(value,values[0]));}
function removeParams(template,parameters){
  if(Array.isArray(template)){for(const item of template)removeParams(item,parameters);return;}
  if(!plain(template))return;
  if(typeof template.$param==='string'&&Object.keys(template).length===1){parameters.delete(template.$param);return;}
  for(const value of Object.values(template))removeParams(value,parameters);
}

function rewrite(template,values,path,context){
  if(varying(values)){
    const resolved=resolveDataflowBinding(values,{stepIndex:context.stepIndex,descriptors:context.descriptors,consumerNode:context.consumerNode,consumerPath:path});
    if(resolved){
      removeParams(template,context.parameters);
      context.bindings.push(resolved.evidence);
      return resolved.binding;
    }
  }
  if(Array.isArray(template))return template.map((item,index)=>rewrite(item,values.map(value=>value[index]),[...path,index],context));
  if(plain(template)&&!(typeof template.$param==='string'&&Object.keys(template).length===1)){
    const out={};
    for(const key of Object.keys(template))out[key]=rewrite(template[key],values.map(value=>value[key]),[...path,key],context);
    return out;
  }
  return template;
}

export function applyDataflowPass(node,operations,parameters,{stepIndex,descriptors,bindings}){
  const values=operations.map(operation=>operation.input);
  node.spec.arguments=rewrite(node.spec.arguments,values,[],{stepIndex,descriptors,consumerNode:node.id,parameters,bindings});
  return node;
}
