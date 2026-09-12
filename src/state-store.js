'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{promisify}=require('node:util');
const gzip=promisify(zlib.gzip),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const objectName=/^(?:events-(?:\d{4}-\d{2}|unknown)|themes|font)-[a-f0-9]{64}\.json$/;
async function atomicWrite(file,data){
 await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');let handle;
 try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(data);await handle.sync();await handle.close();handle=null;await fs.rename(tmp,file);}catch(e){await handle?.close().catch(()=>{});await fs.unlink(tmp).catch(()=>{});throw e;}
}
const monthFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'});
function month(value){
 if(typeof value!=='string'||!value.trim())return 'unknown';
 const date=new Date(value),year=date.getUTCFullYear();
 if(!Number.isFinite(date.getTime())||year<1||year>9999)return 'unknown';
 const p=monthFormatter.formatToParts(date),key=p.find(x=>x.type==='year').value.padStart(4,'0')+'-'+p.find(x=>x.type==='month').value;
 return /^\d{4}-(0[1-9]|1[0-2])$/.test(key)?key:'unknown';
}
function createStateStore(dir){
 const file=path.join(dir,'state.json'),objects=path.join(dir,'objects'),previous=path.join(dir,'state.previous.json'),backups=path.join(dir,'backups');let current=null,legacy=null,maintenanceWarning='';
 async function readObject(name){if(!objectName.test(name))throw Error('無效資料物件路徑');const raw=await fs.readFile(path.join(objects,name),'utf8');if(hash(raw)!==name.slice(-69,-5))throw Error('資料完整性檢查失敗：'+name);return JSON.parse(raw);}
 async function load(){let raw;try{raw=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;
   let entries=[];try{entries=await fs.readdir(dir);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(entries.some(name=>!['writer.lock','events.jsonl'].includes(name)))throw Error('主索引 state.json 遺失，但仍有既有資料；已停止寫入，請保留完整資料夾並使用備份復原。');
   return null;
  }const disk=JSON.parse(raw);
  if(disk.schemaVersion===3){legacy=raw;return disk;}
  if(disk.schemaVersion!==4||!Array.isArray(disk.months)||typeof disk.state!=='object')throw Error('不支援的儲存格式');
  const rows=[];
  for(const ref of disk.months){const batch=await readObject(ref.file);if(!Array.isArray(batch))throw Error('月份紀錄格式不正確');for(const row of batch)rows.push(row);}
  rows.sort((a,b)=>a.index-b.index);
  if(rows.some((r,i)=>r.index!==i||!r.event||typeof r.event!=='object'))throw Error('月份紀錄索引不完整');
  const themes=await readObject(disk.themes);if(themes._fontObjects){themes._fonts={};for(const [id,name]of Object.entries(themes._fontObjects))themes._fonts[id]=await readObject(name);delete themes._fontObjects;}current=disk;return {...disk.state,schemaVersion:3,events:rows.map(x=>x.event),themes};
 }
 async function object(prefix,value){const raw=JSON.stringify(value),name=prefix+'-'+hash(raw)+'.json',target=path.join(objects,name);try{const existing=await fs.readFile(target,'utf8');if(existing!==raw)throw Error('既有物件內容不符');}catch(e){if(e.code!=='ENOENT')throw e;await atomicWrite(target,raw);}return name;}
 async function saveThemes(themes){if(!themes._fonts)return object('themes',themes);const packed={...themes,_fontObjects:{}};delete packed._fonts;for(const [id,data]of Object.entries(themes._fonts))packed._fontObjects[id]=await object('font',data);return object('themes',packed);}
 async function refs(manifest){if(manifest?.schemaVersion!==4)return [];const themes=await readObject(manifest.themes);return [manifest.themes,...manifest.months.map(x=>x.file),...Object.values(themes._fontObjects||{})];}
 async function save(value){
  if(legacy!==null){const target=path.join(dir,'before-storage-v4-'+hash(legacy)+'.json');try{await fs.access(target);}catch{await atomicWrite(target,legacy);}}
  const groups=new Map();value.events.forEach((event,index)=>{const key=month(event.timestamp);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({index,event});});
  const months=[];for(const [key,rows] of groups)months.push({month:key,count:rows.length,file:await object('events-'+key,rows)});
  const {events,themes,schemaVersion,...state}=value,next={schemaVersion:4,state,months,themes:await saveThemes(themes)};
  await atomicWrite(previous,JSON.stringify(current||next));
  await atomicWrite(file,JSON.stringify(next));const old=current;current=next;legacy=null;
  // Only unreferenced generated objects are pruned; current and previous full
  // generations remain readable. User backups and event history are untouched.
  try{const keep=new Set([...await refs(next),...await refs(old)]);for(const entry of await fs.readdir(objects,{withFileTypes:true}))if(entry.isFile()&&objectName.test(entry.name)&&!keep.has(entry.name)){const target=path.join(objects,entry.name);for(let attempt=0;;attempt++){try{await fs.unlink(target);break;}catch(e){if(e.code==='ENOENT')break;if(attempt>=3||!['EBUSY','EPERM','EACCES'].includes(e.code))throw e;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}}}maintenanceWarning='';}catch(e){maintenanceWarning='資料已保存，但舊物件整理未完成'+(e.code?'（'+e.code+'）':'')+'；可稍後再試。';}
 }
 async function backup(value,type='manual'){
  if(!['manual','repair'].includes(type))throw Error('無效備份類型');const raw=JSON.stringify(value),digest=hash(raw),name=type+'-'+digest+'.json.gz',target=path.join(backups,name);await fs.mkdir(backups,{recursive:true});try{await fs.access(target);return {name,reused:true};}catch(e){if(e.code!=='ENOENT')throw e;}await atomicWrite(target,await gzip(raw));return {name,reused:false};
 }
 async function backupList(){try{const list=[];for(const e of await fs.readdir(backups,{withFileTypes:true})){if(!e.isFile()||!/^(manual|repair)-[a-f0-9]{64}\.json\.gz$/.test(e.name))continue;const st=await fs.stat(path.join(backups,e.name));list.push({name:e.name,bytes:st.size,modifiedAt:st.mtime.toISOString()});}return list.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.name.localeCompare(b.name));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 async function cleanup(confirmed){if(confirmed!==true)throw Error('需確認才能整理備份');const list=await backupList(),remove=list.slice(5);for(const entry of remove)await fs.unlink(path.join(backups,entry.name));return {removed:remove.length,bytes:remove.reduce((n,e)=>n+e.bytes,0)};}
 async function usage(){const categories={records:0,appearance:0,backups:0,outputs:0,other:0};let count=0;async function walk(folder,relative=''){for(const e of await fs.readdir(folder,{withFileTypes:true})){const name=relative+e.name,target=path.join(folder,e.name);if(e.isDirectory())await walk(target,name+'/');else if(e.isFile()){const st=await fs.stat(target);count++;let key=(name.startsWith('objects/themes-')||name.startsWith('objects/font-'))?'appearance':name.startsWith('objects/events-')||/^state(?:\.previous)?\.json$/.test(name)?'records':name.startsWith('backups/')||name.startsWith('before-')?'backups':name.startsWith('output/')?'outputs':'other';categories[key]+=st.size;}}}await walk(dir);return {dataPath:dir,totalBytes:Object.values(categories).reduce((a,b)=>a+b,0),files:count,categories,months:current?.months.map(({month,count})=>({month,count}))||[],backups:await backupList(),maintenanceWarning,storageVersion:current?4:3};}
 return {load,save,backup,cleanup,usage};
}
module.exports={createStateStore,atomicWrite,month};
