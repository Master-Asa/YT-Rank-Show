'use strict';
(function(){
  const policy=RecordPolicy;
  const notice=$('exportNotice');
  function refreshSessions(){
    if(connectionMode==='plugin')$('recordMode').value=currentRecordMode();
    const previous=$('exportSession').value;
    const sessions=new Map();
    for(const e of state.events){
      const key=JSON.stringify([e.service,e.liveId]);
      if(!sessions.has(key))sessions.set(key,e);
    }
    $('exportSession').replaceChildren(...[...sessions].map(([key,e])=>{
      const option=document.createElement('option');
      option.value=key;option.textContent=(e.streamTitle?e.streamTitle+'｜':'')+e.service+' / '+e.liveId;
      return option;
    }));
    if(sessions.has(previous))$('exportSession').value=previous;
    else if(sessions.has(JSON.stringify([state.session.service,state.session.liveId])))
      $('exportSession').value=JSON.stringify([state.session.service,state.session.liveId]);
    const isolated=state.events.filter(e=>!policy.eligible(e,isResetEvent,currentChannelLock())).length;
    $('recordHealth').textContent='已保存 '+state.events.length+' 筆 · 未計入 '+isolated+' 筆';
  }
  function getFilter(includeAll=false){
    const scope=$('exportScope').value;
    const filter={timezone:'Asia/Taipei',includeAll,channelLock:currentChannelLock()};
    if(scope==='session'){
      if(!$('exportSession').value)throw new Error('目前沒有可匯出的場次');
      [filter.service,filter.liveId]=JSON.parse($('exportSession').value);
    }else if(scope==='month'){
      filter.month=$('exportMonth').value;
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month))throw new Error('請選擇有效的年份與月份');
    }
    return filter;
  }
  function scopeLabel(filter){
    return (filter.month||filter.liveId||'all').replace(/[^a-zA-Z0-9_-]/g,'_');
  }
  function download(content,name,type){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function runExport(kind){
    try{
      if(kind==='backup'){
        if(globalThis.StyleStore&&!StyleStore.loaded)throw Error('外觀資料尚未讀取完成，請稍後再備份：'+(StyleStore.error||''));
        const content=JSON.stringify({format:'yt-rank-show-backup',schemaVersion:2,exportedAt:new Date().toISOString(),
          timezone:'Asia/Taipei',source:connectionMode,scope:connectionMode==='plugin'?'local-background':'this-browser-only',
          appearance:globalThis.StyleStore?.styles||{},settings:state.settings,effectiveChannelLock:currentChannelLock(),reset:resetState,recordMode:currentRecordMode(),events:state.events},null,2);
        download(content,'yt-rank-show-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json','application/json;charset=utf-8');
        notice.textContent='已送出完整 JSON 備份下載（包括已清空、隔離及測試紀錄）。目前尚無自動還原功能。';return;
      }
      const filter=getFilter(kind==='detail'&&$('exportIncludeAll').checked);
      const events=policy.select(state.events,filter,isResetEvent);
      let content;
      if(kind==='detail')content=policy.details(events,isResetEvent,currentChannelLock());
      else if(['sc','gift','jewel'].includes(kind)){
        content=policy.csv([['名次','平台','userId','聊天室名稱',({sc:'SC／貼圖台幣合計',gift:'贈送會員數',jewel:'寶石合計'}[kind])],
          ...policy.rank(events,kind).map((r,i)=>[i+1,r.service,r.userId,r.displayName,r.value])]);
      }else{
        const groups=new Map();
        for(const e of events){
          const key=JSON.stringify([e.service,e.liveId]);
          const row=groups.get(key)||{service:e.service,liveId:e.liveId,title:e.streamTitle||'',sc:0,scCount:0,gifts:0,jewels:0};
          if(['superchat','supersticker'].includes(e.eventType)){row.sc=Math.round((row.sc+e.amountTwd)*100)/100;row.scCount++;}
          if(e.eventType==='sponsorgift')row.gifts+=e.giftCount;
          if(e.eventType==='jewel')row.jewels+=e.jewelTotal;
          groups.set(key,row);
        }
        content=policy.csv([['平台','直播 ID','直播名稱','SC／貼圖筆數','台幣合計','贈送會員數','寶石合計'],
          ...[...groups.values()].map(r=>[r.service,r.liveId,r.title,r.scCount,r.sc,r.gifts,r.jewels])]);
      }
      download(content,'yt-rank-show-'+(filter.channelLock.channelId||'unconfigured')+'-'+scopeLabel(filter)+'-'+kind+'.csv','text/csv;charset=utf-8');
      notice.textContent='已送出下載；符合篩選 '+events.length+' 筆。排行與場次彙總永遠只計有效紀錄，且匯出全部名次。';
    }catch(e){notice.textContent='匯出失敗：'+e.message}
  }
  $('exportMonth').value=policy.dateParts(new Date().toISOString()).month;
  $('recordMode').value=currentRecordMode();
  $('recordMode').onchange=async()=>{
    try{
      if(connectionMode==='plugin'){
        await api('PUT',{recordMode:$('recordMode').value});
        state.settings.recordMode=$('recordMode').value;
      }
      localStorage.setItem('yt-rank-show-record-mode',$('recordMode').value);
      updateObsUrls();
      notice.textContent='已切換新收錄資料模式，既有紀錄不會改標。新版 OBS 只顯示本管理頁計算結果；OneComme 沒有測試標記時，插件不能自動辨認假資料。';
    }catch(e){$('recordMode').value=currentRecordMode();notice.textContent='模式儲存失敗：'+e.message}
  };
  $('exportScope').onchange=()=>{
    $('exportSession').disabled=$('exportScope').value!=='session';
    $('exportMonth').disabled=$('exportScope').value!=='month';
    if($('exportSessionField'))$('exportSessionField').hidden=$('exportScope').value!=='session';
    if($('exportMonthField'))$('exportMonthField').hidden=$('exportScope').value!=='month';
  };
  document.querySelectorAll('[data-export]').forEach(button=>button.onclick=()=>runExport(button.dataset.export));
  new MutationObserver(refreshSessions).observe($('eventRows'),{childList:true});
  $('exportScope').onchange();refreshSessions();
})();
