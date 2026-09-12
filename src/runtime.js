'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Policy=require('../record-policy'),Lock=require('../channel-lock'),Theme=require('../style-theme'),Output=require('../rank-output');
const {DEFAULT_SETTINGS,normalizeEvent,inPeriod,formatRanking}=require('./core');
const clone=value=>JSON.parse(JSON.stringify(value));
const {createStateStore,atomicWrite}=require('./state-store');
function cleanSettings(value={},base=DEFAULT_SETTINGS){
 const next={...DEFAULT_SETTINGS,...base,rates:{...DEFAULT_SETTINGS.rates,...base.rates}};
 for(const key of ['dollarCurrency','ratesUpdatedAt','giftUnit','emptyText'])if(typeof value[key]==='string')next[key]=value[key].slice(0,300);
 for(const key of ['showTitle','showAmount','showCurrency','showGiftUnit','truncateNames'])if(typeof value[key]==='boolean')next[key]=value[key];
 for(const [key,min,max] of [['rankNameSpaces',0,20],['nameValueSpaces',0,20],['blankLines',0,2],['maxNameLength',1,100]])if(value[key]!==undefined){const n=Number(value[key]);if(!Number.isFinite(n))throw Error('無效設定：'+key);next[key]=Math.max(min,Math.min(max,Math.round(n)));}
 if(value.rates)for(const currency of Object.keys(DEFAULT_SETTINGS.rates)){const n=Number(value.rates[currency]);if(Number.isFinite(n)&&n>0&&n<1000000)next.rates[currency]=n;}
 next.timezone='Asia/Taipei';next.channelLock=Lock.normalize(value.channelLock??base.channelLock);
 next.recordMode=(value.recordMode??base.recordMode)==='test'?'test':'production';return next;
}
function cleanReset(value={}){return {at:Math.max(0,Math.min(Date.now(),Number(value.at)||0)),ids:Array.isArray(value.ids)?[...new Set(value.ids.filter(x=>typeof x==='string'))]:[]};}
async function createRuntime(context={},initial={}){
 const dataDir=context.dataDir||path.join(context.dir||path.join(__dirname,'..'),'data'),release=await require('./writer-lock').acquireWriter(dataDir);
 try{return await createUnlockedRuntime({...context,release},initial);}catch(e){await release();throw e;}
}
async function createUnlockedRuntime({dir,store,dataDir:configuredDataDir,release,clock=()=>Date.now(),retryIntervalMs=5000,historyReader,historyVideoResolver}={},initial={}){
 const root=dir||path.join(__dirname,'..'),dataDir=configuredDataDir||path.join(root,'data'),outDir=configuredDataDir?path.join(dataDir,'output'):path.join(root,'output'),file=path.join(dataDir,'state.json');
 let saved={schemaVersion:3,events:[],settings:cleanSettings(store?.store||{}),reset:cleanReset(),themes:Theme.normalizeMap({}),writeToken:crypto.randomBytes(32).toString('hex'),migrated:false,migrationSource:'',revision:0};
 const storage=createStateStore(dataDir),history=require('./history-import').createHistoryImport({readDatabase:historyReader,now:clock,resolveVideo:historyVideoResolver});
 try{const raw=await storage.load();if(raw){if(raw.schemaVersion!==3||!Array.isArray(raw.events)||!/^[a-f0-9]{64}$/.test(raw.writeToken))throw Error('背景資料格式不正確');const oldImages=Theme.keys.some(key=>[1,2,3].some(i=>raw.themes?.[key]?.icons?.[i]?.image));if(oldImages){await storage.backup(raw);raw.revision++;}saved={...saved,...raw,settings:cleanSettings(raw.settings),reset:cleanReset(raw.reset),themes:Theme.normalizeMap(raw.themes)};}
 else{try{saved.events=(await fs.readFile(path.join(root,'data','events.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;}}const separated=Theme.individualize(saved.themes);if(JSON.stringify(separated)!==JSON.stringify(saved.themes)){await storage.backup(saved);saved={...saved,themes:separated,revision:saved.revision+1};}await storage.save(saved);}
 catch(e){throw Error('背景資料讀取／轉換失敗，已停止以免覆寫：'+e.message);}
 const outputCache=new Map();
 async function writeOutput(name,text){if(outputCache.get(name)===text)return;await atomicWrite(name,text);outputCache.set(name,text);}
 let services=[],session={},queue=Promise.resolve(),closed=false,closing=false,lastError='',lastEventAt='',lastOutputDay='',writeError='',droppedEvents=0,lastWriteSuccessAt='';
 function nextState(){return {...saved,settings:clone(saved.settings),reset:clone(saved.reset)};}
 let lastDelta=null,closePromise=null;
 const pendingEvents=[];let pendingBytes=0;const maxPendingEvents=10000,maxPendingBytes=16*1024*1024,instanceId=crypto.randomBytes(12).toString('hex');
 let cachedKey='',cachedSnapshot=null,cachedThemes=null,cachedStyleRevision='';
 function currentError(){return [writeError+(writeError&&pendingEvents.length?'；尚有 '+pendingEvents.length+' 筆待存，每 5 秒重試，請勿關閉 OneComme。':''),droppedEvents?'待存佇列曾超過上限，'+droppedEvents+' 筆資料未能保留，請核對缺漏。':'',lastError].filter(Boolean).join('；');}
 function storageHealth(){return {error:currentError(),pendingEvents:pendingEvents.length,pendingBytes,droppedEvents,lastWriteSuccessAt};}
 function styleRevision(){if(cachedThemes!==saved.themes){cachedStyleRevision=crypto.createHash('sha256').update(JSON.stringify(saved.themes)).digest('hex');cachedThemes=saved.themes;}return cachedStyleRevision;}
 let confirmationEpoch=0,promptWarning='',videoLooking=false,nextVideoLookup=0;
 function rememberVideo(next,r){next.settings.channelLock=Lock.remember(next.settings.channelLock,r.liveId,{title:r.videoTitle,source:r.source,channelId:r.channelId,channelName:r.channelName,updatedAt:r.resolvedAt});}
 const clearedServices=new Set();
 function serialize(work){if(closing)return Promise.reject(Error('背景插件正在停止'));const next=queue.then(()=>{if(closed)throw Error('背景插件已停止');return work();});queue=next.catch(()=>{});return next;}
 function selectSession(){
  const candidates=services.filter(s=>s.enabled!==false&&!clearedServices.has(s.id)&&(!Lock.parseChannel(s.url)||Lock.parseChannel(s.url)===saved.settings.channelLock.channelId)).map(s=>({service:'youtube',liveId:s.resolvedLiveId||Lock.parseLive(s.url),streamTitle:String(s.streamTitle||s.name||'')})).filter(s=>s.liveId&&Lock.allows(saved.settings.channelLock,s.liveId));
  session=candidates.find(s=>s.liveId===session.liveId)||(candidates.length===1?candidates[0]:{});
 }
 const resetEvent=e=>!!saved.reset.at&&(saved.reset.ids.includes(e.eventId)||!Number.isFinite(Date.parse(e.timestamp))||Date.parse(e.timestamp)<=saved.reset.at);
 function snapshot(){
  const now=new Date(clock()).toISOString(),key=JSON.stringify([saved.revision,Policy.dateParts(now).day,session]);
  if(key!==cachedKey){cachedSnapshot=Output.snapshot({events:saved.events,settings:saved.settings,session,channelLock:saved.settings.channelLock,isReset:resetEvent,themes:saved.themes,now},Policy);cachedKey=key;}
  return {...cachedSnapshot,updatedAt:now,styleRevision:styleRevision(),storageHealth:storageHealth()};
 }
 async function output(){
  const cfg=saved.settings,eligible=saved.events.filter(e=>Policy.eligible(e,resetEvent,cfg.channelLock));
  for(const period of ['current','today','monthly','all_time']){
   const selected=period==='current'&&!session.liveId?[]:eligible.filter(e=>inPeriod(e,period,{...session,timezone:cfg.timezone}));
   for(const kind of ['sc','gift','jewel']){const ranked=Policy.rank(selected,kind);for(const n of [3,5,10]){
    const title=({current:'本場',today:'今日',monthly:'本月',all_time:'歷史'})[period]+' '+({sc:'SC',gift:'贈送會員',jewel:'寶石'}[kind])+' 排行榜';
    await writeOutput(path.join(outDir,`${period}_${kind}_top${n}.txt`),formatRanking(ranked.slice(0,n),{...cfg,kind,title}));
   }
   }
   await writeOutput(path.join(outDir,period+'_jewel.txt'),String(Policy.jewelTotal(selected))+'\n');
  }
  const current=eligible.filter(e=>session.liveId&&e.liveId===session.liveId&&e.service===session.service);
  const total=kind=>Policy.rank(current,kind).reduce((sum,r)=>sum+r.value,0);
  await writeOutput(path.join(outDir,'current_summary.txt'),`SC：NT$${Math.round(total('sc'))}\n贈送會員：${total('gift')}個\n寶石：${total('jewel')}\n`);
  const last=eligible.at(-1);await writeOutput(path.join(outDir,'latest_support.txt'),last?last.displayName+' '+(last.eventType==='jewel'?last.jewelTotal+' 💎':last.eventType==='sponsorgift'?last.giftCount+'個':'NT$'+Math.round(last.amountTwd||0))+'\n':'');
  lastOutputDay=Policy.dateParts(new Date().toISOString()).day;
 }
 async function refreshOutput(){try{await output();lastError='';}catch(e){lastError='紀錄已保存，但 TXT 輸出失敗：'+e.message;}}
 async function commit(next,changedIndexes=null){
  const previous=saved,outputChanged=next.events!==saved.events||JSON.stringify([next.settings,next.reset])!==JSON.stringify([saved.settings,saved.reset]);
  for(const source of services){const owner=Lock.parseChannel(source.url),live=source.resolvedLiveId;if(source.enabled!==false&&!clearedServices.has(source.id)&&owner&&owner===next.settings.channelLock.channelId&&Lock.validLive(live)&&!Lock.removed(next.settings.channelLock,live)&&!Object.hasOwn(next.settings.channelLock.bindings,live))next.settings.channelLock.bindings[live]={channelId:owner,source:'onecomme-channel-url',confirmedAt:new Date(clock()).toISOString(),evidenceUrl:source.url};}
  if(next.settings.channelLock.channelId!==saved.settings.channelLock.channelId||next.settings.channelLock.popupEnabled!==saved.settings.channelLock.popupEnabled)confirmationEpoch++;
  next.revision=saved.revision+1;
  try{await storage.save(next);}catch(e){writeError='資料存檔失敗：'+e.message;throw e;}
  lastDelta=next.events===previous.events?{base:instanceId+':'+previous.revision,count:next.events.length,rows:[]}:changedIndexes&&changedIndexes.length<=512?{base:instanceId+':'+previous.revision,count:next.events.length,rows:changedIndexes.map(index=>({index,event:next.events[index]}))}:null;
  saved=next;writeError='';lastWriteSuccessAt=new Date(clock()).toISOString();selectSession();if(outputChanged)await refreshOutput();
 }
 function view(includeEvents=true){return {background:true,version:require('../app-version'),...(includeEvents?{events:clone(saved.events)}:{notModifiedRecords:true}),dataRevision:instanceId+':'+saved.revision,settings:clone(saved.settings),session:{...session},services:clone(services),reset:clone(saved.reset),outputPath:outDir,migrated:saved.migrated,migrationSource:saved.migrationSource,revision:saved.revision,readToken:crypto.createHash('sha256').update(saved.writeToken).digest('hex'),styleRevision:styleRevision(),lastEventAt,lastError:currentError(),storageHealth:storageHealth(),promptWarning};}
 async function flushPending(){
  if(!pendingEvents.length)return;
  const next=nextState(),batch=Policy.ingestBatch(saved.events,pendingEvents),changed=batch.changed;next.events=batch.events;
  if(changed)await commit(next,batch.indexes);
  pendingEvents.length=0;pendingBytes=0;
  if(changed)lastEventAt=new Date(clock()).toISOString();
 }
 async function applyMetadata(payload){
   const ownerSource=services.find(s=>s.enabled!==false&&s.id===String(payload?.service?.id)&&s.url===payload?.service?.url);
   const owner=ownerSource&&Lock.parseChannel(ownerSource.url),resolved=Lock.parseLive(payload?.data?.url);
   // The host resolves a canonical channel URL to a concrete watch URL. A viewer ID or
   // connection label is never ownership evidence. Require the current service URL.
   if(payload?.type==='youtube'&&owner&&resolved){
    if(payload.data.liveId&&payload.data.liveId!==resolved)return;
    if(payload.data.channelId&&payload.data.channelId!==owner)return;
    ownerSource.resolvedLiveId=resolved;ownerSource.streamTitle=String(payload.data.title||ownerSource.name||'');
    clearedServices.delete(ownerSource.id);
    const lock=saved.settings.channelLock;
    if(owner===lock.channelId&&!Lock.removed(lock,resolved)&&!Object.hasOwn(lock.bindings,resolved)){
     const next=nextState();next.settings.channelLock.bindings[resolved]={channelId:owner,source:'onecomme-channel-url',confirmedAt:new Date(clock()).toISOString(),evidenceUrl:ownerSource.url};
     await commit(next);
    }else{selectSession();await refreshOutput();}
   }
   if(ownerSource&&payload?.type==='youtube'&&Lock.parseLive(ownerSource.url)===(Lock.parseLive(payload?.data?.url)||Lock.parseLive(ownerSource.url))&&typeof payload?.data?.title==='string')ownerSource.streamTitle=payload.data.title.slice(0,300);
   const live=payload?.data?.liveId??payload?.liveId??(Lock.parseLive(payload?.data?.url)||Lock.parseLive(payload?.service?.url));
   const source=services.find(s=>s.enabled!==false&&String(s.id)===String(payload?.service?.id)&&(s.resolvedLiveId||Lock.parseLive(s.url))===String(live));
   if(payload?.type==='youtube'&&source&&Lock.allows(saved.settings.channelLock,live)){clearedServices.delete(source.id);selectSession();}
   if(session.liveId&&String(live)===session.liveId)session.streamTitle=String(payload?.data?.title??payload?.title??session.streamTitle);
   if(source&&typeof payload?.data?.title==='string'&&payload.data.title.trim()){
    const info={title:payload.data.title,source:'onecomme',channelId:owner||'',channelName:'',updatedAt:new Date(clock()).toISOString()},old=saved.settings.channelLock.videoCatalog[String(live)];
    if(old?.source!=='youtube-public-metadata'&&old?.title!==info.title){const next=nextState();next.settings.channelLock=Lock.remember(next.settings.channelLock,String(live),info);await commit(next);}
   }
   return;
  }

 async function subscribe(topic,payload){return serialize(async()=>{
  if(topic==='services'){
   const list=Array.isArray(payload)?payload:payload?.services??payload?.data?.services;
   if(!Array.isArray(list))return;
   const connectionKey=items=>JSON.stringify(items.map(s=>[String(s.id),s.url,s.enabled!==false]).sort());if(connectionKey(list)!==connectionKey(services))confirmationEpoch++;
   for(const s of list){const old=services.find(x=>x.id===String(s.id??''));if(!old||old.url!==s.url||old.enabled===false&&s.enabled!==false)clearedServices.delete(String(s.id??''));}
   services=list.map(s=>{const old=services.find(x=>x.id===String(s.id??'')&&x.url===s.url&&x.enabled!==false&&s.enabled!==false);return {id:String(s.id??''),url:String(s.url||''),name:String(s.name||''),enabled:s.enabled!==false,...(old?{resolvedLiveId:old.resolvedLiveId,streamTitle:old.streamTitle}:{})};});for(const s of list)if(s.meta&&s.enabled!==false)await applyMetadata({type:'youtube',service:s,data:s.meta});selectSession();await refreshOutput();return;
  }
  if(topic==='meta.clear'){confirmationEpoch++;const id=typeof payload==='string'?payload:String(payload?.id??'');for(const s of services)if(!id||s.id===id){clearedServices.add(s.id);delete s.resolvedLiveId;}selectSession();await refreshOutput();return;}
  if(topic==='meta')return applyMetadata(payload);
  if(topic!=='comments')return;
  const list=Array.isArray(payload)?payload:payload?.comments??payload?.data?.comments;
  if(!Array.isArray(list))return;
  for(const item of list){
   const event=normalizeEvent(item,session,saved.settings);if(event.unsupported)continue;
   const bytes=Buffer.byteLength(JSON.stringify(event));
   if(pendingEvents.length>=maxPendingEvents||pendingBytes+bytes>maxPendingBytes){try{await flushPending();}catch{} }
   if(pendingEvents.length>=maxPendingEvents||pendingBytes+bytes>maxPendingBytes){droppedEvents++;continue;}
   pendingEvents.push(event);pendingBytes+=bytes;
  }
  await flushPending();
 });}
 async function request(req){try{
  const lookupBody=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body;
  // External lookup must not block the live-event persistence queue.
  if(req.method==='POST'&&lookupBody?.action==='historyLookup'){
   const result=await history.lookup(lookupBody,()=>{if(closing||closed)throw Error('插件正在關閉，查詢結果未套用');return saved;});
   await serialize(async()=>{if(saved.settings.channelLock.channelId!==lookupBody.channelId)throw Error('頻道已變更');const next=nextState();for(const row of result.sessions)if(row.verification?.channelId)rememberVideo(next,row.verification);if(JSON.stringify(next.settings.channelLock.videoCatalog)!==JSON.stringify(saved.settings.channelLock.videoCatalog))await commit(next);});
   return {code:200,response:{history:result}};
  }
  if(req.method==='POST'&&lookupBody?.action==='sessionLookup'){
   const id=lookupBody.liveId,owner=saved.settings.channelLock.channelId;
   if(lookupBody.consent!==true||!owner||lookupBody.channelId!==owner||!Lock.validLive(id))throw Error('請核對頻道並同意查詢公開影片資訊');
   if(videoLooking||clock()<nextVideoLookup)throw Error('請稍候一秒再查詢');videoLooking=true;nextVideoLookup=clock()+1000;
   try{const url='https://www.youtube.com/watch?v='+id,result=require('../public-resolver').validate(url,await (historyVideoResolver||require('./youtube-resolver').resolveVideoUrl)(url));
   await serialize(async()=>{if(saved.settings.channelLock.channelId!==owner)throw Error('頻道已變更，查詢未套用');const next=nextState();rememberVideo(next,result);await commit(next);});return {code:200,response:{video:result}};}finally{videoLooking=false;}
  }
  return await serialize(async()=>{
  if(req.method==='GET')return {code:200,response:view()};
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('請求格式不正確');
  if(req.method==='POST'&&body.action==='poll'){const changed=body.dataRevision!==instanceId+':'+saved.revision;if(changed&&body.acceptDelta===true&&lastDelta?.base===body.dataRevision)return {code:200,response:{...view(false),notModifiedRecords:lastDelta.rows.length===0,eventDelta:clone(lastDelta)}};return {code:200,response:view(changed)};}
  if(pendingEvents.length&&!['storageInfo','storageCleanup'].includes(body.action))throw Error('還有 '+pendingEvents.length+' 筆資料尚未存檔，每 5 秒重試；請先排除磁碟問題，不要關閉 OneComme。');
  if(req.method==='POST'&&['storageInfo','storageBackup','storageCleanup'].includes(body.action)){
   let backup,cleanup;if(body.action==='storageBackup')backup=await storage.backup(saved);if(body.action==='storageCleanup')cleanup=await storage.cleanup(body.confirmed);
   return {code:200,response:{storage:await storage.usage(),backup,cleanup}};
  }
  if(req.method==='POST'&&body.action==='historyPreview')return {code:200,response:{history:await history.preview(body,saved)}};
  if(req.method==='POST'&&body.action==='historyImport'){const prepared=history.prepare(body,saved);const backup=await storage.backup(saved);await commit(prepared.next);return {code:200,response:{...view(),historyResult:prepared.stats,backup:backup.name}};}
  const next=nextState();
  if(req.method==='POST'&&body.action==='sessionMembership'){
   const lock=saved.settings.channelLock,id=body.liveId;
   if(body.confirmed!==true||!lock.channelId||body.channelId!==lock.channelId||!Lock.validLive(id)||!['join','remove'].includes(body.operation))throw Error('請核對場次與目前頻道後確認');
   const known=lock.bindings[id]||lock.removedLives[id]||lock.dismissedLives[id]||lock.videoCatalog[id]||saved.events.some(e=>e.service==='youtube'&&e.liveId===id)||services.some(s=>(s.resolvedLiveId||Lock.parseLive(s.url))===id);
   if(!known)throw Error('場次不在已收錄清單，請先使用手動加入');
   next.settings.channelLock=body.operation==='join'?Lock.bind(lock,id,new Date(clock()).toISOString()):Lock.unbind(lock,id,new Date(clock()).toISOString());
   if(JSON.stringify(next.settings.channelLock)===JSON.stringify(lock))return {code:200,response:view()};
   await storage.backup(saved);await commit(next);return {code:200,response:view()};
  }
  if(req.method==='PUT'){
   if(body.action==='exclude'){next.events=saved.events.map(e=>({...e}));const matches=next.events.filter(e=>e.eventId===body.eventId&&(!body.liveId||e.liveId===body.liveId));if(matches.length!==1)throw Error('事件識別不唯一，未修改');matches[0].excluded=!!body.excluded;}
   else next.settings=cleanSettings(body,next.settings);
  }else if(req.method==='POST'){
   if(body.action==='migrate'){
    if(saved.migrated)return {code:200,response:{...view(),alreadyMigrated:true}};
    if(!Array.isArray(body.events)||body.events.some(e=>!e||typeof e!=='object'||Array.isArray(e)))throw Error('舊紀錄格式不正確');
    const lock=Lock.normalize(body.settings?.channelLock);
    if(saved.settings.channelLock.channelId&&saved.settings.channelLock.channelId!==lock.channelId)throw Error('舊管理頁與背景的鎖定頻道不同；沒有移入或更換頻道');
    await atomicWrite(path.join(dataDir,'before-migration-'+Date.now()+'.json'),JSON.stringify({background:saved,browser:body}));
    next.events=clone(body.events);for(const e of saved.events)Policy.ingest(next.events,clone(e));
    next.settings=cleanSettings(body.settings||{},saved.settings);next.reset=cleanReset(body.reset);
    next.themes=Theme.individualize(body.themes||{});if(/^[a-f0-9]{64}$/.test(body.writeToken||''))next.writeToken=body.writeToken;
    next.migrated=true;next.migrationSource=String(body.source||'browser').slice(0,500);
   }else if(body.action==='copyStyles'){
    if(body.confirmed!==true)throw Error('請先確認複製目標');if(body.expectedRevision!==snapshot().styleRevision)throw Error('外觀已更新，請重新開啟複製視窗');next.themes=Theme.copyBoards(saved.themes,body.kind,body.period,body.targets);
   }else if(body.action==='styles'){
    if(!Theme.kinds.includes(body.kind))throw Error('榜單類型不正確');
    if(body.expectedRevision!==snapshot().styleRevision)throw Error('外觀已在另一個頁面更新，請重新開啟工作室後再套用');
    next.themes=Theme.saveBoard(saved.themes,body.kind,body.period,body.value);
   }else if(body.action==='reset')next.reset={at:Date.now(),ids:[...new Set([...saved.reset.ids,...saved.events.map(e=>e.eventId)])]};
   else if(body.action==='repairMembership'){
    await storage.backup(saved,'repair');next.events=Policy.repairMembership(saved.events).events;
   }else if(body.action==='resolveChannel')return {code:410,response:{error:'離線版不會查詢 YouTube，請人工確認頻道與直播。'}};
   else if(body.action&&body.action!=='sync')throw Error('不支援此操作');
  }else return {code:405,response:{error:'Method not allowed'}};
  await commit(next);return {code:200,response:{...view(),styles:clone(saved.themes)}};
 });}catch(e){lastError=e.message;return {code:400,response:{error:e.message}};}}
 function pendingConfirmations(){
  const lock=saved.settings.channelLock;if(closed||closing||!lock.channelId||lock.popupEnabled===false)return [];
  const seen=new Set(),out=[];for(const s of services){const live=s.resolvedLiveId||Lock.parseLive(s.url),owner=Lock.parseChannel(s.url);if(!live||s.enabled===false||clearedServices.has(s.id)||owner&&owner!==lock.channelId||Lock.removed(lock,live)||Object.hasOwn(lock.bindings,live)||lock.dismissedLives[live]?.channelId===lock.channelId||seen.has(live))continue;seen.add(live);
   const key=lock.channelId+':'+live,token=crypto.createHash('sha256').update(JSON.stringify([instanceId,confirmationEpoch,s.id,s.url,live,lock.channelId])).digest('hex');
   out.push({key,token,channelId:lock.channelId,channelName:lock.channelName||lock.channelId,liveId:live,title:String(s.streamTitle||s.name||'尚未取得直播標題').slice(0,300),url:'https://www.youtube.com/watch?v='+live});
  }return out;
 }
 async function confirmCandidate(candidate,choice){return serialize(async()=>{
  if(!['accept','reject'].includes(choice))return false;
  if(!pendingConfirmations().some(p=>p.token===candidate.token&&p.key===candidate.key))return false;
  const next=nextState();
  if(choice==='accept')next.settings.channelLock=Lock.bind(next.settings.channelLock,candidate.liveId,new Date(clock()).toISOString());
  else next.settings.channelLock.dismissedLives[candidate.liveId]={channelId:candidate.channelId,at:new Date(clock()).toISOString()};
  next.settings.channelLock=Lock.normalize(next.settings.channelLock);await commit(next);return true;
 });}
 await subscribe('services',initial.services||[]);try{await subscribe('comments',initial.comments||[]);}catch{/* Keep the service alive to expose the pending-write warning and retry. */}await refreshOutput();
 const retryTimer=setInterval(()=>{if(pendingEvents.length&&!closing)serialize(flushPending).catch(()=>{});},Math.max(20,retryIntervalMs));retryTimer.unref?.();
 const timer=setInterval(()=>{if(Policy.dateParts(new Date().toISOString()).day!==lastOutputDay)serialize(refreshOutput).catch(()=>{});},30000);timer.unref?.();
 return {pendingConfirmations,confirmCandidate,setPromptWarning:value=>{promptWarning=String(value||'').slice(0,300);},subscribe,request,snapshot,view,get styles(){return clone(saved.themes);},get events(){return clone(saved.events);},get readToken(){return crypto.createHash('sha256').update(saved.writeToken).digest('hex');},close(){if(closePromise)return closePromise;closePromise=(async()=>{closing=true;clearInterval(timer);clearInterval(retryTimer);await queue;let failure;
 try{await flushPending();}catch(e){failure=Error('停止時仍有 '+pendingEvents.length+' 筆未存檔暫存，關閉後可能遺失：'+e.message);}
 finally{closed=true;await release();}if(failure)throw failure;})();return closePromise;},dataDir};
}
module.exports={createRuntime,atomicWrite,cleanSettings};
