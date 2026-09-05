function getModelContext(runtime){return runtime.modelContext??globalThis.document?.modelContext??null;}
export function createWebMcpRegistry(runtime,onStatus=()=>{}){
  let controller=null;
  const builtins=()=>[
    {name:'kata_search_research',description:'Search live OpenAlex research and load the visible KATA workspace.',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',minimum:1,maximum:25}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:({query,limit=8})=>runtime.search(query,limit,'agent')},
    {name:'kata_workspace_summary',description:'Read the current browser-owned KATA workspace summary.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.summary()},
    {name:'kata_list_automations',description:'List current KATA automations.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listAutomations()},
    {name:'kata_run_automation',description:'Preview and run a saved KATA automation against current candidates.',inputSchema:{type:'object',properties:{automationId:{type:'string'}},required:['automationId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:({automationId})=>runtime.runAutomation(automationId,'agent')},
    {name:'kata_list_learned_tools',description:'List deterministic tools learned in this browser.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listPrograms()}
  ];
  async function refresh(){
    controller?.abort();controller=new AbortController();const mc=getModelContext(runtime);if(!mc?.registerTool){onStatus({supported:false,active:[],error:null});return;}
    const tools=builtins();for(const p of runtime.listPrograms())tools.push({name:p.name,description:p.description,inputSchema:p.inputSchema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>runtime.executeProgram(p.name,input,'agent')});
    const active=[];try{for(const tool of tools){await mc.registerTool(tool,{signal:controller.signal});active.push(tool.name);}onStatus({supported:true,active,error:null});}catch(error){controller.abort();onStatus({supported:true,active:[],error:error instanceof Error?error.message:String(error)});}
  }
  return{refresh,dispose(){controller?.abort();controller=null;}};
}
