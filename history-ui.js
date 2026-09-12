'use strict';
(function(){
 if(new URLSearchParams(location.search).has('obs'))return;
 const box=document.createElement('details');box.id='historyImportPanel';box.className='advanced-block';
 box.innerHTML='<summary>匯入過去直播紀錄</summary><p class="creator-help">唯讀取得 OneComme 紀錄，選定場次後才匯入。不會修改原始資料庫或日誌。</p><div class="form-grid"><label class="field"><span>紀錄來源</span><select id="historySource" class="form-select"><option value="database">本機 OneComme 保存紀錄</option><option value="files">選擇 OneComme 日誌檔</option></select></label><label id="historyFileField" class="field" hidden><span>日誌檔（最多 30 份，共 64 MB）</span><input id="historyFiles" type="file" multiple accept=".log,.json,.jsonl"></label><label class="field"><span>開始日期（台北時間）</span><input id="historyFrom" type="date" class="form-control"></label><label class="field"><span>結束日期</span><input id="historyTo" type="date" class="form-control"></label></div><button id="historyRead" type="button" class="btn btn-outline-primary">讀取場次與預覽</button><p id="historyNotice" class="creator-help" role="status"></p><div id="historyLookupTools" hidden><label class="creator-check"><input id="historyLookupConsent" type="checkbox">同意向 YouTube 查詢所選影片的公開標題與頻道資料</label><p class="creator-help">只傳公開影片網址，不傳觀眾、留言、金額或備份；YouTube 會收到連線 IP。查詢不會匯入紀錄。</p><button id="historySelectAll" type="button" class="btn btn-outline-secondary">全選可選場次</button><button id="historySelectNone" type="button" class="btn btn-outline-secondary">取消選取</button><button id="historyLookupSelected" type="button" class="btn btn-outline-primary">查詢所選影片資訊（最多 10 場）</button><button id="historyLookupStop" type="button" class="btn btn-outline-secondary" hidden>停止後續查詢</button><p id="historyLookupNotice" class="creator-help" role="status"></p></div><div id="historySessions"></div><div id="historyConfirmArea" hidden><label class="creator-check"><input id="historyConfirmed" type="checkbox"><span id="historyConfirmLabel"></span></label><p id="historySelection" class="creator-help"></p><button id="historyCommit" type="button" class="btn btn-primary" disabled>備份並匯入所選場次</button></div><details class="creator-help"><summary>日期、標題與重複紀錄如何處理？</summary><p>只顯示所選日期內有支持事件的場次。「最早紀錄」不是開台時間；標題與開台時間只在來源有提供時顯示。YouTube 查到的是目前公開標題，可能與當年開台標題不同；本次匯入核對狀態重新預覽後重設；查到的標題與頻道資訊另保存在本機。一般聊天不會匯入，受贈紀錄不計贈送榜。</p><p>匯入使用目前的頻道、匯率與紀錄模式。可主動查詢影片標題與頻道：相符才可直接選入，不符會阻擋；未查詢或無法確認須逐場人工核對。已綁定其他頻道的場次不能直接覆蓋。重複事件不重複計數；內容衝突、缺少資料、測試或已清空的紀錄仍不會被強制放行。</p><p>資料庫格式目前支援 OneComme 8／9 的 comments 結構。若格式不同、資料量過大或讀取失敗，可縮小日期或改選日誌檔。插件不會上網補抓已遺失紀錄。</p></details>';
 document.getElementById('records').append(box);
 const get=id=>document.getElementById(id);let scan=null,busy=false,stopLookup=false,activeLive='';
 const today=RecordPolicy.dateParts(new Date().toISOString()).day;get('historyFrom').value=today.slice(0,7)+'-01';get('historyTo').value=today;
 function invalidate(){scan=null;activeLive='';get('historyLookupTools').hidden=true;get('historyLookupConsent').checked=false;get('historyLookupNotice').textContent='';get('historySessions').replaceChildren();get('historyConfirmArea').hidden=true;get('historyConfirmed').checked=false;get('historyCommit').disabled=true;}
 function setBusy(value){busy=value;for(const input of box.querySelectorAll('input,select,button'))input.disabled=value;updateSelection();}
 function updateSelection(){
  const ids=[...box.querySelectorAll('[data-history-live]:checked')].map(e=>e.dataset.historyLive);
  const manual=[...box.querySelectorAll('[data-history-manual]:checked')].map(e=>e.dataset.historyManual);
  const unresolved=scan?ids.filter(id=>scan.sessions.find(s=>s.liveId===id)?.verification?.status!=='match'&&!manual.includes(id)):[];
  get('historySelection').textContent='已選 '+ids.length+' 場 · '+(ids.length-unresolved.length)+' 場可匯入 · '+unresolved.length+' 場待確認';
  get('historyCommit').disabled=busy||!scan||!ids.length||!!unresolved.length||!get('historyConfirmed').checked;
  get('historyLookupSelected').disabled=busy||!scan||!ids.length||!get('historyLookupConsent').checked;
  for(const input of box.querySelectorAll('[data-history-blocked]'))input.disabled=true;return ids;
 }
 function when(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未提供';}
 function renderScan(value){
  const selected=scan?.token===value.token?new Set([...box.querySelectorAll('[data-history-live]:checked')].map(e=>e.dataset.historyLive)):new Set();
  scan=value;const container=get('historySessions');container.replaceChildren();const list=document.createElement('div'),info=document.createElement('div');list.id='historyList';list.setAttribute('aria-label','直播選取清單');info.id='historyInfo';container.append(list,info);if(!value.sessions.some(s=>s.liveId===activeLive))activeLive=value.sessions[0]?.liveId||'';get('historyConfirmed').checked=false;
  get('historyConfirmLabel').textContent='我確認將所選直播加入「'+(value.channelName||value.channelId)+'」的統計。';
  for(const session of value.sessions){
   const check=session.verification||{status:'unchecked'},card=document.createElement('article');card.className='history-session';card.dataset.historyCard=session.liveId;
   const label=document.createElement('label');label.className='creator-check';const input=document.createElement('input');input.type='checkbox';input.dataset.historyLive=session.liveId;input.checked=selected.has(session.liveId)&&!session.blocked;
   if(session.blocked){input.dataset.historyBlocked='true';input.disabled=true;}input.onchange=updateSelection;
   label.append(input,document.createTextNode('選取這場直播'));input.setAttribute('aria-label','選取這場直播 '+session.liveId);
   const title=document.createElement('p'),name=document.createElement('strong');name.textContent=check.videoTitle||session.title||'尚未取得影片標題';title.append(document.createTextNode('影片標題：'),name);
   const videoId=document.createElement('p');videoId.className='creator-help';videoId.textContent='影片 ID：'+session.liveId;
   const source=document.createElement('p');source.className='creator-help';source.textContent=check.videoTitle?'標題來源：YouTube 目前公開資料':session.title?'標題來源：OneComme 本機紀錄':'本機紀錄沒有標題，可查詢公開影片資訊';
   if(check.videoTitle&&session.title&&check.videoTitle!==session.title)source.textContent+='；本機原標題：'+session.title;
   const owner=document.createElement('p');owner.textContent=check.channelId?'頻道：'+check.channelName+'（'+check.channelId+'）':'頻道：尚未取得可核對的公開資料';
   const status=document.createElement('p');status.className='history-verification history-verification-'+check.status;status.setAttribute('role','status');
   status.textContent=check.status==='match'?'✓ 與目前鎖定頻道相符':check.status==='mismatch'?'✕ 屬於其他頻道，不可匯入':check.status==='unknown'?'無法確認：'+check.reason:'尚未查詢所屬頻道（本機歸屬設定不等於線上查證）';
   const link=document.createElement('a');link.href='https://www.youtube.com/watch?v='+session.liveId;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';link.textContent='在 YouTube 開啟影片';
   const meta=document.createElement('p');meta.className='creator-help';meta.textContent='紀錄時間：'+when(session.firstRecorded)+' ～ '+when(session.lastRecorded)+(session.startedAt?' · 來源提供的開台時間：'+when(session.startedAt):'（不是開台時間）');
   const counts=document.createElement('p');counts.className='creator-help';counts.textContent='SC／貼圖 '+session.sc+' 筆 · 贈送 '+session.gift+' 筆 · 寶石 '+session.jewel+' 筆 · 受贈 '+session.received+' 筆；預計新增 '+session.added+' 筆、重複 '+session.duplicates+' 筆、更新 '+session.updated+' 筆。';
   const warning=document.createElement('p');warning.className='creator-help';warning.textContent=session.blocked||(!session.eligible?'目前沒有可計入榜單的事件，其他隔離規則仍有效。':'');
   card.append(title,owner,status,link,counts,warning);
   const query=document.createElement('button');query.type='button';query.className='btn btn-outline-primary';query.textContent='查詢這支影片（連線 YouTube）';query.onclick=()=>lookup([session.liveId]);card.append(query);
   if(!session.blocked){
    if(check.status!=='match'){
     const manualLabel=document.createElement('label');manualLabel.className='creator-check';const manual=document.createElement('input');manual.type='checkbox';manual.dataset.historyManual=session.liveId;manual.onchange=updateSelection;manualLabel.append(manual,document.createTextNode('我已自行核對這支影片屬於鎖定頻道（人工確認，不是線上驗證）'));card.append(manualLabel);
    }
   }
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看支持紀錄樣本（最多 12 筆）';details.append(summary);
   for(const e of session.samples){const p=document.createElement('p');p.className='history-sample';p.textContent=when(e.time)+' · '+e.name+' · '+({superchat:'SC',supersticker:'貼圖',sponsorgift:'贈送會員',giftreceived:'受贈會員',jewel:'寶石'}[e.type]||e.type)+' · '+e.value+' · '+e.status;details.append(p);}
   const extra=document.createElement('details'),extraTitle=document.createElement('summary');extraTitle.textContent='查看詳細資料與支持紀錄';extra.append(extraTitle,videoId,source,meta,details);card.append(extra);info.append(card);
   const row=document.createElement('div');row.className='history-list-row';row.dataset.historyRow=session.liveId;
   label.replaceChildren(input);input.title='選取這場直播';
   const view=document.createElement('button');view.type='button';view.className='history-view';view.dataset.historyView=session.liveId;view.setAttribute('aria-controls','history-detail-'+session.liveId);card.id='history-detail-'+session.liveId;
   const rowTitle=document.createElement('span');rowTitle.className='history-row-title';rowTitle.textContent=check.videoTitle||session.title||'尚未取得影片標題';
   const rowMeta=document.createElement('small');rowMeta.textContent=session.liveId+' · '+when(session.firstRecorded).split(' ')[0];
   const badge=document.createElement('span');badge.className='history-badge';badge.textContent=session.blocked?'不可匯入':({match:'頻道相符',mismatch:'其他頻道',unknown:'無法確認',unchecked:'未查詢'}[check.status]||'待確認');
   view.append(rowTitle,rowMeta,badge);view.onclick=()=>showDetail(session.liveId);row.append(label,view);list.append(row);
  }
  showDetail(activeLive);get('historyLookupTools').hidden=!value.sessions.length;get('historyConfirmArea').hidden=!value.sessions.length;
  get('historyNotice').textContent='找到 '+value.sessions.length+' 場；略過一般聊天／其他平台 '+value.skipped+' 則，無法辨識日期或場次 '+value.invalid+' 則。'+(value.recordMode==='test'?'目前為測試模式，匯入不計正式榜單。':'這份清單可能包含其他頻道，請先核對。');updateSelection();
 }
 function showDetail(id){activeLive=id;for(const card of box.querySelectorAll('[data-history-card]'))card.hidden=card.dataset.historyCard!==id;for(const button of box.querySelectorAll('[data-history-view]'))button.setAttribute('aria-pressed',String(button.dataset.historyView===id));}
 get('historySelectAll').onclick=()=>{for(const input of box.querySelectorAll('[data-history-live]:not([data-history-blocked])'))input.checked=true;updateSelection();};
 get('historySelectNone').onclick=()=>{for(const input of box.querySelectorAll('[data-history-live]'))input.checked=false;updateSelection();};
 async function lookup(ids){
  if(busy||!scan)return;
  if(!get('historyLookupConsent').checked){get('historyLookupNotice').textContent='請先勾選同意向 YouTube 查詢公開影片資訊。';return;}
  if(!ids.length||ids.length>10){get('historyLookupNotice').textContent='每次請選擇 1 至 10 場。';return;}
  const token=scan.token,channelId=scan.channelId;stopLookup=false;setBusy(true);get('historyLookupStop').hidden=false;get('historyLookupStop').disabled=false;
  try{for(let i=0;i<ids.length;i++){
   if(stopLookup)break;get('historyLookupNotice').textContent='正在查詢 '+(i+1)+'／'+ids.length+'，尚未匯入任何紀錄…';
   const result=await LocalRuntime.request('/api','POST',{action:'historyLookup',token,channelId,liveId:ids[i],consent:true});
   if(!result.history)throw Error('請更新背景插件');renderScan(result.history);setBusy(true);get('historyLookupStop').disabled=false;
   if(i+1<ids.length&&!stopLookup)await new Promise(r=>setTimeout(r,1100));
  }get('historyLookupNotice').textContent=stopLookup?'已停止後續查詢；目前結果保留，沒有匯入紀錄。':'查詢完成。請核對標題、頻道與相符狀態，再決定是否匯入。';
  }catch(e){get('historyLookupNotice').textContent='查詢未完成：'+e.message+'。沒有匯入紀錄。';}
  finally{setBusy(false);get('historyLookupStop').hidden=true;}
 }
 get('historyLookupSelected').onclick=()=>lookup(updateSelection());
 get('historyLookupStop').onclick=()=>{stopLookup=true;get('historyLookupNotice').textContent='目前這支完成後停止，不再查詢下一支。';};
 get('historyLookupConsent').onchange=updateSelection;
 get('historySource').onchange=()=>{invalidate();get('historyFileField').hidden=get('historySource').value!=='files';};for(const id of ['historyFrom','historyTo','historyFiles'])get(id).onchange=invalidate;get('historyConfirmed').onchange=updateSelection;
 get('historyRead').onclick=async()=>{if(busy)return;invalidate();setBusy(true);get('historyNotice').textContent='正在唯讀取得紀錄，尚未匯入…';try{if(connectionMode!=='plugin')throw Error('請先啟用背景插件');const body={action:'historyPreview',source:get('historySource').value,from:get('historyFrom').value,to:get('historyTo').value};if(body.source==='files'){const files=[...get('historyFiles').files];if(!files.length||files.length>30||files.reduce((sum,f)=>sum+f.size,0)>64*1024*1024)throw Error('請選擇 1 至 30 份日誌，共 64 MB 以內');body.files=[];for(const f of files)body.files.push({name:f.name,text:await f.text()});}const result=await LocalRuntime.request('/api','POST',body);if(!result.history)throw Error('請更新背景插件後再試');renderScan(result.history);}catch(e){get('historyNotice').textContent='讀取失敗：'+e.message;}finally{setBusy(false);}};
 get('historyCommit').onclick=async()=>{if(busy||!scan)return;const ids=updateSelection();if(!ids.length||!get('historyConfirmed').checked)return;setBusy(true);get('historyNotice').textContent='正在備份並匯入，請勿關閉 OneComme…';try{const result=await LocalRuntime.request('/api','POST',{action:'historyImport',token:scan.token,channelId:scan.channelId,liveIds:ids,manualLiveIds:[...box.querySelectorAll('[data-history-manual]:checked')].map(e=>e.dataset.historyManual),confirmed:true});const r=result.historyResult;if(!r)throw Error('沒有收到匯入結果');invalidate();await load();get('historyNotice').textContent='已完成 '+r.sessions+' 場：新增 '+r.added+' 筆、略過重複 '+r.duplicates+' 筆、更新 '+r.updated+' 筆。原始紀錄與匯入前備份均保留。';}catch(e){get('historyNotice').textContent='匯入未完成：'+e.message+'。可重新預覽核對，重試不會重複計數。';}finally{setBusy(false);}};
})();
