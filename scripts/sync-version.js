'use strict';
// VERSION is authoritative. Other version labels are generated, never hand-edited.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
function expected(){
 const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid VERSION');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));pkg.version=version;
 return new Map([
  ['app-version.js',`/* Generated from VERSION by scripts/sync-version.js. */\n(function(root){const version='${version}';if(typeof module==='object'&&module.exports)module.exports=version;else root.APP_VERSION=version;})(globalThis);\n`],
  ['package.json',JSON.stringify(pkg,null,2)+'\n'],
  ['index.html',fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/v\d+\.\d+\.\d+/g,'v'+version)],
  ['docs/INSTALL.md',fs.readFileSync(path.join(root,'docs/INSTALL.md'),'utf8').replace(/<!-- Release [\d.]+ -->/,'<!-- Release '+version+' -->')]
 ]);
}
function normalizeNewlines(value){return value.replace(/\r\n/g,'\n');}
function sync(check=false){const changes=[];for(const [file,value] of expected()){const target=path.join(root,file);if(normalizeNewlines(fs.readFileSync(target,'utf8'))!==normalizeNewlines(value)){changes.push(file);if(!check)fs.writeFileSync(target,value);}}if(check&&changes.length)throw Error('Version labels stale; run node scripts/sync-version.js: '+changes.join(', '));return changes;}
if(require.main===module)console.log(JSON.stringify({changed:sync(process.argv.includes('--check'))}));
module.exports={sync};
