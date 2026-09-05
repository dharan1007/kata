function getModelContext(runtime){return runtime.modelContext??globalThis.document?.modelContext??null;}
function secureOrigins(values){
 const out=[];for(const raw of Array.isArray(values)?values:[]){try{const url=new URL(String(raw));if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)continue;const origin=url.origin;if(origin!=='null'&&!out.includes(origin))out.push(origin);}catch{}}
 return out;
}
function exposureConfig(runtime){
 const configured=runtime.webMcpExposedTo??globalThis.document?.querySelector?.('meta[name="kata-webmcp-exposed-to"]')?.content?.split(',').map(x=>x.trim()).filter(Boolean)??[];
 return secureOrigins(configured);
}
export function createWebMcpRegistry(runtime,onStatus=()=>{}){
  let controller=null;
  const builtins=()=>[
    {name:'kata_search_research',description:'Search live OpenAlex research and load the visible KATA workspace.',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer',minimum:1,maximum:25}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:({query,limit=8},context={})=>runtime.search(query,limit,'agent',{signal:context.signal})},
    {name:'kata_workspace_summary',description:'Read the current browser-owned KATA workspace summary.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.summary()},
    {name:'kata_list_automations',description:'List current KATA automations.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listAutomations()},
    {name:'kata_run_automation',description:'Preview and run a saved KATA automation against current candidates.',inputSchema:{type:'object',properties:{automationId:{type:'string'}},required:['automationId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:({automationId},context={})=>runtime.runAutomation(automationId,'agent',undefined,{signal:context.signal})},
    {name:'kata_list_learned_tools',description:'List deterministic tools learned in this browser.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listPrograms()}
  ];
  async function refresh(){
    controller?.abort();controller=new AbortController();const mc=getModelContext(runtime);if(!mc?.registerTool){onStatus({supported:false,active:[],error:null});return;}
    const tools=builtins();for(const p of runtime.listPrograms())tools.push({name:p.name,description:p.description,inputSchema:p.inputSchema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input,context={})=>runtime.executeProgram(p.name,input,'agent',{signal:context.signal})});
    const exposedTo=exposureConfig(runtime),registrationOptions={signal:controller.signal,...(exposedTo.length?{exposedTo}:{})};
    const active=[];try{for(const tool of tools){await mc.registerTool(tool,registrationOptions);active.push(tool.name);}onStatus({supported:true,active,error:null,...(exposedTo.length?{exposedTo}:{})});}catch(error){controller.abort();onStatus({supported:true,active:[],error:error instanceof Error?error.message:String(error),...(exposedTo.length?{exposedTo}:{})});}
  }
  return{refresh,dispose(){controller?.abort();controller=null;}};
}
