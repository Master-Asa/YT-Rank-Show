'use strict';
const {execFile}=require('node:child_process'),path=require('node:path');
function showConfirmation(candidate){
 if(process.platform!=='win32')return {result:Promise.reject(Error('確認小視窗僅支援 Windows')),cancel(){}};
 let child;const result=new Promise((resolve,reject)=>{
  child=execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'..','scripts','confirm-live.ps1')],{windowsHide:true,timeout:10*60*1000,maxBuffer:65536,encoding:'utf8'},(error,stdout)=>{if(error)return reject(Error('確認視窗未完成，紀錄仍保留；可在管理頁手動確認。'));try{const value=JSON.parse(stdout.replace(/^\uFEFF/,''));if(!['accept','reject','later'].includes(value.choice))throw Error();resolve(value.choice);}catch{reject(Error('確認視窗回覆無效，沒有加入統計。'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({...candidate,parentPid:process.pid}));
 });return {result,cancel(){child?.kill();}};
}
function createConfirmationController(runtime,{show=showConfirmation,intervalMs=1000,settleMs=2500,now=Date.now,autoStart=true}={}){
 let closed=false,active=null;const deferred=new Set(),seen=new Map();
 function tick(){if(closed)return;let candidates;try{candidates=runtime.pendingConfirmations();}catch{return;}
  if(active){if(!candidates.some(c=>c.token===active.candidate.token)){const old=active;active=null;old.cancel();}else return;}
  const keys=new Set(candidates.map(c=>c.token));for(const key of seen.keys())if(!keys.has(key))seen.delete(key);
  for(const candidate of candidates){if(deferred.has(candidate.key))continue;if(!seen.has(candidate.token)){seen.set(candidate.token,now());continue;}if(now()-seen.get(candidate.token)<settleMs)continue;
   let handle;try{handle=show(candidate);}catch{deferred.add(candidate.key);runtime.setPromptWarning('無法開啟確認視窗，請在管理頁手動确认。');continue;}
   const current={candidate,cancel:()=>handle.cancel()};active=current;
   Promise.resolve(handle.result).then(async choice=>{if(closed||active!==current)return;if(choice==='accept'||choice==='reject'){const saved=await runtime.confirmCandidate(candidate,choice);if(saved)runtime.setPromptWarning('');}else deferred.add(candidate.key);}).catch(()=>{if(!closed&&active===current){deferred.add(candidate.key);runtime.setPromptWarning('確認視窗或存檔未完成，紀錄仍保留；請在管理頁核對後重試。');}}).finally(()=>{if(active===current)active=null;});return;
  }
 }
 const timer=autoStart?setInterval(tick,Math.max(100,intervalMs)):null;timer?.unref?.();if(autoStart)tick();
 return {tick,close(){closed=true;if(timer)clearInterval(timer);active?.cancel();active=null;},get active(){return !!active;}};
}
module.exports={showConfirmation,createConfirmationController};
