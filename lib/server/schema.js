export function validateSchema(schema, value, path='$') {
  const errors=[];
  const fail=(m)=>errors.push(`${path}: ${m}`);
  if(!schema || typeof schema!=='object') return errors;
  if(schema.enum && !schema.enum.some(x=>Object.is(x,value))) fail(`must be one of ${schema.enum.join(', ')}`);
  if(schema.type==='object'){
    if(value===null || typeof value!=='object' || Array.isArray(value)){ fail('must be object'); return errors; }
    for(const key of schema.required??[]) if(!(key in value)) errors.push(`${path}.${key}: required`);
    for(const [key,v] of Object.entries(value)){
      const child=schema.properties?.[key];
      if(!child){ if(schema.additionalProperties===false) errors.push(`${path}.${key}: unexpected`); continue; }
      errors.push(...validateSchema(child,v,`${path}.${key}`));
    }
  } else if(schema.type==='array'){
    if(!Array.isArray(value)){ fail('must be array'); return errors; }
    if(schema.minItems!=null && value.length<schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if(schema.maxItems!=null && value.length>schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    value.forEach((v,i)=>errors.push(...validateSchema(schema.items,v,`${path}[${i}]`)));
  } else if(schema.type==='string'){
    if(typeof value!=='string'){ fail('must be string'); return errors; }
    if(schema.minLength!=null && value.length<schema.minLength) fail(`minLength ${schema.minLength}`);
    if(schema.maxLength!=null && value.length>schema.maxLength) fail(`maxLength ${schema.maxLength}`);
    if(schema.pattern && !(new RegExp(schema.pattern).test(value))) fail('invalid format');
  } else if(schema.type==='integer'){
    if(!Number.isInteger(value)){ fail('must be integer'); return errors; }
    if(schema.minimum!=null && value<schema.minimum) fail(`minimum ${schema.minimum}`);
    if(schema.maximum!=null && value>schema.maximum) fail(`maximum ${schema.maximum}`);
  } else if(schema.type==='number'){
    if(typeof value!=='number'||!Number.isFinite(value)){ fail('must be number'); return errors; }
  } else if(schema.type==='boolean' && typeof value!=='boolean') fail('must be boolean');
  return errors;
}

export function assertSchema(schema,value){
  const errors=validateSchema(schema,value);
  if(errors.length){ const e=new Error('INVALID_ARGUMENTS'); e.details=errors; throw e; }
}
