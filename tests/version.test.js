'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const os=require('node:os'),cp=require('node:child_process');
test('version gate accepts Windows checkout newlines but rejects stale versions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-version-check-'));
 try{
  fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'docs'));
  for(const file of ['VERSION','app-version.js','package.json','index.html','docs/INSTALL.md','scripts/sync-version.js']){
   const text=fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r?\n/g,'\r\n');
   fs.writeFileSync(path.join(dir,file),text);
  }
  const run=()=>cp.execFileSync(process.execPath,[path.join(dir,'scripts/sync-version.js'),'--check'],{stdio:'pipe',windowsHide:true});
  assert.doesNotThrow(run);
  fs.writeFileSync(path.join(dir,'VERSION'),'999.0.0\r\n');
  assert.throws(run,/Version labels stale/);
 }finally{fs.rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
test('release metadata agrees with shared browser/plugin version',()=>{
 const version=require('../app-version');
 assert.equal(require('../package.json').version,version);
 assert.equal(fs.readFileSync(path.join(__dirname,'../VERSION'),'utf8').trim(),version);
 assert.ok(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').includes('v'+version));
});
