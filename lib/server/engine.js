import {createHash, randomUUID} from 'node:crypto';
import {assertSchema} from './schema.js';

const TOOL_NAME=/^[A-Za-z0-9_.-]{1,128}$/;
const TRIGGERS=new Set(['AFTER_SEARCH','WORKSPACE_OPEN','MANUAL']);
const ACTIONS=new Set(['SAVE_WORK','SET_PRIORITY','ADD_TAG','SET_NOTE','RUN_TOOL']);
const PRIORITIES=new Set(['low','medium','high']);
const PROGRAM_COMMANDS=new Set(['SAVE_WORK','SET_PRIORITY','ADD_TAG','SET_NOTE']);
const clone=v=>structuredClone(v);
const iso=()=>new Date().toISOString();
const own=(obj,key)=>Object.hasOwn(obj,key)?obj[key]:undefined;

export function createWorkspace(){return {version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};}
function ensureWorkspace(ws){if(!ws||ws.version!==1||typeof ws.knownWorks!=='object'||typeof ws.savedWorks!=='object'||typeof ws.runs!=='object')throw new Error('INVALID_WORKSPACE');}
function text(v,max,code){const s=String(v??'').trim(); if(!s||s.length>max)throw new Error(code); return s;}

export function applyCommand(workspace,command){
  ensureWorkspace(workspace); if(!command||typeof command!=='object'||!command.args)throw new Error('INVALID_COMMAND');
  const next=clone(workspace), {kind,args}=command; const workId=text(args.workId,128,'INVALID_WORK_ID');
  const known=own(next.knownWorks,workId), saved=own(next.savedWorks,workId);
  if(kind==='SAVE_WORK'){
    if(!known)throw new Error('UNKNOWN_WORK');
    if(!saved) next.savedWorks[workId]={...clone(known),priority:'medium',tags:[],note:'',savedAt:iso()};
  } else if(kind==='SET_PRIORITY'){
    if(!saved)throw new Error('WORK_NOT_SAVED'); if(!PRIORITIES.has(args.priority))throw new Error('INVALID_PRIORITY'); saved.priority=args.priority;
  } else if(kind==='ADD_TAG'){
    if(!saved)throw new Error('WORK_NOT_SAVED'); const tag=text(args.tag,80,'INVALID_TAG'); if(!saved.tags.includes(tag)){ if(saved.tags.length>=32)throw new Error('TAG_LIMIT'); saved.tags.push(tag); }
  } else if(kind==='SET_NOTE'){
    if(!saved)throw new Error('WORK_NOT_SAVED'); const note=String(args.note??''); if(note.length>4000)throw new Error('INVALID_NOTE'); saved.note=note;
  } else throw new Error('INVALID_COMMAND_KIND');
  return next;
}

function normalizeName(name){const n=String(name??'').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,128); if(!TOOL_NAME.test(n))throw new Error('INVALID_TOOL_NAME'); return n;}
function primitiveType(v){if(typeof v==='string')return 'string'; if(typeof v==='boolean')return'boolean'; if(typeof v==='number'&&Number.isFinite(v))return Number.isInteger(v)?'integer':'number'; throw new Error('UNSUPPORTED_ARGUMENT_TYPE');}
function traceShape(trace){if(!Array.isArray(trace)||!trace.length)throw new Error('EMPTY_TRACE'); return trace.map(c=>({kind:c?.kind,keys:Object.keys(c?.args??{}).sort()}));}
export function compileDemos(name,demoA,demoB){
  traceShape(demoA); traceShape(demoB);
  if(demoA.some(c=>!PROGRAM_COMMANDS.has(c.kind))||demoB.some(c=>!PROGRAM_COMMANDS.has(c.kind)))throw new Error('INVALID_COMMAND_KIND');
  if(JSON.stringify(traceShape(demoA))!==JSON.stringify(traceShape(demoB)))throw new Error('DEMO_STRUCTURE_MISMATCH');
  const properties={}, required=[], params=new Map(), steps=[]; let suffix=1;
  for(let i=0;i<demoA.length;i++){
    const a=demoA[i],b=demoB[i],args={};
    for(const key of Object.keys(a.args).sort()){
      const av=a.args[key], bv=b.args[key], type=primitiveType(av); if(primitiveType(bv)!==type)throw new Error('DEMO_TYPE_MISMATCH');
      if(Object.is(av,bv)){args[key]=clone(av);continue;}
      const sig=`${key}:${type}:${JSON.stringify(av)}:${JSON.stringify(bv)}`; let p=params.get(sig);
      if(!p){p=key==='workId'?'workId':key; while(properties[p])p=`${key}${suffix++}`; params.set(sig,p); properties[p]={type}; required.push(p);}
      args[key]={$param:p};
    }
    steps.push({kind:a.kind,args});
  }
  return {id:randomUUID(),name:normalizeName(name),description:`Deterministic KATA workflow: ${steps.map(s=>s.kind).join(' → ')}`,inputSchema:{type:'object',properties,required,additionalProperties:false},steps,createdAt:iso()};
}
function materialize(v,input){if(v&&typeof v==='object'&&!Array.isArray(v)&&'$param'in v)return input[v.$param]; if(Array.isArray(v))return v.map(x=>materialize(x,input)); if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,materialize(x,input)])); return v;}
export function executeProgram(program,input,workspace){
  ensureWorkspace(workspace); if(!program?.inputSchema||!Array.isArray(program.steps))throw new Error('INVALID_PROGRAM'); assertSchema(program.inputSchema,input??{});
  let next=clone(workspace); const commands=[];
  for(const step of program.steps){const cmd={kind:step.kind,args:materialize(step.args,input??{})}; next=applyCommand(next,cmd); commands.push(cmd);}
  return {workspace:next,completed:commands.length,commands};
}

function validateAction(action){
  if(!action||!ACTIONS.has(action.kind))throw new Error('INVALID_AUTOMATION_ACTION');
  if(action.kind==='SET_PRIORITY'&&!PRIORITIES.has(action.value))throw new Error('INVALID_PRIORITY');
  if(action.kind==='ADD_TAG')text(action.value,80,'INVALID_TAG');
  if(action.kind==='SET_NOTE'&&String(action.value??'').length>4000)throw new Error('INVALID_NOTE');
  if(action.kind==='RUN_TOOL'){if(!TOOL_NAME.test(String(action.name??'')))throw new Error('INVALID_TOOL_NAME'); if(action.input!=null&&(typeof action.input!=='object'||Array.isArray(action.input)))throw new Error('INVALID_TOOL_INPUT');}
}
export function createAutomation(input={}){
  if(!TRIGGERS.has(input.trigger))throw new Error('INVALID_TRIGGER'); const actions=Array.isArray(input.actions)?input.actions:[]; if(!actions.length)throw new Error('INVALID_AUTOMATION_ACTIONS'); actions.forEach(validateAction);
  return {id:input.id??randomUUID(),name:text(input.name??'Automation',120,'INVALID_AUTOMATION_NAME'),description:String(input.description??'').slice(0,500),trigger:input.trigger,filters:{minYear:Number.isFinite(input.filters?.minYear)?input.filters.minYear:null,minCitations:Number.isFinite(input.filters?.minCitations)?input.filters.minCitations:null,onlyUnsaved:Boolean(input.filters?.onlyUnsaved)},actions:clone(actions),maxItemsPerRun:Math.max(1,Math.min(25,Number.parseInt(input.maxItemsPerRun??5,10)||5)),enabled:input.enabled!==false,status:input.enabled===false?'paused':'active',createdAt:input.createdAt??iso()};
}
function matches(work,a,ws){if(a.filters.minYear!=null&&(work.year??0)<a.filters.minYear)return false;if(a.filters.minCitations!=null&&(work.citations??0)<a.filters.minCitations)return false;if(a.filters.onlyUnsaved&&Object.hasOwn(ws.savedWorks,work.id))return false;return true;}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function fingerprint(payload){return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');}
export function previewAutomation(a,works,ws){
  ensureWorkspace(ws); const selected=(works??[]).filter(w=>matches(w,a,ws)).sort((x,y)=>(y.citations??0)-(x.citations??0)||String(x.id).localeCompare(String(y.id))).slice(0,a.maxItemsPerRun);
  const fp=fingerprint({automation:{trigger:a.trigger,filters:a.filters,actions:a.actions,maxItemsPerRun:a.maxItemsPerRun},candidates:(works??[]).map(w=>[w.id,w.year,w.citations]),saved:Object.keys(ws.savedWorks).sort()});
  return {matches:selected,plannedOperations:selected.length*a.actions.length,fingerprint:fp};
}
function materializeWorkInput(v,workId){if(v&&typeof v==='object'&&!Array.isArray(v)&&v.$workId===true)return workId;if(Array.isArray(v))return v.map(x=>materializeWorkInput(x,workId));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,materializeWorkInput(x,workId)]));return v;}
export async function runAutomation(a,works,workspace,options={}){
  ensureWorkspace(workspace); const preview=previewAutomation(a,works,workspace); if(options.expectedFingerprint&&options.expectedFingerprint!==preview.fingerprint)throw new Error('STALE_PREVIEW');
  if((options.depth??0)>=4)throw new Error('TOOL_DEPTH_EXCEEDED'); const runKey=options.runKey??`${a.id}:${preview.fingerprint}`; if(workspace.runs[runKey])return{workspace,receipt:{status:'duplicate',runKey,automationId:a.id,processed:0}};
  let next=clone(workspace); const changes=[];
  try{
    for(const work of preview.matches){
      for(const action of a.actions){
        if(action.kind==='RUN_TOOL'){
          if(typeof options.invokeTool!=='function')throw new Error('TOOL_RUNTIME_REQUIRED');
          const out=await options.invokeTool(action.name,materializeWorkInput(action.input??{},work.id),next,{depth:(options.depth??0)+1}); if(!out?.workspace)throw new Error('INVALID_TOOL_RESULT'); next=out.workspace; changes.push({kind:'RUN_TOOL',name:action.name,workId:work.id});
        } else {
          const args={workId:work.id}; if(action.kind==='SET_PRIORITY')args.priority=action.value;if(action.kind==='ADD_TAG')args.tag=action.value;if(action.kind==='SET_NOTE')args.note=action.value; const cmd={kind:action.kind,args}; next=applyCommand(next,cmd); changes.push(cmd);
        }
      }
    }
  }catch(error){return{workspace,receipt:{status:'failed',runKey,automationId:a.id,processed:0,error:error.message,at:iso()}};}
  const receipt={status:'success',runKey,automationId:a.id,processed:preview.matches.length,operations:changes.length,fingerprint:preview.fingerprint,at:iso()}; next.runs[runKey]=receipt; next.activity.unshift({type:'automation',at:receipt.at,message:`${a.name} processed ${receipt.processed} work(s).`}); next.activity=next.activity.slice(0,100); return{workspace:next,receipt};
}
export {TOOL_NAME};