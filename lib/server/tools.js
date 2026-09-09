import {searchOpenAlex} from './openalex.js';
import {assertSchema} from './schema.js';
import {diagnoseWebInterop} from './interop-evaluator.js';
import {applyCommand, compileDemos, createAutomation, executeProgram, previewAutomation, runAutomation} from './engine.js';
import {toolDefinitions} from '../shared/tool-contracts.js';

export {toolDefinitions};
const defs=new Map(toolDefinitions.map(x=>[x.name,x]));

function makeTriageActions(actions={}){const out=[{kind:'SAVE_WORK'}]; if(actions.priority)out.push({kind:'SET_PRIORITY',value:actions.priority}); for(const tag of actions.tags??[])out.push({kind:'ADD_TAG',value:String(tag)}); if(actions.note)out.push({kind:'SET_NOTE',value:String(args.note)}); return out;}

export function createToolRegistry(deps={}){
  const openAlex=deps.openAlex??searchOpenAlex;
  const registry={
    list(){return toolDefinitions.map(x=>structuredClone(x));},
    async invoke(name,args={},ctx={}){
      if((ctx.depth??0)>=4)throw new Error('TOOL_DEPTH_EXCEEDED'); const def=defs.get(name); if(!def)throw new Error('TOOL_NOT_FOUND'); assertSchema(def.inputSchema,args);
      if(name==='kata_search_research')return openAlex(args.query,args.limit??8,{signal:ctx.signal});
      if(name==='kata_plan_triage'){
        const source=Array.isArray(args.works)?{works:args.works,meta:{source:'provided'}}:await openAlex(args.query??'web agents',args.limit??12,{signal:ctx.signal});
        const criteria=args.criteria??{}; const selected=source.works.filter(w=>(criteria.minYear==null||(w.year??0)>=criteria.minYear)&&(criteria.minCitations==null||(w.citations??0)>=criteria.minCitations)).sort((a,b)=>(b.citations??0)-(a.citations??0)).slice(0,args.maxItems??5);
        return{works:source.works,matches:selected,plan:selected.map(w=>({workId:w.id,actions:makeTriageActions(args.actions)})),meta:source.meta};
      }
      if(name==='kata_diagnose_web_interop')return diagnoseWebInterop(args);
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

export function toOpenAIChatCompletionsTools(){return toolDefinitions.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}));}
export function toOpenAIResponsesTools(){return toolDefinitions.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.inputSchema}));}
export function toOpenAITools(){return toOpenAIChatCompletionsTools();}
export function toAnthropicTools(){return toolDefinitions.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema}));}
export function toGeminiInteractionTools(){return toolDefinitions.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.inputSchema}));}
export function toGeminiFunctionDeclarations(){return toolDefinitions.map(t=>({name:t.name,description:t.description,parameters:t.inputSchema}));}
