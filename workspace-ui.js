'use strict';
(function(){
 if(new URLSearchParams(location.search).has('obs'))return;
 document.querySelector('.brand-version').textContent='v'+APP_VERSION;
 const rankingControls=document.querySelector('.ranking-controls');
 document.querySelector('#ranking .panel-heading').after(rankingControls);
 for(const [id,text]of [['period','統計期間'],['kind','榜單種類'],['top','顯示名次']]){const input=$(id),label=document.createElement('label');label.className='rank-filter';label.textContent=text;input.before(label);label.append(input);}
 const main=document.querySelector('main'),appearance=document.createElement('section'),panel=$('appearancePanel');
 $('settingsForm').addEventListener('input',()=>{$('settingsForm').dataset.dirty='true';});
 $('settingsForm').addEventListener('change',()=>{$('settingsForm').dataset.dirty='true';});
 appearance.id='appearance';appearance.hidden=true;appearance.append(panel);main.append(appearance);
 panel.open=true;panel.querySelector('summary').hidden=true;
 const reset=$('resetStatistics').parentElement,management=document.createElement('details');
 management.className='advanced-block';const summary=document.createElement('summary');summary.textContent='清空統計（請先備份）';management.append(summary,reset);$('exports').append(management);
 const steps=document.querySelector('.obs-steps'),help=document.createElement('details'),helpTitle=document.createElement('summary');
 helpTitle.textContent='第一次加入 OBS？查看操作步驟';help.append(helpTitle,steps);document.querySelector('.obs-panel').append(help);
 const nav=document.querySelector('.app-nav'),switchTab=id=>{
  nav.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  main.querySelectorAll(':scope > section').forEach(s=>s.hidden=s.id!==id);
 };
 nav.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
 const originalRender=render;
 render=function(connected=true){
  originalRender(connected);
  const note=document.createElement('details');note.className='overview-note';
  note.textContent='本場基準：OneComme 目前連線中、已加入統計的直播。數字只計本插件已收到且通過驗證的支持事件；不代表 YouTube 全部歷史。';
  const explanation=document.createElement('p');explanation.textContent=note.textContent;note.textContent='';const summary=document.createElement('summary');summary.textContent='統計範圍說明';note.append(summary,explanation);$('overview').prepend(note);
 };
 render(connectionMode!=='none');
 // Compact list: the original event store and export observers remain unchanged.
 const oldTable=document.querySelector('.event-table-scroll');oldTable.hidden=true;
 const heading=$('events').querySelector('.panel-heading p');heading.textContent='查看支持紀錄；點「詳情」核對留言、場次與未計入原因。';
 const toolbar=document.createElement('div');toolbar.className='event-tools';
 const search=document.createElement('input');search.type='search';search.className='form-control';search.placeholder='搜尋名稱、直播或原因';search.setAttribute('aria-label','搜尋事件');
 const type=document.createElement('select');type.className='form-select';type.setAttribute('aria-label','事件種類');
 for(const [value,label]of [['','所有事件'],['sc','SC／貼圖'],['sponsorgift','贈送會員'],['jewel','寶石'],['giftreceived','收到會員']]){const o=document.createElement('option');o.value=value;o.textContent=label;type.append(o);}
 const statusFilter=document.createElement('select');statusFilter.id='eventStatusFilter';statusFilter.className='form-select';statusFilter.setAttribute('aria-label','紀錄狀態');
 for(const [value,label]of [['','全部狀態'],['counted','已計入'],['pending','待核對'],['excluded','不計入']]){const o=document.createElement('option');o.value=value;o.textContent=label;statusFilter.append(o);}
 function statusGroup(e){const status=recordStatus(e);if(status==='有效')return 'counted';return /已清空|手動排除|測試資料|非 YouTube|非鎖定的實況主頻道|已移出統計|受贈紀錄|相同事件副本/.test(status)?'excluded':'pending';}
 const prev=document.createElement('button'),next=document.createElement('button'),info=document.createElement('span');
 for(const b of [prev,next]){b.type='button';b.className='btn btn-outline-secondary';}
 prev.textContent='上一頁';next.textContent='下一頁';info.setAttribute('role','status');toolbar.append(search,type,statusFilter,prev,info,next);
 const filters=document.createElement('div');filters.className='event-filters';
 const from=document.createElement('input'),to=document.createElement('input'),session=document.createElement('select'),clear=document.createElement('button'),notice=document.createElement('p');
 from.type=to.type='date';from.id='eventDateFrom';to.id='eventDateTo';session.id='eventSession';notice.className='filter-notice';notice.setAttribute('role','status');
 for(const [input,text]of [[from,'開始日期（台北）'],[to,'結束日期（含當天）'],[session,'已記錄的直播場次']]){const label=document.createElement('label');label.textContent=text;input.className=input===session?'form-select':'form-control';label.append(input);filters.append(label);}
 clear.type='button';clear.className='btn btn-outline-secondary';clear.textContent='清除篩選';toolbar.append(clear);
 const dateKey=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
 function refreshSessions(){const selected=session.value,known=new Map();for(const id of Object.keys(state.settings.channelLock?.bindings||{}))known.set(id,id);for(const e of state.events)if(e.liveId)known.set(e.liveId,e.streamTitle?e.streamTitle+' · '+e.liveId:e.liveId);session.replaceChildren();for(const [value,text]of [['','全部已記錄場次'],...known]){const o=document.createElement('option');o.value=value;o.textContent=text;session.append(o);}if(known.has(selected))session.value=selected;}
 const wrap=document.createElement('div');wrap.className='compact-events';
 const table=document.createElement('table');table.className='compact-table';
 const thead=document.createElement('thead'),header=document.createElement('tr'),body=document.createElement('tbody');body.id='compactEventRows';
 for(const label of ['時間','聊天室名稱','類型','金額／數量','狀態','操作']){const th=document.createElement('th');th.textContent=label;header.append(th);}
 thead.append(header);table.append(thead,body);wrap.append(table);oldTable.before(filters,notice,toolbar,wrap);
 const repair=document.createElement('details'),repairTitle=document.createElement('summary');repair.className='event-maintenance';repairTitle.textContent='紀錄修復工具';repair.append(repairTitle,$('repairMembership'),$('membershipRepairNotice'));$('events').append(repair);
 const dialog=document.createElement('dialog');dialog.id='eventDetail';dialog.className='event-detail';
 const close=document.createElement('button');close.type='button';close.className='btn btn-outline-secondary';close.textContent='關閉詳情';close.onclick=()=>dialog.close();
 const title=document.createElement('h2');title.textContent='事件詳情';const content=document.createElement('dl');dialog.append(close,title,content);document.body.append(dialog);
 let page=0;
 function details(e){
  content.replaceChildren();
  const values=[['聊天室名稱',e.displayName],['狀態／原因',recordStatus(e)],['留言',String(e.comment||'').replace(/<[^>]*>/g,'')],['直播名稱',e.streamTitle],['直播 ID',e.liveId],['userId（統計識別）',e.userId],['事件 ID',e.eventId],['平台',e.service],['事件類型',e.eventType],['原始時間',e.timestamp],['原始金額',e.originalPaidText||e.originalAmount],['原始幣別',e.originalCurrency],['換算幣別',e.normalizedCurrency],['使用匯率',e.exchangeRate],['換算台幣',e.amountTwd],['贈送數量（原紀錄欄位）',e.giftCount],['數量來源',e.giftCountSource],['寶石累計',e.jewelTotal],['收錄用途',e.recordMode||'舊版未標記']];
  for(const [label,value]of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value??'—');content.append(dt,dd);}
  dialog.showModal();
 }
 function filter(){
  refreshSessions();
  const invalid=from.value&&to.value&&from.value>to.value;
  notice.textContent=invalid?'開始日期不能晚於結束日期。':'台北時間 · 篩選不影響統計';
  const q=search.value.trim().toLowerCase();
  const matches=state.events.slice().reverse().filter(e=>{const day=dateKey(e.timestamp);return !invalid&&(!statusFilter.value||statusGroup(e)===statusFilter.value)&&(!session.value||e.liveId===session.value)&&(!from.value||(day&&day>=from.value))&&(!to.value||(day&&day<=to.value))&&(!type.value||(type.value==='sc'?['superchat','supersticker'].includes(e.eventType):e.eventType===type.value))&&(!q||[e.displayName,e.liveId,e.comment,recordStatus(e)].join(' ').toLowerCase().includes(q));});
  const pages=Math.max(1,Math.ceil(matches.length/25));page=Math.min(page,pages-1);body.replaceChildren();
  for(const e of matches.slice(page*25,page*25+25)){
   const status=recordStatus(e),short=statusGroup(e)==='counted'?'已計入':statusGroup(e)==='excluded'?'不計入':'待核對';
   const time=RecordPolicy.validTimestamp(e.timestamp)?new Date(e.timestamp).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'時間待核對';
   const amount=['superchat','supersticker'].includes(e.eventType)?(e.amountTwd==null?'待核對':'NT$'+e.amountTwd.toLocaleString('zh-TW')):e.eventType==='sponsorgift'?(e.giftCount||'?')+' 個':e.eventType==='jewel'?(e.jewelTotal??'?')+' 顆':'—';
   const row=document.createElement('tr');
   [time,e.displayName,({superchat:'SC',supersticker:'貼圖',sponsorgift:'贈送會員',giftreceived:'收到會員',jewel:'寶石'})[e.eventType]||e.eventType,amount,short].forEach((value,i)=>{
    const td=document.createElement('td');td.textContent=String(value??'');td.dataset.label=['時間','名稱','類型','數值','狀態'][i];
    if(i===0)td.title=e.timestamp;if(i===4){td.className='event-status';td.dataset.valid=String(status==='有效');td.title=status;}row.append(td);
   });
   const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='btn btn-outline-secondary';button.textContent='詳情';button.setAttribute('aria-label','查看 '+e.displayName+' 的事件詳情');button.onclick=()=>details(e);action.append(button);row.append(action);body.append(row);
  }
  if(!matches.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;cell.textContent='沒有符合條件的紀錄';row.append(cell);body.append(row);}
  prev.disabled=page===0;next.disabled=page>=pages-1;info.textContent=(page+1)+' / '+pages+' 頁 · '+matches.length+' 筆';
 }
 search.oninput=statusFilter.onchange=type.onchange=from.onchange=to.onchange=session.onchange=()=>{page=0;filter();};prev.onclick=()=>{page--;filter();};next.onclick=()=>{page++;filter();};
 clear.onclick=()=>{search.value=type.value=statusFilter.value=from.value=to.value=session.value='';page=0;filter();};
 new MutationObserver(filter).observe($('eventRows'),{childList:true});filter();
 for(const card of document.querySelectorAll('.output-card')){
  const group=card.querySelector('.input-group'),button=group.querySelector('button'),label=card.querySelector('h3').textContent;
  button.textContent='複製網址';button.setAttribute('aria-label','複製 '+label+' 的 OBS 網址');card.append(button);
  button.onclick=async()=>{
   const value=group.querySelector('input').value;let copied=false;
   try{await navigator.clipboard.writeText(value);copied=true;}catch{
    const temporary=document.createElement('textarea');temporary.value=value;temporary.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(temporary);temporary.select();
    try{copied=document.execCommand('copy');}finally{temporary.remove();button.focus();}
   }
   showToast(copied?'OBS URL 已複製':'複製失敗，請展開「檢視網址」手動複製');
  };
  const detail=document.createElement('details');detail.className='url-detail';const summary=document.createElement('summary');summary.textContent='檢視網址';detail.append(summary,group);card.append(detail);
 }
})();
