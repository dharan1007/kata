import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const js=walk(root).filter(f=>f.endsWith('.js')&&!f.includes('/dist/'));
for(const file of js)execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const source=js.map(f=>fs.readFileSync(f,'utf8')).join('\n');
for(const bad of [/\beval\s*\(/,/new\s+Function\s*\(/,/\burl\.parse\s*\(/])if(bad.test(source))throw new Error(`Forbidden source pattern: ${bad}`);

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(/\son[a-z]+\s*=/i.test(html)||/\sstyle\s*=/i.test(html))throw new Error('Inline handlers/styles violate CSP');
const extensionHtml=fs.readFileSync(path.join(root,'extension/popup.html'),'utf8');
if(/\son[a-z]+\s*=/i.test(extensionHtml)||/\sstyle\s*=/i.test(extensionHtml)||/<script(?![^>]*\bsrc=)[^>]*>/i.test(extensionHtml))throw new Error('Extension popup contains inline executable/style content');
const extensionManifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
if(extensionManifest.manifest_version!==3||Number(extensionManifest.minimum_chrome_version)!==95)throw new Error('Extension Manifest V3/minimum Chrome contract failed');
if(JSON.stringify([...extensionManifest.permissions].sort())!==JSON.stringify(['activeTab','scripting']))throw new Error('Extension permission set drifted from activeTab+scripting');
if(JSON.stringify(extensionManifest.host_permissions)!==JSON.stringify(['https://kata-webmcp.vercel.app/*']))throw new Error('Extension host permission must remain limited to canonical KATA production');
const forbiddenExtensionPermissions=['cookies','webRequest','debugger','history','downloads','nativeMessaging','clipboardRead','clipboardWrite'];
for(const permission of forbiddenExtensionPermissions)if(extensionManifest.permissions.includes(permission))throw new Error(`Forbidden extension permission ${permission}`);
const manifestText=JSON.stringify(extensionManifest);
if(manifestText.includes('<all_urls>')||manifestText.includes('https://*/')||manifestText.includes('http://*/'))throw new Error('Extension must not request broad host access');

const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const headers=config.headers?.[0]?.headers??[];
const csp=headers.find(x=>x.key==='Content-Security-Policy')?.value??'';
if(!csp.includes("script-src 'self'")||csp.includes('unsafe-inline')||csp.includes('unsafe-eval')||!csp.includes("frame-ancestors 'none'"))throw new Error('CSP release contract failed');
const expected=['/dashboard','/research','/automations','/teach','/tools','/developers','/activity','/learn','/settings'];
const rewrites=new Set(config.rewrites.map(x=>x.source));
for(const r of expected)if(!rewrites.has(r))throw new Error(`Missing product rewrite ${r}`);

const dist=path.join(root,'dist');
const distJs=walk(dist).filter(f=>f.endsWith('.js'));
for(const file of distJs){
  const text=fs.readFileSync(file,'utf8');
  const refs=[...text.matchAll(/(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(m=>m[1]);
  for(const ref of refs){
    const target=path.resolve(path.dirname(file),ref);
    if(!target.startsWith(`${dist}${path.sep}`)||!fs.existsSync(target))throw new Error(`Broken production module import ${path.relative(dist,file)} -> ${ref}`);
  }
}
for(const module of ['runtime-probe.js','api-discovery.js','api-adapter.js','api-execution.js','mcp-adapter.js']){
  const packaged=fs.readFileSync(path.join(dist,'extension',module),'utf8');
  const canonical=fs.readFileSync(path.join(root,'src',module),'utf8');
  if(packaged!==canonical)throw new Error(`Extension ${module} drifted from canonical browser module`);
}
const packagedWorker=fs.readFileSync(path.join(dist,'extension/service-worker.js'),'utf8');
for(const module of ['runtime-probe.js','api-discovery.js','api-adapter.js','api-execution.js','mcp-adapter.js'])if(!packagedWorker.includes(`from './${module}'`))throw new Error(`Extension service worker does not import packaged canonical ${module}`);
if(!packagedWorker.includes("world:'MAIN',func:executePageApiRequest"))throw new Error('Extension API execution must remain in the authorized page MAIN world');
const packagedMcpAdapter=fs.readFileSync(path.join(dist,'extension/mcp-adapter.js'),'utf8');
if(!packagedMcpAdapter.includes("credentials:'omit'")||!packagedMcpAdapter.includes('automaticRetries:false')||!packagedMcpAdapter.includes("redirect:'manual'"))throw new Error('Canonical packaged MCP adapter must preserve credential-free/manual-redirect/no-auto-retry execution boundaries');

const integrityBytes=fs.readFileSync(path.join(root,'dist/integrity.json'));
const manifest=JSON.parse(integrityBytes.toString('utf8'));
for(const [rel,meta] of Object.entries(manifest.assets)){
  const b=fs.readFileSync(path.join(root,'dist',rel.slice(1)));
  const sha=createHash('sha256').update(b).digest('hex');
  if(sha!==meta.sha256)throw new Error(`Integrity mismatch ${rel}`);
}
for(const requiredExtensionAsset of ['/extension/manifest.json','/extension/service-worker.js','/extension/runtime-probe.js','/extension/api-discovery.js','/extension/api-adapter.js','/extension/api-execution.js','/extension/mcp-adapter.js','/extension/popup.html','/extension/popup.js','/extension/popup.css'])if(!manifest.assets[requiredExtensionAsset])throw new Error(`Extension asset not integrity-bound: ${requiredExtensionAsset}`);
for(const requiredWebAsset of ['/src/api-discovery.js','/src/api-adapter.js','/src/api-execution.js','/src/mcp-adapter.js'])if(!manifest.assets[requiredWebAsset])throw new Error(`Web interoperability asset not integrity-bound: ${requiredWebAsset}`);

const release=JSON.parse(fs.readFileSync(path.join(root,'dist/release.json'),'utf8'));
if(release.schemaVersion!==2||release.service!=='kata-webmcp'||release.version!=='3.0.0')throw new Error('Invalid release provenance contract');
const required=new Set((release.deployment?.requiredRoutes??[]).map(x=>`${x.method} ${x.path}`));
for(const route of ['GET /','GET /release.json','GET /integrity.json','GET /api/health','GET /api/capabilities','GET /api/agents','GET /api/openapi','POST /api/invoke','POST /api/mcp'])if(!required.has(route))throw new Error(`Release contract missing ${route}`);
if(process.env.GITHUB_SHA&&release.source?.sha!==process.env.GITHUB_SHA.toLowerCase())throw new Error('Release source SHA does not match GITHUB_SHA');
const integrityEvidence=release.evidence?.integrity;
const manifestSha256=createHash('sha256').update(integrityBytes).digest('hex');
if(integrityEvidence?.path!=='/integrity.json')throw new Error('Release contract integrity path mismatch');
if(integrityEvidence?.sha256!==manifestSha256)throw new Error('Release contract does not bind the emitted integrity manifest');
if(integrityEvidence?.bytes!==integrityBytes.length)throw new Error('Release contract integrity byte count mismatch');

console.log(`Static/security check passed: ${js.length} JS modules, ${expected.length+1} product routes, ${Object.keys(manifest.assets).length} integrity assets, ${distJs.length} production modules import-resolved, active-tab extension permission/runtime/API/MCP adapter parity enforced, source provenance ${release.source?.provenance}, integrity evidence bound.`);