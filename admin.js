'use strict';
const API='http://127.0.0.1:11181/api';const DEFAULT_SETTINGS={timezone:'Asia/Taipei',dollarCurrency:'TWD',rates:{TWD:1,USD:31.5,JPY:.21,HKD:4.05,CNY:4.35,EUR:34.5,KRW:.024},ratesUpdatedAt:'2026-09-09',showTitle:true,rankNameSpaces:1,nameValueSpaces:4,blankLines:0,showAmount:true,showCurrency:true,showGiftUnit:true,giftUnit:'個',maxNameLength:20,truncateNames:true,emptyText:''};let state={events:[],settings:{...DEFAULT_SETTINGS},session:{},outputPath:'插件啟用後顯示'};
const $=id=>document.getElementById(id), text=(el,value)=>{el.textContent=String(value??'')};
const CACHE_KEY='yt-rank-show-browser-events-v0.1';let connectionMode='none';

const RESET_KEY='yt-rank-show-reset-v1';
function readReset(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(RESET_KEY)||'{}')}catch{}
  const value=Number(new URLSearchParams(location.search).get('reset'));
  return {at:Math.max(Number(saved.at)||0,Number.isFinite(value)&&value>0?Math.min(value,Date.now()):0),ids:Array.isArray(saved.ids)?saved.ids:[]};
}
let resetState=readReset();
function isResetEvent(e){return !!resetState.at&&(resetState.ids.includes(e.eventId)||!Number.isFinite(Date.parse(e.timestamp))||Date.parse(e.timestamp)<=resetState.at)}
function saveReset(at){
  const next={at,ids:[...new Set([...resetState.ids,...state.events.map(e=>e.eventId)])]};
  localStorage.setItem(RESET_KEY,JSON.stringify(next));
  resetState=next;
}
async function resetStatistics(){
  if(!confirm('清空所有期間的 SC、贈送會員與寶石統計？旧事件保留但不再計入，匯率與排版不變。新版 OBS 同步來源會自動歸零；舊版来源需換成新版同步網址。'))return;
  try{if(connectionMode==='plugin'){const result=await api('POST',{action:'reset'});resetState=result.reset;}else saveReset(Date.now());render(connectionMode!=='none');updateObsUrls();$('resetNotice').textContent='已清空。新版 OBS 同步來源會自動更新，請到「OBS 輸出」確認同步正常。';showToast('統計已歸零')}
  catch(e){$('resetNotice').textContent='清空失敗：'+e.message}
}
if(resetState.at){try{localStorage.setItem(RESET_KEY,JSON.stringify(resetState))}catch{}}
window.addEventListener('storage',e=>{if(e.key===RESET_KEY&&connectionMode!=='plugin'){resetState=readReset();render(connectionMode!=='none');updateObsUrls()}});

function ensureSDK(){if(typeof OneSDK!=='undefined')return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='../__origin/js/onesdk.js';script.onload=resolve;script.onerror=()=>reject(new Error('找不到わんコメ OneSDK'));document.head.append(script)})}
function sdkMoney(d){const raw=String(d.paidText||'').replace(/\u00a0/g,' ').trim(),m=raw.match(/^\s*(NT\s*\$|NTD|TWD|US\$|USD|HK\$|HKD|CNY|RMB|EUR|€|JPY|¥|￥|KRW|₩|\$)\s*([\d,]+(?:\.\d+)?)/i),unit=String(d.unit||d.currency||(m&&m[1])||'').replace(/\s+/g,''),amount=d.price!==undefined?Number(String(d.price).replace(/,/g,'')):m?Number(m[2].replace(/,/g,'')):null,key=unit.toUpperCase(),currency=key==='$'?state.settings.dollarCurrency:({'NT$':'TWD',NTD:'TWD',TWD:'TWD','US$':'USD',USD:'USD','¥':'JPY','￥':'JPY',JPY:'JPY','HK$':'HKD',HKD:'HKD',CNY:'CNY',RMB:'CNY',EUR:'EUR','€':'EUR',KRW:'KRW','₩':'KRW'})[key]||null,rate=currency?Number(state.settings.rates[currency]):NaN;return{originalPaidText:raw,originalAmount:Number.isFinite(amount)?amount:null,originalCurrency:unit,normalizedCurrency:currency,exchangeRate:Number.isFinite(rate)?rate:null,amountTwd:Number.isFinite(amount)&&Number.isFinite(rate)?Math.round(amount*rate*100)/100:null,currencyDecisionSource:d.price!==undefined&&d.unit?'structured-unit':'paid-text'}}
function sdkEvent(item){
  const d=item?.data||{},eventType=String(d.giftType||d.type||item?.type||'').toLowerCase().replace(/[_-]/g,'');
  const eventId=d.id??d.commentId??item?.commentId;
  return {schemaVersion:2,eventId:String(eventId||['missing-id',item?.service,d.liveId,eventType,d.userId,d.timestamp,d.paidText,d.comment].join('|')),eventIdSource:eventId?'comment-id':'fallback',
    service:String(item?.service||''),liveId:String(d.liveId||item?.liveId||'unknown'),streamTitle:String(d.streamTitle||((d.liveId===state.session.liveId)&&state.session.streamTitle)||''),
    eventType,userId:String(d.userId||''),displayName:String(d.displayName||d.name||item?.name||'匿名'),profileImage:String(d.profileImage||''),
    timestamp:String(d.timestamp||item?.timestamp||''),...sdkMoney(d),...RecordPolicy.gift(d),...(eventType==='jewel'?RecordPolicy.jewel(d):{}),
    recordMode:currentRecordMode(),explicitTest:d.isTest===true||item?.isTest===true,
    comment:String(d.comment||''),excluded:false,createdAt:new Date().toISOString()};
}
function currentRecordMode(){
  const query=new URLSearchParams(location.search);
  if(query.has('obs'))return query.get('recordMode')==='test'?'test':'production';
  if(connectionMode==='plugin')return state.settings.recordMode==='test'?'test':'production';
  try{return localStorage.getItem('yt-rank-show-record-mode')==='test'?'test':'production'}catch{return 'production'}
}
function currentChannelLock(){
  const query=new URLSearchParams(location.search);
  // An old OBS URL without a lock must fail closed, not borrow another browser's lock.
  return query.has('obs')?ChannelLock.fromQuery(query):ChannelLock.normalize(state.settings.channelLock);
}
function channelAllowsLive(liveId){return ChannelLock.allows(currentChannelLock(),liveId)}
function recordStatus(e){return RecordPolicy.status(e,isResetEvent,currentChannelLock())}
function recordEligible(e){return RecordPolicy.eligible(e,isResetEvent,currentChannelLock())}
// Session selection is independent of historical event storage.
let liveServices = null;
function applyServices(payload) {
  if(typeof connectionMode!=='undefined'&&connectionMode==='plugin')return;
  const list = Array.isArray(payload) ? payload : payload?.services ?? payload?.data?.services;
  if (!Array.isArray(list)) return; // Unknown payload must not erase state.
  liveServices = list.filter(s => s.enabled !== false && s.url);
  const candidates = [];
  for (const s of liveServices) {
    let liveId;
    try {
      const url = new URL(s.url);
      if (/(^|\.)youtube\.com$/.test(url.hostname)) liveId = url.searchParams.get('v') || url.pathname.match(/\/(?:live|shorts)\/([^/]+)/)?.[1] || liveId;
      else if (url.hostname === 'youtu.be') liveId = url.pathname.slice(1);
      else continue;
    } catch {}
    if (liveId && channelAllowsLive(liveId)) candidates.push({service:'youtube',liveId,streamTitle:s.name || ''});
  }
  state.session = candidates.find(s => s.liveId === state.session.liveId) ||
    (candidates.length === 1 ? candidates[0] : {});
  render(true);
  text($('status'), liveServices.length === 0 ? 'OneSDK 已連線｜目前沒有直播連線' :
    candidates.length > 1 && !state.session.liveId ? 'OneSDK 已連線｜多場直播，等待確認本場' : 'OneSDK 已連線（模板模式）');
}
function observeSession(item) {
  const liveId = item?.data?.liveId;
  if (item?.service !== 'youtube' || !liveId) return;
  // Until the connection list arrives, do not revive a historical session.
  if (liveServices === null) return;
  const source = liveServices.find(s => String(s.id) === String(item.id));
  if (!source) return;
  // A replayed comment cannot identify the current video of a channel/handle URL.
  if (ChannelLock.parseLive(source.url) !== String(liveId)) return;
  if (!state.session.liveId && liveServices.length === 1 && channelAllowsLive(String(liveId)))
    state.session = {service:'youtube',liveId:String(liveId),streamTitle:source.name || ''};
}
function clearSessionMeta() {
  // Meta clear can concern only one connection: recheck the list instead of deleting history.
  if (typeof OneSDK.getServices === 'function')
    OneSDK.getServices().then(applyServices).catch(() => {});
}

function sdkComments(items){
  if(connectionMode==='plugin')return; // Background is the sole writer after migration.
  if(!Array.isArray(items))return;
  for(const item of items){
    if(item?.service!=='youtube')continue;
    observeSession(item);
    const e=sdkEvent(item);
    if(!['superchat','supersticker','sponsorgift','giftreceived','jewel'].includes(e.eventType))continue;
    RecordPolicy.ingest(state.events,e);
  }
  let storageError='';
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(state.events))}catch(e){storageError='｜儲存失敗！目前新資料僅在記憶體，請立即匯出 JSON 備份：'+e.message}
  const warning=$('storageWarning');if(warning){warning.hidden=!storageError;text(warning,storageError);}
  render(true);
  text($('status'),'OneSDK 已連線（模板模式）'+storageError);
}
function sdkMeta(meta){if(meta?.type!=='youtube'||!state.session.liveId)return;if(meta.data?.liveId&&String(meta.data.liveId)!==state.session.liveId)return;state.session={...state.session,streamTitle:meta.data?.title||state.session.streamTitle||''};render(true);}
function restoreBrowserEvents(){
  try{
    const saved=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]');
    if(!Array.isArray(saved)||saved.some(e=>!e||typeof e!=='object'||Array.isArray(e)))throw new Error('事件資料格式不正確');
    state.events=saved;state.session={};
  }catch(e){
    throw new Error('已保存紀錄無法讀取，已停止收錄以免覆寫。請勿清除瀏覽器資料：'+e.message);
  }
}
async function connectSDK(){await ensureSDK();if(OneSDK.ready)await OneSDK.ready();restoreBrowserEvents();OneSDK.setup({permissions:['comments','meta','meta.clear','services'],commentLimit:1000,mode:'all'});OneSDK.subscribe({action:'comments',callback:sdkComments});OneSDK.subscribe({action:'meta',callback:sdkMeta});OneSDK.subscribe({action:'services',callback:applyServices});OneSDK.subscribe({action:'meta.clear',callback:clearSessionMeta});if(typeof OneSDK.getServices==='function'){await OneSDK.getServices().then(applyServices).catch(()=>{});setInterval(()=>OneSDK.getServices().then(applyServices).catch(()=>{}),2000);}await OneSDK.connect();connectionMode='onesdk';render(true);text($('status'),'OneSDK 已連線（模板模式）')}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('main>section').forEach(s=>s.hidden=s.id!==b.dataset.tab)});
function updateObsUrls(){globalThis.dispatchEvent(new Event('obs-links-updated'));}
function showToast(message){const toast=$('toast');text(toast,message);toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}
$('resetStatistics').onclick=resetStatistics;document.querySelectorAll('.copy-url').forEach(button=>button.onclick=async()=>{const input=$(button.dataset.target);try{await navigator.clipboard.writeText(input.value)}catch{input.select();document.execCommand('copy')}showToast('OBS URL 已複製')});updateObsUrls();
const OBS_MODE=new URLSearchParams(location.search).get('obs');if(['sc','gift','jewel'].includes(OBS_MODE)){const query=new URLSearchParams(location.search),requestedTop=query.get('top')||'10',requestedPeriod=['current','monthly'].includes(query.get('period'))?query.get('period'):'current',direct=document.createElement('pre');direct.id='obsDirect';direct.textContent='正在連接わんコメ…';direct.style.cssText='margin:0;padding:8px;background:transparent;color:white;white-space:pre-wrap;font:700 36px/1.5 Microsoft JhengHei,sans-serif;text-shadow:0 2px 4px #000';document.querySelector('.app-shell').style.display='none';document.body.style.background='transparent';document.body.append(direct);$('kind').value=OBS_MODE==='jewel'?'sc':OBS_MODE;$('period').value=requestedPeriod;$('top').value=requestedTop;const source=$('preview'),sync=()=>{direct.textContent=!currentChannelLock().channelId?'尚未設定頻道鎖，請更新 OBS URL':requestedPeriod==='current'&&!state.session.liveId?'':OBS_MODE==='jewel'?String(RecordPolicy.jewelTotal(eventsFor(requestedPeriod))):source.textContent.trim()||`【${requestedPeriod==='monthly'?'本月':'本場'} ${OBS_MODE==='sc'?'SC':'贈送會員'} 排行榜】`};new MutationObserver(sync).observe(source,{subtree:true,childList:true,characterData:true});sync()}
function eventsFor(period){
  const dates=RecordPolicy.dateParts(new Date().toISOString(),state.settings.timezone),filter={timezone:state.settings.timezone,channelLock:currentChannelLock()};
  if(period==='current'){
    if(!state.session.liveId||!state.session.service)return [];
    filter.liveId=state.session.liveId;filter.service=state.session.service;
  }
  if(period==='monthly')filter.month=dates.month;
  if(period==='today')filter.day=dates.day;
  return RecordPolicy.select(state.events,filter,isResetEvent);
}
function preview(){if($('period').value==='current'&&!state.session.liveId){text($('preview'),'');return;}const kind=$('kind').value,period=$('period').value;text($('preview'),RankOutput.format(rowsFor(kind,period,Number($('top').value)),kind,period,state.settings));}
function render(connected=true){const events=Array.isArray(state.events)?state.events:[],settings={...DEFAULT_SETTINGS,...(state.settings||{}),rates:{...DEFAULT_SETTINGS.rates,...(state.settings?.rates||{})}};state={...state,events,settings,session:state.session||{}};if(!channelAllowsLive(state.session.liveId))state.session={};if(connected)text($('status'),connectionMode==='plugin'?'背景插件已連線':connectionMode==='onesdk'?'OneSDK 已連線（模板模式）':'正在確認 OneComme 連線');const current=events.filter(e=>recordEligible(e)&&e.liveId===state.session?.liveId&&e.service===state.session?.service),sc=current.filter(e=>['superchat','supersticker'].includes(e.eventType)&&e.amountTwd!==null),gift=current.filter(e=>e.eventType==='sponsorgift');$('overview').replaceChildren();const cards=document.createElement('div');cards.className='cards';[['目前直播',state.session?.streamTitle||'尚未取得'],['liveId',state.session?.liveId||'尚未取得'],['本場 SC',`${sc.length} 筆／NT$${Math.round(sc.reduce((a,e)=>a+e.amountTwd,0)).toLocaleString('zh-TW')}`],['本場贈送會員',gift.reduce((a,e)=>a+e.giftCount,0)+' 個'],['本場寶石',RecordPolicy.jewelTotal(current).toLocaleString('zh-TW')+' 💎'],['最新事件',current.at(-1)?.displayName||'尚無']].forEach(([a,b])=>{const c=document.createElement('div');c.className='card';const strong=document.createElement('strong'),p=document.createElement('p');text(strong,a);text(p,b);c.append(strong,p);cards.append(c)});$('overview').append(cards);$('eventRows').replaceChildren(...events.slice().reverse().map(e=>{const tr=document.createElement('tr');[RecordPolicy.validTimestamp(e.timestamp)?new Date(e.timestamp).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):e.timestamp,e.liveId,e.displayName,({superchat:'SC',supersticker:'貼圖',sponsorgift:'贈送會員',giftreceived:'收到會員',jewel:'寶石'})[e.eventType]||e.eventType,`${e.originalPaidText||e.originalAmount||''} ${e.originalCurrency||''}`,['superchat','supersticker'].includes(e.eventType)?e.amountTwd??'待確認':'—',e.giftCount||'',e.eventType==='jewel'?(e.jewelTotal??'待確認'):'',String(e.comment||'').replace(/<[^>]*>/g,''),recordStatus(e)].forEach(v=>{const td=document.createElement('td');text(td,v);tr.append(td)});return tr}));const f=$('settingsForm');if(f.dataset.dirty!=='true'){for(const [k,v] of Object.entries(settings)){if(f.elements[k])f.elements[k].type==='checkbox'?f.elements[k].checked=!!v:f.elements[k].value=v}text($('outputPath'),'輸出路徑：'+state.outputPath);const rates=$('rates');rates.replaceChildren(...Object.entries(settings.rates).map(([k,v])=>{const l=document.createElement('label'),i=document.createElement('input');i.type='number';i.className='form-control';i.step='0.000001';i.dataset.rate=k;i.value=v;text(l,k);l.append(i);return l}));}for(const button of f.querySelectorAll('button'))button.disabled=!connected;preview()}
async function api(method='GET',body){return LocalRuntime.request('/api',method,body);}
let loadBusy=false,loadFailed=false,lastBackgroundMeta='';
async function load(){
 if(loadBusy)return;loadBusy=true;
 const note=$('backgroundNotice');
 try{
  const sessionInfo=await LocalRuntime.session();
  if(!sessionInfo.background)throw Error('本機同步器運作中，但 OneComme 背景插件尚未啟用');
  let value=await api('POST',{action:'poll',dataRevision:state.dataRevision||'',acceptDelta:true});
  if(!value.background)throw Error('背景插件版本不符');
  if(value.eventDelta){const delta=value.eventDelta;if(delta.base!==state.dataRevision||!Number.isSafeInteger(delta.count)||delta.count<state.events.length||!Array.isArray(delta.rows)||delta.rows.some(r=>!Number.isInteger(r.index)||r.index<0||r.index>=delta.count||!r.event))throw Error('增量紀錄版本不符，請重新整理');const events=state.events.slice();for(const row of delta.rows)events[row.index]=row.event;if(events.length!==delta.count||events.some(e=>!e))throw Error('增量紀錄不完整');value.events=events;delete value.eventDelta;}
  await globalThis.StyleStore?.ready;
  if(!value.migrated){
  const legacyEvents=JSON.parse(localStorage.getItem(CACHE_KEY)||'[]');
  const legacySettings=JSON.parse(localStorage.getItem('yt-rank-show-settings-v0.1')||'{}');
  if(!Array.isArray(legacyEvents))throw Error('舊紀錄格式不正確，沒有覆寫');
  const hasLegacy=legacyEvents.length||legacySettings.channelLock?.channelId;
  if(!value.migrated&&hasLegacy){
   value=await api('POST',{action:'migrate',source:location.origin,events:legacyEvents,settings:{...legacySettings,recordMode:localStorage.getItem('yt-rank-show-record-mode')||'production'},reset:readReset(),themes:globalThis.StyleStore?.styles||{},writeToken:localStorage.getItem('yt-rank-show-obs-publisher-v1')||''});
  }
  }
    const wasPlugin=connectionMode==='plugin';connectionMode='plugin';
    const backgroundMeta=JSON.stringify([value.session,value.services,value.lastError,value.promptWarning,value.settings,value.reset]);
    const needsRender=loadFailed||!value.notModifiedRecords||lastBackgroundMeta!==backgroundMeta;
    state={...state,...value};resetState=value.reset||{at:0,ids:[]};liveServices=value.services||[];
  if(StyleStore.remoteRevision!==value.styleRevision){const appearance=await LocalRuntime.request('/styles');await StyleStore.useBackground(appearance.styles,appearance.revision);}
  if(!wasPlugin&&typeof OneSDK!=='undefined'&&typeof OneSDK.disconnect==='function')OneSDK.disconnect();
    if(needsRender)render(true);lastBackgroundMeta=backgroundMeta;loadFailed=false;
    if(note){note.dataset.state=value.lastError?'error':'ready';note.textContent=value.lastError||'背景收錄中 · 可關閉管理頁';}
 }catch(e){
  loadFailed=true;
  if(note){note.dataset.state='error';note.textContent='背景尚未就緒：'+e.message+'。請在 OneComme「插件」重新讀取並啟用 YT Rank Show；舊資料沒有刪除。';}
  if(connectionMode==='plugin'){text($('status'),'背景連線中斷，畫面保留上次資料');}
  else if(connectionMode==='none'){try{await connectSDK()}catch(sdkError){text($('status'),'無法連接 OneComme：'+sdkError.message);render(false);}}
 }finally{loadBusy=false;}
}
setInterval(load,2500);
['period','kind','top'].forEach(id=>$(id).onchange=preview);$('settingsForm').onsubmit=async e=>{e.preventDefault();const body={rates:{}};new FormData(e.target).forEach((v,k)=>body[k]=['rankNameSpaces','nameValueSpaces','blankLines','maxNameLength'].includes(k)?Number(v):v);body.showTitle=e.target.elements.showTitle.checked;document.querySelectorAll('[data-rate]').forEach(i=>body.rates[i.dataset.rate]=Number(i.value));try{if(connectionMode==='plugin'){await api('PUT',body);e.target.dataset.dirty='';await load()}else{state.settings={...state.settings,...body};localStorage.setItem('yt-rank-show-settings-v0.1',JSON.stringify(state.settings));e.target.dataset.dirty='';render(true);text($('status'),'OneSDK 已連線；設定已保存在本機')}}catch(error){text($('status'),'儲存失敗：'+error.message)}};$('rebuild').onclick=async()=>{if(connectionMode==='plugin'){try{await api('POST',{});await load()}catch(error){text($('status'),'重新輸出失敗：'+error.message)}}else{render(true);text($('status'),'OneSDK 已連線；排行榜已重新計算')}};try{state.settings={...state.settings,...JSON.parse(localStorage.getItem('yt-rank-show-settings-v0.1')||'{}')}}catch{}render(false);load();
function rowsFor(kind,period,limit){return RecordPolicy.rank(eventsFor(period),kind).slice(0,limit);}
