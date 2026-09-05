import {searchOpenAlex} from './openalex.js';
import {assertSchema} from './schema.js';
import {applyCommand, compileDemos, createAutomation, executeProgram, previewAutomation, runAutomation} from './engine.js';

const workspaceSchema={type:'object'};
const worksSchema={type:'array',maxItems:25,items:{type:'object'}};
const programSchema={type:'object'};
const automationSchema={type:'object'};
const commandSchema={type:'object'};

export const toolDefinitions=[
 {name:'kata_search_research',description:'Search live scholarly works through OpenAlex. Returns normalized real research records; never mock data.',annotations:{readOnlyHint:true,untrustedContentHint:true},inputSchema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:240},limit:{type:'integer',minimum:1,maximum:25}},required:['query'],additionalProperties:false}},
 {name:'kata_plan_triage',description:'Create a deterministic triage plan from live OpenAlex results or supplied works without mutating a workspace.',annotations:{readOnlyHint:true,untrustedContentHint:true},inputSchema:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:240},limit:{type:'integer',minimum:1,maximum:25},works:worksSchema,criteria:{type:'object'},actions:{type:'object'},maxItems:{type:'integer',minimum:1,maximum:25}},additionalProperties:false}},
 {name:'kata_apply_command',description:'Apply one allowlisted semantic workspace command and return the next workspace snapshot.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{workspace:workspaceSchema,command:commandSchema},required:['workspace','command'],additionalProperties:false}},
 {name:'kata_compile_workflow',description:'Compile two compatible semantic demonstrations into a deterministic JSON-Schema-constrained program.',annotations:{readOnlyHint:true,untrustedContentHint:false},inputSchema:{type:'object',properties:{name:{type:'string',minLength:1,maxLength:128},demos:{type:'array',minItems:2,maxItems:2,items:{type:'array',minItems:1,maxItems:32,items:{type:'object'}}}},required:['name','demos'],additionalProperties:false}},
 {name:'kata_execute_program',description:'Execute a compiled deterministic program transactionally against a supplied workspace snapshot.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{workspace:workspaceSchema,program:programSchema,input:{type:'object'}},required:['workspace','program','input'],additionalProperties:false}},
 {name:'kata_preview_automation',description:'Preview an automation and return matching works plus an integrity fingerprint. Makes no changes.',annotations:{readOnlyHint:true,untrustedContentHint:false},inputSchema:{type:'object',properties:{workspace:workspaceSchema,works:worksSchema,automation:automationSchema},required:['workspace','works','automation'],additionalProperties:false}},
 {name:'kata_run_automation',description:'Run a deterministic automation only when its preview fingerprint still matches current inputs. Nested tools are depth-bounded.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{workspace:workspaceSchema,works:worksSchema,automation:automationSchema,previewFingerprint:{type:'string',minLength:64,maxLength:64}},required:['workspace','works','automation','previewFingerprint'],additionalProperties:false}}
];
const defs=new Map(toolDefinitions.map(x=>[x.name,x]));

function makeTriageActions(actions={}){const out=[{kind:'SAVE_WORK'}]; if(actions.priority)out.push({kind:'SET_PRIORITY',value:actions.priority}); for(const tag of actions.tags??[])out.push({kind:'ADD_TAG',value:String(tag)}); if(actions.note)out.push({kind:'SET_NOTE',value:String(actions.note)}); return out;}

export function createToolRegistry(deps={}){
  const openAlex=deps.openAlex??searchOpenAlex;
  const registry={
    list(){return toolDefinitions.map(x=>structuredClone(x));},
    async invoke(name,args={},ctx={}){
      if((ctx.depth??0)>=4)throw new Error('TOOL_DEPTH_EXCEEDED'); const def=defs.get(name); if(!def)throw new Error('TOOL_NOT_FOUND'); assertSchema(def.inputSchema,args);
      if(name==='kata_search_research')return openAlex(args.query,args.limit??8);
      if(name==='kata_plan_triage'){
        const source=Array.isArray(args.works)?{works:args.works,meta:{source:'provided'}}:await openAlex(args.query??'web agents',args.limit??12);
        const criteria=args.criteria??{}; const selected=source.works.filter(w=>(criteria.minYear==null||(w.year??0)>=criteria.minYear)&&(criteria.minCitations==null||(w.citations??0)>=criteria.minCitations)).sort((a,b)=>(b.citations??0)-(a.citations??0)).slice(0,args.maxItems??5);
        return{works:source.works,matches:selected,plan:selected.map(w=>({workId:w.id,actions:makeTriageActions(args.actions)})),meta:source.meta};
      }
      if(name==='kata_apply_command')return{workspace:applyCommand(args.workspace,args.command),command:args.command};
      if(name==='kata_compile_workflow')return{program:compileDemos(args.name,args.demos[0],args.demos[1])};
      if(name==='kata_execute_program')return executeProgram(args.program,args.input,args.workspace);
      if(name==='kata_preview_automation'){const automation=createAutomation(args.automation);return{automation,preview:previewAutomation(automation,args.works,args.workspace)};}
      if(name==='kata_run_automation'){
        const automation=createAutomation(args.automation);
        return runAutomation(automation,args.works,args.workspace,{expectedFingerprint:args.previewFingerprint,depth:ctx.depth??0,invokeTool:async(tool,input,workspace,nested)=>{
          const payload={...(input??{})}; if(defs.get(tool)?.inputSchema?.properties?.workspace&&!('workspace'in payload))payload.workspace=workspace;
          const result=await registry.invoke(tool,payload,{...ctx,depth:nested.depth}); return result.workspace?result:{workspace,result};
        }});
      }
      throw new Error('TOOL_NOT_FOUND');
    }
  };
  return registry;
}

export function toOpenAITools(){return toolDefinitions.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}));}
export function toAnthropicTools(){return toolDefinitions.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema}));}
export function toGeminiInteractionTools(){return toolDefinitions.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.inputSchema}));}
export function toGeminiFunctionDeclarations(){return toolDefinitions.map(t=>({name:t.name,description:t.description,parameters:t.inputSchema}));}
