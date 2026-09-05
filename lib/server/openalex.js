export function buildOpenAlexUrl(query,limit=8){
  const q=String(query??'').trim(); if(!q||q.length>240)throw new Error('INVALID_QUERY'); const n=Math.max(1,Math.min(25,Number.parseInt(limit,10)||8));
  const url=new URL('https://api.openalex.org/works'); url.searchParams.set('search',q); url.searchParams.set('per-page',String(n)); url.searchParams.set('select','id,title,publication_year,cited_by_count,authorships,doi,primary_location'); return url;
}
function workId(id){return String(id??'').split('/').filter(Boolean).at(-1)??'';}
function mapWork(w){return{id:workId(w.id),openAlexId:String(w.id??''),title:String(w.title??'Untitled'),year:Number.isInteger(w.publication_year)?w.publication_year:null,citations:Number.isFinite(w.cited_by_count)?w.cited_by_count:0,authors:(w.authorships??[]).map(x=>x?.author?.display_name).filter(Boolean).slice(0,8),doi:w.doi??null,url:w.primary_location?.landing_page_url??w.doi??w.id??null};}
function numericHeader(headers,name){const raw=headers?.get?.(name);if(raw==null||raw==='')return null;const value=Number(raw);return Number.isFinite(value)?value:null;}
function rateLimitMeta(headers){
  const rateLimit={limit:numericHeader(headers,'x-ratelimit-limit'),remaining:numericHeader(headers,'x-ratelimit-remaining'),creditsUsed:numericHeader(headers,'x-ratelimit-credits-used'),resetSeconds:numericHeader(headers,'x-ratelimit-reset')};
  return Object.values(rateLimit).some(value=>value!=null)?rateLimit:null;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function searchOpenAlex(query,limit=8,options={}){
  const fetchImpl=options.fetchImpl??fetch, retries=options.retries??2, retryDelayMs=options.retryDelayMs??150, timeoutMs=options.timeoutMs??8000, url=buildOpenAlexUrl(query,limit);
  const apiKey=String(options.apiKey??process.env.OPENALEX_API_KEY??'').trim();
  const headers={Accept:'application/json','User-Agent':'KATA-WebMCP/3.0',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})};
  for(let attempt=0;;attempt++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(new Error('UPSTREAM_TIMEOUT')),timeoutMs); let res;
    try{res=await fetchImpl(url,{signal:controller.signal,headers});}catch(error){clearTimeout(timer); if(controller.signal.aborted)throw new Error('UPSTREAM_TIMEOUT'); if(attempt<retries){await sleep(retryDelayMs*(attempt+1));continue;} throw new Error('UPSTREAM_UNAVAILABLE');} clearTimeout(timer);
    if((res.status===429||res.status>=500)&&attempt<retries){await sleep(retryDelayMs*(attempt+1));continue;} if(res.status===429)throw new Error('UPSTREAM_RATE_LIMITED'); if(!res.ok)throw new Error('UPSTREAM_UNAVAILABLE');
    let data; try{data=await res.json();}catch{throw new Error('UPSTREAM_INVALID_RESPONSE');} if(!Array.isArray(data.results))throw new Error('UPSTREAM_INVALID_RESPONSE');
    const rateLimit=rateLimitMeta(res.headers);
    return{works:data.results.map(mapWork).filter(w=>w.id),meta:{source:'openalex',query:String(query).trim(),count:data.results.length,...(rateLimit?{rateLimit}:{})}};
  }
}
