const SCHEMA_TYPES=new Set(['object','array','string','integer','number','boolean','null']);
const NON_NEGATIVE_INTEGER_KEYWORDS=['minItems','maxItems','minLength','maxLength','minProperties','maxProperties'];
const FINITE_NUMBER_KEYWORDS=['minimum','maximum','exclusiveMinimum','exclusiveMaximum'];
const COMBINATOR_KEYWORDS=['allOf','anyOf','oneOf'];
const MAX_SCHEMA_BRANCHES=32;
const MAX_PATTERN_LENGTH=1024;
const MAX_SCHEMA_DEPTH=64;
const MAX_SCHEMA_NODES=4096;
const MAX_VALIDATION_DEPTH=64;
const MAX_VALIDATION_STEPS=250000;
const STRUCTURAL_BUDGET_EXCEEDED=Symbol('STRUCTURAL_BUDGET_EXCEEDED');
const UNSUPPORTED_EXECUTABLE_KEYWORDS=new Set([
  '$ref','$dynamicRef',
  'not','if','then','else',
  'contains','minContains','maxContains',
  'patternProperties','dependentSchemas','dependentRequired',
  'unevaluatedProperties','unevaluatedItems'
]);

function validTypeSchema(type){
  if(typeof type==='string')return SCHEMA_TYPES.has(type);
  return Array.isArray(type)&&type.length>0&&type.every(item=>typeof item==='string'&&SCHEMA_TYPES.has(item))&&new Set(type).size===type.length;
}

function validPatternSchema(pattern){
  if(typeof pattern!=='string'||pattern.length>MAX_PATTERN_LENGTH)return false;
  try{new RegExp(pattern,'u');return true;}catch{return false;}
}

function validSchemaValue(schema){
  return typeof schema==='boolean'||(schema!==null&&typeof schema==='object'&&!Array.isArray(schema));
}

function schemaShapeErrors(schema,path='$',errors=[],state={nodes:0,exhausted:false},depth=0){
  if(depth>MAX_SCHEMA_DEPTH){errors.push(`Schema exceeds maximum depth ${MAX_SCHEMA_DEPTH} at ${path}`);return errors;}
  state.nodes+=1;
  if(state.nodes>MAX_SCHEMA_NODES){
    if(!state.exhausted){errors.push(`Schema exceeds maximum node budget ${MAX_SCHEMA_NODES}`);state.exhausted=true;}
    return errors;
  }
  if(!validSchemaValue(schema)){errors.push(`Invalid schema at ${path}`);return errors;}
  if(typeof schema==='boolean')return errors;
  for(const keyword of Object.keys(schema)){
    if(UNSUPPORTED_EXECUTABLE_KEYWORDS.has(keyword))errors.push(`Unsupported executable schema keyword "${keyword}" at ${path}`);
  }
  if(schema.type!==undefined&&!validTypeSchema(schema.type))errors.push(`Invalid type schema at ${path}`);
  if(schema.enum!==undefined&&!Array.isArray(schema.enum))errors.push(`Invalid enum schema at ${path}`);
  if(schema.enum!==undefined&&Array.isArray(schema.enum)&&schema.enum.length===0)errors.push(`Invalid enum schema at ${path}`);
  if(schema.required!==undefined){
    const valid=Array.isArray(schema.required)&&schema.required.every(key=>typeof key==='string')&&new Set(schema.required).size===schema.required.length;
    if(!valid)errors.push(`Invalid required schema at ${path}`);
  }
  if(schema.uniqueItems!==undefined&&typeof schema.uniqueItems!=='boolean')errors.push(`Invalid uniqueItems schema at ${path}`);
  if(schema.pattern!==undefined&&!validPatternSchema(schema.pattern))errors.push(`Invalid pattern schema at ${path}`);
  for(const keyword of NON_NEGATIVE_INTEGER_KEYWORDS){
    if(schema[keyword]!==undefined&&(!Number.isInteger(schema[keyword])||schema[keyword]<0))errors.push(`Invalid ${keyword} schema at ${path}`);
  }
  for(const keyword of FINITE_NUMBER_KEYWORDS){
    if(schema[keyword]!==undefined&&(typeof schema[keyword]!=='number'||!Number.isFinite(schema[keyword])))errors.push(`Invalid ${keyword} schema at ${path}`);
  }
  if(schema.multipleOf!==undefined&&(typeof schema.multipleOf!=='number'||!Number.isFinite(schema.multipleOf)||schema.multipleOf<=0))errors.push(`Invalid multipleOf schema at ${path}`);
  for(const keyword of COMBINATOR_KEYWORDS){
    if(schema[keyword]===undefined)continue;
    if(!Array.isArray(schema[keyword])||schema[keyword].length===0||schema[keyword].length>MAX_SCHEMA_BRANCHES){errors.push(`Invalid ${keyword} schema at ${path}`);continue;}
    schema[keyword].forEach((branch,index)=>{
      if(!validSchemaValue(branch))errors.push(`Invalid ${keyword} schema at ${path}.${keyword}[${index}]`);
      else schemaShapeErrors(branch,`${path}.${keyword}[${index}]`,errors,state,depth+1);
    });
  }
  if(schema.prefixItems!==undefined){
    if(!Array.isArray(schema.prefixItems)||schema.prefixItems.length===0||schema.prefixItems.length>MAX_SCHEMA_BRANCHES)errors.push(`Invalid prefixItems schema at ${path}`);
    else schema.prefixItems.forEach((branch,index)=>{
      if(!validSchemaValue(branch))errors.push(`Invalid prefixItems schema at ${path}.prefixItems[${index}]`);
      else schemaShapeErrors(branch,`${path}.prefixItems[${index}]`,errors,state,depth+1);
    });
  }
  if(schema.properties!==undefined){
    if(schema.properties===null||typeof schema.properties!=='object'||Array.isArray(schema.properties))errors.push(`Invalid properties schema at ${path}`);
    else for(const [key,child] of Object.entries(schema.properties)){
      if(!validSchemaValue(child))errors.push(`Invalid properties schema at ${path}.properties.${key}`);
      else schemaShapeErrors(child,`${path}.properties.${key}`,errors,state,depth+1);
    }
  }
  if(schema.propertyNames!==undefined){
    if(!validSchemaValue(schema.propertyNames))errors.push(`Invalid propertyNames schema at ${path}`);
    else schemaShapeErrors(schema.propertyNames,`${path}.propertyNames`,errors,state,depth+1);
  }
  if(schema.items!==undefined){
    if(!validSchemaValue(schema.items))errors.push(`Invalid items schema at ${path}`);
    else schemaShapeErrors(schema.items,`${path}.items`,errors,state,depth+1);
  }
  if(schema.additionalProperties!==undefined){
    if(!validSchemaValue(schema.additionalProperties))errors.push(`Invalid additionalProperties schema at ${path}`);
    else schemaShapeErrors(schema.additionalProperties,`${path}.additionalProperties`,errors,state,depth+1);
  }
  return errors;
}

function matchesType(type,value){
  if(type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(type==='array')return Array.isArray(value);
  if(type==='string')return typeof value==='string';
  if(type==='integer')return Number.isInteger(value);
  if(type==='number')return typeof value==='number'&&Number.isFinite(value);
  if(type==='boolean')return typeof value==='boolean';
  if(type==='null')return value===null;
  return false;
}

function consumeValidationWork(budget,steps=1){
  if(!budget)return true;
  if(budget.exhausted)return false;
  budget.steps+=steps;
  if(budget.steps>MAX_VALIDATION_STEPS){budget.exhausted=true;return false;}
  return true;
}

function jsonEqual(left,right,budget){
  if(!consumeValidationWork(budget))return STRUCTURAL_BUDGET_EXCEEDED;
  if(left===right)return true;
  if(left===null||right===null||typeof left!==typeof right)return false;
  if(Array.isArray(left)||Array.isArray(right)){
    if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return false;
    for(let i=0;i<left.length;i+=1){
      const equal=jsonEqual(left[i],right[i],budget);
      if(equal===STRUCTURAL_BUDGET_EXCEEDED)return equal;
      if(!equal)return false;
    }
    return true;
  }
  if(typeof left==='object'){
    const leftKeys=Object.keys(left),rightKeys=Object.keys(right);
    if(!consumeValidationWork(budget,leftKeys.length+rightKeys.length))return STRUCTURAL_BUDGET_EXCEEDED;
    if(leftKeys.length!==rightKeys.length)return false;
    for(const key of leftKeys){
      if(!Object.prototype.hasOwnProperty.call(right,key))return false;
      const equal=jsonEqual(left[key],right[key],budget);
      if(equal===STRUCTURAL_BUDGET_EXCEEDED)return equal;
      if(!equal)return false;
    }
    return true;
  }
  return false;
}

function appendJsonFingerprint(value,parts,ancestors,budget){
  if(!consumeValidationWork(budget))return STRUCTURAL_BUDGET_EXCEEDED;
  if(value===null){parts.push('N');return true;}
  const type=typeof value;
  if(type==='string'){parts.push('S',String(value.length),':',value);return true;}
  if(type==='boolean'){parts.push(value?'B1':'B0');return true;}
  if(type==='number'){
    if(!Number.isFinite(value))return false;
    parts.push('D',Object.is(value,-0)?'0':String(value),';');
    return true;
  }
  if(type!=='object'||ancestors.has(value))return false;

  ancestors.add(value);
  let valid=true;
  if(Array.isArray(value)){
    parts.push('A',String(value.length),'[');
    for(const item of value){
      const result=appendJsonFingerprint(item,parts,ancestors,budget);
      if(result===STRUCTURAL_BUDGET_EXCEEDED){ancestors.delete(value);return result;}
      if(!result){valid=false;break;}
    }
    if(valid)parts.push(']');
  }else{
    const keys=Object.keys(value);
    if(!consumeValidationWork(budget,keys.length)){ancestors.delete(value);return STRUCTURAL_BUDGET_EXCEEDED;}
    keys.sort();
    parts.push('O',String(keys.length),'{');
    for(const key of keys){
      parts.push('K',String(key.length),':',key);
      const result=appendJsonFingerprint(value[key],parts,ancestors,budget);
      if(result===STRUCTURAL_BUDGET_EXCEEDED){ancestors.delete(value);return result;}
      if(!result){valid=false;break;}
    }
    if(valid)parts.push('}');
  }
  ancestors.delete(value);
  return valid;
}

function jsonFingerprint(value,budget){
  const parts=[];
  const result=appendJsonFingerprint(value,parts,new Set(),budget);
  if(result===STRUCTURAL_BUDGET_EXCEEDED)return result;
  return result?parts.join(''):null;
}

function hasDuplicateJsonValue(values,budget){
  const buckets=new Map();
  const prior=[];
  for(const value of values){
    const fingerprint=jsonFingerprint(value,budget);
    if(fingerprint===STRUCTURAL_BUDGET_EXCEEDED)return fingerprint;
    if(fingerprint===null){
      for(const existing of prior){
        const equal=jsonEqual(existing,value,budget);
        if(equal===STRUCTURAL_BUDGET_EXCEEDED)return equal;
        if(equal)return true;
      }
    }else{
      const bucket=buckets.get(fingerprint);
      if(bucket){
        for(const existing of bucket){
          const equal=jsonEqual(existing,value,budget);
          if(equal===STRUCTURAL_BUDGET_EXCEEDED)return equal;
          if(equal)return true;
        }
        bucket.push(value);
      }else{
        buckets.set(fingerprint,[value]);
      }
    }
    prior.push(value);
  }
  return false;
}

function isMultipleOf(value,divisor){
  if(typeof divisor!=='number'||!Number.isFinite(divisor)||divisor<=0)return false;
  const quotient=value/divisor;
  if(Number.isInteger(quotient))return true;
  const nearest=Math.round(quotient);
  const tolerance=Number.EPSILON*Math.max(1,Math.abs(quotient))*8;
  return Math.abs(quotient-nearest)<=tolerance;
}

function unicodeCharacterLength(value){
  let length=0;
  for(const _ of value)length+=1;
  return length;
}

function childValidationState(state){
  return {budget:state.budget,depth:state.depth+1};
}

function validationBudgetFailure(fail){
  fail(`validation work budget exceeded (${MAX_VALIDATION_STEPS} steps)`);
}

export function validateSchema(schema,value,path='$',state={budget:{steps:0,exhausted:false},depth:0}) {
  const errors=[];
  const fail=(m)=>errors.push(`${path}: ${m}`);
  if(!consumeValidationWork(state.budget)){validationBudgetFailure(fail);return errors;}
  if(state.depth>MAX_VALIDATION_DEPTH){fail(`validation depth exceeds ${MAX_VALIDATION_DEPTH}`);return errors;}
  const childState=()=>childValidationState(state);
  if(schema===true)return errors;
  if(schema===false){fail('boolean schema is false');return errors;}
  if(!schema || typeof schema!=='object') return errors;
  if(Array.isArray(schema.allOf)) for(const branch of schema.allOf) errors.push(...validateSchema(branch,value,path,childState()));
  if(Array.isArray(schema.anyOf)){
    const matches=schema.anyOf.some(branch=>validateSchema(branch,value,path,childState()).length===0);
    if(!matches)fail('must match at least one anyOf schema');
  }
  if(Array.isArray(schema.oneOf)){
    let matches=0;
    for(const branch of schema.oneOf)if(validateSchema(branch,value,path,childState()).length===0)matches+=1;
    if(matches!==1)fail('must match exactly one oneOf schema');
  }
  if(Object.prototype.hasOwnProperty.call(schema,'const')){
    const equal=jsonEqual(schema.const,value,state.budget);
    if(equal===STRUCTURAL_BUDGET_EXCEEDED){validationBudgetFailure(fail);return errors;}
    if(!equal)fail('must equal const value');
  }
  if(schema.enum){
    let matched=false;
    for(const candidate of schema.enum){
      const equal=jsonEqual(candidate,value,state.budget);
      if(equal===STRUCTURAL_BUDGET_EXCEEDED){validationBudgetFailure(fail);return errors;}
      if(equal){matched=true;break;}
    }
    if(!matched)fail(`must be one of ${schema.enum.length} allowed enum values`);
  }
  if(typeof schema.type==='string'&&!matchesType(schema.type,value)){
    fail(`must be ${schema.type}`);
    return errors;
  }
  if(Array.isArray(schema.type)&&!schema.type.some(type=>matchesType(type,value))){
    fail(`must be one of the allowed types: ${schema.type.join(', ')}`);
    return errors;
  }
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
    const propertyCount=Object.keys(value).length;
    if(schema.minProperties!=null&&propertyCount<schema.minProperties)fail(`must contain at least ${schema.minProperties} properties`);
    if(schema.maxProperties!=null&&propertyCount>schema.maxProperties)fail(`must contain at most ${schema.maxProperties} properties`);
    for(const key of schema.required??[]) if(!Object.prototype.hasOwnProperty.call(value,key)) errors.push(`${path}.${key}: required`);
    const declared=schema.properties&&typeof schema.properties==='object'&&!Array.isArray(schema.properties)?schema.properties:{};
    for(const [key,v] of Object.entries(value)){
      if(schema.propertyNames!==undefined)errors.push(...validateSchema(schema.propertyNames,key,`${path} property name ${JSON.stringify(key)}`,childState()));
      if(Object.prototype.hasOwnProperty.call(declared,key)){
        errors.push(...validateSchema(declared[key],v,`${path}.${key}`,childState()));
        continue;
      }
      if(schema.additionalProperties===false){errors.push(`${path}.${key}: unexpected`);continue;}
      if(schema.additionalProperties&&typeof schema.additionalProperties==='object'&&!Array.isArray(schema.additionalProperties))errors.push(...validateSchema(schema.additionalProperties,v,`${path}.${key}`,childState()));
    }
  }
  if(Array.isArray(value)){
    if(schema.minItems!=null && value.length<schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if(schema.maxItems!=null && value.length>schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    if(schema.uniqueItems===true){
      const duplicate=hasDuplicateJsonValue(value,state.budget);
      if(duplicate===STRUCTURAL_BUDGET_EXCEEDED){validationBudgetFailure(fail);return errors;}
      if(duplicate)fail('items must be unique');
    }
    const prefix=Array.isArray(schema.prefixItems)?schema.prefixItems:[];
    for(let i=0;i<Math.min(prefix.length,value.length);i+=1)errors.push(...validateSchema(prefix[i],value[i],`${path}[${i}]`,childState()));
    if(schema.items===false){
      if(value.length>prefix.length)fail('additional items are not permitted');
    }else if(schema.items&&typeof schema.items==='object'&&!Array.isArray(schema.items)){
      for(let i=prefix.length;i<value.length;i+=1)errors.push(...validateSchema(schema.items,value[i],`${path}[${i}]`,childState()));
    }
  }
  if(typeof value==='string'){
    const length=unicodeCharacterLength(value);
    if(schema.minLength!=null && length<schema.minLength) fail(`minLength ${schema.minLength}`);
    if(schema.maxLength!=null && length>schema.maxLength) fail(`maxLength ${schema.maxLength}`);
    if(schema.pattern!==undefined && !(new RegExp(schema.pattern,'u').test(value))) fail('invalid format');
  }
  if(typeof value==='number'&&Number.isFinite(value)){
    if(schema.multipleOf!=null&&!isMultipleOf(value,schema.multipleOf)) fail(`multipleOf ${schema.multipleOf}`);
    if(schema.minimum!=null && value<schema.minimum) fail(`minimum ${schema.minimum}`);
    if(schema.maximum!=null && value>schema.maximum) fail(`maximum ${schema.maximum}`);
    if(schema.exclusiveMinimum!=null && value<=schema.exclusiveMinimum) fail(`exclusiveMinimum ${schema.exclusiveMinimum}`);
    if(schema.exclusiveMaximum!=null && value>=schema.exclusiveMaximum) fail(`exclusiveMaximum ${schema.exclusiveMaximum}`);
  }
  return errors;
}

export function assertSchema(schema,value){
  const shapeErrors=schemaShapeErrors(schema);
  if(shapeErrors.length){const e=new Error('INVALID_SCHEMA');e.details=shapeErrors;throw e;}
  const errors=validateSchema(schema,value);
  if(errors.length){ const e=new Error('INVALID_ARGUMENTS'); e.details=errors; throw e; }
}
