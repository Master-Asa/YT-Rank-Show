'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// One writer per data directory. A live process is never displaced.
async function acquireWriter(dataDir){
 await fs.mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'writer.lock'),owner={pid:process.pid,token:crypto.randomBytes(16).toString('hex')};
 for(let attempt=0;attempt<12;attempt++){
  try{await fs.writeFile(file,JSON.stringify(owner),{flag:'wx',mode:0o600});let released=false;return async()=>{if(released)return;released=true;try{const current=JSON.parse(await fs.readFile(file,'utf8'));if(current.token===owner.token)await fs.unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}};}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   let current;try{current=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw Error('背景資料鎖無法讀取；未改動紀錄，請檢查是否有另一份插件。');}
   if(!Number.isSafeInteger(current.pid)||current.pid<=0)throw Error('背景資料鎖格式不正確；未改動紀錄。');
   let alive=true;try{process.kill(current.pid,0);}catch(p){if(p.code==='ESRCH')alive=false;}
   if(!alive){const again=JSON.parse(await fs.readFile(file,'utf8'));if(again.token===current.token)await fs.unlink(file);continue;}
   if(current.pid!==process.pid||attempt===11)throw Error('已有背景程序正在使用同一份資料；沒有啟動第二個寫入者。');
   await new Promise(resolve=>setTimeout(resolve,250)); // host reload does not await destroy
  }
 }
 throw Error('無法取得背景資料鎖');
}
module.exports={acquireWriter};
