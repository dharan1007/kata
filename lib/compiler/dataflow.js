const MAX_SEARCH_NODES=100000;
const MAX_MATCHES=4096;
const MAX_DEPTH=64;

function isObject(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(isObject(value)){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stable(value[key]);
    return out;
  }
  return value;
}
function sameValue(a,b){
  try{return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
  catch{return false;}
}
function error(code,extra={}){
  const value=new Error(code);
  value.code=code;
  Object.assign(value,extra);
  throw value;
}
function readPath(value,path){
  let current=value;
  for(const segment of path){
    if(Array.isArray(current)){
      if(!Number.isInteger(segment)||segment<0||segment>=current.length)return {found:false};
      current=current[segment];
    }else if(isObject(current)&&typeof segment==='string'&&Object.prototype.hasOwnProperty.call(current,segment)){
      current=current[segment];
    }else return {found:false};
  }
  return {found:true,value:current};
}
function matches(root,target){
  const found=[];
  const stack=[{value:root,path:[]}];
  let visited=0;
  while(stack.length){
    const item=stack.pop();
    visited++;
    if(visited>MAX_SEARCH_NODES)error('COMPILER_DATAFLOW_SEARCH_BUDGET_EXCEEDED');
    if(sameValue(item.value,target)){
      found.push(item.path);
      if(found.length>MAX_MATCHES)error('COMPILER_DATAFLOW_SEARCH_BUDGET_EXCEEDED');
    }
    if(item.path.length>=MAX_DEPTH)continue;
    if(Array.isArray(item.value)){
      for(let index=item.value.length-1;index>=0;index--)stack.push({value:item.value[index],path:[...item.path,index]});
    }else if(isObject(item.value)){
      for(const key of Object.keys(item.value).sort().reverse())stack.push({value:item.value[key],path:[...item.path,key]});
    }
  }
  return found;
}

export function resolveDataflowBinding(values,{stepIndex,descriptors,consumerNode,consumerPath}){
  if(!Array.isArray(values)||values.length!==descriptors.length||stepIndex<=0)return null;
  const candidates=[];
  for(let producerIndex=0;producerIndex<stepIndex;producerIndex++){
    for(const path of matches(descriptors[0].outputs[producerIndex],values[0])){
      let valid=true;
      for(let demoIndex=1;demoIndex<descriptors.length;demoIndex++){
        const result=readPath(descriptors[demoIndex].outputs[producerIndex],path);
        if(!result.found||!sameValue(result.value,values[demoIndex])){valid=false;break;}
      }
      if(valid)candidates.push({producerIndex,path});
    }
  }
  candidates.sort((a,b)=>a.producerIndex-b.producerIndex||JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)));
  if(candidates.length===0)return null;
  const evidenceCandidates=candidates.map(candidate=>({producerNode:`step_${String(candidate.producerIndex+1).padStart(4,'0')}`,producerPath:[...candidate.path]}));
  if(candidates.length>1)error('COMPILER_DATAFLOW_AMBIGUOUS',{candidates:evidenceCandidates});
  const candidate=candidates[0];
  const producerNode=`step_${String(candidate.producerIndex+1).padStart(4,'0')}`;
  return {
    binding:{$from:{node:producerNode,path:[...candidate.path]}},
    evidence:{consumerNode,consumerPath:[...consumerPath],producerNode,producerPath:[...candidate.path]},
  };
}
