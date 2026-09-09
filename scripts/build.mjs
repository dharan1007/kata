import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReleaseContract} from './release-contract.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(path.join(out,'src'),{recursive:true});

const assets=['index.html','style.css','favicon.svg','robots.txt','src/main.js','src/app.js','src/webmcp.js','src/runtime-probe.js','src/api-discovery.js','src/api-adapter.js','src/api-execution.js','src/mcp-adapter.js','lib/shared/tool-contracts.js','lib/shared/schema.js'];
const extensionAssets=['manifest.json','popup.html','popup.js','popup.css','README.md'];
const integrity={version:'3.0.0',generatedAt:new Date().toISOString(),assets:{}};
async function emit(rel,bytes){
  const dst=path.join(out,rel);await fs.mkdir(path.dirname(dst),{recursive:true});await fs.writeFile(dst,bytes);
  integrity.assets[`/${rel}`]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
for(const rel of assets)await emit(rel,await fs.readFile(path.join(root,rel)));
for(const rel of extensionAssets)await emit(`extension/${rel}`,await fs.readFile(path.join(root,'extension',rel)));
const workerSource=await fs.readFile(path.join(root,'extension/service-worker.js'),'utf8');
const rewrites=[['../src/runtime-probe.js','./runtime-probe.js'],['../src/api-discovery.js','./api-discovery.js'],['../src/api-adapter.js','./api-adapter.js'],['../src/api-execution.js','./api-execution.js'],['../src/mcp-adapter.js','./mcp-adapter.js']];
let packagedWorker=workerSource;
for(const [from,to] of rewrites){const next=packagedWorker.replace(from,to);if(next===packagedWorker)throw new Error(`Extension worker canonical import rewrite did not apply: ${from}`);packagedWorker=next;}
await emit('extension/service-worker.js',Buffer.from(packagedWorker));
for(const rel of ['runtime-probe.js','api-discovery.js','api-adapter.js','api-execution.js','mcp-adapter.js'])await emit(`extension/${rel}`,await fs.readFile(path.join(root,'src',rel)));
const schemaImport='../lib/shared/schema.js';
const packagedMcp=await fs.readFile(path.join(out,'extension/mcp-adapter.js'),'utf8');
if(packagedMcp.includes(schemaImport)){
  await emit('extension/lib/shared/schema.js',await fs.readFile(path.join(root,'lib/shared/schema.js')));
}

const integrityBytes=Buffer.from(JSON.stringify(integrity,null,2));
const integritySha256=createHash('sha256').update(integrityBytes).digest('hex');
const release=createReleaseContract(process.env,{integritySha256,integrityBytes:integrityBytes.length});
await fs.writeFile(path.join(out,'integrity.json'),integrityBytes);
await fs.writeFile(path.join(out,'release.json'),JSON.stringify(release,null,2));
console.log(`Built ${Object.keys(integrity.assets).length} canonical static assets with SHA-256 integrity manifest and release provenance contract (${release.source.provenance}, integrity-bound).`);
