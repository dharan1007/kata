import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'dist');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(path.join(out,'src'),{recursive:true});
const assets=['index.html','style.css','favicon.svg','robots.txt','src/main.js','src/app.js','src/webmcp.js'];const manifest={version:'3.0.0',generatedAt:new Date().toISOString(),assets:{}};
for(const rel of assets){const src=path.join(root,rel),dst=path.join(out,rel);await fs.mkdir(path.dirname(dst),{recursive:true});const bytes=await fs.readFile(src);await fs.writeFile(dst,bytes);manifest.assets[`/${rel}`]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};}
await fs.writeFile(path.join(out,'integrity.json'),JSON.stringify(manifest,null,2));console.log(`Built ${assets.length} canonical static assets with SHA-256 integrity manifest.`);
