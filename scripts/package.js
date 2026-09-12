'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const validation=require('./release-check').run();
const root=path.resolve(__dirname,'..'),manifest=require('./release-files.json'),version=validation.version;
function valid(relative){return typeof relative==='string'&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).some(x=>x==='..'||x==='')&&!/[\r\n]/.test(relative);}
function verify(relative){if(!valid(relative))throw Error('Unsafe release path');const full=path.join(root,relative);if(!fs.lstatSync(full).isFile()||fs.lstatSync(full).isSymbolicLink())throw Error('Not a regular release file: '+relative);const text=fs.readFileSync(full,'utf8');for(const pattern of [/[A-Z]:[\\/]Users[\\/][^\\/\s]+/i,/E:[\\/]OneComme/i,/["'](?:writeToken|readToken|credential)["']\s*:\s*["'][a-f0-9]{64}["']/i])if(pattern.test(text))throw Error('Private fixture/path/credential detected: '+relative);}
function copy(relative,dest){const to=path.join(dest,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,relative),to);}
function entries(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?entries(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]).sort();}
function inventory(dir){return entries(dir).map(name=>({path:name,bytes:fs.statSync(path.join(dir,name)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')}));}
function zip(dir,file){const quote=x=>"'"+x.replace(/'/g,"''")+"'";cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('+quote(dir)+', '+quote(file)+')'],{windowsHide:true,stdio:'inherit'});}
const install=[...new Set(manifest.install)],source=[...new Set([...install,...manifest.source])];for(const f of source)verify(f);
for(const f of ['index.html','obs-live.html']){const html=fs.readFileSync(path.join(root,f),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const ref=m[1];if(/^(https?:|data:)/.test(ref))throw Error('External entry asset: '+ref);if(ref.includes('?')||!install.includes(ref))throw Error('Missing or incompatible entry asset: '+ref);}}
const out=path.join(root,'dist','release-'+version+'-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});const clean=path.join(out,'github-source'),bundle=path.join(out,'installer'),plugin=path.join(bundle,'local.yt-rank-show.plugin');
fs.writeFileSync(path.join(out,'VALIDATION.json'),JSON.stringify(validation,null,2));
for(const f of source)copy(f,clean);for(const f of install)copy(f,plugin);
fs.copyFileSync(path.join(root,'docs','INSTALL.md'),path.join(bundle,'先看我－安裝與升級說明.txt'));fs.copyFileSync(path.join(root,'docs','PRIVACY.md'),path.join(bundle,'隱私與資料保存說明.txt'));
fs.writeFileSync(path.join(bundle,'FILE-MANIFEST.json'),JSON.stringify({version,files:inventory(bundle)},null,2));
const installer=path.join(out,'YT-Rank-Show-'+version+'-Windows.zip'),sourceZip=path.join(out,'YT-Rank-Show-'+version+'-Source.zip');zip(bundle,installer);zip(clean,sourceZip);
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),[installer,sourceZip].map(f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')+'  '+path.basename(f)).join('\n')+'\n');
console.log(JSON.stringify({version,output:out,cleanSource:clean,installer,sourceZip,installFiles:install.length,sourceFiles:source.length},null,2));
