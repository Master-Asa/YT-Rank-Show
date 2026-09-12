'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
function run(){
 require('./sync-version').sync(true);
 const manifest=require('./release-files.json'),files=[...new Set([...manifest.install,...manifest.source])].sort();
 if(files.length!==manifest.install.length+manifest.source.length)throw Error('Duplicate release manifest entry');
 for(const relative of files.filter(f=>f.endsWith('.js'))){const code=fs.readFileSync(path.join(root,relative),'utf8');for(const match of code.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const base=path.resolve(path.dirname(path.join(root,relative)),match[1]),target=[base,base+'.js',base+'.json',path.join(base,'index.js')].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(!target||!files.includes(path.relative(root,target).replace(/\\/g,'/')))throw Error('Unbundled local dependency: '+relative+' -> '+match[1]);}}
 if(!manifest.install.includes('vendor/BOOTSTRAP-LICENSE.txt')||!manifest.install.includes('docs/THIRD-PARTY-NOTICES.md'))throw Error('Missing third-party license notices');
 const denyPath=/^(?:data|output|backups|artifacts|implementation|mockup|node_modules|dist)\//;
 const digest=crypto.createHash('sha256');
 for(const file of files){
  if(path.isAbsolute(file)||file.split(/[\\/]/).some(x=>x==='..'||!x)||denyPath.test(file)||/\.(?:zip|log|jsonl|ttf|otf|woff2?|png|jpe?g|webp)$/i.test(file))throw Error('Private or unsafe release path: '+file);
  const target=path.join(root,file);if(!fs.lstatSync(target).isFile()||fs.lstatSync(target).isSymbolicLink())throw Error('Nonregular release file: '+file);
  const text=fs.readFileSync(target,'utf8');
  if(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/i.test(text)||/E:[\\/]OneComme/i.test(text)||/["'](?:writeToken|readToken|credential)["']\s*:\s*["'][a-f0-9]{64}["']/i.test(text))throw Error('Private path/credential: '+file);
  digest.update(file+'\0').update(text);
  if(file.endsWith('.js'))cp.execFileSync(process.execPath,['--check',target],{stdio:'pipe',windowsHide:true});
 }
 // Verify the transitive local script graph, not only files linked in index.html.
 for(const file of files.filter(x=>x.endsWith('.html'))){const html=fs.readFileSync(path.join(root,file),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(?:https?:|data:)/.test(m[1])||!manifest.install.includes(m[1]))throw Error('Unbundled/external entry asset: '+m[1]);}}
 const rounds=Number(process.env.YT_TEST_ROUNDS||3);if(!Number.isInteger(rounds)||rounds<1||rounds>5)throw Error('YT_TEST_ROUNDS must be 1..5');
 const tests=files.filter(x=>/^tests\/.*\.test\.js$/.test(x));
 // Windows integration tests launch PowerShell; avoid competing compiler/process startup across files.
 for(let i=1;i<=rounds;i++){console.log('Release test round '+i+'/'+rounds);cp.execFileSync(process.execPath,['--test','--test-concurrency=1',...tests],{cwd:root,stdio:'inherit',windowsHide:true});}
 return {version:fs.readFileSync(path.join(root,'VERSION'),'utf8').trim(),files:files.length,rounds,sourceSha256:digest.digest('hex')};
}
if(require.main===module)console.log(JSON.stringify(run()));module.exports={run};
