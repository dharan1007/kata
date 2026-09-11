import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);const cli=new URL('../bin/kata.mjs',import.meta.url);
async function server(){
  const seen=[];
  const http=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');seen.push({path:url.pathname,authorization:req.headers.authorization||null});res.setHeader('content-type','application/json');
    if(url.pathname==='/api/health')return res.end(JSON.stringify({ok:true,service:'kata'}));
    if(url.pathname==='/release.json')return res.end(JSON.stringify({source:{sha:'a'.repeat(40),provenance:'source-bound',authority:'vercel-git',repository:'dharan1007/kata',ref:'main'}}));
    if(url.pathname==='/integrity.json')return res.end(JSON.stringify({assets:{'/index.html':{sha256:'b'.repeat(64),bytes:1}}}));
    if(url.pathname==='/api/capabilities')return res.end(JSON.stringify({ok:true,capabilities:{tools:[{name:'kata_search_research'}]}}));
    if(url.pathname==='/api/openapi')return res.end(JSON.stringify({openapi:'3.1.0',paths:{'/api/mcp':{post:{}}}}));
    if(url.pathname==='/api/pricing')return res.end(JSON.stringify({ok:true,plans:[{id:'free',priceInrMonthly:0}]}));
    if(url.pathname==='/api/readiness/commercial')return res.end(JSON.stringify({ok:true,readiness:{status:'blocked'}}));
    if(url.pathname==='/api/search')return res.end(JSON.stringify({ok:true,results:[{title:url.searchParams.get('query')}]}));
    if(url.pathname==='/api/invoke'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;return res.end(JSON.stringify({ok:true,echo:JSON.parse(body)}));}
    res.statusCode=404;res.end(JSON.stringify({error:{code:'NOT_FOUND'}}));
  });
  await new Promise((ok,reject)=>http.listen(0,'127.0.0.1',ok).once('error',reject));const address=http.address();return{http,base:`http://127.0.0.1:${address.port}`,seen};
}

test('CLI health/search/invoke use the canonical HTTP contracts and KATA_TOKEN without echoing it',async()=>{
  const local=await server();const secret='kata_test_secret_never_echo';
  try{
    const env={...process.env,KATA_TOKEN:secret};
    const health=JSON.parse((await execFileAsync(process.execPath,[cli.pathname,'health','--base',local.base],{env,encoding:'utf8'})).stdout);assert.equal(health.ok,true);
    const search=JSON.parse((await execFileAsync(process.execPath,[cli.pathname,'search','causal reduction','--limit','3','--base',local.base],{env,encoding:'utf8'})).stdout);assert.equal(search.results[0].title,'causal reduction');
    const invoke=JSON.parse((await execFileAsync(process.execPath,[cli.pathname,'invoke','kata_search_research','--args','{"query":"x"}','--base',local.base],{env,encoding:'utf8'})).stdout);assert.deepEqual(invoke.echo,{name:'kata_search_research',arguments:{query:'x'}});
    assert.ok(local.seen.every(item=>item.authorization===`Bearer ${secret}`));assert.equal(JSON.stringify({health,search,invoke}).includes(secret),false);
  }finally{await new Promise(ok=>local.http.close(ok));}
});

test('CLI doctor verifies source-bound production structure across all required public surfaces',async()=>{
  const local=await server();try{const result=JSON.parse((await execFileAsync(process.execPath,[cli.pathname,'doctor','--base',local.base],{encoding:'utf8'})).stdout);assert.equal(result.ok,true);assert.equal(result.structural.healthOk,true);assert.equal(result.structural.sourceBound,true);assert.equal(result.structural.canonicalRepo,true);assert.equal(result.structural.capabilityCount,1);for(const key of ['health','release','integrity','capabilities','openapi','pricing','commercialReadiness'])assert.equal(result.checks[key].ok,true);}finally{await new Promise(ok=>local.http.close(ok));}
});

test('CLI forbids token command-line arguments and insecure non-local bases',async()=>{
  await assert.rejects(execFileAsync(process.execPath,[cli.pathname,'health','--token','secret'],{encoding:'utf8'}),error=>error.code===2&&/TOKEN_MUST_USE_KATA_TOKEN_ENV/.test(error.stderr));
  await assert.rejects(execFileAsync(process.execPath,[cli.pathname,'health','--base','http://example.com'],{encoding:'utf8'}),error=>error.code===2&&/HTTPS_BASE_REQUIRED/.test(error.stderr));
});
