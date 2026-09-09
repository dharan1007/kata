import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReleaseContract} from './release-contract.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(path.join(out,'src'),{recursive:true});

const assets=['index.html','style.css','favicon.svg','robots.txt','src/main.js','src/app.js','src/webmcp.js','src/runtime-probe.js','lib/shared/tool-contracts.js'];
const integrity={version:'3.0.0',generatedAt:new Date().toISOString(),assets:{}};
for(const rel of assets){
  const src=path.join(root,rel),dst=path.join(out,rel);
  await fs.mkdir(path.dirname(dst),{recursive:true});
  const bytes=await fs.readFile(src);
  await fs.writeFile(dst,bytes);
  integrity.assets[`/${rel}`]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}

const integrityBytes=Buffer.from(JSON.stringify(integrity,null,2));
const integritySha256=createHash('sha256').update(integrityBytes).digest('hex');
const release=createReleaseContract(process.env,{integritySha256,integrityBytes:integrityBytes.length});
await fs.writeFile(path.join(out,'integrity.json'),integrityBytes);
await fs.writeFile(path.join(out,'release.json'),JSON.stringify(release,null,2));
console.log(`Built ${assets.length} canonical static assets with SHA-256 integrity manifest and release provenance contract (${release.source.provenance}, integrity-bound).`);
