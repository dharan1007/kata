const SCHEMA_TYPES=new Set(['object','array','string','integer','number','boolean','null']);
const NON_NEGATIVE_INTEGER_KEYWORDS=['minItems','maxItems','minLength','maxLength'];
const FINITE_NUMBER_KEYWORDS=['minimum','maximum','exclusiveMinimum','exclusiveMaximum'];
const COMBINATOR_KEYWORDS=['allOf','anyOf','oneOf'];

function validTypeSchema(type){
  if(typeof type==='string')return SCHEMA_TYPES.has(type);
  return Array.isArray(type)&&type.length>0&&type.every(item=>typeof item==='string'&&SCHEMA_TYPES.has(item))&&new Set(type).size===type.length;
}

function schemaShapeErrors(schema,path='$',errors=[]){
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return errors;
  if(schema.type!==undefined&&!validTypeSchema(schema.type))errors.push(`Invalid type schema at ${path}`);
  if(schema.enum!==undefined&&!Array.isArray(schema.enum))errors.push(`Invalid enum schema at ${path}`);
  if(schema.enum!==undefined&&Array.isArray(schema.enum)&&schema.enum.length===0)errors.push(`Invalid enum schema at ${path}`);
  if(schema.required!==undefined){
    const valid=Array.isArray(schema.required)&&schema.required.every(key=>typeof key==='string')&&new Set(schema.required).size===schema.required.length;
    if(!valid)errors.push(`Invalid required schema at ${path}`);
  }
  for(const keyword of NON_NEGATIVE_INTEGER_KEYWORDS){
    if(schema[keyword]!==undefined&&(!Number.isInteger(schema[keyword])||schema[keyword]<0))errors.push(`Invalid ${keyword} schema at ${path}`);
  }
  for(const keyword of FINITE_NUMBER_KEYWORDS){
    if(schema[keyword]!==undefined&&(typeof schema[keyword]!=='number'||!Number.isFinite(schema[keyword])))errors.push(`Invalid ${keyword} schema at ${path}`);
  }
  for(const keyword of COMBINATOR_KEYWORDS){
    if(schema[keyword]===undefined)continue;
    if(!Array.isArray(schema[keyword])||schema[keyword].length===0){errors.push(`Invalid ${keyword} schema at ${path}`);continue;}
    schema[keyword].forEach((branch,index)=>{
      if(!branch||typeof branch!=='object'||Array.isArray(branch))errors.push(`Invalid ${keyword} schema at ${path}.${keyword}[${index}]`);
      else schemaShapeErrors(branch,`${path}.${keyword}[${index}]`,errors);
    });
  }
  if(schema.prefixItems!==undefined){
    if(!Array.isArray(schema.prefixItems)||schema.prefixItems.length===0)errors.push(`Invalid prefixItems schema at ${path}`);
    else schema.prefixItems.forEach((branch,index)=>{
      if(!branch||typeof branch!=='object'||Array.isArray(branch))errors.push(`Invalid prefixItems schema at ${path}.prefixItems[${index}]`);
      else schemaShapeErrors(branch,`${path}.prefixItems[${index}]`,errors);
    });
  }
  if(schema.properties&&typeof schema.properties==='object'&&!Array.isArray(schema.properties))for(const [key,child] of Object.entries(schema.properties))schemaShapeErrors(child,`${path}.properties.${key}`,errors);
  if(schema.items&&typeof schema.items==='object'&&!Array.isArray(schema.items))schemaShapeErrors(schema.items,`${path}.items`,errors);
  if(schema.additionalProperties&&typeof schema.additionalProperties==='object'&&!Array.isArray(schema.additionalProperties))schemaShapeErrors(schema.additionalProperties,`${path}.additionalProperties`,errors);
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

function jsonEqual(left,right){
  if(left===right)return true;
  if(left===null||right===null||typeof left!==typeof right)return false;
  if(Array.isArray(left)||Array.isArray(right)){
    if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return false;
    for(let i=0;i<left.length;i+=1)if(!jsonEqual(left[i],right[i]))return false;
    return true;
  }
  if(typeof left==='object'){
    const leftKeys=Object.keys(left),rightKeys=Object.keys(right);
    if(leftKeys.length!==rightKeys.length)return false;
    for(const key of leftKeys){
      if(!Object.prototype.hasOwnProperty.call(right,key)||!jsonEqual(left[key],right[key]))return false;
    }
    return true;
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

export function validateSchema(schema, value, path='$') {
  const errors=[];
  const fail=(m)=>errors.push(`${path}: ${m}`);
  if(!schema || typeof schema!=='object') return errors;
  if(Array.isArray(schema.allOf)) for(const branch of schema.allOf) errors.push(...validateSchema(branch,value,path));
  if(Array.isArray(schema.anyOf)){
    const matches=schema.anyOf.some(branch=>validateSchema(branch,value,path).length===0);
    if(!matches)fail('must match at least one anyOf schema');
  }
  if(Array.isArray(schema.oneOf)){
    let matches=0;
    for(const branch of schema.oneOf)if(validateSchema(branch,value,path).length===0)matches+=1;
    if(matches!==1)fail('must match exactly one oneOf schema');
  }
  if(Object.prototype.hasOwnProperty.call(schema,'const')&&!jsonEqual(schema.const,value)) fail('must equal const value');
  if(schema.enum && !schema.enum.some(x=>jsonEqual(x,value))) fail(`must be one of ${schema.enum.join(', ')}`);
  if(typeof schema.type==='string'&&!matchesType(schema.type,value)){
    fail(`must be ${schema.type}`);
    return errors;
  }
  if(Array.isArray(schema.type)&&!schema.type.some(type=>matchesType(type,value))){
    fail(`must be one of the allowed types: ${schema.type.join(', ')}`);
    return errors;
  }
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
    for(const key of schema.required??[]) if(!Object.prototype.hasOwnProperty.call(value,key)) errors.push(`${path}.${key}: required`);
    const declared=schema.properties&&typeof schema.properties==='object'&&!Array.isArray(schema.properties)?schema.properties:{};
    for(const [key,v] of Object.entries(value)){
      if(Object.prototype.hasOwnProperty.call(declared,key)){
        errors.push(...validateSchema(declared[key],v,`${path}.${key}`));
        continue;
      }
      if(schema.additionalProperties===false){errors.push(`${path}.${key}: unexpected`);continue;}
      if(schema.additionalProperties&&typeof schema.additionalProperties==='object'&&!Array.isArray(schema.additionalProperties))errors.push(...validateSchema(schema.additionalProperties,v,`${path}.${key}`));
    }
  }
  if(Array.isArray(value)){
    if(schema.minItems!=null && value.length<schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if(schema.maxItems!=null && value.length>schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    const prefix=Array.isArray(schema.prefixItems)?schema.prefixItems:[];
    for(let i=0;i<Math.min(prefix.length,value.length);i+=1)errors.push(...validateSchema(prefix[i],value[i],`${path}[${i}]`));
    if(schema.items===false){
      if(value.length>prefix.length)fail('additional items are not permitted');
    }else if(schema.items&&typeof schema.items==='object'&&!Array.isArray(schema.items)){
      for(let i=prefix.length;i<value.length;i+=1)errors.push(...validateSchema(schema.items,value[i],`${path}[${i}]`));
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
