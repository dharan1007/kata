const byId=id=>document.getElementById(id);
const status=byId('status'),result=byId('result'),runtimeList=byId('runtime'),diagnosis=byId('diagnosis'),blockers=byId('blockers'),button=byId('inspect'),intent=byId('intent');
const mcpButton=byId('inspect-mcp'),mcpEndpoint=byId('mcp-endpoint'),mcpResult=byId('mcp-result'),mcpSummary=byId('mcp-summary');

function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
function addPair(term,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=value??'Unknown';runtimeList.append(dt,dd);}
function render(data){
  clear(runtimeList);clear(diagnosis);clear(blockers);const r=data.runtime??{};
  addPair('Page',r.url??'Unavailable');addPair('Secure context',String(Boolean(r.secureContext)));addPair('Frameworks',(r.frameworkHints??[]).map(x=>x.name).join(', ')||'No framework marker established');addPair('Open shadow roots',String(r.dom?.openShadowRoots??0));addPair('Iframes',String(r.dom?.iframes??0));
  if(data.ok){const d=data.diagnosis??{};const strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=`${d.status??'unknown'} · ${d.primaryPath??'unknown'}`;p.textContent=d.recommendedAction??'No recommendation returned.';diagnosis.append(strong,p);for(const item of d.blockers??[]){const li=document.createElement('li'),title=document.createElement('strong'),reason=document.createElement('p'),remediation=document.createElement('p');title.textContent=item.code??'Restriction';reason.textContent=item.reason??'';remediation.textContent=item.remediation??'';li.append(title,reason,remediation);blockers.append(li);}if(!(d.blockers??[]).length){const li=document.createElement('li');li.textContent='No blocking condition was established from the observed evidence.';blockers.append(li);}status.textContent='Inspection complete.';}else{const p=document.createElement('p');p.textContent=data.error??'Inspection failed.';diagnosis.append(p);status.textContent='Local inspection completed, but KATA diagnosis was unavailable.';}result.hidden=false;
}
function renderMcp(data){
  clear(mcpSummary);const strong=document.createElement('strong'),p=document.createElement('p'),recommendation=document.createElement('p'),pre=document.createElement('pre');const e=data.environment??{};
  strong.textContent=`${e.mcpEndpoint??'unknown'} · ${e.mcpModernProtocol??'unknown'} · auth ${e.mcpAuth??'unknown'}`;
  p.textContent=data.ok?'MCP discovery evidence collected locally. No tool was invoked and no authorization flow was started.':(data.error??'MCP inspection failed.');
  const d=data.diagnosis;if(d)recommendation.textContent=`KATA: ${d.status??'unknown'} · ${d.primaryPath??'unknown'} — ${d.recommendedAction??''}`;else if(data.diagnosisError)recommendation.textContent=`KATA diagnosis unavailable: ${data.diagnosisError}`;
  const local={endpoint:data.endpoint??null,server:data.server??null,authorization:data.authorization??null,environment:e};pre.textContent=JSON.stringify(local,null,2);mcpSummary.append(strong,p,recommendation,pre);mcpResult.hidden=false;
}

button.addEventListener('click',async()=>{button.disabled=true;result.hidden=true;status.textContent='Inspecting the explicitly authorized active tab…';try{render(await chrome.runtime.sendMessage({type:'inspect-active-tab',intent:intent.value})??{ok:false,error:'No response from the KATA extension service worker.'});}catch(error){status.textContent=String(error?.message??error);result.hidden=true;}finally{button.disabled=false;}});
mcpButton.addEventListener('click',async()=>{mcpButton.disabled=true;mcpResult.hidden=true;status.textContent='Inspecting the user-authorized same-origin MCP endpoint…';try{const data=await chrome.runtime.sendMessage({type:'inspect-mcp-endpoint',endpoint:mcpEndpoint.value||'/mcp'});renderMcp(data??{ok:false,error:'No MCP inspection response.'});status.textContent='MCP inspection complete.';}catch(error){status.textContent=String(error?.message??error);mcpResult.hidden=true;}finally{mcpButton.disabled=false;}});
