import {EFFECT_CLASSES,IDEMPOTENCY_MODES} from '../kir/model.js';

function fail(code,detail=''){
  const error=new Error(detail?`${code}: ${detail}`:code);
  error.code=code;
  throw error;
}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(plain(value)){const out={};for(const key of Object.keys(value).sort())out[key]=stable(value[key]);return out;}return value;}
function json(value){return JSON.stringify(stable(value));}
function equal(a,b){return json(a)===json(b);}
function sortedStrings(value){if(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!item))fail('COMPILER_OPERATION_CONTRACT_MISSING');return [...new Set(value)].sort();}
function kind(value){if(value===null)return 'null';if(Array.isArray(value))return 'array';if(plain(value))return 'object';if(typeof value==='number'&&Number.isFinite(value))return Number.isInteger(value)?'integer':'number';if(typeof value==='string'||typeof value==='boolean')return typeof value;fail('COMPILER_VALUE_UNSUPPORTED');}
function compatibleKinds(values){const kinds=[...new Set(values.map(kind))];if(kinds.every(value=>value==='integer'||value==='number'))return kinds.includes('number')?'number':'integer';return kinds.length===1?kinds[0]:null;}
function schemaForScalar(type){return {type};}

export function inferSchema(values,path='$'){
  if(!Array.isArray(values)||!values.length)fail('COMPILER_VALUE_EVIDENCE_MISSING',path);
  const type=compatibleKinds(values);
  if(!type)fail('COMPILER_VALUE_TYPE_CONFLICT',path);
  if(['string','boolean','integer','number','null'].includes(type))return schemaForScalar(type);
  if(type==='object'){
    const keys=Object.keys(values[0]).sort();
    for(const value of values){const current=Object.keys(value).sort();if(json(current)!==json(keys))fail('COMPILER_VALUE_SHAPE_CONFLICT',path);}
    const properties={};
    for(const key of keys)properties[key]=inferSchema(values.map(value=>value[key]),`${path}.${key}`);
    return {type:'object',properties,required:keys,additionalProperties:false};
  }
  const length=values[0].length;
  if(values.some(value=>value.length!==length))fail('COMPILER_VALUE_SHAPE_CONFLICT',path);
  return {type:'array',prefixItems:Array.from({length},(_,index)=>inferSchema(values.map(value=>value[index]),`${path}[${index}]`)),items:false,minItems:length,maxItems:length};
}

function parameterName(stepId,path){
  const tail=path.length?path.map(part=>String(part).replace(/[^A-Za-z0-9_-]+/g,'_')).join('__'):'value';
  return `${stepId}__${tail}`;
}

export function generalizeValues(values,{stepId,path=[],parameters}){
  if(values.every(value=>equal(value,values[0])))return structuredClone(values[0]);
  const type=compatibleKinds(values);
  if(!type)fail('COMPILER_VALUE_TYPE_CONFLICT',path.join('.')||'$');
  if(type==='object'){
    const keys=Object.keys(values[0]).sort();
    for(const value of values)if(json(Object.keys(value).sort())!==json(keys))fail('COMPILER_VALUE_SHAPE_CONFLICT',path.join('.')||'$');
    const out={};
    for(const key of keys)out[key]=generalizeValues(values.map(value=>value[key]),{stepId,path:[...path,key],parameters});
    return out;
  }
  if(type==='array'){
    const length=values[0].length;
    if(values.some(value=>value.length!==length))fail('COMPILER_VALUE_SHAPE_CONFLICT',path.join('.')||'$');
    return Array.from({length},(_,index)=>generalizeValues(values.map(value=>value[index]),{stepId,path:[...path,index],parameters}));
  }
  const name=parameterName(stepId,path);
  parameters.set(name,inferSchema(values,path.join('.')||'$'));
  return {$param:name};
}

function requireEffect(operation){
  if(!plain(operation.effect)||!EFFECT_CLASSES.has(operation.effect.class)||!IDEMPOTENCY_MODES.has(operation.effect.idempotency))fail('COMPILER_OPERATION_CONTRACT_MISSING');
  const effect={class:operation.effect.class,idempotency:operation.effect.idempotency};
  for(const key of ['keyBinding','reconciliation','compensation'])if(operation.effect[key]!==undefined)effect[key]=stable(operation.effect[key]);
  return effect;
}

export function operationContract(operation){
  if(!plain(operation)||typeof operation.semanticId!=='string'||!/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/.test(operation.semanticId)||!plain(operation.input))fail('COMPILER_OPERATION_CONTRACT_MISSING');
  const effect=requireEffect(operation);
  const capabilities=sortedStrings(operation.capabilities);
  if(!plain(operation.authorization))fail('COMPILER_OPERATION_CONTRACT_MISSING');
  const scopes=sortedStrings(operation.authorization.scopes);
  const outputSchema=operation.outputSchema===undefined?true:stable(operation.outputSchema);
  return {semanticId:operation.semanticId,effect,capabilities,authorization:{scopes},outputSchema};
}

export function assertStableOperationContract(operations){
  const contracts=operations.map(operationContract);
  const first=contracts[0];
  if(contracts.some(contract=>json(contract)!==json(first)))fail('COMPILER_OPERATION_CONTRACT_VARIATION');
  return first;
}

export function inferStep(stepId,operations,parameters){
  const contract=assertStableOperationContract(operations);
  const values=operations.map(operation=>operation.input);
  const inputSchema=inferSchema(values);
  const argumentsTemplate=generalizeValues(values,{stepId,path:[],parameters});
  return {
    id:stepId,
    kind:'invoke',
    inputSchema,
    outputSchema:structuredClone(contract.outputSchema),
    effect:structuredClone(contract.effect),
    capabilities:[...contract.capabilities],
    authorization:{scopes:[...contract.authorization.scopes]},
    timeoutMs:15_000,
    retry:{maxAttempts:1,strategy:'none'},
    budget:{},
    spec:{target:{transport:'semantic',name:contract.semanticId},arguments:argumentsTemplate},
  };
}
