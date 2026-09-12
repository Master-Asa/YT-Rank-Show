'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),{execFile}=require('node:child_process');
const SQL='SELECT comment FROM comments WHERE created_at >= ? AND created_at < ? ORDER BY created_at LIMIT 250001';
async function readCommentDatabase({from,until},file=path.join(process.env.APPDATA||'','onecomme','comments.db'),forceFallback=false){
 const stat=await fs.stat(file).catch(()=>{throw Error('找不到本機 OneComme 保存紀錄，請確認曾啟用保存，或改選日誌檔。');});if(!stat.isFile())throw Error('紀錄資料庫不是檔案');
 let DatabaseSync;if(!forceFallback)try{({DatabaseSync}=require('node:sqlite'));}catch{}
 if(DatabaseSync){const db=new DatabaseSync(file,{readOnly:true});try{db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');let bytes=0;const rows=[];for(const row of db.prepare(SQL).iterate(from,until)){if(typeof row.comment!=='string')throw Error('不支援此紀錄格式');bytes+=Buffer.byteLength(row.comment);if(bytes>64*1024*1024||rows.length>=250000||Buffer.byteLength(row.comment)>1024*1024)throw Error('紀錄量過大，請縮小日期範圍');rows.push(JSON.parse(row.comment));}return rows;}finally{db.close();}}
 if(process.platform!=='win32')throw Error('此版本僅支援 Windows 本機紀錄讀取，請改用日誌檔');
 const script=path.join(__dirname,'..','scripts','read-comment-db.ps1');
 return new Promise((resolve,reject)=>{const child=execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,timeout:45000,maxBuffer:70*1024*1024,encoding:'utf8'},(error,stdout)=>{if(error)return reject(Error('本機紀錄讀取失敗或超過處理上限，請縮小日期範圍；也可改用日誌檔。'));try{resolve(stdout.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(JSON.parse));}catch{reject(Error('OneComme 紀錄格式無法解析'));}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({path:file,from,until}));});
}
module.exports={readCommentDatabase};
