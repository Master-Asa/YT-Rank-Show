'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const files=new Map();
function localFontPath(file){
 if(typeof file!=='string'||!/^[A-Za-z]:[\\/]/.test(file))return false;
 const candidate=path.resolve(file).toLowerCase(),roots=[path.join(process.env.SystemRoot||'C:\\Windows','Fonts'),...(process.env.LOCALAPPDATA?[path.join(process.env.LOCALAPPDATA,'Microsoft','Windows','Fonts')]:[])];
 return roots.some(root=>candidate.startsWith(path.resolve(root).toLowerCase()+path.sep));
}
let cached=null,expires=0,pending=null;
const safe=v=>typeof v==='string'&&/^[\p{L}\p{N} _.,-]{1,100}$/u.test(v);
function normalizeFonts(values){const out=new Map();for(const f of Array.isArray(values)?values:[values]){if(!f||!safe(f.family))continue;const aliases=[...new Set((Array.isArray(f.aliases)?f.aliases:[]).filter(safe))];out.set(f.family,{family:f.family,label:safe(f.label)?f.label:f.family,aliases});}return [...out.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant'));}
function installedFonts(){
 if(process.platform!=='win32')return Promise.reject(Error('Windows only'));
 if(cached&&Date.now()<expires)return Promise.resolve(cached);
 if(pending)return pending;
 // Names only: use the installed font's own localized family names. No files or network access.
 const script=path.join(__dirname,'..','scripts','list-fonts.ps1');
 pending=new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,timeout:20000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout)=>{
  if(error)return reject(error);
  try{const parsed=JSON.parse(stdout.replace(/^\uFEFF/,'')),raw=Array.isArray(parsed)?parsed:[parsed];cached=normalizeFonts(raw);files.clear();for(const f of cached){const source=raw.find(v=>v.family===f.family);if(localFontPath(source?.file)&&/\.(ttf|otf|ttc)$/i.test(source.file)){f.fileId=crypto.createHash('sha256').update(source.file+'|'+f.family).digest('hex');files.set(f.fileId,{file:source.file,family:f.family});}}expires=Date.now()+300000;resolve(cached);}catch(e){reject(e);}
 })).finally(()=>pending=null);
 return pending;
}
async function installedFontData(id){
 if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('字型識別碼無效');
 if(!files.has(id))await installedFonts();
 const entry=files.get(id);if(!entry)throw Error('字型清單已更新，請重新讀取');
 const file=entry.file;
 // Only a path returned by Windows font enumeration, never a path supplied by HTTP.
 const actual=await fs.realpath(file);if(!localFontPath(actual))throw Error('字型不在本機字型資料夾');const handle=await fs.open(actual,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>32*1024*1024)throw Error('此字型超過 32 MB；仍可按名稱選用，但不會複製字型檔');let bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw Error('字型檔讀取不完整');offset+=bytesRead;}
 bytes=require('./font-collection').extractCollection(bytes,entry.family);
 const magic=bytes.subarray(0,4).toString('hex');if(!['00010000','4f54544f','74727565'].includes(magic))throw Error('不支援此字型檔格式');
 return {data:'data:font/'+(magic==='4f54544f'?'otf':'ttf')+';base64,'+bytes.toString('base64')};
 }finally{await handle.close();}
}
module.exports={installedFonts,normalizeFonts,installedFontData,localFontPath};
