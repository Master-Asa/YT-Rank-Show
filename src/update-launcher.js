'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process');
const {EventEmitter}=require('node:events');
// CREATE_DETACHED_PROCESS can make Windows PowerShell exit before executing -File.
// A short, normally-started bootstrap delegates lifetime separation to Start-Process.
async function startWindowsHelper(executable,args,options){
 const q=s=>"'"+s.replaceAll("'","''")+"'",task=options.cwd;
 const command='& '+q(path.join(task,'update-install.ps1'))+' *> '+q(path.join(task,'launcher.log'));
 const encoded=Buffer.from(command,'utf16le').toString('base64');
 const pidFile=path.join(task,'launcher-pid');await fs.rm(pidFile,{force:true});
 const script='$ErrorActionPreference="Stop";$p=Start-Process -FilePath '+q(executable)+' -ArgumentList @("-NoProfile","-NonInteractive","-STA","-ExecutionPolicy","Bypass","-EncodedCommand",'+q(encoded)+') -WorkingDirectory '+q(task)+' -WindowStyle Hidden -PassThru;[IO.File]::WriteAllText('+q(pidFile)+',[string]$p.Id)';
 let bootstrapError;const bootstrap=cp.spawn(executable,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe'});bootstrap.once('error',e=>{bootstrapError=e;});bootstrap.stdin.end();bootstrap.stdout.resume();bootstrap.stderr.resume();bootstrap.unref();bootstrap.stdout.unref?.();bootstrap.stderr.unref?.();
 let pid;const deadline=Date.now()+15000;while(Date.now()<deadline){try{const raw=(await fs.readFile(pidFile,'utf8')).trim();if(/^\d+$/.test(raw)){pid=Number(raw);break;}}catch{}if(bootstrapError)throw bootstrapError;await new Promise(r=>setTimeout(r,100));}
 if(!pid){bootstrap.kill();throw Error('更新程序未回傳有效 PID');}
 const child=new EventEmitter();const timer=setInterval(()=>{try{process.kill(pid,0);}catch{clearInterval(timer);child.emit('exit','unknown',null);}},150);timer.unref();
 child.kill=()=>{try{process.kill(pid);}catch{}};child.unref=()=>clearInterval(timer);return child;
}
async function launchWindow(task,{spawn=startWindowsHelper,timeout=90000,poll=150}={}){
 await fs.rm(path.join(task,'launch-confirmed'),{force:true});
 let child,ended=false,failure;
 try {
  child=await spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),[],{cwd:task});
  child.once('error',e=>{ended=true;failure=e;});
  child.once('exit',(code,signal)=>{ended=true;failure=Error('更新程序已結束（'+(signal||code)+'）');});
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
   let result;try{result=JSON.parse((await fs.readFile(path.join(task,'result.json'),'utf8')).replace(/^\ufeff/,''));}catch{}
   if(result?.state==='waiting'){await fs.writeFile(path.join(task,'launch-confirmed'),'confirmed');child.unref();return;}
   if(['failed','cancelled'].includes(result?.state))throw Error(result.message||'更新視窗已取消或啟動失敗');
   if(ended)throw failure||Error('更新程序未顯示視窗便結束');
   await new Promise(r=>setTimeout(r,poll));
  }
  child.kill();throw Error('等待更新視窗顯示逾時');
 } catch(e){
  throw Error(e.message+'；未確認視窗已開啟，可重試。詳見更新暫存資料夾 launcher.log。');
 }
}
module.exports={launchWindow,startWindowsHelper};
