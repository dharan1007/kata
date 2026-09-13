import {KIR_VERSION,validateKirProgram} from './model.js';

const LEGACY_COMMANDS=new Set(['SAVE_WORK','SET_PRIORITY','ADD_TAG','SET_NOTE']);
const ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

function fail(code){const error=new Error(code);error.code=code;throw error;}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function normalizeId(value){const raw=String(value??'workflow').trim();if(ID.test(raw))return raw;const out=raw.replace(/[^A-Za-z0-9_.:-]+/g,'_').replace(/^[^A-Za-z]+/,'wf_').slice(0,128);if(!ID.test(out))fail('KIR_LEGACY_ID_INVALID');return out;}

function migrateStep(step,index){
  if(!plain(step)||!LEGACY_COMMANDS.has(step.kind)||!plain(step.args))fail('KIR_LEGACY_STEP_INVALID');
  return {
    id:`step_${String(index+1).padStart(4,'0')}`,
    kind:'invoke',
    inputSchema:{type:'object',properties:{},additionalProperties:true},
    outputSchema:{type:'object',properties:{},additionalProperties:true},
    effect:{class:'REVERSIBLE_WRITE',idempotency:'intrinsic'},
    capabilities:['workspace:write'],
    authorization:{scopes:['workspace:write']},
    timeoutMs:5000,
    retry:{maxAttempts:1,strategy:'none'},
    budget:{maxOutputBytes:1000000},
    spec:{target:{transport:'kata-command',name:step.kind},arguments:structuredClone(step.args)},
  };
}

export function migrateLegacyProgram(legacy){
  if(!plain(legacy))fail('KIR_LEGACY_PROGRAM_INVALID');
  if(legacy.irVersion===KIR_VERSION){const copy=structuredClone(legacy);validateKirProgram(copy);return copy;}
  if(!Array.isArray(legacy.steps)||legacy.steps.length<1||legacy.steps.length>10000)fail('KIR_LEGACY_STEPS_INVALID');
  if(!(plain(legacy.inputSchema)||typeof legacy.inputSchema==='boolean'))fail('KIR_LEGACY_SCHEMA_INVALID');
  const nodes=legacy.steps.map(migrateStep);
  const edges=nodes.slice(0,-1).map((current,index)=>({from:current.id,to:nodes[index+1].id}));
  const result={
    irVersion:KIR_VERSION,
    id:normalizeId(legacy.id??legacy.name),
    name:String(legacy.name??'Migrated workflow').trim().slice(0,256),
    description:typeof legacy.description==='string'?legacy.description.slice(0,16384):'Migrated KATA workflow',
    inputSchema:structuredClone(legacy.inputSchema),
    outputSchema:{type:'object',properties:{completed:{type:'integer',minimum:0},commands:{type:'array',items:{type:'object'}}},required:['completed','commands'],additionalProperties:false},
    graph:{entry:[nodes[0].id],nodes,edges},
    invariants:[{kind:'migration',value:'preserve-step-order'}],
    policies:{failClosed:true},
    metadata:{migratedFrom:'legacy-step-program-v1',legacyId:legacy.id??null,legacyCreatedAt:legacy.createdAt??null},
  };
  validateKirProgram(result);
  return result;
}
