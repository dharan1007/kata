#!/usr/bin/env node
const DEFAULT_BASE='https://kata-webmcp.vercel.app';
const MAX_RESPONSE_BYTES=2*1024*1024;
const TIMEOUT_MS=10000;

function usage(){return `KATA CLI\n\nUsage:\n  kata health [--base https://...]\n  kata capabilities [--base https://...]\n  kata pricing [--base https://...]\n  kata readiness [--base https://...]\n  kata search <query> [--limit 8] [--base https://...]\n  kata invoke <tool> [--args '{"key":"value"}'] [--base https://...]\n  kata doctor [--base https://...]\n\nAuthentication, when required by future commercial endpoints, is read only from KATA_TOKEN. Tokens are never accepted as command-line arguments.\n`;}
function cliError(message,code=2){const error=new Error(message);error.exitCode=code;throw error;}
function parse(argv){
  const positional=[];const options={};
  for(let i=0;i<argv.length;i++){
    const token=argv[i];if(!token.startsWith('--')){positional.push(token);continue;}
    const key=token.slice(2);if(key==='token')cliError('TOKEN_MUST_USE_KATA_TOKEN_ENV');
    const value=argv[i+1];if(!value||value.startsWith('--'))cliError(`MISSING_OPTION_VALUE:${key}`);options[key]=value;i++;
  }
  return{positional,options};
}
function baseUrl(value){
  let url;try{url=new URL(value||DEFAULT_BASE);}catch{cliError('INVALID_BASE_URL');}
  const local=['localhost','127.0.0.1','::1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'))cliError('HTTPS_BASE_REQUIRED');
  if(url.username||url.password||url.search||url.hash)cliError('INVALID_BASE_URL');
  url.pathname=url.pathname.replace(/\/+$/,'');return url;
}
async function boundedJson(response){
  const declared=Number(response.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new Error('RESPONSE_TOO_LARGE');
  const reader=response.body?.getReader();if(!reader){const text=await response.text();if(Buffer.byteLength(text)>MAX_RESPONSE_BYTES)throw new Error('RESPONSE_TOO_LARGE');return text?JSON.parse(text):{};}
  const chunks=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch{}throw new Error('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}
  const text=Buffer.concat(chunks,total).toString('utf8');return text?JSON.parse(text):{};
}
async function request(base,path,{method='GET',body}={}){
  const target=new URL(path,`${base.origin}${base.pathname.replace(/\/$/,'')}/`);
  const headers={'accept':'application/json','user-agent':'kata-cli/3.0.0'};if(body!==undefined)headers['content-type']='application/json';if(process.env.KATA_TOKEN)headers.authorization=`Bearer ${process.env.KATA_TOKEN}`;
  let response;try{response=await fetch(target,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS)});}catch(error){throw new Error(error?.name==='TimeoutError'?'REQUEST_TIMEOUT':'REQUEST_FAILED');}
  if(response.status>=300&&response.status<400)throw new Error('UNEXPECTED_REDIRECT');
  let payload;try{payload=await boundedJson(response);}catch(error){if(error?.message==='RESPONSE_TOO_LARGE')throw error;throw new Error('INVALID_JSON_RESPONSE');}
  if(!response.ok){const error=new Error(payload?.error?.code||`HTTP_${response.status}`);error.httpStatus=response.status;error.details=payload?.error?.details;throw error;}
  return payload;
}
function print(value){process.stdout.write(`${JSON.stringify(value,null,2)}\n`);}
async function doctor(base){
  const checks=[
    ['health','/api/health'],['release','/release.json'],['integrity','/integrity.json'],['capabilities','/api/capabilities'],['openapi','/api/openapi'],['pricing','/api/pricing'],['commercialReadiness','/api/readiness/commercial']
  ];
  const results={};
  for(const [name,path] of checks){const started=Date.now();try{results[name]={ok:true,latencyMs:Date.now()-started,data:await request(base,path)};}catch(error){results[name]={ok:false,latencyMs:Date.now()-started,error:String(error?.message||error)};}}
  const release=results.release?.data,health=results.health?.data,capabilities=results.capabilities?.data;
  const structural={healthOk:health?.ok===true,sourceBound:release?.source?.provenance==='source-bound',canonicalRepo:release?.source?.repository==='dharan1007/kata',capabilityCount:Array.isArray(capabilities?.capabilities?.tools)?capabilities.capabilities.tools.length:0};
  return{ok:Object.values(results).every(item=>item.ok)&&structural.healthOk&&structural.sourceBound&&structural.canonicalRepo,base:base.origin+base.pathname,structural,checks:results};
}
async function main(){
  const [command,...rest]=process.argv.slice(2);if(!command||['help','--help','-h'].includes(command)){process.stdout.write(usage());return;}
  const {positional,options}=parse(rest);const base=baseUrl(options.base);
  if(command==='health')return print(await request(base,'/api/health'));
  if(command==='capabilities')return print(await request(base,'/api/capabilities'));
  if(command==='pricing')return print(await request(base,'/api/pricing'));
  if(command==='readiness')return print(await request(base,'/api/readiness/commercial'));
  if(command==='search'){
    const query=positional.join(' ').trim();if(!query)cliError('QUERY_REQUIRED');const limit=Number(options.limit??8);if(!Number.isInteger(limit)||limit<1||limit>25)cliError('INVALID_LIMIT');return print(await request(base,`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`));
  }
  if(command==='invoke'){
    const name=positional[0];if(!name)cliError('TOOL_REQUIRED');let args={};if(options.args){try{args=JSON.parse(options.args);}catch{cliError('INVALID_ARGS_JSON');}if(!args||typeof args!=='object'||Array.isArray(args))cliError('INVALID_ARGS_JSON');}
    return print(await request(base,'/api/invoke',{method:'POST',body:{name,arguments:args}}));
  }
  if(command==='doctor'){const result=await doctor(base);print(result);if(!result.ok)process.exitCode=5;return;}
  cliError('UNKNOWN_COMMAND');
}
main().catch(error=>{const message=String(error?.message||error||'INTERNAL_ERROR').replace(/[\r\n]+/g,' ');let code=Number(error?.exitCode)||5;if(error?.httpStatus===401||error?.httpStatus===403)code=4;else if(error?.httpStatus===429)code=3;else if(error?.httpStatus>=400&&error?.httpStatus<500)code=2;process.stderr.write(`KATA_ERROR ${message}\n`);process.exitCode=code;});
