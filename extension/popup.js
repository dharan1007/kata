const byId=id=>document.getElementById(id);
const status=byId('status'),result=byId('result'),runtimeList=byId('runtime'),diagnosis=byId('diagnosis'),blockers=byId('blockers'),button=byId('inspect'),intent=byId('intent');
const apiButton=byId('compile-api-tools'),apiResult=byId('api-tools-result'),apiSummary=byId('api-tools-summary');
const mcpButton=byId('inspect-mcp'),mcpEndpoint=byId('mcp-endpoint'),mcpResult=byId('mcp-result'),mcpSummary=byId('mcp-summary');

function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
function addPair(term,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=value??'Unknown';runtimeList.append(dt,dd);}
function render(data){
  clear(runtimeList);clear(diagnosis);clear(blockers);const r=data.runtime??{};
  addPair('Page',r.url??'Unavailable');addPair('Secure context',String(Boolean(r.secureContext)));addPair('Frameworks',(r.frameworkHints??[]).map(x=>x.name).join(', ')||'No framework marker established');addPair('Open shadow roots',String(r.dom?.openShadowRoots??0));addPair('Iframes',String(r.dom?.iframes??0));
  if(data.ok){const d=data.diagnosis??{};const strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=`${d.status??'unknown'} · ${d.primaryPath??'unknown'}`;p.textContent=d.recommendedAction??'No recommendation returned.';diagnosis.append(strong,p);for(const item of d.blockers??[]){const li=document.createElement('li'),title=document.createElement('strong'),reason=document.createElement('p'),remediation=document.createElement('p');title.textContent=item.code??'Restriction';reason.textContent=item.reason??'';remediation.textContent=item.remediation??'';li.append(title,reason,remediation);blockers.append(li);}if(!(d.blockers??[]).length){const li=document.createElement('li');li.textContent='No blocking condition was established from the observed evidence.';blockers.append(li);}status.textContent='Inspection complete.';}else{const p=document.createElement('p');p.textContent=data.error??'Inspection failed.';diagnosis.append(p);status.textContent='Local inspection completed, but KATA diagnosis was unavailable.';}result.hidden=false;
}
function renderApiTools(data){
  clear(apiSummary);if(!data?.ok){const p=document.createElement('p');p.textContent=data?.error??'API tool compilation failed.';apiSummary.append(p);apiResult.hidden=false;return;}
  const compilation=data.compilation??{},tools=compilation.tools??[],rejected=compilation.rejected??[];
  const headline=document.createElement('strong'),note=document.createElement('p'),list=document.createElement('ul');
  headline.textContent=`${tools.length} preview-only tool contract${tools.length===1?'':'s'} compiled`;
  note.textContent=`${rejected.length} operation${rejected.length===1?' was':'s were'} rejected because KATA could not establish a safe, complete agent contract. No API operation was executed.`;
  for(const tool of tools.slice(0,25)){
    const li=document.createElement('li'),name=document.createElement('strong'),meta=document.createElement('span');
    name.textContent=tool.name;meta.textContent=` — ${tool.execution?.method??'?'} · ${tool.execution?.requiresAuthorization?'authorization required':'no declared authorization'}${(tool.execution?.streamingMedia??[]).length?` · stream ${(tool.execution.streamingMedia??[]).join(', ')}`:''}`;li.append(name,meta);list.append(li);
  }
  apiSummary.append(headline,note,list);apiResult.hidden=false;
}
function renderMcp(data){
  clear(mcpSummary);const strong=document.createElement('strong'),p=document.createElement('p'),recommendation=document.createElement('p'),pre=document.createElement('pre');const e=data.environment??{};
  strong.textContent=`${e.mcpEndpoint??'unknown'} · ${e.mcpModernProtocol??'unknown'} · auth ${e.mcpAuth??'unknown'}`;
  p.textContent=data.ok?'MCP discovery evidence collected locally. No tool was invoked and no authorization flow was started.':(data.error??'MCP inspection failed.');
  const d=data.diagnosis;if(d)recommendation.textContent=`KATA: ${d.status??'unknown'} · ${d.primaryPath??'unknown'} — ${d.recommendedAction??''}`;else if(data.diagnosisError)recommendation.textContent=`KATA diagnosis unavailable: ${data.diagnosisError}`;
  const local={endpoint:data.endpoint??null,server:data.server??null,authorization:data.authorization??null,environment:e};pre.textContent=JSON.stringify(local,null,2);mcpSummary.append(strong,p,recommendation,pre);mcpResult.hidden=false;
}

button.addEventListener('click',async()=>{button.disabled=true;result.hidden=true;status.textContent='Inspecting the explicitly authorized active tab…';try{render(await chrome.runtime.sendMessage({type:'inspect-active-tab',intent:intent.value})??{ok:false,error:'No response from the KATA extension service worker.'});}catch(error){status.textContent=String(error?.message??error);result.hidden=true;}finally{button.disabled=false;}});
apiButton.addEventListener('click',async()=>{apiButton.disabled=true;apiResult.hidden=true;status.textContent='Discovering API descriptions and compiling local preview-only agent contracts…';try{const data=await chrome.runtime.sendMessage({type:'compile-api-tools',includeWellKnownCatalog:true,maxDescriptions:3,maxTools:50});renderApiTools(data??{ok:false,error:'No API compiler response.'});status.textContent='API agent contracts compiled locally. No target operation was executed.';}catch(error){status.textContent=String(error?.message??error);apiResult.hidden=true;}finally{apiButton.disabled=false;}});
mcpButton.addEventListener('click',async()=>{mcpButton.disabled=true;mcpResult.hidden=true;status.textContent='Inspecting the user-authorized same-origin MCP endpoint…';try{const data=await chrome.runtime.sendMessage({type:'inspect-mcp-endpoint',endpoint:mcpEndpoint.value||'/mcp'});renderMcp(data??{ok:false,error:'No MCP inspection response.'});status.textContent='MCP inspection complete.';}catch(error){status.textContent=String(error?.message??error);mcpResult.hidden=true;}finally{mcpButton.disabled=false;}});
