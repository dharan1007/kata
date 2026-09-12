function matchesType(type,value){
  if(type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(type==='array')return Array.isArray(value);
  if(type==='string')return typeof value==='string';
  if(type==='integer')return Number.isInteger(value);
  if(type==='number')return typeof value==='number'&&Number.isFinite(value);
  if(type==='boolean')return typeof value==='boolean';
  if(type==='null')return value===null;
  return true;
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
  if(schema.enum && !schema.enum.some(x=>jsonEqual(x,value))) fail(`must be one of ${schema.enum.join(', ')}`);
  if(typeof schema.type==='string'&&!matchesType(schema.type,value)){
    fail(`must be ${schema.type}`);
    return errors;
  }
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)){
    for(const key of schema.required??[]) if(!(key in value)) errors.push(`${path}.${key}: required`);
    for(const [key,v] of Object.entries(value)){
      const child=schema.properties?.[key];
      if(!child){ if(schema.additionalProperties===false) errors.push(`${path}.${key}: unexpected`); continue; }
      errors.push(...validateSchema(child,v,`${path}.${key}`));
    }
  }
  if(Array.isArray(value)){
    if(schema.minItems!=null && value.length<schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if(schema.maxItems!=null && value.length>schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    if(schema.items) value.forEach((v,i)=>errors.push(...validateSchema(schema.items,v,`${path}[${i}]`)));
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
  }
  return errors;
}

export function assertSchema(schema,value){
  const errors=validateSchema(schema,value);
  if(errors.length){ const e=new Error('INVALID_ARGUMENTS'); e.details=errors; throw e; }
}
